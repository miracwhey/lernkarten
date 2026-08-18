// Hält `decay-halflife` seine eigene Behauptung? Wenn ja, sind Zahlen an der Achse
// ehrlich möglich; wenn nein, würden sie präzise lügen.
//
// BEFUND (18.08.): nein. Die gezeichnete Kurve steht bei einem Drittel der Strecke auf
// 36,7 % statt auf 50 %, bei zwei Dritteln auf 11,4 % statt auf 25 % — sie fällt deutlich
// steiler als eine Halbwertszeit-Kurve über drei Halbwertszeiten. Die Form SAGT „Zerfall",
// sie ist aber nicht DIESER Zerfall. Ein Callout „NOCH 50 % WIRKUNG" bei t=0,33 steht
// damit auf einer Stelle, an der das Bild 37 % zeigt.
//
// Folge für die Frage nach Achsen-Zahlen: erst muss die Kurve den Werten folgen, dann
// dürfen Werte an die Achse. Umgekehrt entsteht ein Diagramm, das genau falsch ist.
// Nutzung: node probes/kurve-treue.mjs
import { chromium } from "playwright";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const karte = {
  type: "curve", relation: "trend", text: "Zerfall.", xlabel: "STUNDEN", ylabel: "REST",
  series: [{ label: "KOFFEIN", color: "es", shape: "decay-halflife", from: "high", to: "floor" }],
  caption: "Probe."
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto("file://" + resolve(repo, "karten-grammatik.html"));
await page.waitForTimeout(150);
const out = await page.evaluate((c) => {
  renderCardInto(area, c, { onAdvance: () => {} });
  const el = document.querySelector(".diagram svg polyline[data-series]");
  const pts = el.getAttribute("points").trim().split(/\s+/).map((p) => p.split(",").map(Number));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), yTop = Math.min(...ys), yBot = Math.max(...ys);
  // Wert an einem Bruchteil der Strecke, normiert auf die Spanne (1 = Startniveau, 0 = Boden).
  const wertBei = (f) => {
    const zx = x0 + (x1 - x0) * f;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p[0] - zx) < Math.abs(best[0] - zx)) best = p;
    return (yBot - best[1]) / (yBot - yTop);
  };
  return { n: pts.length, bei: [0.25, 1 / 3, 0.5, 2 / 3, 0.75].map((f) => [f, +wertBei(f).toFixed(3)]) };
}, karte);
console.log("Punkte:", out.n);
for (const [f, v] of out.bei) console.log(`  bei ${(f * 100).toFixed(0).padStart(3)} % der Strecke: ${(v * 100).toFixed(1)} % der Höhe`);
// Gleiche Normierung für beide Seiten benennen, sonst vergleicht die Zeile zwei Skalen:
// gemessen wird auf die GEZEICHNETE Spanne (Start = 100 %, Kurvenende = 0 %). Eine echte
// Zerfallskurve erreicht die Null nie — auch das gehört zum Befund.
console.log("Vergleich: echter Zerfall über 3 Halbwertszeiten, gleiche Strecke —");
for (const [f, w] of [[0.25, 59], [1 / 3, 50], [0.5, 35], [2 / 3, 25], [0.75, 21]])
  console.log(`  bei ${(f * 100).toFixed(0).padStart(3)} % der Strecke: ${w} % der Höhe`);
await browser.close();
