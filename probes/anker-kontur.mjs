// Welche Karten-Typen können die Erklär-Schicht überhaupt tragen?
//
// Ein Callout, eine Klammer oder ein Ring brauchen vom Anker eine KONTUR, nicht nur einen
// Namen: der Solver sucht seine Lagen entlang abgetasteter Punkte. Anker, die nur auf
// HTML-Elemente zeigen (compare ist ausdrücklich eine reine HTML-Karte ohne
// Pfad-Geometrie), liefern keine — solche Typen bekommen die Schicht schlicht nicht.
//
// Diese Probe rendert jede Bestandskarte und misst je Anker, ob abtastbare SVG-Geometrie
// darunter hängt. Nutzung: node probes/anker-kontur.mjs
import { chromium } from "playwright";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { normalizeLesson } from "../validate-lesson.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dateien = [
  ...readdirSync(resolve(repo, "lessons")).sort().map((f) => `lessons/${f}`),
  "probes/asset-demo-lesson.json"
].map((f) => resolve(repo, f)).filter(existsSync);

const karten = [];
for (const f of dateien) {
  const lesson = normalizeLesson(JSON.parse(readFileSync(f, "utf8")));
  lesson.cards.forEach((c) => karten.push(c));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.setContent('<div class="phone"><div class="cardarea" id="area"></div></div>');
await page.addStyleTag({ path: repo + "/renderer.css" });
await page.addScriptTag({ path: repo + "/assets/assets.js" });
await page.addScriptTag({ path: repo + "/renderer.js" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

const proTyp = new Map();
for (const c of karten) {
  const r = await page.evaluate((card) => {
    const area = document.getElementById("area");
    area.innerHTML = RENDERERS[card.type](card);
    // Dieselbe Auswahl, die der Renderer als Geometrie behandelt (ASSET_GEO_SEL).
    const GEO = "path:not(.a-route), line, polygon, circle";
    const namen = new Set();
    area.querySelectorAll("[data-anchor]").forEach((e) =>
      e.getAttribute("data-anchor").split(/\s+/).filter(Boolean).forEach((n) => namen.add(n)));
    let mit = 0, ohne = 0;
    const ohneNamen = [];
    for (const n of namen) {
      const els = [...area.querySelectorAll(`[data-anchor~="${CSS.escape(n)}"]`)];
      const geo = els.some((el) => el.matches(GEO) || el.querySelector(GEO));
      if (geo) mit++; else { ohne++; ohneNamen.push(n); }
    }
    return { mit, ohne, ohneNamen };
  }, c);
  const e = proTyp.get(c.type) || { karten: 0, mit: 0, ohne: 0, ohneNamen: new Set() };
  e.karten++; e.mit += r.mit; e.ohne += r.ohne;
  r.ohneNamen.forEach((n) => e.ohneNamen.add(n.replace(/[^:]*$/, "…")));
  proTyp.set(c.type, e);
}
await browser.close();

console.log("Typ           Karten  Anker MIT Kontur  ohne  → trägt die Erklär-Schicht?");
for (const [typ, e] of [...proTyp].sort()) {
  const traegt = e.mit > 0 ? (e.ohne === 0 ? "ja" : "teilweise") : "NEIN";
  console.log(`${typ.padEnd(13)} ${String(e.karten).padStart(6)} ${String(e.mit).padStart(17)} ${String(e.ohne).padStart(5)}  ${traegt}`
    + (e.ohne ? `  (ohne: ${[...e.ohneNamen].join(", ")})` : ""));
}
