// Blindtest via NVIDIA NIM gegen Contract v2.
// Stufen: LLM (gegroundet aufs Fakten-Dossier) → Parse → normalize(relation→type)
// → Validator (Feld-Fehler als Patch-Runden, Struktur als Voll-Retry) → Spellcheck-
// Prüfrunde → Fakten-Stufe (Detektor-Flags + unabhängiger Judge, Fixes deterministisch
// gepatcht) → Render-Audit (Geometrie ist Systemsache — ein Fail hier ist UNSER Bug).
// Nutzung: node glm-generate.mjs [modell-id] [dossier.md]
//          node glm-generate.mjs --from <lesson.json> [dossier.md]   (nur Prüf-Stufen)
//          zusätzlich: --topic <text> --dossier <pfad> --outdir <dir> (Worker-Betrieb)
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { normalizeLesson, validateLesson } from "./validate-lesson.mjs";
import { suspiciousWords, wordFindings } from "./spellcheck.mjs";
import { factFlags } from "./factcheck.mjs";
import { judgeLesson, restoreMarkup } from "./judge.mjs";
import { loadKey } from "./nim.mjs";

const DIR = new URL(".", import.meta.url).pathname.replace(/\/$/, "");

// Args: [modell-id] [dossier.md] bzw. --from <lesson.json> [dossier.md];
// --key <ENV_NAME> überall erlaubt (Konto-Quotas hängen am Key, nicht am Modell —
// NIM-Katalog-Leichen wie Kimi zwingen sonst in tote Familien-Keys).
const argv = process.argv.slice(2);
const kIdx = argv.indexOf("--key");
const keyOverride = kIdx > -1 ? argv.splice(kIdx, 2)[1] : null;
// --base <url>: beliebiger OpenAI-kompatibler Endpunkt (Groq etc.); Default NIM.
const bIdx = argv.indexOf("--base");
const baseOverride = bIdx > -1 ? argv.splice(bIdx, 2)[1] : null;
// --body '<json>': Extra-Felder für den Request-Body (z. B. {"reasoning_effort":"none"}
// gegen Thinking-Modelle, deren Denk-Block sonst das Output-Budget frisst).
const eIdx = argv.indexOf("--body");
const bodyExtra = eIdx > -1 ? JSON.parse(argv.splice(eIdx, 2)[1]) : {};
// --judge <modell> --judgekey <ENV>: Judge-Austausch, wenn der Generator selbst
// DeepSeek ist (Judge darf NIE das Generator-Modell sein).
const jIdx = argv.indexOf("--judge");
const judgeModelArg = jIdx > -1 ? argv.splice(jIdx, 2)[1] : null;
const jkIdx = argv.indexOf("--judgekey");
const judgeKeyArg = jkIdx > -1 ? argv.splice(jkIdx, 2)[1] : null;
// --topic <text>: Thema der Lektion (Default = die Bestands-Blindtest-Vorgabe unten).
const tIdx = argv.indexOf("--topic");
const topicArg = tIdx > -1 ? argv.splice(tIdx, 2)[1] : null;
// --dossier <pfad>: Fakten-Dossier explizit (sonst wie bisher positional/Default).
const dIdx = argv.indexOf("--dossier");
const dossierArg = dIdx > -1 ? argv.splice(dIdx, 2)[1] : null;
// --outdir <dir>: Ablage aller Lauf-Artefakte (Default = Repo-Wurzel wie bisher);
// parallele Worker-Jobs überschreiben einander sonst über den gemeinsamen TAG.
const oIdx = argv.indexOf("--outdir");
const outdirArg = oIdx > -1 ? argv.splice(oIdx, 2)[1] : null;
const judgeOpts = { ...(judgeModelArg && { model: judgeModelArg }), ...(judgeKeyArg && { keyName: judgeKeyArg }) };
const fromFile = argv[0] === "--from" ? argv[1] : null;
// --from <lesson.json> [modell] [dossier.md] — Prüf-Stufen mit beliebigem Fixer-Modell
// (ohne Modell wie bisher: GLM aus dem Katalog, Fix-Runden nur soweit Kontingent).
const fromModel = fromFile && argv[2] && !argv[2].endsWith(".md") ? argv[2] : null;
const modelArg = fromFile ? fromModel : argv[0];

// claude-* Modelle laufen über die Anthropic-API (eigener Adapter unten),
// alles andere über NVIDIA NIM. Judge bleibt in beiden Fällen DeepSeek/NIM.
const isAnthropic = !!modelArg && modelArg.startsWith("claude");

// Key zum Modell auflösen: NVIDIA_<TOKEN>_KEY aus jarvis/.env, dessen Token in der
// Modell-ID vorkommt (glm→NVIDIA_GLM_KEY, …). Ohne Match/Arg bleibt GLM der Default.
const envKeys = readFileSync("/Users/leonvalentin/Workspace/jarvis/.env", "utf8")
  .split("\n").map((l) => l.match(/^(NVIDIA_([A-Z_]+)_KEY)=/)).filter(Boolean);
const keyName = isAnthropic ? "ANTHROPIC_API_KEY"
  : keyOverride ?? (modelArg && envKeys.find((m) => modelArg.toLowerCase().includes(m[2].toLowerCase()))?.[1]) ?? "NVIDIA_GLM_KEY";
console.log("Nutze Key:", keyName);
const KEY = isAnthropic ? null : loadKey(keyName);
const BASE = baseOverride ?? "https://integrate.api.nvidia.com/v1";
const HEADERS = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const DOSSIER_PATH = dossierArg ?? (fromFile ? (fromModel ? argv[3] : argv[2]) : argv[1]) ?? `${DIR}/facts/why-we-sleep.md`;
const dossier = readFileSync(DOSSIER_PATH, "utf8");
const OUT = outdirArg ?? DIR;
if (outdirArg) mkdirSync(OUT, { recursive: true });

let model = modelArg;
if (!model) {
  const res = await fetch(`${BASE}/models`, { headers: HEADERS });
  if (!res.ok) { console.log("MODELS-FEHLER:", res.status, (await res.text()).slice(0, 300)); process.exit(2); }
  const glms = (await res.json()).data.map((m) => m.id).filter((id) => id.toLowerCase().includes("glm")).sort();
  if (!glms.length) { console.log("Kein GLM-Modell im Katalog."); process.exit(2); }
  model = glms[glms.length - 1];
}
console.log("Nutze Modell:", model);
// Datei-Präfix je Generator-Modell — Läufe überschreiben einander nicht (--from ohne
// Modell bleibt beim glm-Bestand; --from MIT Modell schreibt <modell>-refix-*).
const slug = (m) => m.split("/").pop().toLowerCase().replace(/[^a-z0-9.-]/g, "");
const TAG = fromFile ? (fromModel ? slug(fromModel) + "-refix" : "glm") : slug(model);

const system = readFileSync(`${DIR}/generator-prompt.md`, "utf8");
const TOPIC = topicArg ?? `„Why We Sleep" von Matthew Walker (2017) — warum wir schlafen, Schlafdruck, Koffein, was Schlafmangel anrichtet.`;
const userBase = `Thema: ${TOPIC}

## Fakten-Dossier (bindend — Regel 9)

${dossier}

Deine finale Antwort ist NUR das JSON-Objekt der Lektion (beginnend mit { und endend mit }), ohne Markdown-Zäune, ohne jeden weiteren Text.`;

// Anthropic-Adapter: /v1/messages statt chat/completions — system als Top-Level-
// Parameter, Antwort als content-Blöcke, usage-Zahlen echt (Basis der Preisrechnung).
// Haiku 4.5 ist Prä-4.6: temperature erlaubt, kein thinking. Preise Stand 08/2026.
const PRICE = { "claude-haiku-4-5": { in: 1, out: 5 } };   // USD je 1M Token
const spend = { in: 0, out: 0, calls: 0 };
process.on("exit", () => {
  if (!spend.calls) return;
  const p = PRICE[model];
  console.log(`Anthropic-Verbrauch: ${spend.calls} Calls · ${spend.in} in / ${spend.out} out Tokens`
    + (p ? ` · ~$${(spend.in / 1e6 * p.in + spend.out / 1e6 * p.out).toFixed(4)}` : " (Modell nicht in PRICE — Kosten manuell rechnen)"));
});

async function anthropicChat(messages) {
  const key = process.env.ANTHROPIC_API_KEY ?? loadKey("ANTHROPIC_API_KEY");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  for (let i = 0; i < 5; i++) {
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 8000, temperature: 0.6, system, messages: rest }),
      });
    } catch (e) {
      const wait = 5000 * (i + 1);
      console.log(`NETZ-FEHLER (Anthropic): ${e.message} — warte ${wait / 1000}s…`);
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = (Number(res.headers.get("retry-after")) || 15) * 1000;
      console.log(`Anthropic ${res.status} — warte ${wait / 1000}s…`);
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    spend.in += data.usage.input_tokens; spend.out += data.usage.output_tokens; spend.calls++;
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!text) throw new Error(`Anthropic: keine Text-Antwort (stop_reason ${data.stop_reason})`);
    return text;
  }
  throw new Error("Anthropic: Rate-Limit hält an.");
}

let firstCall = true;
async function llm(messages) {
  if (isAnthropic) return anthropicChat(messages);   // kein Free-Tier-Pacing nötig
  // Free-Tier-Pacing: NIM drosselt aggressiv — Abstand halten statt hineinlaufen.
  if (!firstCall) await new Promise((ok) => setTimeout(ok, 25000));
  firstCall = false;
  for (let i = 0; i < 8; i++) {
    let res;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: "POST", headers: HEADERS,
        body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 8000, ...bodyExtra })
      });
    } catch (e) {
      // Netz kurz weg — transient, wie 5xx behandeln.
      const wait = 15000 * (i + 1);
      console.log(`NETZ-FEHLER: ${e.message} — warte ${wait / 1000}s…`);
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    // Rest-Panzerung: falls ein Thinking-Modell trotz Abschaltung <think>-Blöcke
    // inline liefert, fliegen sie hier raus — sonst bricht die JSON-Extraktion
    // und der Denk-Ballast bläht die Folge-Requests auf. content kann null sein,
    // wenn das Denken das komplette Output-Budget gefressen hat (z. B. gpt-oss).
    if (res.ok) {
      const msg = (await res.json()).choices[0].message;
      return (msg.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }
    const body = (await res.text()).slice(0, 300);
    if (res.status === 429 || res.status >= 500) {
      const wait = 30000 * (i + 1);
      console.log(`API ${res.status} — warte ${wait / 1000}s…`);
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    throw new Error(`API ${res.status}: ${body}`);
  }
  throw new Error("API: Rate-Limit hält an.");
}

function parseAndValidate(raw, tag) {
  writeFileSync(`${OUT}/${TAG}-raw-${tag}.txt`, raw);
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { errors: ["Antwort enthält kein JSON-Objekt."] };
  let json;
  try { json = JSON.parse(raw.slice(start, end + 1)); }
  catch (e) { return { errors: ["JSON nicht parsebar: " + e.message] }; }
  const lesson = normalizeLesson(json);
  const errs = validateLesson(lesson);
  if (errs.length) return { errors: errs, lesson };
  return { lesson };
}

// Feld-Fehler (cards[i].feld…, id, title, source) heilen per JSON-Patch — das Modell
// liefert NUR die korrigierten Felder, unbeteiligte Felder können nicht regressieren.
// Nur Struktur-Fehler (Kartenzahl, Typ/Relation der Karte, Reihenfolge) erzwingen Voll-Retry.
const isFieldError = (e) => /^(cards\[\d+\]\.|id:|title:|source:)/.test(e);
const setPath = (obj, path, value) => {
  const toks = path.match(/[^.\[\]]+/g);
  let cur = obj;
  for (let i = 0; i < toks.length - 1; i++) cur = cur[/^\d+$/.test(toks[i]) ? Number(toks[i]) : toks[i]];
  cur[/^\d+$/.test(toks.at(-1)) ? Number(toks.at(-1)) : toks.at(-1)] = value;
};

const MAX_FULL = 3, MAX_PATCH = 3;
const messages = [{ role: "system", content: system }, { role: "user", content: userBase }];
let lesson = null, raw = null, r = null;

if (fromFile) {
  // Prüf-Stufen-Modus: bestehende Lektion, keine Generierung.
  lesson = normalizeLesson(JSON.parse(readFileSync(fromFile, "utf8")));
  raw = JSON.stringify(lesson);
  messages.push({ role: "assistant", content: raw });
  const errs = validateLesson(lesson);
  console.log(errs.length ? `Eingangs-Contract: ${errs.length} Fehler (werden am Ende erneut geprüft)` : "Eingangs-Contract: PASS");
}

full: for (let i = 1; fromFile ? false : i <= MAX_FULL; i++) {
  raw = await llm(messages);
  r = parseAndValidate(raw, `v2-try${i}`);
  if (!r.errors) { console.log(`VERSUCH ${i}: Contract PASS`); break; }
  console.log(`VERSUCH ${i} — ${r.errors.length} Contract-Fehler:\n` + r.errors.map((e) => "- " + e).join("\n"));

  if (r.lesson && r.errors.every(isFieldError)) {
    lesson = r.lesson;
    for (let pr = 1; pr <= MAX_PATCH; pr++) {
      console.log(`→ Patch-Runde ${pr} (nur fehlerhafte Felder)…`);
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: `Korrigiere NUR die fehlerhaften Felder. Fehlerliste:\n${r.errors.map((e) => "- " + e).join("\n")}\n\nAntworte mit einem flachen JSON-Objekt { "<pfad>": <neuer Wert>, … } — Pfade exakt wie in der Fehlerliste (z. B. "cards[4].left.sub"). Nur das JSON, nichts sonst.` });
      raw = await llm(messages);
      writeFileSync(`${OUT}/${TAG}-raw-v2-patch${pr}.txt`, raw);
      let patch;
      try { patch = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); }
      catch (e) { console.log("Patch nicht parsebar:", e.message); continue; }
      for (const [path, value] of Object.entries(patch)) {
        try { setPath(lesson, path, value); } catch { console.log(`Patch-Pfad ungültig, übersprungen: ${path}`); }
      }
      r = { lesson, errors: validateLesson(lesson) };
      if (!r.errors.length) { r = { lesson }; console.log(`Patch-Runde ${pr}: Contract PASS`); break full; }
      console.log(`Patch-Runde ${pr} — ${r.errors.length} Fehler verbleiben:\n` + r.errors.map((e) => "- " + e).join("\n"));
    }
    console.log("Pipeline lehnt ab (Patch-Runden erschöpft)."); process.exit(1);
  }

  if (i === MAX_FULL) { console.log("Pipeline lehnt ab (max. Versuche erreicht)."); process.exit(1); }
  console.log("→ Struktur-Fehler: voller Retry…");
  messages.push({ role: "assistant", content: raw });
  messages.push({ role: "user", content: `Deine Antwort verletzt den Contract. Fehlerliste:\n${r.errors.map((e) => "- " + e).join("\n")}\n\nKorrigiere alle Fehler und sende das VOLLSTÄNDIGE JSON-Objekt erneut — nur das JSON, nichts sonst.` });
}
lesson = r?.lesson ?? lesson;

// Eine Generator-Patch-Runde für eine gegebene Fehlerliste (für Nach-Judge-Verstöße).
async function generatorPatchRound(errorList) {
  messages.push({ role: "assistant", content: JSON.stringify(lesson) });
  messages.push({ role: "user", content: `Korrigiere NUR die fehlerhaften Felder. Fehlerliste:\n${errorList.map((e) => "- " + e).join("\n")}\n\nAntworte mit einem flachen JSON-Objekt { "<pfad>": <neuer Wert>, … } — Pfade exakt wie in der Fehlerliste. Nur das JSON, nichts sonst.` });
  const praw = await llm(messages);
  let patch;
  try { patch = JSON.parse(praw.slice(praw.indexOf("{"), praw.lastIndexOf("}") + 1)); }
  catch (e) { console.log("Patch nicht parsebar:", e.message); return validateLesson(lesson); }
  for (const [path, value] of Object.entries(patch)) {
    try { setPath(lesson, path, value); } catch { console.log(`Patch-Pfad ungültig, übersprungen: ${path}`); }
  }
  return validateLesson(lesson);
}

// Spellcheck-Prüfrunde als FELD-PATCH: die alte Voll-JSON-Antwort scheiterte am
// Contract, sobald die korrekte Schreibweise ein Längen-Limit sprengte — der
// abgeschnittene Stumpf („FAHRUNTÜCH") blieb dann stehen. Patch-Format + expliziter
// Synonym-Zwang + Validator-Schleife schließen diese Sackgasse.
const wf = wordFindings(lesson);
if (wf.suspicious.length && fromFile && !fromModel) {
  console.log("Spellcheck-Verdacht (nur Report — kein Fixer-Modell):", wf.suspicious.map((s) => s.word).join(", "));
} else if (wf.suspicious.length) {
  console.log("Spellcheck-Verdacht:", wf.suspicious.map((s) => s.word).join(", "));
  try {
    messages.push({ role: "assistant", content: JSON.stringify(lesson) });
    messages.push({ role: "user", content: `Rechtschreib-Prüfung deiner Lektion. Diese Wörter sind verdächtig (können aber korrekte Fachbegriffe sein):\n${wf.suspicious.map((s) => `- "${s.word}" (${s.path})`).join("\n")}\n\nPrüfe jedes Wort im Kontext seines Felds. Sind alle korrekt geschrieben, antworte exakt mit: OK\nSonst antworte mit einem flachen Patch-JSON { "<pfad>": "<vollständiger korrigierter Feldwert>", … } NUR für die fehlerhaften Felder. Die Längen-Limits des Contracts gelten unverändert — sprengt die korrekte Schreibweise das Limit, wähle ein kürzeres Synonym; NIEMALS ein Wort abschneiden. Nur das JSON bzw. OK, nichts sonst.` });
    const check = await llm(messages);
    if (check.trim() !== "OK") {
      let patch = null;
      try { patch = JSON.parse(check.slice(check.indexOf("{"), check.lastIndexOf("}") + 1)); }
      catch (e) { console.log("Spellfix-Patch nicht parsebar — behalte vorige Fassung:", e.message); }
      if (patch) {
        for (const [path, value] of Object.entries(patch)) {
          try { setPath(lesson, path, value); } catch { console.log(`Patch-Pfad ungültig, übersprungen: ${path}`); }
        }
        let errs = validateLesson(lesson);
        if (errs.length) {
          console.log(`Spellfix verletzt Contract (${errs.length}) — Generator-Patch-Runde…`);
          errs = await generatorPatchRound(errs);
          if (errs.length) console.log("Nach Patch-Runde verbleiben:\n" + errs.map((e) => "- " + e).join("\n"));
        }
        console.log("Spellfix übernommen. Verbleibender Verdacht:", suspiciousWords(lesson).map((s) => s.word).join(", ") || "keiner");
      }
    } else console.log("Modell bestätigt: alles korrekt.");
  } catch (e) { console.log("Spell-Runde übersprungen (API):", e.message); }
}

// Fakten-Stufe: deterministische Flags + Wort-Sinn-Aufträge (nur-als-Kompositum
// herleitbare Wörter wie „Schlafmantel") + unabhängiger Judge; Fixes deterministisch
// gepatcht. Danach läuft der Detektor ERNEUT — ein Judge-Fix ist Behauptung, kein Beweis.
async function applyJudgeFindings(findings) {
  if (!findings.length) return;
  const getPath = (obj, path) => path.match(/[^.\[\]]+/g).reduce((c, t) => c?.[/^\d+$/.test(t) ? Number(t) : t], obj);
  const tagCount = (s) => (String(s).match(/<(b|strong|span)[\s>]/g) || []).length;
  let applied = 0;
  const lostMarkup = [];
  for (const f of findings) {
    console.log(`  [${f.verdict}] ${f.path}: ${f.problem}`);
    if (!f.fix || !f.path) continue;
    try {
      const original = getPath(lesson, f.path);
      setPath(lesson, f.path, f.fix); applied++;
      if (typeof original === "string" && tagCount(original) > tagCount(f.fix))
        lostMarkup.push({ path: f.path, original, value: f.fix });
    } catch { console.log(`  Fix-Pfad ungültig: ${f.path}`); }
  }
  console.log(`  → ${applied}/${findings.length} Fixes gepatcht`);
  // Fixes dürfen die Farb-Auszeichnung nicht still verlieren — gezielt restaurieren.
  if (lostMarkup.length) {
    console.log(`  Markup verloren in ${lostMarkup.length} Feld(ern) — restauriere…`);
    try {
      const restored = await restoreMarkup(lostMarkup);
      for (const it of lostMarkup) {
        const v = restored[it.path];
        const stripEq = (s) => String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (typeof v === "string" && stripEq(v) === stripEq(it.value)) { setPath(lesson, it.path, v); console.log(`  ✓ ${it.path}`); }
        else console.log(`  ✗ ${it.path}: Restaurierung verändert Wortlaut oder fehlt — behalte Fix ohne Tags`);
      }
    } catch (e) { console.log("  Markup-Restaurierung nicht möglich (API):", e.message); }
  }
}

const judgeFlags = [
  ...factFlags(lesson, dossier),
  ...wordFindings(lesson).composita.map((c) => ({ kind: "wort-sinn", path: c.path,
    detail: `Wort "${c.word}" ist nur als Kompositum herleitbar — existiert es als deutsches Wort und verdreht es keinen bestehenden Begriff? (Alltagsbeispiele ohne Dossier-Bezug sind ok)` })),
];
const { findings, checks, model: judgeModel } = await judgeLesson(lesson, dossier, { flags: judgeFlags, ...judgeOpts });
console.log(`Judge (${judgeModel}): ${checks.length} Checks, ${findings.length} Fakten-Befund(e)`);
await applyJudgeFindings(findings);

// Detektor-Re-Run: steht auf einem gefixten Pfad weiter eine unbelegte Zahl, hat der
// Fix den Befund nicht beseitigt → zweite Judge-Runde mit verschärftem Auftrag; bleibt
// es danach unbelegt UND vom Judge nicht ausdrücklich freigegeben → Ablehnung.
const fixedPaths = new Set(findings.filter((f) => f.fix && f.path).map((f) => f.path));
let post = factFlags(lesson, dossier).filter((f) => f.kind === "ungedeckte-zahl" && fixedPaths.has(f.path));
if (post.length) {
  console.log(`Detektor-Re-Run: ${post.length} Judge-Fix(e) lassen unbelegte Zahlen stehen — zweite Judge-Runde…`);
  const r2 = await judgeLesson(lesson, dossier, { ...judgeOpts, flags: post.map((f) => ({ ...f,
    detail: f.detail + " — der vorige Fix hat das NICHT beseitigt: Dossier-Zahl verwenden oder ohne Zahl formulieren" })) });
  await applyJudgeFindings(r2.findings);
  post = factFlags(lesson, dossier).filter((f) => f.kind === "ungedeckte-zahl" && fixedPaths.has(f.path));
  const stillBad = post.filter((f) => !r2.checks.some((c) => String(c.auftrag).includes(f.path) && c.ergebnis === "ok"));
  if (stillBad.length) {
    console.log("Pipeline lehnt ab — unbelegte Zahl überlebt zwei Judge-Runden: " + stillBad.map((f) => f.path).join(", "));
    writeFileSync(`${OUT}/${TAG}-lesson-v2-rejected.json`, JSON.stringify(lesson, null, 2));
    process.exit(1);
  }
}
let finalErrs = validateLesson(lesson);
if (finalErrs.length) {
  console.log(`Contract nach Fakten-Fixes — ${finalErrs.length} Fehler:\n` + finalErrs.map((e) => "- " + e).join("\n") + "\n→ Generator-Patch-Runde…");
  try { finalErrs = await generatorPatchRound(finalErrs); }
  catch (e) { console.log("Patch-Runde nicht möglich (API):", e.message); }
  if (finalErrs.length) {
    console.log("Pipeline lehnt ab — verbleibende Contract-Fehler:\n" + finalErrs.map((e) => "- " + e).join("\n"));
    writeFileSync(`${OUT}/${TAG}-lesson-v2-rejected.json`, JSON.stringify(lesson, null, 2));
    process.exit(1);
  }
  console.log("Contract PASS nach Patch-Runde");
}

const file = `${OUT}/${TAG}-lesson-v2.json`;
writeFileSync(file, JSON.stringify(lesson, null, 2));
console.log("→", file);

// Bild-Text-Zahl-Konsistenz: Note-Claims gegen das gerenderte Kurvenniveau.
// Erreichbare Claims fixt notecheck deterministisch (t-Versatz, kein API-Call);
// HART = Claim auf der Kurve unerreichbar → das Modell muss Zahl/Serie ändern.
async function runNotecheck() {
  try {
    console.log(execFileSync("node", [`${DIR}/notecheck.mjs`, file, "--fix"], { encoding: "utf8" }).trim());
    return [];
  } catch (e) {
    const out = (e.stdout || e.message).trim();
    console.log(out);
    return out.split("\n").filter((l) => l.startsWith("HART ")).map((l) => "- " + l.slice(6));
  } finally {
    lesson = JSON.parse(readFileSync(file, "utf8"));   // t-Fixe zurücklesen
  }
}
let hardClaims = await runNotecheck();
if (hardClaims.length) {
  console.log("→ Generator-Patch-Runde für unerreichbare Note-Claims…");
  try {
    const errs = await generatorPatchRound(hardClaims);
    if (errs.length) { console.log("Pipeline lehnt ab — Contract-Fehler nach Note-Patch:\n" + errs.map((e) => "- " + e).join("\n")); process.exit(1); }
    writeFileSync(file, JSON.stringify(lesson, null, 2));
    hardClaims = await runNotecheck();
  } catch (e) { console.log("Patch-Runde nicht möglich (API):", e.message); }
  if (hardClaims.length) {
    console.log("Pipeline lehnt ab — Bild-Text-Zahl-Widerspruch bleibt.");
    writeFileSync(`${OUT}/${TAG}-lesson-v2-rejected.json`, JSON.stringify(lesson, null, 2));
    process.exit(1);
  }
}

// Render-Audit: Geometrie-Beweis. Ein Fail hier ist ein System-Bug, kein Retry-Fall.
try {
  console.log(execFileSync("node", [`${DIR}/audit-lesson.mjs`, file, `${OUT}/${TAG}-v2-shots`], { encoding: "utf8" }).trim());
} catch (e) {
  console.log((e.stdout || e.message).trim());
  console.log("↑ SYSTEM-BUG im Solver/Renderer — nicht dem Modell anlasten.");
  process.exit(3);
}
