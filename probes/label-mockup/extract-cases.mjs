// Extrahiert die 3 Mockup-Fälle als ECHTE Renderer-SVGs (eine Geometrie-Quelle):
// Kurven, Achsen, Stop-Chip kommen 1:1 aus renderer.js — das Mockup variiert nur
// die Label-Schicht. Output: cases.js mit { id, name, svg } je Fall.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { normalizeLesson } from "../../validate-lesson.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const apex = normalizeLesson(JSON.parse(readFileSync(ROOT + "/probes/apex-crash-lesson.json", "utf8")));
const luna = normalizeLesson(JSON.parse(readFileSync(ROOT + "/bench-runs/2026-08-14T15-25-26/gpt-5.6-luna-pro-r2/gpt-5.6-luna-pro-lesson-v2.json", "utf8")));
// Härtester Matrix-Fall: engste Breite, größte Höhe → steilster Ast (wie adversarial.mjs)
const matrix = {
  type: "curve",
  text: "Ereignis-Matrix reb-flat-low-t0.9-high.",
  xlabel: "ZEIT", ylabel: "NIVEAU",
  stop: { t: 0.9, label: "EREIGNIS" },
  series: [
    { label: "Referenz", color: "es", shape: "linear-rise", from: "low", to: "high", dash: true },
    { label: "Ereignis", color: "ueberich", shape: "flat", from: "low", afterStop: "rebound", reboundTo: "high" }
  ],
  notes: [{ label: "APEX-NOTE", series: 1, at: "apex" }],
  caption: "reb-flat-low-t0.9-high"
};

const CASES = [
  { id: "A", name: "Apex-Vollausbau (Koffein-Crash, suppressed→rebound)", card: apex.cards[2] },
  { id: "B", name: "Ecken-Matrix reb-flat-low-t0.9-high (steilster Ast)", card: matrix },
  { id: "C", name: "luna-r2 Koffein (flat→rebound, 2 Notes)", card: luna.cards[3] }
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.goto("file://" + ROOT + "/karten-grammatik.html");
await page.waitForTimeout(150);

const out = [];
for (const c of CASES) {
  const svg = await page.evaluate((card) => {
    area.innerHTML = RENDERERS[card.type](card);
    return area.querySelector(".diagram svg").outerHTML;
  }, c.card);
  out.push({ id: c.id, name: c.name, svg, card: c.card });
  console.log(c.id, "ok,", svg.length, "bytes");
}
await browser.close();
writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "cases.js"),
  "// GENERIERT von extract-cases.mjs — nicht von Hand editieren.\nconst CASES = " +
  JSON.stringify(out, null, 1) + ";\n");
console.log("cases.js geschrieben");
