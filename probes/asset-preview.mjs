// Library-Ansicht: jedes Asset groß, einzeln, über den ECHTEN Einbau-Pfad des Renderers
// (assetEinbau → dieselbe Platzierung wie auf der Karte). Zweck ist die Bildprüfung mit
// eigenen Augen — ein Objekt, das nur als Kennzahl „ok" ist, hat niemand angesehen.
// Zusätzlich wird der Inhalts-Kasten GEMESSEN (getBBox in Karten-Einheiten): so steht
// im Report eine Zahl, die ein Produzent erzeugt hat, keine geschätzte.
// Nutzung: node probes/asset-preview.mjs [outdir]
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const OUT = resolve(process.argv[2] || resolve(HIER, "asset-preview"));
mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(resolve(REPO, "assets/manifest.json"), "utf8"));
// Für intern verbrauchte Objekte (Waage, Eisberg) wird die ECHTE Karte ihres Typs
// gezeigt. Ein Teile-Abwurf ohne die Platzierung des Karten-Typs sähe kaputt aus und
// wäre ein falsches Bild — eine Ansicht, die lügt, ist schlimmer als keine.
const bestand = JSON.parse(readFileSync(resolve(REPO, "lessons/freud-psyche.json"), "utf8")).cards;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
// Karten haben eine Eintritts-Animation. Ohne reduced-motion trifft der Shot einen
// Zwischenframe (halbtransparent) — ein Mid-Flight-Bild, das nichts beweist.
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto("file://" + resolve(REPO, "karten-grammatik.html"));
await page.waitForTimeout(150);

for (const [ref, a] of Object.entries(manifest.assets)) {
  const rolle = process.argv.includes("--inline") ? "inline" : "hero";
  const mass = await page.evaluate(([ref, a, rolle, bestandKarten]) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:800px;height:600px;background:var(--card);z-index:9999";
    host.id = "preview";
    // Interner Verbraucher: die echte Karte seines Typs rendern.
    if (a.verbraucher) {
      const karte = bestandKarten.find((c) => c.type === a.verbraucher);
      host.innerHTML = RENDERERS[a.verbraucher](karte);
      document.body.appendChild(host);
      const svg = host.querySelector("svg"), g = svg;
      const b = g.getBBox();
      return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), karte: a.verbraucher };
    }
    const inhalt = assetEinbau(ref, {
          A: ankerVergabe(), role: rolle,
          labels: Object.fromEntries((a.labelSlots || []).map((s) => [s.id, s.beispiel || s.id.toUpperCase()]))
        });
    host.innerHTML = `<svg viewBox="0 0 400 300" style="width:800px;height:600px">${inhalt}</svg>`;
    document.body.appendChild(host);
    const g = host.querySelector("svg > g");
    const b = g.getBBox(), m = g.getCTM ? g.getScreenCTM() : null;
    // Kasten in KARTEN-Einheiten: getBBox misst lokal, die Platzierung skaliert.
    const svg = host.querySelector("svg");
    const t = svg.getScreenCTM().inverse().multiply(g.getScreenCTM());
    const ecken = [[b.x, b.y], [b.x + b.width, b.y + b.height]].map(([x, y]) => [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f]);
    void m;
    return { x: +ecken[0][0].toFixed(1), y: +ecken[0][1].toFixed(1), w: +(ecken[1][0] - ecken[0][0]).toFixed(1), h: +(ecken[1][1] - ecken[0][1]).toFixed(1) };
  }, [ref, a, rolle, bestand]);
  await page.locator("#preview").screenshot({ path: `${OUT}/${ref}.png` });
  await page.evaluate(() => document.getElementById("preview").remove());
  console.log(`${ref.padEnd(22)} Inhalt in Karten-Einheiten: x ${mass.x} y ${mass.y} b ${mass.w} h ${mass.h}`
    + (mass.karte ? `   (gezeigt als echte ${mass.karte}-Karte)` : ""));
}
await browser.close();
console.log(`ASSET-PREVIEW — ${Object.keys(manifest.assets).length} Bilder in ${OUT}/`);
