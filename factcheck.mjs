// Fakten-Detektor (deterministisch): gleicht belegpflichtige Zahlen der Lektion
// gegen das Dossier ab und prüft, ob das Insight-Zitat belegt ist. Findet keine
// Wahrheit — er erzeugt PRÜFAUFTRÄGE für den Judge (wie spellcheck.mjs).
// Nutzung: node factcheck.mjs <lesson.json> <dossier.md>  → Exit 0 / 2 (Flags).
// Als Modul: import { factFlags, geometryFlags }.
import { readFileSync } from "fs";
import { RELATION_TO_TYPE } from "./validate-lesson.mjs";

// Prosa-Felder wie im Spellcheck; stats ("7 Karten · 4 Minuten") ist Meta, keine Faktenfläche.
const SKIP_KEYS = new Set(["type", "relation", "color", "shape", "from", "to", "afterStop", "side", "series", "id", "source", "cite", "eyebrow", "stats"]);

// Relationale Mengenwörter: nicht belegpflichtig, aber IMMER nachzurechnen.
const RELATION_WORDS = /\b(hälfte|halb(e|es|er)?|viertel|drittel|doppelt|dreifach|verdoppelt|halbiert)\b/gi;

const normNum = (s) => parseFloat(s.replace(",", "."));

// Zahlen mit Kontextfenster extrahieren. Uhrzeiten ("um 16 Uhr") sind Szenario-Zahlen.
function numbersWithContext(text) {
  const plain = text.replace(/<[^>]+>/g, " ");
  const out = [];
  for (const m of plain.matchAll(/(\d+(?:[.,]\d+)?)/g)) {
    const start = Math.max(0, m.index - 24);
    const ctx = plain.slice(start, m.index + m[0].length + 24);
    const isClock = new RegExp(`(um|gegen|ab)\\s*${m[1].replace(",", "[.,]")}([\\s-]*Uhr)?|${m[1].replace(",", "[.,]")}[\\s-]*Uhr`, "i").test(ctx);
    out.push({ value: normNum(m[1]), raw: m[1], ctx: ctx.trim(), clock: isClock });
  }
  return out;
}

const normQuote = (s) => s.toLowerCase().replace(/[^a-zäöüß]/g, "");

export function factFlags(lesson, dossier) {
  const dossierNums = new Set(numbersWithContext(dossier).map((n) => n.value));
  const dossierNorm = normQuote(dossier);
  const flags = [];

  const walk = (v, path, key) => {
    if (SKIP_KEYS.has(key) && typeof v !== "object") return;
    if (typeof v === "string") {
      for (const n of numbersWithContext(v)) {
        if (n.clock) continue;                       // Szenario-Uhrzeit — Arithmetik prüft der Judge
        if (!dossierNums.has(n.value))
          flags.push({ kind: "ungedeckte-zahl", path, detail: `"${n.raw}" (Kontext: …${n.ctx}…) steht nicht im Dossier` });
      }
      const rel = [...v.replace(/<[^>]+>/g, " ").matchAll(RELATION_WORDS)].map((m) => m[0]);
      for (const w of new Set(rel.map((x) => x.toLowerCase())))
        flags.push({ kind: "rechen-aussage", path, detail: `Mengenwort "${w}" — Arithmetik nachrechnen` });
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, key));
    else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], path ? `${path}.${k}` : k, k);
  };
  walk(lesson, "", "");

  const quote = lesson.cards?.find((c) => c.type === "insight")?.quote;
  if (quote && !dossierNorm.includes(normQuote(quote)))
    flags.push({ kind: "unbelegtes-zitat", path: "cards[insight].quote", detail: `"${quote}" nicht (wörtlich) im Dossier — prüfen, ob sinngemäß belegt oder erfunden` });

  return flags;
}

// ── Geometrie-Sinn ───────────────────────────────────────────────────────────
// Zweite Hälfte der Fehlerklasse „Text widerspricht dem Bild": notecheck misst die
// Richtung an der Note-Position, sieht aber weder Lehrsatz noch Caption noch die
// Achsen-Beschriftung. Diese Flags übersetzen die DEKLARIERTE Geometrie in Worte und
// beauftragen den Judge, die Texte dagegen zu halten — deterministisch erzeugt, ohne
// Rendern: die Aussage steckt bereits im Karten-JSON.

// Was jede shape-Form zeichnet. Die Enums stammen aus validate-lesson.mjs; ändert
// sich dort eine Form, muss hier ihr Satz stehen (sonst beschreibt der Auftrag Unsinn).
const SHAPE_SINN = {
  "linear-rise": "STEIGT gleichmäßig",
  "compound-rise": "STEIGT beschleunigt (erst flach, dann steil)",
  "saturating-rise": "STEIGT und flacht oben ab",
  "decay-halflife": "FÄLLT ab (Halbwertszeit-Form)",
  "suppressed": "bleibt UNTEN, gedrückt (Delle statt Anstieg)",
  "flat": "bleibt KONSTANT",
};
const AFTER_STOP_SINN = {
  collapse: "bricht danach auf den Boden ein",
  reset: "fällt danach auf ihr Startniveau zurück",
  rebound: "schnellt danach über ihr bisheriges Maximum hinauf",
};
// Defaults exakt wie im Renderer (renderer.js, defFrom/defTo) — ein abweichender
// Default hier beschriebe dem Judge eine Kurve, die so nie gezeichnet wird.
const defFrom = (s) => s.from ?? (s.shape === "decay-halflife" ? "high" : "low");
const defTo = (s) => s.to ?? (s.shape === "decay-halflife" ? "floor"
  : (s.shape === "flat" || s.shape === "suppressed") ? defFrom(s) : "high");

const cardType = (c) => c.type ?? RELATION_TO_TYPE[c.relation];

export function geometryFlags(lesson) {
  const flags = [];
  (lesson.cards || []).forEach((c, i) => {
    const path = `cards[${i}]`;
    const typ = cardType(c);
    if (typ === "curve") {
      const serien = (c.series || []).map((s) => {
        const verlauf = SHAPE_SINN[s.shape] ?? `unbekannte Form "${s.shape}"`;
        const niveau = s.shape === "flat" || s.shape === "suppressed"
          ? `Niveau ${defFrom(s)}` : `von ${defFrom(s)} auf ${defTo(s)}`;
        return `„${s.label ?? "(ohne Label)"}" ${verlauf}, ${niveau}`
          + (s.afterStop ? ` und ${AFTER_STOP_SINN[s.afterStop] ?? s.afterStop}` : "");
      }).join("; ");
      const stop = c.stop ? ` Ereignis „${c.stop.label}" bei t=${c.stop.t} (${Math.round(c.stop.t * 100)} % der Breite).` : "";
      flags.push({ kind: "geometrie-sinn", path,
        detail: `Das Diagramm zeichnet: ${serien}.${stop} Achsen: x „${c.xlabel}", y „${c.ylabel}".`
          + ` Widersprechen text, caption oder ein Noten-Label dieser Richtung (z. B. „senkt" auf einer steigenden Serie)?`
          + ` Passen xlabel/ylabel zu der Größe, die hier dargestellt wird, und zum Dossier?` });
    }
    // Diagramm-Begriffe (alle Karten-Typen): Labels/Achsen einsammeln und als
    // Greifbarkeits-Auftrag an den Judge geben. Feldnamen-Whitelist statt Typ-Liste —
    // neue Diagramm-Typen mit label/sub-Feldern sind automatisch abgedeckt.
    // Lehrsatz-Register (text/caption/quote/source) gehört NICHT dazu: Fachbegriffe
    // sind dort erwünscht, auf dem Graphen steht ihre greifbare Übersetzung.
    if (typ && !["title", "quiz", "insight"].includes(typ)) {
      const begriffe = [];
      const sammle = (v, p) => {
        if (Array.isArray(v)) v.forEach((x, k) => sammle(x, `${p}[${k}]`));
        else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => {
          if (["text", "caption", "quote", "source", "options"].includes(k)) return;
          if (["label", "sub", "xlabel", "ylabel"].includes(k) && typeof x === "string") begriffe.push([`${p}.${k}`, x]);
          else sammle(x, `${p}.${k}`);
        });
      };
      sammle(c, path);
      if (begriffe.length) flags.push({ kind: "begriff-greifbar", path,
        detail: `Diagramm-Begriffe dieser Karte: ${begriffe.map(([bp, w]) => `${bp} = „${w}"`).join("; ")}.`
          + ` Versteht ein Leser OHNE Fachwissen jeden Begriff sofort (Erlebnis-/Alltagssprache)?`
          + ` Wiederholt ein Noten-Label sinngemäß ein Serien- oder Ereignis-Label derselben Karte?` });
    }
    if (typ === "balance") {
      // Der Renderer kippt den Balken statisch: linker Arm endet tiefer (y=107 gegen
      // y=85), linke Schale hängt unten — LINKS ist die schwerere Seite. Verifiziert
      // an renderer.js (balance) und der aria-Beschriftung „left wiegt schwerer".
      flags.push({ kind: "geometrie-sinn", path,
        detail: `Die Waage rendert die LINKE Seite als die schwerere (linke Schale hängt unten).`
          + ` Links steht „${c.left?.label}" (${c.left?.sub}), rechts „${c.right?.label}" (${c.right?.sub}), am Drehpunkt „${c.pivot?.label}".`
          + ` „${c.left?.label}" ist damit die schwerere — passt diese Seitenzuordnung zum Lehrsatz der Karte?`
          + ` Wiegt laut Lehrsatz und Dossier das rechte Objekt schwerer, müssen left und right getauscht werden.` });
    }
  });
  return flags;
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const lesson = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const dossier = readFileSync(process.argv[3], "utf8");
  const flags = factFlags(lesson, dossier);
  if (!flags.length) { console.log("FACTCHECK OK — keine Flags"); process.exit(0); }
  console.log("PRÜFAUFTRÄGE (für den Judge, nicht zwingend Fehler):\n" +
    flags.map((f) => `- [${f.kind}] ${f.path}: ${f.detail}`).join("\n"));
  process.exit(2);
}
