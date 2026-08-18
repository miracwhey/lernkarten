// Drift-Gate für den Platzierungs-Solver: rendert jede Karte des Bestands und schreibt
// das erzeugte SVG-Markup als Text heraus. Verglichen werden damit die BERECHNETEN
// Koordinaten, nicht Pixel — feiner als ein Screenshot und ohne Rendering-Rauschen.
//
// Warum es das gibt: `shot-all.mjs` deckt den Asset-Noten-Pfad NICHT ab. Im ganzen
// Bestand trägt genau eine Asset-Karte eine freie Note (probes/asset-demo-lesson.json c4),
// und die steckt in keiner Lektion. Ein Byte-Vergleich über lessons/ läuft deshalb grün,
// ohne den Solver je ausgeführt zu haben — die Gegenprobe wäre leer.
//
// Nutzung:  node probes/solver-fixture.mjs <ausgabedatei> [--shots <dir>]
// Gegenprobe: einmal vor, einmal nach dem Umbau, dann `diff`.
//
// GEMESSENER DECKUNGSSTAND der Staffel in platziere() (18.08., je Zweig einzeln
// abgeschaltet und das Markup verglichen):
//   bevorzugt → trifft asset-demo c4 (Note an einer Fläche), exklusiv
//   notnagel  → trifft den Sonderfall "Platznot", exklusiv
//   streng    → NICHT auslösbar: in keinem Fall des Bestands diskriminiert `eindeutig`.
//               Die erste freie Lage ist zugleich die eindeutige, die laxe Stufe wird nie
//               gebraucht. Der Zweig bleibt als Sicherheitsnetz, ist aber ungeprüft.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { normalizeLesson } from "../validate-lesson.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ziel = process.argv[2] || "solver-fixture.txt";

const dateien = [
  ...readdirSync(resolve(repo, "lessons")).sort().map((f) => `lessons/${f}`),
  "probes/asset-demo-lesson.json"
].map((f) => resolve(repo, f)).filter(existsSync);

// Sonderfälle, die der Bestand NICHT ausübt. Gemessen am 18.08.: die einzige Asset-Note
// des Bestands hängt an `node:koerper` — einer FLÄCHE. Damit greift die bevorzugte Lage
// und die Staffel darunter (streng → lax → Notnagel) wird nie erreicht; eine Mutation an
// ihr lief spurlos durch. Die Fälle hier hängen an Ankern OHNE Fläche und treffen sie.
const SONDERFALL = [{
  quelle: "sonderfall: Note an Linien-Anker (Staffel statt Fläche)",
  type: "asset", relation: "object",
  text: "Die Reize laufen am Dendriten ein.",
  asset: { ref: "biology.neuron", role: "hero", labels: { reize: "REIZE KOMMEN AN" } },
  notes: [{ anker: "node:dendrit", text: "HIER LÄUFT ES EIN", ton: "ich" }],
  caption: "Sonderfall Staffel."
}, {
  // Zwei Notes an benachbarten Ankern, beide lang: die zweite findet die guten Lagen
  // belegt vor und muss über die laxe Stufe oder den Notnagel gehen.
  quelle: "sonderfall: zwei lange Notes, konkurrierende Lagen",
  type: "asset", relation: "object",
  text: "Zwei Anmerkungen drängen sich um dieselbe Stelle.",
  asset: { ref: "biology.neuron", role: "hero", labels: { reize: "REIZE KOMMEN AN", feuert: "AB HIER FEUERT ES" } },
  notes: [
    { anker: "node:dendrit", text: "HIER LAUFEN DIE REIZE ZUSAMMEN UND WARTEN", ton: "ich" },
    { anker: "node:soma", text: "HIER ENTSCHEIDET SICH, OB ES WEITERGEHT", ton: "es" }
  ],
  caption: "Sonderfall Konkurrenz."
}, {
  // Erzwingt den NOTNAGEL: vier lange Notes an drei Ankern, zwei davon am selben.
  // Gemessen — schaltet man den Notnagel-Zweig ab, ändert sich das Markup dieser Karte
  // (und nur ihres). Ohne sie liefe eine Mutation am Notnagel spurlos durch.
  quelle: "sonderfall: Platznot erzwingt den Notnagel",
  type: "asset", relation: "object",
  text: "Vier lange Anmerkungen an drei Ankern.",
  asset: { ref: "biology.neuron", role: "hero",
    labels: { reize: "REIZE KOMMEN AN", feuert: "AB HIER FEUERT ES", sprung: "SIGNAL SPRINGT ÜBER" } },
  notes: [
    { anker: "node:dendrit", text: "HIER LAUFEN DIE REIZE ZUSAMMEN UND WARTEN AUF IHRE SCHWELLE", ton: "ich" },
    { anker: "node:dendrit", text: "NOCH EINE LANGE ANMERKUNG AM SELBEN DENDRITEN OHNE PLATZ", ton: "es" },
    { anker: "node:soma", text: "HIER ENTSCHEIDET SICH OB ES WEITERGEHT ODER VERPUFFT", ton: "es" },
    { anker: "node:synapse", text: "AM ENDE SPRINGT DAS SIGNAL UEBER DEN SPALT ZUM NAECHSTEN", ton: "ich" }
  ],
  caption: "Sonderfall Platznot."
}, {
  // Bandlage: zwei deckungsgleiche Serien — die Konstellation, die label-audit als INFO
  // meldet („Serienabstand < 10 px", bei Strichstärke 3 sind die Kurven optisch eins).
  //
  // VERSUCH GESCHEITERT, absichtlich dokumentiert: der Fall sollte die laxe Stufe
  // erzwingen, tut es aber nicht. `eindeutig` fragt, ob die FREMDE Serie NÄHER liegt als
  // die eigene; bei Deckungsgleichheit sind beide gleich weit, die Prüfung ist also
  // erfüllt. Sie schlägt nur an, wenn die eigene Serie WEITER weg ist — etwa wenn zwei
  // Kurven sich kreuzen und hinter dem Kreuzungspunkt auseinanderlaufen. Solche Lagen
  // entstehen im Bestand nur am Apex-Ast, und der läuft über apexPlace, nicht über den
  // gemeinsamen Kern. Die laxe Stufe bleibt damit ungemessenes Sicherheitsnetz.
  quelle: "sonderfall: Bandlage (zwei deckungsgleiche Serien)",
  type: "curve", relation: "trend",
  text: "Zwei deckungsgleiche Serien.", xlabel: "ZEIT", ylabel: "WERT",
  series: [
    { label: "ERSTE FLACHE", color: "es", shape: "flat", from: "mid" },
    { label: "ZWEITE FLACHE", color: "ich", shape: "flat", from: "mid", dash: true }
  ],
  notes: [{ label: "HIER LIEGT ALLES AUFEINANDER", series: 0, t: 0.5 }],
  caption: "Sonderfall Bandlage."
}];

const karten = [];
for (const f of dateien) {
  const lesson = normalizeLesson(JSON.parse(readFileSync(f, "utf8")));
  lesson.cards.forEach((c, i) => karten.push({ c, quelle: `${f.split("/").pop()} c${i + 1}` }));
}
SONDERFALL.forEach(({ quelle, ...c }) => karten.push({ c, quelle }));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
// Ohne das erwischt der Shot die Einblende der Karte und liefert ein fast leeres Bild —
// das Markup wäre trotzdem korrekt. shot-all.mjs setzt es aus demselben Grund.
await page.emulateMedia({ reducedMotion: "reduce" });
await page.setContent(`<div class="phone"><div class="topbar"><div class="progress"></div></div><div class="cardarea" id="area"></div></div>`);
await page.addStyleTag({ path: repo + "/renderer.css" });
await page.addScriptTag({ path: repo + "/assets/assets.js" });
await page.addScriptTag({ path: repo + "/renderer.js" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

// --shots: die Karten, die den Solver ausüben, auch als Bild — ein Markup-Diff beweist
// Gleichheit, aber nicht, dass das Bild überhaupt etwas zeigt.
const shotIdx = process.argv.indexOf("--shots");
const shotDir = shotIdx > -1 ? process.argv[shotIdx + 1] : null;
if (shotDir) mkdirSync(shotDir, { recursive: true });

const zeilen = [];
let mitNoten = 0, geschossen = 0;
for (const { c, quelle } of karten) {
  const markup = await page.evaluate((card) => {
    const area = document.getElementById("area");
    area.innerHTML = RENDERERS[card.type](card);
    return area.innerHTML;
  }, c);
  if ((c.notes || []).length) mitNoten++;
  zeilen.push(`### ${quelle} [${c.type}] notes=${(c.notes || []).length}\n${markup}\n`);
  if (shotDir && (c.notes || []).length) {
    const name = quelle.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60);
    await page.waitForTimeout(200);
    await page.locator(".phone").screenshot({ path: `${shotDir}/${name}.png` });
    geschossen++;
  }
}
await browser.close();
if (shotDir) console.log(`${geschossen} Shots -> ${shotDir}`);

writeFileSync(ziel, zeilen.join("\n"));
console.log(`${karten.length} Karten -> ${ziel} (davon ${mitNoten} mit Notes)`);
