// Adversarial-Fälle gegen den Label-Solver: Maximal-Längen, Randlagen, Deckungsgleichheit.
// Rendert Testkarten direkt über RENDERERS.curve, misst Überlappungen im DOM, screenshottet.
// Nutzung: node adversarial.mjs [outdir=adv]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const outdir = process.argv[2] || "adv";
mkdirSync(outdir, { recursive: true });

const CASES = [
  ["max-lengths", {
    type: "curve", text: "Maximal lange Labels überall.",
    xlabel: "ZWÖLFZEICHEN", ylabel: "MAXIMALLÄNGE",
    stop: { t: 0.5, label: "VIERZEHNZEICHN" },
    series: [
      { label: "Sechzehn Zeichen", color: "es", shape: "linear-rise", afterStop: "collapse", area: true },
      { label: "Auch sechzehn Ze", color: "ich", shape: "saturating-rise" }
    ],
    notes: [
      { label: "ZWEIUNDZWANZIG ZEICHEN", series: 1, t: 0.5, side: "above" },
      { label: "NOCH EINE LANGE NOTIZ", series: 0, t: 0.4, side: "below" }
    ],
    caption: "Stresstest."
  }],
  ["stop-left-edge", {
    type: "curve", text: "Stop ganz links.",
    xlabel: "ZEIT", ylabel: "WERT",
    stop: { t: 0.15, label: "FRÜHES ENDE" },
    series: [{ label: "Serie A", color: "es", shape: "compound-rise", afterStop: "rebound" }],
    notes: [{ label: "NOTIZ AM LINKEN RAND", series: 0, t: 0.02, side: "above" }]
  }],
  ["stop-right-edge", {
    type: "curve", text: "Stop ganz rechts.",
    xlabel: "ZEIT", ylabel: "WERT",
    stop: { t: 0.9, label: "SPÄTES ENDE MAX" },
    series: [
      { label: "Steigt lange an", color: "ich", shape: "saturating-rise", afterStop: "reset", area: true }
    ],
    notes: [{ label: "NOTIZ AM RECHTEN RAND", series: 0, t: 0.98, side: "above" }]
  }],
  ["identical-flat", {
    type: "curve", text: "Zwei deckungsgleiche Serien.",
    xlabel: "ZEIT", ylabel: "WERT",
    series: [
      { label: "Erste flache", color: "es", shape: "flat", from: "mid" },
      { label: "Zweite flache", color: "ich", shape: "flat", from: "mid", dash: true }
    ]
  }],
  ["crowded-top", {
    type: "curve", text: "Alles drängt nach oben.",
    xlabel: "ZEIT", ylabel: "WERT",
    stop: { t: 0.55, label: "MITTIG OBEN" },
    series: [
      { label: "Hoch und flach", color: "es", shape: "saturating-rise", from: "mid", to: "high" },
      { label: "Auch ganz oben", color: "ueberich", shape: "linear-rise", from: "mid", to: "high", dash: true }
    ],
    notes: [{ label: "OBEN IST ES ENG", series: 0, t: 0.75, side: "above" }]
  }],
  ["decay-vs-flat", {
    type: "curve", text: "Zerfall trifft flache Linie.",
    xlabel: "STUNDEN", ylabel: "PEGEL",
    series: [
      { label: "Halbwertszeit", color: "ueberich", shape: "decay-halflife", area: true },
      { label: "Grenzwert", color: "es", shape: "flat", from: "low", dash: true, faded: true }
    ],
    notes: [{ label: "SCHNITTPUNKT HIER", series: 0, t: 0.6, side: "below" }]
  }]
];

const url = "file://" + resolve("karten-grammatik.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

let findings = 0;
for (const [name, card] of CASES) {
  await page.goto(url);
  await page.waitForTimeout(150);
  const report = await page.evaluate((c) => {
    area.innerHTML = RENDERERS.curve(c);
    const svg = document.querySelector(".diagram svg");
    const vb = svg.viewBox.baseVal;
    const out = [];
    const texts = [...svg.querySelectorAll("text")].map((el) => {
      const b = el.getBBox();
      return { label: el.textContent.trim(), x: b.x, y: b.y, w: b.width, h: b.height };
    });
    for (const a of texts) {
      if (a.x < vb.x || a.y < vb.y || a.x + a.w > vb.x + vb.width || a.y + a.h > vb.y + vb.height)
        out.push(`CLIP  "${a.label}"`);
    }
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j], p = -2;
      if (!(a.x + a.w + p < b.x || b.x + b.w + p < a.x || a.y + a.h + p < b.y || b.y + b.h + p < a.y))
        out.push(`TEXT² "${a.label}" × "${b.label}"`);
    }
    const strokes = [...svg.querySelectorAll("polyline, line:not(.leader)")];
    for (const a of texts) for (const el of strokes) {
      const len = el.getTotalLength ? el.getTotalLength() : 0;
      if (!len) continue;
      for (let d = 0; d <= len; d += 3) {
        const pt = el.getPointAtLength(d);
        if (pt.x >= a.x - 1.5 && pt.x <= a.x + a.w + 1.5 && pt.y >= a.y - 1.5 && pt.y <= a.y + a.h + 1.5) {
          out.push(`PATH  "${a.label}" × ${el.tagName}`); break;
        }
      }
    }
    return out;
  }, card);
  await page.locator(".phone").screenshot({ path: `${outdir}/${name}.png` });
  if (report.length === 0) console.log(`${name}: OK`);
  else { findings += report.length; console.log(`${name}:\n  ` + report.join("\n  ")); }
}
await browser.close();
console.log(findings === 0 ? "ADVERSARIAL PASS" : `ADVERSARIAL FAIL — ${findings} Befunde`);
process.exit(findings === 0 ? 0 : 1);
