// Zahlen-Gate der Dossier-Stufe: das Dossier ist die EINZIGE Grundwahrheit, aus
// der Generator und Judge danach arbeiten — steht hier eine falsche Zahl, kann
// keine spätere Stufe sie noch finden (alle prüfen GEGEN das Dossier).
// Ablauf: Zahlen deterministisch extrahieren → unabhängiger Judge (nie das
// Dossier-Modell) arbeitet eine Zwangs-Checkliste ab, EINE Zeile pro Zahl →
// Befunde deterministisch patchen → Detektor erneut laufen lassen (ein LLM-Fix
// ist eine Behauptung) → was hart bleibt, fliegt als Zeile raus.
// Nutzung: node worker/dossier-check.mjs <dossier.md> [--patch <out.md>]
import { readFileSync, writeFileSync } from "fs";
import { chat, NIM_BASE } from "./models.mjs";
import { JUDGE } from "./models.mjs";
import { chatJson } from "../nim.mjs";

// Was KEINE Sachzahl ist und darum keinen Prüfauftrag erzeugt (sonst ertrinkt die
// Prüfliste in Quellen- und Namensbestandteilen):
//   Jahreszahlen (Quellenangabe), Ziffern direkt hinter einem Buchstaben (CO2,
//   H2O), Auflagen ("6. Aufl."), Namensbestandteile hinter Wort+Bindestrich
//   ("Aquaporin-1", "Ribulose-1,5-bisphosphat"). Zahlenspannen ("10–100") bleiben,
//   weil vor dem Bindestrich dort eine Ziffer steht.
const JAHR = /^(1[5-9]\d{2}|20\d{2})$/;
const ZAHL = /(?<![A-Za-zÄÖÜäöüß₀-₉·])(\d+(?:[.,]\d+)?)/g;
const istRauschen = (text, m) => JAHR.test(m[1].replace(",", "."))
  || /^\.\s*Aufl/.test(text.slice(m.index + m[1].length))
  || /[A-Za-zÄÖÜäöüß][-‑–]$/.test(text.slice(Math.max(0, m.index - 2), m.index));

/// Alle belegpflichtigen Zahlen mit ihrer Trägerzeile. Eine Behauptung = eine
/// Zeile; mehrere Zahlen in einer Zeile werden einzeln gelistet (der Judge muss
/// jede einzeln beurteilen), die Zeile ist die Patch-Einheit.
export function zahlenClaims(md) {
  const claims = [];
  const zeilen = md.split("\n");
  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];
    if (!/^\s*[-*]\s+\S/.test(zeile)) continue;          // nur Aufzählungspunkte
    const klar = zeile.replace(/\*\*/g, "");
    const zahlen = [...klar.matchAll(ZAHL)].filter((m) => !istRauschen(klar, m)).map((m) => m[1]);
    if (!zahlen.length) continue;
    claims.push({ nr: claims.length + 1, zeilenNr: i, zeile, zahlen: [...new Set(zahlen)] });
  }
  return claims;
}

const SYSTEM = `Du bist Zahlen-Prüfer für Fakten-Dossiers. Ein Dossier ist die einzige Quelle, aus der später eine Lernkarten-Lektion geschrieben wird — eine falsche Zahl hier vergiftet alles Folgende und wird von keiner späteren Prüfung mehr gefunden.

Du bekommst das Dossier und eine nummerierte Prüfliste. Prüfe JEDE Zahl der Prüfliste auf vier Dinge:
1. **Einheit** — ist eine Einheit genannt und passt sie zur Größe? (kg, %, nm, ppm, mOsm, atm, Faktor …)
2. **Zeitbasis** — bei Raten/Mengen: pro Tag, pro Jahr, pro Stunde, einmalig? Fehlt sie oder ist sie falsch, ist die Zahl wertlos. Achte besonders auf Zeitbasen, die um Größenordnungen danebenliegen (etwas „pro Tag" nennen, was ein Jahreswert ist, und umgekehrt).
3. **Größenordnung** — ist der Wert für diese Größe realistisch? Rechne gegen bekannte Bezugsgrößen (ein Mensch verbraucht ~0,8 kg Sauerstoff pro Tag; ein Jahr hat 365 Tage; ein großer Baum bindet einige kg Kohlenstoff pro Jahr …). Weicht der Wert um mehr als eine Größenordnung von der etablierten Lehrbuchgröße ab, ist das ein Fehler.
4. **Interne Konsistenz** — widerspricht die Zahl einer anderen Aussage im selben Dossier? Rechne Formeln nach, die im Dossier stehen.

Sei streng bei Einheit, Zeitbasis und Größenordnung; sei tolerant bei gerundeten Lehrbuchwerten und Spannen (±20 % sind in Ordnung, „rund"/„etwa" ist erlaubt).

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{"pruefungen":[{"nr":<Nummer aus der Prüfliste>,"zahl":"<die geprüfte Zahl mit Einheit>","zeitbasis":"<genannte Zeitbasis oder 'keine'>","groessenordnung":"<Vergleichsrechnung in einem Satz>","ergebnis":"ok|fehler"}],
 "befunde":[{"nr":<Nummer>,"schwere":"hart|weich","problem":"<was falsch ist, mit Rechnung>","fix":"<die VOLLSTÄNDIGE korrigierte Zeile, Markdown-Formatierung wie im Original>"}]}

PFLICHT: "pruefungen" enthält GENAU EINEN Eintrag pro Zeile der Prüfliste, in derselben Reihenfolge — keinen auslassen, auch nicht die unauffälligen. Jede Prüfung mit ergebnis "fehler" braucht einen Befund mit derselben nr.
schwere "hart" = falsche Einheit, falsche Zeitbasis, Größenordnung daneben, innerer Widerspruch. schwere "weich" = ungenau, aber nicht irreführend.
Der "fix" ersetzt die Zeile wörtlich: gleiche Aufzählungs-Syntax, gleiche Sprache, nur die Zahl bzw. ihre Einordnung korrigiert. Kannst du den korrekten Wert nicht sicher angeben, formuliere die Zeile ohne die Zahl.
Keine Fehler → {"pruefungen":[…],"befunde":[]}.`;

const prueflisteText = (claims) => claims
  .map((c) => `${c.nr}. Zahl(en) ${c.zahlen.join(", ")} in: ${c.zeile.trim()}`).join("\n");

/// Ein Judge-Durchgang über eine Claim-Liste. Vollständigkeits-Gate wie in
/// judge.mjs: fehlen Prüfzeilen, gibt es genau EINEN Nachschlag.
async function judgeZahlen(md, claims, opts) {
  // Über den Chat-Chokepoint aus models.mjs — der ist base-aware. Ein hartes
  // nimChat schickte den Judge-Key an die NIM-API, sobald der Judge auf einem
  // anderen Endpunkt liegt (OpenRouter → 401).
  const judge = { body: {}, ...opts.judge, base: opts.judge.base ?? NIM_BASE };
  const chatFn = (msgs) => chat(judge, msgs, { temperature: 0.1, paceMs: opts.paceMs ?? 5000, signal: opts.signal });
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `## Dossier\n\n${md}\n\n## Prüfliste (${claims.length} Zahlen-Behauptungen)\n\n${prueflisteText(claims)}` },
  ];
  for (let versuch = 0; ; versuch++) {
    const { value, raw } = await chatJson(chatFn, messages, { log: opts.log });
    const pruefungen = Array.isArray(value.pruefungen) ? value.pruefungen : [];
    const befunde = Array.isArray(value.befunde) ? value.befunde : [];
    if (pruefungen.length >= claims.length || versuch >= 1) return { pruefungen, befunde };
    opts.log(`Zahlen-Gate: nur ${pruefungen.length}/${claims.length} Prüfungen — Nachschlag…`);
    messages.push({ role: "assistant", content: raw });
    messages.push({ role: "user", content: `Deine Liste "pruefungen" hat ${pruefungen.length} Einträge, die Prüfliste ${claims.length}. Arbeite JEDE Nummer einzeln ab (gleiche Reihenfolge, mit Vergleichsrechnung) und sende das vollständige JSON erneut.` });
  }
}

/// Vollständiges Gate: prüfen → patchen → erneut prüfen → Unheilbares streichen.
/// Liefert { md, befunde, pruefungen, gestrichen } — md ist die geheilte Fassung.
export async function pruefeZahlen(md, opts = {}) {
  const log = opts.log ?? console.log;
  const judge = opts.judge ?? JUDGE;
  if (opts.dossierModel && opts.dossierModel === judge.id)
    throw new Error(`Zahlen-Gate: Judge (${judge.id}) darf nicht das Dossier-Modell sein.`);
  const claims = zahlenClaims(md);
  if (!claims.length) { log("Zahlen-Gate: keine Zahlen im Dossier — übersprungen."); return { md, befunde: [], pruefungen: [], gestrichen: [] }; }

  const { pruefungen, befunde } = await judgeZahlen(md, claims, { ...opts, judge, log });
  log(`Zahlen-Gate (${judge.id}): ${pruefungen.length}/${claims.length} Prüfungen, ${befunde.length} Befund(e)`);
  for (const b of befunde) log(`  [${b.schwere}] Nr. ${b.nr}: ${b.problem}`);
  if (!befunde.length) return { md, befunde, pruefungen, gestrichen: [] };

  // Deterministisch patchen: die Trägerzeile wird wörtlich ersetzt. Findet sich
  // das Original nicht exakt wieder, wird NICHT geraten — der Befund bleibt offen.
  let neu = md;
  const gepatcht = [];
  for (const b of befunde) {
    const claim = claims.find((c) => c.nr === Number(b.nr));
    if (!claim) { log(`  Befund ohne gültige nr (${b.nr}) — übersprungen`); continue; }
    if (!b.fix) { log(`  Befund Nr. ${b.nr} ohne fix — übersprungen`); continue; }
    if (!neu.includes(claim.zeile)) { log(`  Zeile zu Nr. ${b.nr} nicht mehr auffindbar — übersprungen`); continue; }
    neu = neu.replace(claim.zeile, b.fix.trimEnd());
    gepatcht.push({ ...b, alt: claim.zeile, neuZeile: b.fix.trimEnd() });
  }
  log(`  → ${gepatcht.length}/${befunde.length} Zeilen gepatcht`);
  if (!gepatcht.length) return { md: neu, befunde, pruefungen, gestrichen: [] };

  // Detektor-Re-Run: der Fix ist eine Behauptung. Nur die geänderten Zeilen erneut
  // prüfen — was danach HART bleibt, wird gestrichen (eine falsche Zahl im Dossier
  // ist schlimmer als ein fehlender Punkt; das Format-Gate zählt danach neu).
  const neueClaims = zahlenClaims(neu).filter((c) => gepatcht.some((g) => g.neuZeile.trim() === c.zeile.trim()));
  const gestrichen = [];
  if (neueClaims.length) {
    const nach = await judgeZahlen(neu, neueClaims.map((c, i) => ({ ...c, nr: i + 1 })), { ...opts, judge, log });
    const hart = nach.befunde.filter((b) => b.schwere === "hart");
    log(`  Detektor-Re-Run: ${nach.pruefungen.length} Prüfungen, ${hart.length} harte(r) Befund(e) überleben den Fix`);
    for (const b of hart) {
      const c = neueClaims[Number(b.nr) - 1];
      if (!c || !neu.includes(c.zeile)) continue;
      neu = neu.split("\n").filter((z) => z !== c.zeile).join("\n");
      gestrichen.push(c.zeile.trim());
      log(`  Zeile gestrichen (Befund überlebt den Fix): ${c.zeile.trim().slice(0, 110)}`);
    }
  }
  return { md: neu, befunde, pruefungen, gestrichen, gepatcht };
}

// CLI — Sonde über ein einzelnes Dossier.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const pfad = process.argv[2];
  const md = readFileSync(pfad, "utf8");
  const claims = zahlenClaims(md);
  console.log(`${pfad}: ${claims.length} Zahlen-Behauptungen`);
  for (const c of claims) console.log(`  ${c.nr}. [${c.zahlen.join(", ")}] ${c.zeile.trim().slice(0, 100)}`);
  if (process.argv.includes("--nur-extrakt")) process.exit(0);
  const r = await pruefeZahlen(md, {});
  for (const p of r.pruefungen) console.log(`  [${p.ergebnis}] Nr. ${p.nr} ${p.zahl} · Zeitbasis ${p.zeitbasis} — ${p.groessenordnung}`);
  const oIdx = process.argv.indexOf("--patch");
  if (oIdx > -1) { writeFileSync(process.argv[oIdx + 1], r.md); console.log("→", process.argv[oIdx + 1]); }
  console.log(r.befunde.length ? `ZAHLEN-GATE — ${r.befunde.length} Befund(e), ${r.gestrichen.length} Zeile(n) gestrichen` : "ZAHLEN-GATE PASS");
  process.exit(r.befunde.length ? 2 : 0);
}
