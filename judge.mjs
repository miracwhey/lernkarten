// Fakten-Judge: unabhängiges Modell (Default DeepSeek via NIM — nie das Generator-
// Modell, es spräche sich selbst frei) prüft eine Lektion gegen das Dossier.
// Enger Auftrag: Arithmetik nachrechnen, Mechanismen abgleichen, Detektor-Flags
// beurteilen. Meldet NUR Probleme, mit konkretem fix je Feld (→ Patch-Mechanik).
// Nutzung: node judge.mjs <lesson.json> <dossier.md> [modell-id]  → Exit 0 / 2.
// Als Modul: import { judgeLesson }.
import { readFileSync } from "fs";
import { loadKey, resolveModel, nimChat, extractJson } from "./nim.mjs";
import { factFlags } from "./factcheck.mjs";

const JUDGE_SYSTEM = `Du bist Fakten-Prüfer für Lernkarten. Du erhältst ein Fakten-Dossier (die einzige zulässige Quelle), eine Lektion als JSON und eine Liste automatischer Prüfaufträge.

Prüfe ausschließlich Fakten — keine Stilnoten, keine Didaktik. Konkret:
1. **Rechne jede Zahlen- und Mengenaussage nach** (Halbwertszeiten, Uhrzeit-Differenzen, Prozente, Faktoren wie „Hälfte/Viertel/doppelt"). Schreibe die Rechnung auf.
2. **Prüfe Mechanismus-Behauptungen gegen das Dossier** (falsche Kategorie wie „Hormon" statt Rezeptor-Blockade = Fehler; das Dossier listet typische Fehler explizit).
3. **Beurteile jeden Prüfauftrag** der Liste: echter Fehler, unbelegt, oder unbedenklich?
4. **Zitat**: Das Insight-Zitat muss im Dossier belegt sein (sinngemäße Übersetzung ok). Unbelegt = melden.
5. **Wort-Sinn-Aufträge** (kind „wort-sinn"): Beurteile NUR, ob das genannte Wort als deutsches Wort existiert und keinen bestehenden Begriff verdreht. Verdrehte oder erfundene Komposita („Schlafmantel" statt „Schlafmangel") sind Fehler → finding mit fix (korrigierter Feldwert, Längen-Limit des Felds beachten). Alltags- und Beispielwörter (Zahnarzt, Bäcker, Espresso) sind auch OHNE Dossier-Bezug in Ordnung — Captions dürfen frei erfundene Alltagsbeispiele nutzen; fehlender Dossier-Bezug ist bei wort-sinn NIE ein Fehler.

Toleranz: Alltagsrundung in Beispielen ist ok, wenn die Größenordnung stimmt (±20 %). Ein falscher Faktor (Viertel statt Hälfte), eine falsche Kategorie oder eine erfundene Zahl ist NIE ok.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{"checks":[{"auftrag":"<path — kind, exakt aus der Prüfauftrag-Liste>","rechnung":"<explizite Nachrechnung bzw. Dossier-Abgleich>","ergebnis":"ok|fehler"}],
 "findings":[{"path":"<JSON-Pfad des Felds, z. B. cards[3].text>","zitat":"<die beanstandete Aussage>","problem":"<was falsch/unbelegt ist>","rechnung":"<Nachrechnung, falls Zahlen>","verdict":"wrong|unsupported|imprecise","fix":"<vollständiger korrigierter Feldwert>"}]}

PFLICHT: "checks" enthält GENAU EINEN Eintrag pro Zeile der Prüfauftrag-Liste, in derselben Reihenfolge — keinen auslassen. Bei Uhrzeit-Rechnungen: Differenz explizit bilden (16 Uhr → 21 Uhr = 5 h = eine Halbwertszeit = 50 %). Jeder check mit ergebnis "fehler" braucht ein zugehöriges finding. Findings darfst du auch für Fehler melden, die in keinem Prüfauftrag stehen.

Regeln für fix: kompletter Ersatz-Text des Felds unter path (nicht nur das korrigierte Wort), gleiche Sprache/Ton, HTML-Auszeichnung des Originals erhalten, ähnlich lang oder kürzer als das Original (harte Limits: text ≤ 220, caption ≤ 90, explain ≤ 180, quiz-Option ≤ 42 Zeichen). Korrekte Karten erzeugen KEIN Finding. Keine Probleme → {"findings":[]}.`;

export async function judgeLesson(lesson, dossier, opts = {}) {
  const flags = opts.flags ?? factFlags(lesson, dossier);
  const key = loadKey(opts.keyName ?? "NVIDIA_DS_PRO_KEY");
  const model = opts.model ?? await resolveModel(key, opts.modelFilter ?? "deepseek");
  const user = `## Fakten-Dossier\n\n${dossier}\n\n## Lektion (JSON)\n\n${JSON.stringify(lesson, null, 2)}\n\n## Automatische Prüfaufträge\n\n${flags.length ? flags.map((f) => `- [${f.kind}] ${f.path}: ${f.detail}`).join("\n") : "(keine)"}`;
  const messages = [
    { role: "system", content: JUDGE_SYSTEM },
    { role: "user", content: user }
  ];
  // Vollständigkeits-Gate: jeder Prüfauftrag braucht seine Check-Zeile — ein Retry bei Lücken.
  for (let attempt = 0; ; attempt++) {
    const raw = await nimChat(key, model, messages, { temperature: 0.1, paceMs: opts.paceMs ?? 5000 });
    const parsed = extractJson(raw);
    if (!Array.isArray(parsed.findings) || !Array.isArray(parsed.checks)) throw new Error("Judge-Antwort ohne checks/findings-Arrays");
    if (parsed.checks.length >= flags.length || attempt >= 1)
      return { findings: parsed.findings, checks: parsed.checks, model, flags };
    console.log(`Judge: nur ${parsed.checks.length}/${flags.length} Prüfaufträge abgearbeitet — Retry…`);
    messages.push({ role: "assistant", content: raw });
    messages.push({ role: "user", content: `Deine checks-Liste hat ${parsed.checks.length} Einträge, die Prüfauftrag-Liste ${flags.length}. Arbeite JEDEN Auftrag einzeln ab (gleiche Reihenfolge, mit expliziter Rechnung) und sende das vollständige JSON erneut.` });
  }
}

// Markup-Restaurierung: ein Fix hat Auszeichnungs-Tags des Originals verloren —
// gezielter Nach-Call, der NUR Tags in den neuen Text einsetzt (Text bleibt wörtlich).
export async function restoreMarkup(items, opts = {}) {
  if (!items.length) return {};
  const key = loadKey(opts.keyName ?? "NVIDIA_DS_PRO_KEY");
  const model = opts.model ?? await resolveModel(key, opts.modelFilter ?? "deepseek");
  const user = `In korrigierten Lernkarten-Feldern ist die HTML-Auszeichnung des Originals verloren gegangen. Setze sie sinngemäß in den NEUEN Text ein — der Wortlaut des neuen Texts bleibt EXAKT unverändert, du fügst nur Tags hinzu.

Erlaubte Tags und Bedeutung: <b>…</b> (Indigo — Lösungs-/Kernbegriff), <span class="w-es">…</span> (Koralle — Problem/Gefahr/Verlust), <span class="w-ue">…</span> (Ocker — Belohnung/Wert), <strong>…</strong> (nur wo das Original <strong> nutzte). Markiere die Begriffe, die der Rolle der im Original markierten Begriffe entsprechen.

${items.map((it) => `### ${it.path}\nOriginal (mit Tags): ${it.original}\nNeuer Text (Tags fehlen): ${it.value}`).join("\n\n")}

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt { "<path>": "<neuer Text mit Tags>", … } für alle Felder.`;
  const raw = await nimChat(key, model, [{ role: "user", content: user }], { temperature: 0.1, paceMs: opts.paceMs ?? 5000 });
  return extractJson(raw);
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const lesson = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const dossier = readFileSync(process.argv[3], "utf8");
  const { findings, checks, model, flags } = await judgeLesson(lesson, dossier, { model: process.argv[4] });
  console.log(`Judge: ${model} · ${flags.length} Prüfaufträge`);
  for (const c of checks) console.log(`  [${c.ergebnis}] ${c.auftrag} — ${c.rechnung}`);
  if (!findings.length) { console.log("JUDGE PASS — keine Fakten-Befunde"); process.exit(0); }
  console.log(`JUDGE — ${findings.length} Befund(e):`);
  for (const f of findings) {
    console.log(`\n[${f.verdict}] ${f.path}\n  Aussage: ${f.zitat}\n  Problem: ${f.problem}${f.rechnung ? `\n  Rechnung: ${f.rechnung}` : ""}\n  Fix: ${f.fix}`);
  }
  process.exit(2);
}
