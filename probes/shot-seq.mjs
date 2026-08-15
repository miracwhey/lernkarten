// Schritt-Shots des v3-Sequenz-Layers: je sequence-Karte JEDER Schritt-ENDZUSTAND über
// den deterministischen Hook __seqGoto (einfrieren + Zustand) — nie Mid-Flight-Frames.
// Zusätzlich gemessen (nicht nur geschossen): prefers-reduced-motion muss denselben
// Zustand erzeugen wie der letzte Schritt — sonst ist der „Endzustand" zwei Zustände.
// Nutzung: node probes/shot-seq.mjs [lesson.json] [outdir]
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { normalizeLesson } from "../validate-lesson.mjs";

const repo = resolve(new URL("..", import.meta.url).pathname);
const file = resolve(repo, process.argv[2] || "probes/seq-demo-lesson.json");
const OUT = resolve(repo, process.argv[3] || "probes/seq-shots");
mkdirSync(OUT, { recursive: true });
const lesson = normalizeLesson(JSON.parse(readFileSync(file, "utf8")));
const seqKarten = lesson.cards.map((c, i) => ({ c, i })).filter(({ c }) => Array.isArray(c.sequence));

const HOST = `<div class="phone">
  <div class="topbar"><button class="xbtn">✕</button><div class="progress">${"<span></span>".repeat(8)}</div></div>
  <div class="cardarea" id="area"></div>
</div>`;

// Zustands-Signatur: was der Schritt SAGT, nicht wie er aussieht — Sichtbarkeit,
// Trace-Fortschritt, Dim, Aufglühen. Zwei Wege in denselben Schritt müssen sie teilen.
const signatur = () => {
  const out = [];
  document.querySelectorAll("#area [data-anchor]").forEach((e) => {
    out.push([e.getAttribute("data-anchor"), e.tagName,
      e.dataset.seqStep || "-", e.classList.contains("on") ? "on" : "off",
      e.classList.contains("seq-dim") ? "dim" : "-", e.classList.contains("lit") ? "lit" : "-",
      e.style.strokeDashoffset || "-", e.style.fill || "-"].join("|"));
  });
  document.querySelectorAll("#area .seq-halo").forEach((h) => out.push(`halo|${h.classList.contains("lit") ? "lit" : "-"}`));
  return out.sort().join("\n");
};

const browser = await chromium.launch();
const seite = async (reduced) => {
  const page = await browser.newPage({ viewport: { width: 560, height: 1000 }, deviceScaleFactor: 2 });
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.setContent(HOST);
  await page.addStyleTag({ path: repo + "/renderer.css" });
  // Wie in den Wirt-Seiten: Library VOR renderer.js — asset-Karten lösen refs sonst nie auf.
  await page.addScriptTag({ path: repo + "/assets/assets.js" });
  await page.addScriptTag({ path: repo + "/renderer.js" });
  page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
  return page;
};

const page = await seite(false);
const red = await seite(true);
let fehler = 0;
console.log(`# ${file.split("/").pop()} — ${seqKarten.length} Karten mit sequence`);

for (const { c, i } of seqKarten) {
  const schritte = await page.evaluate((card) => {
    renderCardInto(document.getElementById("area"), card, { onAdvance: () => {} });
    return window.__seqSteps;
  }, c);
  const soll = c.sequence.length;
  console.log(`\nc${i + 1} ${c.type} — __seqSteps=${schritte} (Contract: ${soll} Schritte)${schritte === soll ? "" : "  ← ABWEICHUNG"}`);
  if (schritte !== soll) fehler++;

  // Der Puls-Punkt ist im eingefrorenen Bild unsichtbar (sein Endzustand IST das
  // Verschwinden) — sein WEG muss deshalb gemessen werden, nicht angeschaut.
  const wege = await page.evaluate(() => {
    // Chrome normalisiert offsetPath beim Auslesen (Kommas → Leerzeichen). Verglichen
    // wird deshalb die Zahlen-/Befehlsfolge, nicht die Schreibweise.
    const norm = (s) => (s || "").replace(/path\(|\)|['"]/g, "").replace(/([A-Za-z])/g, " $1 ")
      .replace(/[\s,]+/g, " ").trim();
    return [...document.querySelectorAll("#area .seq-pulse")].map((d) => {
      const p = norm(d.style.offsetPath);
      const treffer = [...document.querySelectorAll("#area [data-anchor]")].find((e) =>
        norm(e.getAttribute("d")) === p ||
        (e.tagName === "line" && norm(`M${e.getAttribute("x1")},${e.getAttribute("y1")} L${e.getAttribute("x2")},${e.getAttribute("y2")}`) === p));
      const stuetzen = (p.match(/ L /g) || []).length + 1;
      return treffer ? `folgt ${treffer.getAttribute("data-anchor")}`
        : stuetzen === 2 ? "Gerade (Anker-Mitten)" : `entlang der Serie (${stuetzen} Stützstellen)`;
    });
  });
  if (wege.length) console.log(`  Puls-Wege: ${wege.join(" · ")}`);

  const namen = [];
  for (let s = 0; s <= schritte; s++) {
    const zustand = await page.evaluate(([s, sig]) => {
      window.__seqGoto(s);
      return { cur: window.__seqGoto(s), sig: new Function("return (" + sig + ")()")() };
    }, [s, signatur.toString()]);
    await page.waitForTimeout(60);
    const name = `c${i + 1}-${c.type}-s${s}.png`;
    await page.locator(".phone").screenshot({ path: `${OUT}/${name}` });
    namen.push(name);
    const verb = s ? `${c.sequence[s - 1].verb} ${c.sequence[s - 1].target ?? `${c.sequence[s - 1].from}→${c.sequence[s - 1].to}`}` : "(Ausgangszustand)";
    const sichtbar = zustand.sig.split("\n").filter((l) => l.includes("|on|")).length;
    console.log(`  s${s} ${verb.padEnd(46)} sichtbar=${sichtbar}  → ${name}`);
    if (s === schritte) {
      // Beweis statt Behauptung: reduced-motion rendert OHNE Hook und muss denselben
      // Zustand tragen wie der letzte Schritt.
      const sigRed = await red.evaluate(([card, sig]) => {
        renderCardInto(document.getElementById("area"), card, { onAdvance: () => {} });
        return new Function("return (" + sig + ")()")();
      }, [c, signatur.toString()]);
      const gleich = sigRed === zustand.sig;
      if (!gleich) fehler++;
      console.log(`  reduced-motion == Endzustand: ${gleich ? "JA" : "NEIN — zwei verschiedene Endzustände"}`);
      if (!gleich) {
        const a = zustand.sig.split("\n"), b = sigRed.split("\n");
        a.filter((l) => !b.includes(l)).slice(0, 5).forEach((l) => console.log(`     nur Hook: ${l}`));
        b.filter((l) => !a.includes(l)).slice(0, 5).forEach((l) => console.log(`     nur reduced: ${l}`));
      }
      await red.locator(".phone").screenshot({ path: `${OUT}/c${i + 1}-${c.type}-reduced.png` });
    }
  }
}

// Gegenprobe: eine Karte OHNE sequence darf keinen Sequenz-Zustand tragen.
const ohne = lesson.cards.find((c) => !c.sequence && c.type !== "title" && c.type !== "quiz" && c.type !== "insight");
if (ohne) {
  const rest = await page.evaluate((card) => {
    renderCardInto(document.getElementById("area"), card, { onAdvance: () => {} });
    return { steps: window.__seqSteps, markiert: document.querySelectorAll("#area [data-seq-step]").length };
  }, ohne);
  const sauber = rest.steps === 0 && rest.markiert === 0;
  if (!sauber) fehler++;
  console.log(`\nKarte ohne sequence (${ohne.type}): __seqSteps=${rest.steps}, data-seq-step-Elemente=${rest.markiert} — ${sauber ? "unverändert" : "VERUNREINIGT"}`);
}

await browser.close();
console.log(fehler ? `\nSEQ-SHOTS FAIL — ${fehler} Abweichungen` : `\nSEQ-SHOTS PASS — Shots in ${OUT}/`);
process.exit(fehler ? 1 : 0);
