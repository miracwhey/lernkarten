// Adversarial-Fälle gegen den Label-Solver: Maximal-Längen, Randlagen, Deckungsgleichheit.
// Dazu die EREIGNIS-MATRIX: die Nach-Stop-Geometrie über verschiedene Startniveaus,
// Stop-Zeitpunkte und Apex-Höhen — damit kein Einzelfall-Fix als Lösung durchgeht.
// Rendert Testkarten direkt über RENDERERS.curve, misst im DOM, screenshottet.
// Gemessen wird je Fall: Clipping (Text UND Geometrie), Text-Kollisionen,
// Text×Kurve, sowie die ZUORDENBARKEIT (liegt ein Label näher an einer fremden
// Serie als an der eigenen?). Zusätzlich protokolliert die Matrix Apex-Höhe und
// steilsten Winkel des Asts — enge Kombinationen dürfen die FORM degradieren
// (steiler), nie die deklarierte Höhe.
// Nutzung: node adversarial.mjs [outdir=adv]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";
import { auditCurveCard } from "./label-audit.mjs";

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

// ————— Ereignis-Matrix: Startniveau × Stop-Zeitpunkt × Apex-Höhe —————
// Jede Kombination trägt eine Referenzserie (damit Zuordenbarkeit messbar ist), ein
// Stop-Ereignis und eine apex-verankerte Note (der Solver muss das Apex-Label auch
// in der Ecke unterbringen).
const EVENT_BASES = [
  ["flat-low", { shape: "flat", from: "low" }],
  ["flat-mid", { shape: "flat", from: "mid" }],
  ["flat-high", { shape: "flat", from: "high" }],
  ["supp-mid-low", { shape: "suppressed", from: "mid", to: "low" }],
  ["supp-high-floor", { shape: "suppressed", from: "high", to: "floor" }],
  ["supp-low", { shape: "suppressed", from: "low" }],
  ["rise-low-mid", { shape: "saturating-rise", from: "low", to: "mid" }]
];
const STOPS = [0.2, 0.5, 0.9];
const REBOUND_TO = ["low", "mid", "high"];
// Basen, die auch collapse/reset durchlaufen — die beiden Formen sind unverändert,
// müssen aber über dieselben Startniveaus/Zeitpunkte sauber bleiben.
const PLAIN_BASES = ["flat-low", "supp-mid-low", "rise-low-mid"];
// Extremkombinationen, von denen zusätzlich ein Bild abgelegt wird.
const SHOT = new Set([
  "reb-flat-low-t0.9-high",      // engste Breite, größte Höhe → steilster Ast
  "reb-flat-high-t0.9-high",     // Apex oben rechts, direkt an der Plot-Ecke
  "reb-flat-low-t0.2-high",      // längster Ast, flachster Schwung
  "reb-supp-high-floor-t0.5-low",// kleinster Hub: von floor auf low
  "reb-supp-mid-low-t0.9-mid",   // spät + mittlere Höhe
  "reb-rise-low-mid-t0.5-mid",   // Ereignis unterbricht einen Anstieg
  "collapse-rise-low-mid-t0.9",  // Bestandsform spät
  "reset-supp-mid-low-t0.2"      // Bestandsform früh
]);

// Weitere Fallnamen als Argumente → zusätzlich screenshotten (Nachschau bei Befunden).
for (const n of process.argv.slice(3)) SHOT.add(n);

const matrixCard = (label, base, t, afterStop, reboundTo) => ({
  type: "curve",
  text: `Ereignis-Matrix ${label}: Startniveau, Zeitpunkt und Apex-Höhe variiert.`,
  xlabel: "ZEIT", ylabel: "NIVEAU",
  stop: { t, label: "EREIGNIS" },
  series: [
    { label: "Referenz", color: "es", shape: "linear-rise", from: "low", to: "high", dash: true },
    { label: "Ereignis", color: "ueberich", ...base, afterStop, ...(reboundTo ? { reboundTo } : {}) }
  ],
  notes: [{ label: "APEX-NOTE", series: 1, at: "apex" }],
  caption: label
});

const MATRIX = [];
for (const [bn, base] of EVENT_BASES) for (const t of STOPS) {
  for (const r of REBOUND_TO) {
    const name = `reb-${bn}-t${t}-${r}`;
    MATRIX.push([name, matrixCard(name, base, t, "rebound", r)]);
  }
  if (PLAIN_BASES.includes(bn)) for (const a of ["collapse", "reset"]) {
    const name = `${a}-${bn}-t${t}`;
    MATRIX.push([name, matrixCard(name, base, t, a, null)]);
  }
}

// Gemessen wird mit demselben Chokepoint wie in audit-lesson.mjs (label-audit.mjs):
// Text-Kollision/Clipping, Geometrie-Clipping, Zuordenbarkeit, Leader-Deckel und das
// Sticky-Gate der Serien-Label-Bindung.

const url = "file://" + resolve("karten-grammatik.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto(url);
await page.waitForTimeout(150);

let findings = 0;
const run = async (name, card, shot) => {
  const { out, ast } = await page.evaluate(auditCurveCard, { card });
  if (shot) await page.locator(".phone").screenshot({ path: `${outdir}/${name}.png` });
  const kennz = ast ? `  [${ast.art} apex=${ast.niveau} maxWinkel=${ast.maxDeg}°]` : "";
  const echt = out.filter((o) => !o.startsWith("INFO"));
  if (out.length === 0) console.log(`${name}: OK${kennz}`);
  else { findings += echt.length; console.log(`${name}: ${echt.length ? "" : "OK "}${kennz}\n  ` + out.join("\n  ")); }
  return ast;
};

console.log("——— Solver-Stresstests ———");
for (const [name, card] of CASES) await run(name, card, true);

console.log("——— Ereignis-Matrix ———");
const asts = [];
for (const [name, card] of MATRIX) {
  const ast = await run(name, card, SHOT.has(name));
  if (ast) asts.push({ name, ...ast });
}
const rebs = asts.filter((a) => a.art === "rebound");
const steil = [...rebs].sort((a, b) => b.maxDeg - a.maxDeg).slice(0, 5);
console.log(`MATRIX ${MATRIX.length} Kombinationen, davon ${rebs.length} rebound`);
console.log("Steilste Äste: " + steil.map((a) => `${a.name}=${a.maxDeg}°`).join("  "));
console.log(`Apex-Niveaus: min=${Math.min(...rebs.map((a) => a.niveau))} max=${Math.max(...rebs.map((a) => a.niveau))}`);

await browser.close();
console.log(findings === 0 ? "ADVERSARIAL PASS" : `ADVERSARIAL FAIL — ${findings} Befunde`);
process.exit(findings === 0 ? 0 : 1);
