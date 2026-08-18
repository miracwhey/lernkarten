// Anker-Gleichheit: die Registry (validate-lesson.mjs, ohne Rendern) und der Renderer
// (data-anchor, konstruktiv beim Bau) sind ZWEI Produzenten derselben Namen. Dass sie
// dasselbe sagen, ist eine Behauptung, solange es niemand misst — hier wird gemessen.
// Gemessen wird an ECHTEN Karten aller Lektionen plus zwei Sonderfällen (Slug-Kollision,
// Umlaut). Fehlt ein Diagramm-Typ im Bestand, ist der Lauf UNGÜLTIG, nicht grün.
// Nutzung: node probes/anker-check.mjs [lesson.json …]
import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { normalizeLesson, ankerFuerKarte, RELATION_TO_TYPE } from "../validate-lesson.mjs";

const repo = resolve(new URL("..", import.meta.url).pathname);
const dateien = (process.argv.length > 2 ? process.argv.slice(2) : [
  "lessons/atomic-habits.json", "lessons/freud-psyche.json", "lessons/naval-almanack.json",
  "lessons/thinking-fast-slow.json", "lessons/warum-wir-schlafen.json",
  "probes/apex-crash-lesson.json", "probes/seq-demo-lesson.json", "probes/seq-verben-lesson.json",
  "probes/asset-demo-lesson.json"
]).map((f) => resolve(repo, f)).filter(existsSync);

// Sonderfälle, die im Bestand nicht vorkommen: gleicher Slug zweimal auf EINER Karte
// (Dedup -2 muss in beiden Produzenten an derselben Stelle greifen) und Satzzeichen.
const SONDERFALL = [{
  // Benannte Ziele gibt es im Bestand noch nicht — ohne diesen Fall liefe die Probe
  // grün, ohne die neuen Label-Anker je gesehen zu haben. Ein Ziel trägt bewusst den
  // Namen der Quelle: dann müssen BEIDE Produzenten an derselben Stelle auf -2 zählen.
  quelle: "sonderfall: multiplication mit benannten Zielen", type: "fanout", relation: "multiplication",
  text: "Ein Auslöser, vier verschiedene Bereiche.", caption: "Eine Nacht wirkt überall.",
  source: { label: "SCHLAF", sub: "eine Nacht", color: "ich" }, count: 4,
  targets: [{ label: "GEDÄCHTNIS" }, { label: "ABWEHR" }, { label: "SCHLAF" }, { label: "LEBENSZEIT" }],
  result: { label: "WIRKT ÜBERALL" },
}, {
  quelle: "sonderfall: Slug-Kollision + Satzzeichen", type: "curve", relation: "trend",
  text: "Zwei Serien, ein Name.", xlabel: "ZEIT", ylabel: "DRUCK", caption: "Sonderfall.",
  series: [
    { label: "DRUCK (ROH)", color: "es", shape: "linear-rise", from: "low", to: "high" },
    { label: "DRUCK — ROH", color: "ich", shape: "compound-rise", from: "low", to: "high" }
  ],
  stop: { t: 0.6, label: "DRUCK (ROH)" },
  notes: [{ label: "SPÄTER PEAK", series: 0, t: 0.5 }, { label: "SPÄTER PEAK", series: 1, t: 0.8 }]
}];

const karten = [];
for (const f of dateien) {
  const lesson = normalizeLesson(JSON.parse(readFileSync(f, "utf8")));
  lesson.cards.forEach((c, i) => karten.push({ c, quelle: `${f.split("/").pop()} c${i + 1}` }));
}
SONDERFALL.forEach((c) => karten.push({ c, quelle: c.quelle }));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.setContent('<div id="area" class="cardarea"></div>');
await page.addStyleTag({ path: repo + "/renderer.css" });
// Die Asset-Library kommt VOR dem Renderer: Karten-Typen holen ihre Objekt-Geometrie
// aus ihr (Waage, Eisberg), Asset-Karten ihre Anker.
await page.addScriptTag({ path: repo + "/assets/assets.js" });
await page.addScriptTag({ path: repo + "/renderer.js" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

let fehler = 0, geprueft = 0;
const gesehen = new Set();
for (const { c, quelle } of karten) {
  const soll = ankerFuerKarte(c);
  const ist = await page.evaluate((card) => {
    document.getElementById("area").innerHTML = RENDERERS[card.type](card);
    const out = [];
    document.querySelectorAll("#area [data-anchor]").forEach((e) =>
      e.getAttribute("data-anchor").split(/\s+/).filter(Boolean).forEach((n) => { if (!out.includes(n)) out.push(n); }));
    return out;
  }, c);
  gesehen.add(c.type);
  if (!soll.length && !ist.length) continue;        // title/quiz/insight tragen keine Anker
  geprueft++;
  const fehlend = soll.filter((n) => !ist.includes(n));
  const ueberzaehlig = ist.filter((n) => !soll.includes(n));
  if (fehlend.length || ueberzaehlig.length) {
    fehler++;
    console.log(`MISMATCH ${quelle} (${c.type})`);
    if (fehlend.length) console.log(`   Registry sagt, DOM zeigt nicht: ${fehlend.join(", ")}`);
    if (ueberzaehlig.length) console.log(`   DOM zeigt, Registry kennt nicht: ${ueberzaehlig.join(", ")}`);
  } else console.log(`OK ${quelle} (${c.type}) — ${soll.length} Anker: ${soll.join(", ")}`);
}
await browser.close();

// Ein Checker ohne Abdeckungs-Nachweis ist kein Check: fehlt ein Typ im Material,
// ist der Lauf ungültig — nicht grün.
const typen = [...new Set(Object.values(RELATION_TO_TYPE))];
const fehltTyp = typen.filter((t) => !gesehen.has(t));
console.log(`ABDECKUNG ${typen.length - fehltTyp.length}/${typen.length} Diagramm-Typen: ${typen.filter((t) => gesehen.has(t)).join(", ")}`);
if (fehltTyp.length) console.log(`UNGÜLTIG — ohne Karte für: ${fehltTyp.join(", ")}`);
console.log(fehler || fehltTyp.length ? `ANKER-CHECK FAIL — ${fehler} Mismatch bei ${geprueft} Karten` : `ANKER-CHECK PASS — ${geprueft} Karten, Registry ≡ DOM`);
process.exit(fehler || fehltTyp.length ? 1 : 0);
