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

const karte = (ref, labels, role, zusatz = {}) => ({
  type: "asset", relation: "object", text: "Deckel-Messung.", caption: "Deckel-Messung.",
  asset: { ref, role, labels, ...(zusatz.subs ? { subs: zusatz.subs } : {}) },
  ...(zusatz.notes ? { notes: zusatz.notes } : {})
});
const befunde = async (ref, labels, role, zusatz = {}) => {
  const { out } = await page.evaluate(auditCurveCard, { card: karte(ref, labels, role, zusatz) });
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

// ——— Sub-Zeilen: derselbe Weg, eine Ebene tiefer ———
// Die Sub-Zeile steht konstruktiv unter ihrem Label, also wird sie MIT gesetzten Labels
// gemessen. Anders als beim Label gibt es keinen abgenommenen Text, von dem aus gewachsen
// werden könnte — deshalb von unten. Es gilt dieselbe Konvention wie oben: der erste
// Befund beendet die Reihe, die Autorität bleibt das Layout-Gate.
//
// Der Deckel steht hier JE ROLLE, anders als beim Label. Gemessen: dieselbe Sub-Zeile
// trägt am psyche.person als hero 30 Zeichen und inline 7 — inline staucht die
// Komposition auf 60 %, die Schrift bleibt gleich groß. Ein Minimum über beide Rollen
// wäre kein Deckel, sondern eine Verengung: es verböte die abgenommene Mockup-Karte
// (hero) wegen einer Enge, die nur in der anderen Rolle existiert.
const subVorschlag = {};
for (const [ref, a] of Object.entries(manifest.assets)) {
  const slots = a.labelSlots || [];
  if (!slots.length) continue;
  const alleLabels = Object.fromEntries(slots.map((t) => [t.id, MUSTER[t.id]]));
  subVorschlag[ref] = {};
  for (const rolle of rollenJeAsset[ref]) {
    const deckel = {};
    for (const s of slots) {
      // Gewachsen wird mit realistischem Text — wie beim Label. Wo ein abgenommener
      // Sub-Text existiert (subBeispiel aus dem Mockup), ist ER das Muster und der
      // Startwert: gemessen mit Füllmuster fiel der Deckel unter den abgenommenen Text
      // (144 px Füllung gegen 142 px echten Text — genau an der Clip-Kante).
      const muster = s.subBeispiel || MUSTER[s.id];
      const subText = (n) => (muster + " ").repeat(Math.ceil(n / (muster.length + 1)) + 1).slice(0, n).trim().padEnd(n, "N");
      const start = s.subBeispiel ? s.subBeispiel.length : 4;
      let gut = start - 1;
      for (let n = start; n <= OBER; n++) {
        if ((await befunde(ref, alleLabels, rolle, { subs: { [s.id]: subText(n) } })).length) { gut = n - 1; break; }
        gut = n;
      }
      deckel[s.id] = Math.max(0, gut);
    }
    // Gegenprobe wie bei den Labels: ALLE Sub-Zeilen dieser Rolle gleichzeitig am Deckel.
    for (let runde = 0; runde < 40; runde++) {
      const offen = Object.entries(deckel).filter(([, n]) => n > 0);
      if (!offen.length) break;
      const subs = Object.fromEntries(offen.map(([id, n]) => {
        const m2 = slots.find((t) => t.id === id).subBeispiel || MUSTER[id];
        return [id, (m2 + " ").repeat(Math.ceil(n / (m2.length + 1)) + 1).slice(0, n).trim().padEnd(n, "N")];
      }));
      const f = await befunde(ref, alleLabels, rolle, { subs });
      if (!f.length) break;
      const laengster = offen.sort((x, y) => y[1] - x[1])[0][0];
      deckel[laengster]--;
      console.log(`  ${ref} (${rolle}): Sub-Kombination kracht (${f[0].slice(0, 60)}) → "${laengster}" auf ${deckel[laengster]}`);
    }
    for (const [id, n] of Object.entries(deckel)) {
      subVorschlag[ref][id] = { ...(subVorschlag[ref][id] || {}), [rolle]: n };
    }
  }
}

// ——— Notes: der Deckel gilt für JEDEN Anker ———
// Eine Note darf an jedem Gegenstand des Objekts hängen; der Deckel muss deshalb am
// ENGSTEN Anker gelten, nicht am bequemsten. Zwei Zeilen sind erlaubt (der Renderer
// bricht selbst um), die Obergrenze liegt darum höher als bei einem Label.
const NOTE_OBER = 48;
const noteVorschlag = {};
for (const [ref, a] of Object.entries(manifest.assets)) {
  const slots = a.labelSlots || [];
  const anker = a.anker || [];
  if (!slots.length || !anker.length) continue;
  const alleLabels = Object.fromEntries(slots.map((t) => [t.id, MUSTER[t.id]]));
  const muster = MUSTER[slots[0].id];
  const noteText = (n) => (muster + " ").repeat(Math.ceil(n / (muster.length + 1)) + 1).slice(0, n).trim().padEnd(n, "N");
  let deckel = NOTE_OBER;
  for (const rolle of rollenJeAsset[ref]) {
    for (const ank of anker) {
      let gut = 0;
      for (let n = 4; n <= NOTE_OBER; n++) {
        if ((await befunde(ref, alleLabels, rolle, { notes: [{ anker: ank, text: noteText(n) }] })).length) { gut = n - 1; break; }
        gut = n;
      }
      if (gut < deckel) { deckel = gut; console.log(`  ${ref} (${rolle}): engster Note-Anker bisher "${ank}" → ${gut}`); }
    }
  }
  noteVorschlag[ref] = deckel;
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
    const sub = subVorschlag[ref]?.[s.id];
    if (sub === undefined) continue;
    const zeig = (v) => v ? Object.entries(v).map(([r, n]) => `${r} ${n}`).join(", ") : "-";
    console.log(`  ${"".padEnd(21)} ${s.id.padEnd(12)} sub ${zeig(s.subMax).padEnd(18)} → ${zeig(sub)}`
      + (Object.values(sub).some((n) => n > 0) ? "" : "   trägt keine Sub-Zeile"));
    if (JSON.stringify(sub) !== JSON.stringify(s.subMax)) geaendert++;
    if (process.argv.includes("--schreiben")) s.subMax = sub;
  }
  const note = noteVorschlag[ref];
  if (note !== undefined) {
    console.log(`  ${ref.padEnd(21)} ${"(note)".padEnd(12)} max ${String(a.noteMax ?? "-").padStart(2)} → ${String(note).padStart(2)}`
      + (note > 0 ? "   (gilt am engsten Anker)" : "   trägt keine Notes"));
    if (note !== a.noteMax) geaendert++;
    if (process.argv.includes("--schreiben")) a.noteMax = note;
  }
  if (process.argv.includes("--schreiben") && rollenJeAsset[ref]) a.rollen = rollenJeAsset[ref];
}
if (process.argv.includes("--schreiben")) {
  writeFileSync(manifestPfad, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nMANIFEST GESCHRIEBEN — ${geaendert} Deckel geändert (danach: node build-assets.mjs)`);
} else console.log(`\n${geaendert} Deckel würden sich ändern (--schreiben übernimmt sie)`);
await browser.close();
