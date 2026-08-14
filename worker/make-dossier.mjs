// Dossier-Stufe (Mockup S4, Schritt „Quellen sammeln"): Thema bzw. eigener Text →
// Fakten-Dossier im Format von facts/why-we-sleep.md. Das Dossier ist die EINZIGE
// Grounding-Quelle, die Generator UND Judge danach lesen — steht ein Fakt nicht
// drin, darf er nicht in die Lektion. Darum steht vor der Weitergabe ein
// deterministisches Format-Gate: fehlende oder zu dünne Sektion = kein Dossier.
// Nutzung: node worker/make-dossier.mjs --kind topic --depth standard --input "Photosynthese" [--out d.md]
//          --kein-zahlen-gate überspringt die Judge-Prüfung der Zahlen (Debug).
import { readFileSync, writeFileSync } from "fs";
import { cardRange } from "../validate-lesson.mjs";
import { CHAIN, chat } from "./models.mjs";
import { pruefeZahlen } from "./dossier-check.mjs";

const DIR = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const VORBILD_PATH = `${DIR}/../facts/why-we-sleep.md`;

// Format-Contract, aus facts/why-we-sleep.md abgelesen: vier Pflicht-Sektionen mit
// exakt diesen Überschriften, jede als Aufzählung.
export const SEKTIONEN = [
  { head: "## Mechanismen (belegt)", name: "Mechanismen" },
  { head: "## Zahlen (belegt)", name: "Zahlen" },
  { head: "## Zitate (belegt, deutsche Übersetzung zulässig)", name: "Zitate" },
  { head: "## Typische Fehler (nicht schreiben)", name: "Typische Fehler" },
];

// Tiefe steuert die Dichte des Dossiers UND die Kartenzahl der Lektion
// (validate-lesson.mjs: DEPTH_CARDS). Das Dossier muss so viel Stoff tragen, wie
// die Lektion Karten hat — sonst wiederholt der Generator sich, um den Contract
// zu erfüllen. Faustregel: jeder Mechanismus und jede Zahl trägt ~eine Karte.
// `tokens` = Ausgabe-Budget der Stufe. Es MUSS mit der geforderten Dichte wachsen:
// Denk-Tokens zählen bei Thinking-Modellen mit, und ein zu knappes Budget schneidet
// die Antwort mitten im Dossier ab — das Format-Gate meldet dann „Sektion fehlt"
// und schickt das Modell auf die falsche Fährte.
export const DEPTHS = {
  kompakt:  { Mechanismen: 3, Zahlen: 3, Zitate: 1, "Typische Fehler": 3, tokens: 4000, soll: "3–4 Mechanismen, 3–4 Zahlen" },
  standard: { Mechanismen: 5, Zahlen: 5, Zitate: 1, "Typische Fehler": 3, tokens: 6000, soll: "6–8 Mechanismen, 5–7 Zahlen" },
  tief:     { Mechanismen: 8, Zahlen: 7, Zitate: 1, "Typische Fehler": 5, tokens: 10000, soll: "9–12 Mechanismen, 8–10 Zahlen" },
};

/// Zählt die Aufzählungspunkte je Sektion (eine Zeile, die mit "- " beginnt).
export function sektionsPunkte(md) {
  const out = {};
  for (let i = 0; i < SEKTIONEN.length; i++) {
    const start = md.indexOf(SEKTIONEN[i].head);
    if (start < 0) { out[SEKTIONEN[i].name] = null; continue; }
    const rest = md.slice(start + SEKTIONEN[i].head.length);
    const end = rest.search(/\n## /);
    const body = end < 0 ? rest : rest.slice(0, end);
    out[SEKTIONEN[i].name] = body.split("\n").filter((l) => /^-\s+\S/.test(l)).length;
  }
  return out;
}

/// Deterministisches Gate. Liefert eine Fehlerliste (leer = Dossier brauchbar).
export function pruefeDossier(md, depth) {
  const min = DEPTHS[depth] ?? DEPTHS.standard;
  const errs = [];
  if (!md.trim()) return ["Leere Antwort — kein Dossier."];
  // Abgeschnittene Antwort erkennen, bevor die Zählungen sie als „Sektion fehlt"
  // fehldeuten: ein vollständiges Dossier endet mit einem abgeschlossenen Satz.
  const letzte = md.trimEnd().split("\n").at(-1).trim();
  if (!/[.)\]"“”»)]$/.test(letzte))
    errs.push(`Dossier endet mitten im Satz ("…${letzte.slice(-40)}") — die Antwort war abgeschnitten. Sende sie vollständig und kürzer gefasst.`);
  if (!/^# Fakten-Dossier: \S/m.test(md)) errs.push('Kopfzeile fehlt — erste Zeile muss "# Fakten-Dossier: <Titel>" sein.');
  const punkte = sektionsPunkte(md);
  for (const { head, name } of SEKTIONEN) {
    const n = punkte[name];
    if (n === null) { errs.push(`Sektion "${head}" fehlt komplett (Überschrift wortgleich übernehmen).`); continue; }
    if (n < min[name]) errs.push(`Sektion "${name}" hat ${n} Punkte, gefordert sind mindestens ${min[name]}.`);
  }
  if (md.length > 12000) errs.push(`Dossier ist ${md.length} Zeichen lang — maximal 12000 (es wandert in jeden Generator-Prompt).`);
  return errs;
}

const SYSTEM = `Du bist Fakten-Rechercheur für eine Lernkarten-App. Du lieferst ein Fakten-Dossier in Markdown — die einzige Quelle, aus der ein Generator die Lektion schreibt und ein unabhängiger Judge sie anschließend prüft.

Harte Regeln:
1. Antworte AUSSCHLIESSLICH mit dem Markdown-Dossier. Keine Zäune, keine Vorrede, kein Kommentar.
2. Übernimm die vier Sektions-Überschriften WORTGLEICH aus dem Vorbild unten, in derselben Reihenfolge.
3. Jede Zahl muss stimmen und einordbar sein (Einheit, Bezugsgröße). Erfinde keine Zahl und keine Studie.
4. **Zitate**: nur echte, zuschreibbare Aussagen mit Urheber. Erfinde NIEMALS ein Zitat. Findest du kein belegtes Zitat, nimm einen breit anerkannten Merksatz des Fachgebiets und nenne als Urheber das Fachgebiet, nicht eine erfundene Person.
5. **Typische Fehler**: die häufigsten Verwechslungen zum Thema — jeweils der falsche Satz PLUS in Klammern, warum er falsch ist. Diese Sektion ist der wichtigste Teil; sie hält den Generator von den üblichen Halbwahrheiten ab.
6. Deutsch, Fachbegriffe präzise benennen (Rezeptor, Enzym, Antagonist — keine Umschreibung, wo der Begriff steht).
7. Mechanismen erklären das WIE, nicht nur das DASS.`;

const VORBILD = () => `## Vorbild (Format — Inhalt ist ein anderes Thema, nur die Struktur übernehmen)

\`\`\`markdown
${readFileSync(VORBILD_PATH, "utf8")}
\`\`\``;

function auftrag({ kind, input, depth }) {
  const min = DEPTHS[depth] ?? DEPTHS.standard;
  const [lo, hi] = cardRange(DEPTHS[depth] ? depth : "standard");
  const umfang = `Umfang für Tiefe „${depth}": ${min.soll}, mindestens 1 Zitat, mindestens ${min["Typische Fehler"]} typische Fehler.`
    + `\nAus diesem Dossier entsteht eine Lektion mit ${lo}–${hi} Karten, und jede Karte trägt genau einen Gedanken — liefere so viele eigenständige Mechanismen und Zahlen, dass der Stoff dafür reicht, ohne dass sich etwas wiederholt.`;
  if (kind === "text") {
    return `Erstelle das Dossier AUSSCHLIESSLICH aus dem folgenden Text des Nutzers.

STRENG: Kein Weltwissen, keine Ergänzung, keine Zahl und kein Mechanismus, der nicht im Text steht. Zitate nur wörtlich aus dem Text. Steht etwas nicht im Text, kommt es nicht ins Dossier — lieber weniger Punkte als erfundene. Die Sektion „Typische Fehler" leitest du aus dem Text ab: Aussagen, die dem Text WIDERSPRECHEN.

${umfang}

## Text des Nutzers

${input}`;
  }
  return `Erstelle das Dossier zum Thema: ${input}

${umfang}

Nimm den etablierten Wissensstand des Fachgebiets. Ist das Thema breit, wähle den Kern, den man in ${lo}–${hi} Karten wirklich verstehen kann, und geh dort in die Tiefe — statt alles flach zu streifen.`;
}

/// Erzeugt ein Dossier mit dem gegebenen Modell. Bei Gate-Fehlern eine Reparatur-
/// Runde mit der konkreten Fehlerliste (Markdown kennt keinen Feld-Patch).
/// Zwei Gates hintereinander: FORMAT (deterministisch, hier) und ZAHLEN
/// (unabhängiger Judge, dossier-check.mjs) — Letzteres kann Zeilen streichen,
/// darum läuft das Format-Gate danach ein zweites Mal.
export async function makeDossier({ kind, input, depth, model, log = console.log, signal, zahlenGate = true }) {
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `${VORBILD()}\n\n---\n\n${auftrag({ kind, input, depth })}` },
  ];
  let md = "", errs = [];
  for (let runde = 1; runde <= 2; runde++) {
    // Das Signal des Aufrufers reicht bis in den fetch: läuft die Job-Deadline ab,
    // wird der Request wirklich abgebrochen statt im Hintergrund weiterzulaufen.
    md = stripFences(await chat(model, messages, { temperature: 0.3, maxTokens: (DEPTHS[depth] ?? DEPTHS.standard).tokens, retries: 3, signal }));
    errs = pruefeDossier(md, depth);
    if (!errs.length) {
      log(`Dossier-Format OK (${md.length} Zeichen, ${JSON.stringify(sektionsPunkte(md))})`);
      if (!zahlenGate) return md;
      const geprueft = await pruefeZahlen(md, { log, signal, dossierModel: model.id });
      const nachErrs = pruefeDossier(geprueft.md, depth);
      if (nachErrs.length) {
        // Streichungen haben eine Sektion unter das Minimum gedrückt — lieber ein
        // dünneres Dossier als eine falsche Zahl, aber nicht unter das Format-Gate.
        log(`Nach dem Zahlen-Gate verletzt das Dossier das Format:\n` + nachErrs.map((e) => "- " + e).join("\n"));
        errs = nachErrs;
        if (runde === 2) break;
        messages.push({ role: "assistant", content: md });
        messages.push({ role: "user", content: `Ein unabhängiger Prüfer hat diese Zahlen beanstandet:\n${geprueft.befunde.map((b) => `- [${b.schwere}] ${b.problem}`).join("\n")}\n\nDie beanstandeten Zeilen wurden entfernt, dadurch fehlt jetzt Substanz:\n${nachErrs.map((e) => "- " + e).join("\n")}\n\nSende das VOLLSTÄNDIGE Dossier erneut — mit belegbaren Ersatz-Punkten für die entfernten. Nur das Markdown, nichts sonst.` });
        continue;
      }
      log(`Dossier OK (${geprueft.md.length} Zeichen, ${JSON.stringify(sektionsPunkte(geprueft.md))}`
        + `, Zahlen-Gate: ${geprueft.pruefungen.length} Prüfungen / ${geprueft.befunde.length} Befund(e) / ${geprueft.gestrichen.length} gestrichen)`);
      return geprueft.md;
    }
    log(`Dossier-Format Runde ${runde} — ${errs.length} Verstoß/Verstöße:\n` + errs.map((e) => "- " + e).join("\n"));
    if (runde === 2) break;
    messages.push({ role: "assistant", content: md });
    messages.push({ role: "user", content: `Das Dossier verletzt das Format. Fehlerliste:\n${errs.map((e) => "- " + e).join("\n")}\n\nSende das VOLLSTÄNDIGE korrigierte Dossier erneut — nur das Markdown, nichts sonst.` });
  }
  // Inhaltliches Scheitern (Gate nach 2 Runden) als solches markieren — API-/
  // Netz-Fehler tragen die Markierung nicht und dürfen dem Nutzer nie als
  // „keine Quellen" etikettiert werden.
  const err = new Error(`Dossier nach 2 Runden nicht brauchbar: ${errs.join(" | ")}`);
  err.inhaltlich = true;
  throw err;
}

const stripFences = (s) => s.replace(/^\s*```(?:markdown|md)?\s*\n/, "").replace(/\n```\s*$/, "").trim();

// CLI — Dossier-Stufe einzeln fahren (Debug, ohne Job-Queue).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const arg = (n) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : null; };
  const md = await makeDossier({
    kind: arg("kind") ?? "topic",
    input: arg("input"),
    depth: arg("depth") ?? "standard",
    model: CHAIN.find((m) => m.id === arg("model")) ?? CHAIN[0],
    zahlenGate: !process.argv.includes("--kein-zahlen-gate"),
  });
  const out = arg("out");
  if (out) { writeFileSync(out, md); console.log("→", out); } else console.log(md);
}
