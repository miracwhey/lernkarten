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
const waage = lade("lessons/wie-nervenzellen-feuern.json", 9);
const kreis = lade("lessons/wie-nervenzellen-feuern.json", 4);

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
  ["07-unbekannter-anker", { ...neuron, annotations: [{ art: "callout", text: "GIBT ES NICHT", an: "node:quatsch" }] }],
  // Die Klammer am Eisberg: der Fall, für den das Primitiv gebaut ist. Spitze →
  // Wasserlinie ist die Strecke über Wasser, dieselbe Aussage wie Imprints „What I Know".
  ["08-eisberg-klammer", { ...eisberg, annotations: [{ art: "klammer", text: "WAS ICH ZEIGE", von: "node:berg", bis: "waterline" }] }],
  ["09-eisberg-beides", { ...eisberg, annotations: [
    { art: "klammer", text: "WAS ICH ZEIGE", von: "node:berg", bis: "waterline" },
    { art: "callout", text: "UND WAS NICHT", an: "region:es" }
  ] }],
  ["10-neuron-klammer", { ...neuron, annotations: [{ art: "klammer", text: "DER GANZE WEG", von: "node:dendrit", bis: "node:synapse" }] }],
  // ring markiert, callout benennt — bei Imprint (Macroexpressions) genau dieses Paar.
  ["11-neuron-ring", { ...neuron, annotations: [{ art: "ring", an: "node:soma" }] }],
  ["12-neuron-ring-callout", { ...neuron, annotations: [
    { art: "ring", an: "node:soma" },
    { art: "callout", text: "HIER ENTSCHEIDET SICH", an: "node:soma" }
  ] }],
  // Zwei Negativfälle für den Pfeil, beide am Neuron: die Karte zeichnet ihre Wege selbst
  // (Axon zwischen Soma und Synapse), ein Pfeil darauf wäre eine zweite Linie auf der
  // ersten. Und Dendrit/Soma berühren sich — dazwischen ist kein Weg.
  ["13-pfeil-redundant", { ...neuron, annotations: [{ art: "pfeil", text: "LÄUFT WEITER", von: "node:soma", bis: "node:synapse" }] }],
  ["14-pfeil-zu-nah", { ...neuron, annotations: [{ art: "pfeil", von: "node:dendrit", bis: "node:soma" }] }],
  // Positivfall: die Waagschalen sind räumlich getrennt und NICHT direkt verbunden.
  ["14b-waage-pfeil", { ...waage, annotations: [{ art: "pfeil", text: "KIPPT ES", von: "node:erregung", bis: "node:hemmung" }] }],
  ["15-neuron-zone", { ...neuron, annotations: [{ art: "zone", text: "DIE ZELLE", umfasst: ["node:dendrit", "node:soma"] }] }],
  // Prompt-Deckung: trägt ein Schritt-Anker bei Kette/Kreis wirklich, und was macht ein
  // Callout an einer layers-Region (deren rect geclippt und damit irreführend ist)?
  ["17-cycle-step", { ...kreis, annotations: [{ art: "callout", text: "HIER KIPPT ES", an: "step:schwelle" }] }],
  ["18-layers-region", { ...eisberg, annotations: [{ art: "callout", text: "DAS ZEIGE ICH", an: "region:ich" }] }],
  // Der Fall aus dem ersten Generator-Lauf mit Schicht (Eisberg, ring-2.6-1t): der Text
  // ist einzeilig 171 Einheiten breit, in einer 400er Karte war KEINE der 1728 Lagen
  // frei, der Solver fiel auf den Notnagel und dessen Leader querte das Zonen-Label
  // „DEIN GEFÜHL". Umbruch ist die Ausweichform, die diese Notlage auflöst — und der
  // Deckel dafür, dass ein Callout nicht mehr Raum nimmt, als die Karte hat.
  ["19-callout-lang", { ...eisberg, annotations: [{ art: "callout", text: "ADENOSIN STAUT SICH HIER", an: "waterline" }] }],
  ["16-alles", { ...neuron, annotations: [
    { art: "zone", text: "DIE ZELLE", umfasst: ["node:dendrit", "node:soma"] },
    { art: "ring", an: "node:synapse" },
    { art: "pfeil", von: "node:soma", bis: "node:synapse" },
    { art: "callout", text: "SPRINGT ÜBER", an: "node:synapse" }
  ] }]
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
    return document.querySelectorAll("#area .c-callout, #area .c-klammer, #area .c-ring, #area .c-pfeil, #area .c-zone").length;
  }, card);
  await page.waitForTimeout(150);
  await page.locator(".phone").screenshot({ path: `${outdir}/${name}.png` });
  const soll = (card.annotations || []).length;
  console.log(`${name.padEnd(24)} Annotationen im JSON: ${soll}  gezeichnet: ${n}`);
}
await browser.close();
if (fehler.length) { console.error(`${fehler.length} Seitenfehler`); process.exit(1); }
console.log(`Shots -> ${outdir}`);
