// Fakten-Detektor (deterministisch): gleicht belegpflichtige Zahlen der Lektion
// gegen das Dossier ab und prüft, ob das Insight-Zitat belegt ist. Findet keine
// Wahrheit — er erzeugt PRÜFAUFTRÄGE für den Judge (wie spellcheck.mjs).
// Nutzung: node factcheck.mjs <lesson.json> <dossier.md>  → Exit 0 / 2 (Flags).
// Als Modul: import { factFlags }.
import { readFileSync } from "fs";

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
