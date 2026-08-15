// Transport der Asset-Library in die Seiten. Die SVG-Dateien in assets/ sind die
// EINZIGE Geometrie-Quelle; dieses Skript verpackt ihren Text unverändert (kein
// Umschreiben, kein Minifizieren) in ein klassisches Script, weil die Karten-Seiten
// über file:// laufen und dort kein fetch möglich ist.
//
// Zwei Ziele, weil zwei Wirte:
//   assets/assets.js  — <script src> für karten-grammatik.html und die Proben
//   card-canvas.html  — INLINE zwischen Markern, weil die App genau die dort
//                       gelisteten Dateien bündelt (app/project.yml ist tabu) und ein
//                       zusätzlicher Pfad im Bundle fehlen würde.
// Beide Fassungen sind byte-gleich erzeugt; `node asset-check.mjs` baut sie neu und
// bricht bei jeder Abweichung — ein Drift zwischen Datei und Transport ist damit ein
// Gate-Fehler, keine Fundsache.
// Nutzung: node build-assets.mjs [--check]
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const HIER = dirname(fileURLToPath(import.meta.url));
export const MARKE_AUF = "<!-- ASSETS:BEGIN (generiert von build-assets.mjs) -->";
export const MARKE_ZU = "<!-- ASSETS:END -->";

/// Baut die Nutzlast aus den Quelldateien. Reine Funktion: gleiche Dateien → gleicher String.
export function baueNutzlast() {
  const manifest = JSON.parse(readFileSync(resolve(HIER, "assets/manifest.json"), "utf8"));
  const src = {};
  for (const [ref, a] of Object.entries(manifest.assets))
    src[ref] = readFileSync(resolve(HIER, "assets", a.datei), "utf8");
  return "// GENERIERT von build-assets.mjs — nicht von Hand ändern.\n"
    + "// Quelle: assets/manifest.json + assets/*.svg (node asset-check.mjs prüft die Gleichheit).\n"
    + `window.ASSET_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n`
    + `window.ASSETS_SRC = ${JSON.stringify(src, null, 2)};\n`;
}

export function inlineBlock(nutzlast) {
  return `${MARKE_AUF}\n<script>\n${nutzlast}</script>\n${MARKE_ZU}`;
}

/// Ersetzt den Block zwischen den Markern. Fehlen sie, ist das ein Fehler und kein
/// stiller Anhang — ein Wirt ohne Marker hätte die Library sonst nie bekommen.
export function ersetzeBlock(html, block, datei) {
  const a = html.indexOf(MARKE_AUF), b = html.indexOf(MARKE_ZU);
  if (a < 0 || b < 0) throw new Error(`${datei}: Marker ${MARKE_AUF} … ${MARKE_ZU} fehlen`);
  return html.slice(0, a) + block + html.slice(b + MARKE_ZU.length);
}

const ZIELE = () => {
  const nutzlast = baueNutzlast();
  const canvas = readFileSync(resolve(HIER, "card-canvas.html"), "utf8");
  return [
    ["assets/assets.js", nutzlast],
    ["card-canvas.html", ersetzeBlock(canvas, inlineBlock(nutzlast), "card-canvas.html")]
  ];
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const nurPruefen = process.argv.includes("--check");
  let abweichung = 0;
  for (const [datei, soll] of ZIELE()) {
    const pfad = resolve(HIER, datei);
    const ist = existsSync(pfad) ? readFileSync(pfad, "utf8") : "";
    if (ist === soll) { console.log(`OK      ${datei} (${soll.length} Zeichen)`); continue; }
    abweichung++;
    if (nurPruefen) console.log(`DRIFT   ${datei} — Transport weicht von assets/ ab`);
    else { writeFileSync(pfad, soll); console.log(`GESCHRIEBEN ${datei} (${soll.length} Zeichen)`); }
  }
  if (nurPruefen && abweichung) { console.log(`BUILD-ASSETS FAIL — ${abweichung} Ziel(e) veraltet: node build-assets.mjs`); process.exit(1); }
  console.log(nurPruefen ? "BUILD-ASSETS PASS — Transport aktuell" : "BUILD-ASSETS fertig");
}
