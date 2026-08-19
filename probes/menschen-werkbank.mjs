// Werkbank für MENSCHEN — die Bausteine, die den Szenen bisher fehlen.
//
// Warum eine eigene Werkbank, bevor irgendeine Karte entsteht: die erste Szenen-Runde ist
// genau an Körperteilen gescheitert (eine Hand, die als Klumpen las, ein Profilgesicht ohne
// Kinn), und beide Fehler waren in der fertigen Karte nicht mehr diagnostizierbar — sie
// sahen aus wie „wirkt unfertig". Einzeln und groß gezeichnet fällt jeder Fehler sofort auf.
//
// Die Referenz zeichnet Menschen NICHT anatomisch, sondern als Silhouette: geschlossene
// Fläche, kräftige Kontur, sehr wenig Innenzeichnung. Getragen wird die Figur von ihrer
// Haltung, nicht von Details — eine hängende Schulter erzählt mehr als ein gezeichnetes
// Gesicht. Deshalb sind hier Rumpf und Glieder Röhren (zwei Striche übereinander: außen
// Tinte, innen Stofffarbe), und das Gesicht besteht aus höchstens vier Strichen.
//
// Nutzung: node probes/menschen-werkbank.mjs [outdir=menschen-werkbank-shots]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = process.argv[2] || "menschen-werkbank-shots";
mkdirSync(outdir, { recursive: true });
import { K, kopf, sitzend, klein, eimer, kiste, besen, blase, tasse } from "./menschen-formen.mjs";

// Die Formen selbst liegen in menschen-formen.mjs — dieselbe Quelle, aus der die Karte
// zeichnet. Eine Werkbank, die eigene Kopien prüft, prüft nichts.

const FORMEN = [
  ["kopf", `${kopf(70, 80, 1.5, { wach: true })}${kopf(190, 80, 1.5, { wach: false })}`
    + `${kopf(310, 80, 1.5, { wach: false, haut: "var(--ueberich-soft)", haar: "#4A3B22", blick: -4 })}`],
  // Tischkante mitzeichnen: „Ellbogen auf der Platte" ist ohne Platte nicht beurteilbar —
  // der Arm hinge dann im Nichts und man könnte nicht sagen, ob die Höhe stimmt.
  ["sitzend-aufrecht", `${sitzend(100, 150, 1.05, { sacken: 0, arm: "tisch" })}`
    + `${sitzend(300, 150, 1.05, { sacken: 0, spiegel: true, stoff: "var(--es-soft)", haar: "#4A3B22", arm: "haengend" })}`
    + `<path d="M130,124 h100 v7 h-100 z" fill="var(--chrome)" stroke="${K.ink}" stroke-width="2.4"/>`],
  ["sitzend-gesackt", `${sitzend(100, 150, 1.05, { sacken: 1, wach: false, arm: "stuetzt" })}`
    + `${sitzend(300, 150, 1.05, { sacken: 0.55, wach: false, spiegel: true, stoff: "var(--es-soft)", arm: "tisch" })}`
    + `<path d="M120,124 h160 v7 h-160 z" fill="var(--chrome)" stroke="${K.ink}" stroke-width="2.4"/>`],
  // Die kleine Figur in Arbeitsgröße UND zweimal vergrößert daneben: bei 56 Einheiten wird
  // sie in der Karte gelesen, bei 112 sieht man, ob die Form selbst trägt oder ob sie nur
  // durch Kleinheit davonkommt.
  ["klein", `<line x1="20" y1="150" x2="380" y2="150" stroke="${K.line}" stroke-width="2"/>`
    + `${klein(60, 150, 56, { armWinkel: 42, requisite: eimer({ strahl: 14 }) })}`
    + `${klein(140, 150, 56, { zopf: true, stoff: "var(--es-soft)", armWinkel: 62, requisite: kiste("TAG 3") })}`
    + `${klein(215, 150, 56, { stoff: "var(--ich-soft)", armWinkel: 30, requisite: besen(150) })}`
    + `${klein(310, 150, 100, { armWinkel: 42, requisite: eimer({ strahl: 14 }) })}`],
  ["blase", `${blase(30, 30, 190, 46, [{ txt: "Mir geht's gut." }])}`
    + `${blase(240, 30, 130, 64, [{ txt: "Das ist das", size: 12 }, { txt: "dritte Mal.", size: 12 }], { zipfel: "unten-rechts" })}`],
  ["kleinkram", `${tasse(70, 90, 1.4)}${tasse(170, 90, 1.4, { leer: true })}${tasse(270, 90, 1)}`],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 300 }, deviceScaleFactor: 2 });
await page.emulateMedia({ reducedMotion: "reduce" });
const fehler = [];
page.on("pageerror", (e) => { fehler.push(e.message); console.error("PAGEERROR:", e.message); });

for (const [name, inhalt] of FORMEN) {
  await page.setContent(`<body style="margin:0;background:var(--card)">
    <svg id="s" viewBox="0 0 400 220" width="480" height="264">${inhalt}</svg></body>`);
  await page.addStyleTag({ path: repo + "/renderer.css" });
  await page.waitForTimeout(80);
  await page.locator("#s").screenshot({ path: `${outdir}/${name}.png` });
  console.log(`${name.padEnd(18)} gezeichnet`);
}
await browser.close();
if (fehler.length) { console.error(`${fehler.length} Seitenfehler`); process.exit(1); }
console.log(`Shots -> ${outdir}`);
