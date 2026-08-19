// Beweis, dass die App-Fläche mitprofitiert: card-canvas.html ist der WKWebView-Host
// der App und lädt denselben renderer.js/renderer.css. Gerendert wird hier in WebKit
// (Safari-Engine, wie auf dem Gerät), nicht in Chromium.
// Nutzung: node probes/shot-canvas.mjs <lesson.json> <outdir> [kartenIndex ...]
import { webkit } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { resolve, basename } from "path";
import { normalizeLesson } from "../validate-lesson.mjs";

const file = process.argv[2];
const outdir = process.argv[3] || "probes/canvas-shots";
mkdirSync(outdir, { recursive: true });
const lesson = normalizeLesson(JSON.parse(readFileSync(file, "utf8")));
const tag = basename(file, ".json");
const picked = process.argv.slice(4).map(Number);
const idx = picked.length ? picked
  : lesson.cards.map((c, i) => (c.type === "curve" ? i : -1)).filter((i) => i >= 0);

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// Ohne reduzierte Bewegung fotografiert dieses Werkzeug bei jeder Karte mit
// `sequence`/`trigger:"auto"` den AUSGANGSZUSTAND: 120 ms nach dem Rendern hat die
// Enthüllung gerade erst begonnen, und die Karte sieht leer aus. Gemessen an der
// Musik-Lektion (19.08.2026) — die `object`-Karte wirkte bis auf ein Kringel-Fragment
// unbebildert, obwohl mit ihr alles in Ordnung war. Ein Stillbild-Werkzeug, das den
// Startframe einer Animation liefert, meldet Defekte, die es nicht gibt; die Engine
// springt unter `reduce` per Definition sofort in den Endzustand.
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto("file://" + resolve("card-canvas.html"));
await page.waitForTimeout(200);

for (const i of idx) {
  await page.evaluate((c) => window.renderCard(c), lesson.cards[i]);
  await page.waitForTimeout(120);
  // Gegenprobe: die neuen Kurven-Elemente müssen im App-Host wirklich existieren.
  // Geprüft wird, was es HEUTE gibt: Ereignis-Text mit Halo (der Chip ist entfallen),
  // Serien-Label in Serienfarbe und gedreht. Ein Feld, das ein abgeschafftes Element
  // abfragt, meldet für immer „false" und liest sich wie ein Defekt.
  const found = await page.evaluate(() => {
    const stop = document.querySelector(".c-stop"), serie = document.querySelector(".c-series");
    const svg = document.querySelector(".diagram svg");
    return {
      stop: !!stop,
      halo: stop ? getComputedStyle(stop).paintOrder : null,
      note: !!document.querySelector(".c-note"),
      dot: !!document.querySelector(".c-notedot"),
      serie: !!serie,
      noteFill: (() => { const el = document.querySelector(".c-note"); return el ? getComputedStyle(el).fill : null; })(),
      serieFill: serie ? getComputedStyle(serie).fill : null,
      serieDeg: serie && svg
        ? +(Math.atan2(...(() => { const m = svg.getScreenCTM().inverse().multiply(serie.getScreenCTM()); return [m.b, m.a]; })()) * 180 / Math.PI).toFixed(1)
        : null
    };
  });
  const p = `${outdir}/${tag}-c${i}-canvas.png`;
  await page.screenshot({ path: p });
  console.log(`${p}  ${JSON.stringify(found)}`);
}
await browser.close();
