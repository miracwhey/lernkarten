// Wie lang darf ein Label-Platz WIRKLICH werden? Das Manifest nennt je Platz ein max;
// diese Zahl darf nicht geschätzt sein. Hier wird sie erzeugt: Text mit dem breitesten
// Großbuchstaben (M) wachsen lassen, bis das Layout-Gate anschlägt — der letzte saubere
// Wert ist der Deckel. Gemessen wird mit demselben Chokepoint wie audit/adversarial.
//
// Danach die Gegenprobe: ALLE Plätze gleichzeitig auf ihrem Deckel. Labels kollidieren
// auch miteinander — ein Deckel, der nur einzeln hält, ist keiner.
// Beide Rollen werden geprüft (hero und inline): inline staucht die Komposition, die
// Schrift bleibt gleich groß, also ist inline der engere Fall.
// Nutzung: node probes/asset-slot-max.mjs [--schreiben]
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { auditCurveCard } from "../label-audit.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const manifestPfad = resolve(REPO, "assets/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPfad, "utf8"));
// Der Deckel ist eine ZEICHENZAHL, die Kollision hängt aber an der BREITE. Mit dem
// breitesten Großbuchstaben gemessen wäre der Deckel so klein, dass er die abgenommenen
// Mockup-Texte verböte (gemessen: „SONNENLICHT" passt, „MMMM" nicht). Gemessen wird
// deshalb mit realistischem Label-Text: der abgenommene Text des Platzes, wiederholt auf
// die geprüfte Länge. Die Zeichenzahl bleibt eine Näherung — die AUTORITÄT ist und
// bleibt das Layout-Gate (audit-lesson misst jede echte Lektion).
const MUSTER = Object.fromEntries(Object.values(manifest.assets)
  .flatMap((a) => (a.labelSlots || []).map((s) => [s.id, s.beispiel])));
const text = (id, n) => (MUSTER[id] + " ").repeat(Math.ceil(n / (MUSTER[id].length + 1)) + 1).slice(0, n).trim().padEnd(n, "N");
const OBER = 34;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto("file://" + resolve(REPO, "karten-grammatik.html"));
await page.waitForTimeout(150);

const karte = (ref, labels, role) => ({
  type: "asset", relation: "object", text: "Deckel-Messung.", caption: "Deckel-Messung.",
  asset: { ref, role, labels }
});
const befunde = async (ref, labels, role) => {
  const { out } = await page.evaluate(auditCurveCard, { card: karte(ref, labels, role) });
  return (out || []).filter((o) => !o.startsWith("INFO"));
};

// Welche ROLLEN trägt ein Objekt überhaupt? `inline` staucht die Komposition auf 60 %,
// die Schrift bleibt gleich groß — ein Objekt mit vielen Label-Plätzen wird dabei
// unlesbar (gemessen: sky-scatter kollidiert inline bei JEDER Textlänge). Statt das
// hinzunehmen, wird die Rolle zur gemessenen Eigenschaft des Objekts: der Validator
// lässt nur zu, was hier durchgekommen ist.
const rollenJeAsset = {};
for (const [ref, a] of Object.entries(manifest.assets)) {
  const slots = a.labelSlots || [];
  if (!slots.length) continue;
  rollenJeAsset[ref] = [];
  for (const rolle of ["hero", "inline"]) {
    // Geprüft wird mit den TATSÄCHLICHEN Label-Texten des Objekts (die abgenommenen
    // Mockup-Texte): die Frage ist, ob das Objekt in dieser Rolle mit seiner eigenen
    // Beschriftung funktioniert — nicht mit Füllzeichen.
    const echt = Object.fromEntries(slots.map((t) => [t.id, MUSTER[t.id]]));
    const f = await befunde(ref, echt, rolle);
    if (!f.length) rollenJeAsset[ref].push(rolle);
    else if (rolle === "hero") console.log(`  ${ref} scheitert schon als hero: ${f[0]}`);
  }
  console.log(`${ref.padEnd(21)} Rollen: ${rollenJeAsset[ref].join(", ") || "(keine!)"}`);
}

const vorschlag = {};
for (const [ref, a] of Object.entries(manifest.assets)) {
  const slots = a.labelSlots || [];
  if (!slots.length) continue;
  vorschlag[ref] = {};
  for (const rolle of rollenJeAsset[ref]) {
    for (const s of slots) {
      // Die anderen Plätze bleiben auf ihrem bisherigen Deckel — Nachbarn gehören zur Lage.
      // Vom abgenommenen Text aus WACHSEN: die Frage ist, wie viel länger dieser Platz
      // werden darf, ohne dass es kracht. Bei 4 Zeichen anzufangen hieße, einen Deckel
      // von 0 zu melden, sobald irgendein Nachbar-Text stört.
      let gut = MUSTER[s.id].length;
      for (let n = gut; n <= OBER; n++) {
        const labels = Object.fromEntries(slots.map((t) => [t.id, t.id === s.id ? text(t.id, n) : MUSTER[t.id]]));
        if ((await befunde(ref, labels, rolle)).length) { gut = n - 1; break; }
        gut = n;
      }
      const bisher = vorschlag[ref][s.id];
      vorschlag[ref][s.id] = bisher === undefined ? gut : Math.min(bisher, gut);
    }
  }
}

// Gegenprobe: alle Plätze gleichzeitig am Deckel, beide Rollen. Wo es kracht, wird der
// LÄNGSTE Platz um eins gekürzt und erneut geprüft — so bleibt der Deckel gemessen.
for (const [ref, deckel] of Object.entries(vorschlag)) {
  for (let runde = 0; runde < 40; runde++) {
    let schlimm = null;
    for (const rolle of rollenJeAsset[ref]) {
      const labels = Object.fromEntries(Object.entries(deckel).map(([id, n]) => [id, text(id, n)]));
      const f = await befunde(ref, labels, rolle);
      if (f.length) { schlimm = { rolle, f }; break; }
    }
    if (!schlimm) break;
    const laengster = Object.entries(deckel).sort((a, b) => b[1] - a[1])[0][0];
    deckel[laengster]--;
    console.log(`  ${ref} (${schlimm.rolle}): Kombination kracht (${schlimm.f[0].slice(0, 60)}) → "${laengster}" auf ${deckel[laengster]}`);
  }
}

console.log("\nPlatz-Deckel (gemessen mit realistischem Label-Text, beide Rollen, inkl. Kombination):");
let geaendert = 0;
for (const [ref, a] of Object.entries(manifest.assets)) {
  for (const s of (a.labelSlots || [])) {
    const neu = vorschlag[ref]?.[s.id];
    if (neu === undefined) continue;
    const demo = MUSTER[s.id];
    const passt = demo && demo.length <= neu;
    console.log(`  ${ref.padEnd(21)} ${s.id.padEnd(12)} max ${String(s.max).padStart(2)} → ${String(neu).padStart(2)}`
      + `   abgenommener Text ${JSON.stringify(demo)} (${demo?.length}) ${passt ? "passt" : "PASST NICHT"}`);
    if (neu !== s.max) geaendert++;
    if (process.argv.includes("--schreiben")) s.max = neu;
  }
  if (process.argv.includes("--schreiben") && rollenJeAsset[ref]) a.rollen = rollenJeAsset[ref];
}
if (process.argv.includes("--schreiben")) {
  writeFileSync(manifestPfad, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nMANIFEST GESCHRIEBEN — ${geaendert} Deckel geändert (danach: node build-assets.mjs)`);
} else console.log(`\n${geaendert} Deckel würden sich ändern (--schreiben übernimmt sie)`);
await browser.close();
