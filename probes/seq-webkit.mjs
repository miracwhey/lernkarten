// Der Sequenz-Layer im ECHTEN App-Host: card-canvas.html im WKWebView (WebKit, wie auf
// dem Gerät) — nicht in Chromium. Geprüft wird, was dort brechen KANN: offset-path für
// den Puls, filter für dim, und ob die abgespielte Sequenz nach Ablauf denselben
// Zustand trägt wie der eingefrorene letzte Schritt (Endzustand ist deterministisch).
// Nutzung: node probes/seq-webkit.mjs [lesson.json]
import { webkit } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { normalizeLesson } from "../validate-lesson.mjs";

const repo = resolve(new URL("..", import.meta.url).pathname);
const file = resolve(repo, process.argv[2] || "probes/seq-demo-lesson.json");
const OUT = resolve(repo, "probes/seq-shots/webkit");
mkdirSync(OUT, { recursive: true });
const lesson = normalizeLesson(JSON.parse(readFileSync(file, "utf8")));

const signatur = () => {
  const out = [];
  document.querySelectorAll("#cardhost [data-anchor]").forEach((e) => out.push([e.getAttribute("data-anchor"), e.tagName,
    e.dataset.seqStep || "-", e.classList.contains("on") ? "on" : "off",
    e.classList.contains("seq-dim") ? "dim" : "-", e.classList.contains("lit") ? "lit" : "-",
    e.style.strokeDashoffset || "-"].join("|")));
  document.querySelectorAll("#cardhost .seq-halo").forEach((h) => out.push(`halo|${h.classList.contains("lit") ? "lit" : "-"}`));
  return out.sort().join("\n");
};

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => { console.error("PAGEERROR:", e.message); fehlerZaehler++; });
let fehlerZaehler = 0;
await page.goto("file://" + resolve(repo, "card-canvas.html"));
await page.waitForTimeout(200);

let fehler = 0;
for (const [i, c] of lesson.cards.entries()) {
  if (!Array.isArray(c.sequence)) continue;
  const start = await page.evaluate((card) => {
    window.renderCard(card);
    const dot = document.querySelector("#cardhost .seq-pulse");
    return {
      steps: window.__seqSteps,
      // Stützt WebKit offset-path? Ein leerer Wert hieße: der Punkt läge fest auf 0,0.
      offsetPath: dot ? (dot.style.offsetPath || "").slice(0, 28) : "(kein Puls in dieser Sequenz)",
      dimFilter: CSS.supports("filter", "opacity(0.35)"),
      paintOrder: CSS.supports("paint-order", "stroke"),
      motionPath: CSS.supports("offset-path", "path('M0,0 L1,1')")
    };
  }, c);
  // Ablaufen lassen: die Sequenz spielt (trigger:auto) und muss von selbst im
  // Endzustand landen — gemessen, nicht angenommen.
  await page.waitForTimeout(320 + start.steps * 1100 + 400);
  const gelaufen = await page.evaluate((sig) => new Function("return (" + sig + ")()")(), signatur.toString());
  const eingefroren = await page.evaluate(([sig, n]) => { window.__seqGoto(n); return new Function("return (" + sig + ")()")(); },
    [signatur.toString(), start.steps]);
  const gleich = gelaufen === eingefroren;
  if (!gleich) fehler++;
  if (!start.motionPath || !start.dimFilter || !start.paintOrder) fehler++;
  await page.screenshot({ path: `${OUT}/c${i + 1}-${c.type}-webkit-ende.png` });
  console.log(`c${i + 1} ${c.type}: __seqSteps=${start.steps} · offset-path=${start.motionPath} · filter=${start.dimFilter} · paint-order=${start.paintOrder}`);
  console.log(`   Puls-Pfad im DOM: ${start.offsetPath}${start.offsetPath.length === 28 ? "…" : ""}`);
  console.log(`   abgespielt == eingefroren: ${gleich ? "JA" : "NEIN"}`);
  if (!gleich) {
    const a = gelaufen.split("\n"), b = eingefroren.split("\n");
    a.filter((l) => !b.includes(l)).slice(0, 4).forEach((l) => console.log(`      nur abgespielt: ${l}`));
    b.filter((l) => !a.includes(l)).slice(0, 4).forEach((l) => console.log(`      nur eingefroren: ${l}`));
  }
}
await browser.close();
console.log(fehler + fehlerZaehler ? `SEQ-WEBKIT FAIL — ${fehler + fehlerZaehler} Befunde` : `SEQ-WEBKIT PASS — Shots in ${OUT}/`);
process.exit(fehler + fehlerZaehler ? 1 : 0);
