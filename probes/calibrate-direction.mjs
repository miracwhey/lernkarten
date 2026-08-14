// Kalibrier-Sonde für die Richtungs-Messung in notecheck.mjs: misst über den ECHTEN
// Renderer, wie jede shape-Form an jeder Stelle klassifiziert wird. Zweck ist die
// Gegenprobe zur Schwelle FLAT_RATE — eine monotone Form darf NIRGENDS als „flach"
// gelten (das erzeugte falsche HART-Befunde), eine flache Form nirgends als gerichtet.
// Nutzung: node probes/calibrate-direction.mjs
import { noteMeasurements, measuredDirection } from "../notecheck.mjs";

const TS = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1];
// Enge Niveau-Spannen sind der harte Fall: kleiner Hub, gleiche Schwelle.
const FAELLE = [
  ["linear-rise", { shape: "linear-rise", from: "low", to: "high" }, "up"],
  ["compound-rise", { shape: "compound-rise", from: "low", to: "high" }, "up"],
  ["compound-rise eng", { shape: "compound-rise", from: "floor", to: "low" }, "up"],
  ["saturating-rise", { shape: "saturating-rise", from: "low", to: "high" }, "up"],
  ["saturating-rise eng", { shape: "saturating-rise", from: "low", to: "mid" }, "up"],
  ["decay-halflife", { shape: "decay-halflife", from: "high", to: "floor" }, "down"],
  ["decay-halflife eng", { shape: "decay-halflife", from: "mid", to: "low" }, "down"],
  ["flat", { shape: "flat", from: "mid" }, "flat"],
  ["suppressed", { shape: "suppressed", from: "low" }, "*"],
];

const cards = [];
const meta = [];
for (const [name, serie, soll] of FAELLE) {
  for (const t of TS) {
    meta.push({ name, soll, t });
    cards.push({
      type: "curve", relation: "trend", text: "Kalibrierung.", xlabel: "ZEIT", ylabel: "WERT",
      series: [{ label: "S", color: "es", ...serie }],
      notes: [{ label: "X", series: 0, t }], caption: "K",
    });
  }
}

const ms = await noteMeasurements({ id: "kalib", title: "Kalibrierung", source: "-", cards });
let fehl = 0;
const zeilen = new Map();
ms.forEach((m, i) => {
  const { name, soll, t } = meta[i];
  const d = measuredDirection(m);
  const ok = soll === "*" || d.dir === soll;
  if (!ok) fehl++;
  if (!zeilen.has(name)) zeilen.set(name, []);
  zeilen.get(name).push(`${t}:${d.dir}${ok ? "" : "!"}(${d.rate.toFixed(2)})`);
});
for (const [name, zs] of zeilen) console.log(name.padEnd(20), zs.join(" "));
console.log(fehl ? `KALIBRIERUNG FAIL — ${fehl} Fehlklassifikation(en)` : `KALIBRIERUNG OK — ${ms.length} Messpunkte, keine Fehlklassifikation`);
process.exit(fehl ? 2 : 0);
