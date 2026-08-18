// Werkbank der Erklär-Schicht (docs/erklaer-schicht-spec.md).
//
// Läuft über renderCardInto — NICHT über RENDERERS[type](card) wie die solver-fixture:
// die Schicht legt sich nach dem Karten-Markup auf das gerenderte DOM, wer den Typ direkt
// aufruft, sieht sie gar nicht. Genau daran wäre ein Gate blind gewesen.
//
// Nutzung: node probes/annot-fixture.mjs [outdir=annot-shots]
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { normalizeLesson } from "../validate-lesson.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = process.argv[2] || "annot-shots";
mkdirSync(outdir, { recursive: true });

const lade = (datei, i) => {
  const l = normalizeLesson(JSON.parse(readFileSync(resolve(repo, datei), "utf8")));
  return JSON.parse(JSON.stringify(l.cards[i]));
};

// Bestandskarten, um je EINE Annotation ergänzt. Absicht: dieselbe Karte einmal ohne und
// einmal mit Schicht, damit das Delta sichtbar ist und nicht mit einer neu gebauten Karte
// verwechselt wird.
const neuron = lade("lessons/wie-nervenzellen-feuern.json", 1);
const eisberg = lade("lessons/freud-psyche.json", 1);
const kurve = lade("lessons/warum-wir-schlafen.json", 1);

const FAELLE = [
  ["01-neuron-ohne", neuron],
  ["02-neuron-callout", { ...neuron, annotations: [{ art: "callout", text: "HIER LÄUFT ES EIN", an: "node:dendrit" }] }],
  ["03-neuron-zwei", { ...neuron, annotations: [
    { art: "callout", text: "HIER LÄUFT ES EIN", an: "node:dendrit" },
    { art: "callout", text: "SPRINGT ÜBER", an: "node:synapse" }
  ] }],
  // Der Eisberg ist das Imprint-Muster schlechthin — und der Grund, warum node:berg
  // überhaupt einen Anker bekommen hat (region:/zone: liefern dort keine Kontur).
  ["04-eisberg-ohne", eisberg],
  ["05-eisberg-callout", { ...eisberg, annotations: [{ art: "callout", text: "WAS ICH ZEIGE", an: "node:berg" }] }],
  ["06-kurve-callout", { ...kurve, annotations: [{ art: "callout", text: "STEIGT WEITER", an: "axis" }] }],
  // Negativprobe: ein Anker, den es nicht gibt. Muss spurlos bleiben (der Validator lehnt
  // ihn ab, der Renderer darf daran nicht zerbrechen).
  ["07-unbekannter-anker", { ...neuron, annotations: [{ art: "callout", text: "GIBT ES NICHT", an: "node:quatsch" }] }]
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.setContent('<div class="phone"><div class="topbar"><div class="progress"></div></div><div class="cardarea" id="area"></div></div>');
await page.addStyleTag({ path: repo + "/renderer.css" });
await page.addScriptTag({ path: repo + "/assets/assets.js" });
await page.addScriptTag({ path: repo + "/renderer.js" });
const fehler = [];
page.on("pageerror", (e) => { fehler.push(e.message); console.error("PAGEERROR:", e.message); });

for (const [name, card] of FAELLE) {
  const n = await page.evaluate((c) => {
    renderCardInto(document.getElementById("area"), c);
    return document.querySelectorAll("#area .c-callout").length;
  }, card);
  await page.waitForTimeout(150);
  await page.locator(".phone").screenshot({ path: `${outdir}/${name}.png` });
  const soll = (card.annotations || []).length;
  console.log(`${name.padEnd(24)} Annotationen im JSON: ${soll}  gezeichnet: ${n}`);
}
await browser.close();
if (fehler.length) { console.error(`${fehler.length} Seitenfehler`); process.exit(1); }
console.log(`Shots -> ${outdir}`);
