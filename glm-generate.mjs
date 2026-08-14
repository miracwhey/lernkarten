// Blindtest via NVIDIA NIM gegen Contract v2.
// Stufen: LLM (gegroundet aufs Fakten-Dossier) → Parse → normalize(relation→type)
// → Validator (Feld-Fehler als Patch-Runden, Struktur als Voll-Retry) → Spellcheck-
// Prüfrunde → Fakten-Stufe (Detektor-Flags + unabhängiger Judge, Fixes deterministisch
// gepatcht) → Render-Audit (Geometrie ist Systemsache — ein Fail hier ist UNSER Bug).
// Nutzung: node glm-generate.mjs [modell-id] [dossier.md]
//          node glm-generate.mjs --from <lesson.json> [dossier.md]   (nur Prüf-Stufen)
//          zusätzlich: --topic <text> --dossier <pfad> --outdir <dir> (Worker-Betrieb)
//          --depth <kompakt|standard|tief> steuert die Kartenzahl (Default: Bestand 7–8)
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { cardRange, lesezeit, normalizeLesson, validateLesson } from "./validate-lesson.mjs";
import { suspiciousWords, wordFindings } from "./spellcheck.mjs";
import { factFlags, geometryFlags } from "./factcheck.mjs";
import { judgeLesson, restoreMarkup } from "./judge.mjs";
import { attemptSignal, chatJson, collectUsage, defaultPace, extractJson, infraFault, isAbortError, loadKey, NIM_BASE, warnAbgeschnitten } from "./nim.mjs";

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
// --judgebase <url>: Judge auf einem fremden Endpunkt (Bench fährt Generator UND
// Judge über OpenRouter); ohne Flag bleibt der Judge auf NIM.
const jbIdx = argv.indexOf("--judgebase");
const judgeBaseArg = jbIdx > -1 ? argv.splice(jbIdx, 2)[1] : null;
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
// --depth <kompakt|standard|tief>: Tiefe der Lektion. Sie steuert die Kartenzahl —
// Prompt-Auftrag UND Contract lesen denselben Bereich aus validate-lesson.mjs.
// Ohne Flag bleibt alles wie bisher (Bestands-Contract 7–8, keine Tiefe im Artefakt).
const depIdx = argv.indexOf("--depth");
const depth = depIdx > -1 ? argv.splice(depIdx, 2)[1] : null;
const fromFile = argv[0] === "--from" ? argv[1] : null;
// --from <lesson.json> [modell] [dossier.md] — Prüf-Stufen mit beliebigem Fixer-Modell
// (ohne Modell wie bisher: GLM aus dem Katalog, Fix-Runden nur soweit Kontingent).
const fromModel = fromFile && argv[2] && !argv[2].endsWith(".md") ? argv[2] : null;
const modelArg = fromFile ? fromModel : argv[0];

// Ablage und Statistik stehen VOR der ersten Abbruch-Möglichkeit: ein Konfigurations-
// Fehler ist ein Lauf-Ausgang wie jeder andere und muss in der Statistik erscheinen —
// sonst fehlt im Bench genau die Zeile, die erklärt, warum ein Lauf nichts geliefert hat.
const slug = (m) => m.split("/").pop().toLowerCase().replace(/[^a-z0-9.-]/g, "");
const OUT = outdirArg ?? DIR;
if (outdirArg) mkdirSync(OUT, { recursive: true });
// Vorläufiges Datei-Präfix; steht das Modell (ggf. aus dem Katalog), wird es überschrieben.
let TAG = modelArg ? slug(modelArg) : fromFile ? "glm" : "lauf";

const T0 = Date.now();
const stats = {
  model: modelArg ?? null, base: null, judgeModel: judgeModelArg ?? null, judgeBase: judgeBaseArg ?? null,
  depth: depth ?? null, dossierPath: null, wallMs: 0, outcome: null,
  // Ausgang der ERSTEN Modell-Antwort — das eigentliche Können ohne Reparatur-Runden.
  contractErsterWurf: null,
  runden: { vollRetries: 0, patchRunden: 0, ergaenzungsRunden: 0, generatorPatches: 0 },
  spellVerdacht: [], judge: [], detektorReRun: null, notecheck: [],
  usage: { gen: { in: 0, out: 0, calls: 0, providers: [] }, judge: { in: 0, out: 0, calls: 0, providers: [] } },
};
// Stufe, die abgelehnt hat (nicht die Fehlerart) + Klartext-Grund. Ohne den Marker
// wäre jeder Exit 1 ununterscheidbar; rejectDetail trägt die konkrete Ursache.
const reject = (stufe, grund) => { stats.rejectStage = stufe; stats.rejectDetail = grund; };
// Infrastruktur-Ursachen (leeres Konto, falscher Key, totes Netz) sind KEIN Modell-
// Versagen — sie kommen nur hier an, wenn der Fehler den Lauf wirklich beendet.
process.on("uncaughtException", (e) => {
  // Stack mitdrucken: der Handler unterdrückt sonst genau die Ausgabe, die einen
  // echten System-Bug von einem Infrastruktur-Fehler unterscheidbar macht.
  console.log("ABBRUCH:", e.stack ?? e.message);
  stats.infra = e.infra ?? null;
  stats.fehler = e.message;
  process.exitCode = 1;
});
process.on("exit", (code) => {
  stats.wallMs = Date.now() - T0;
  // Exit 1 ohne Stufen-Marker heißt: der Lauf ist geplatzt, nicht abgelehnt worden.
  stats.outcome = stats.infra ? `infra-${stats.infra}`
    : code === 0 ? "pass" : code === 2 ? "config" : code === 3 ? "system-bug"
    : stats.rejectStage ? `reject-${stats.rejectStage}` : "system-bug";
  try { writeFileSync(`${OUT}/${TAG}-stats.json`, JSON.stringify(stats, null, 2)); }
  catch (e) { console.log("Statistik nicht schreibbar:", e.message); }
});

let CARDS;
try { CARDS = cardRange(depth); } catch (e) { console.log(e.message); process.exit(2); }
const [MIN_CARDS, MAX_CARDS] = CARDS;
const judgeOpts = { ...(judgeModelArg && { model: judgeModelArg }), ...(judgeKeyArg && { keyName: judgeKeyArg }),
  ...(judgeBaseArg && { base: judgeBaseArg }), usage: stats.usage.judge };

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
const BASE = baseOverride ?? NIM_BASE;
const HEADERS = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const DOSSIER_PATH = dossierArg ?? (fromFile ? (fromModel ? argv[3] : argv[2]) : argv[1]) ?? `${DIR}/facts/why-we-sleep.md`;
const dossier = readFileSync(DOSSIER_PATH, "utf8");
stats.base = BASE;
stats.dossierPath = DOSSIER_PATH;

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
TAG = fromFile ? (fromModel ? slug(fromModel) + "-refix" : "glm") : slug(model);
stats.model = model;

const system = readFileSync(`${DIR}/generator-prompt.md`, "utf8");
const TOPIC = topicArg ?? `„Why We Sleep" von Matthew Walker (2017) — warum wir schlafen, Schlafdruck, Koffein, was Schlafmangel anrichtet.`;
// Der Soll-Bereich steht NUR hier im Auftrag (nicht im Systemprompt) — eine Quelle,
// dieselbe Zahl, die der Validator gleich prüft.
const diagramme = `${MIN_CARDS - 3}–${MAX_CARDS - 3}`;
const kartenAuftrag = `## Umfang (Contract — wird geprüft)

${MIN_CARDS}–${MAX_CARDS} Karten${depth ? ` (Tiefe „${depth}")` : ""}: Karte 1 = title, dazwischen ${diagramme} Diagramm-Karten, vorletzte = quiz, letzte = insight.
Mehr Karten heißen feinere Gedanken-Schritte aus dem Dossier — nicht längere Karten und keine Wiederholungen.
In "stats" der Titel-Karte steht die tatsächliche Kartenzahl: "<N> Karten · <M> Minuten".`;
const userBase = `Thema: ${TOPIC}

${kartenAuftrag}

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
    let res, data;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 8000, temperature: 0.6, system, messages: rest }),
      });
      // Body-Read unter dasselbe Fehler-Netz wie der fetch: ein Netzriss mitten im
      // Read würde sonst ungefangen den Prozess töten.
      if (res.status !== 429 && res.status < 500) data = await res.json();
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
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    spend.in += data.usage.input_tokens; spend.out += data.usage.output_tokens; spend.calls++;
    stats.usage.gen.in += data.usage.input_tokens;
    stats.usage.gen.out += data.usage.output_tokens;
    stats.usage.gen.calls++;
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!text) throw new Error(`Anthropic: keine Text-Antwort (stop_reason ${data.stop_reason})`);
    return text;
  }
  throw new Error("Anthropic: Rate-Limit hält an.");
}

// Request-Body einer Generator-Anfrage. `--body` gewinnt gegen die Vorgaben, und ein
// explizites null LÖSCHT ein Feld: Modelle ohne temperature-Unterstützung (laut
// OpenRouter supported_parameters etwa die GPT-5.6-Reihe) antworten auf ein
// mitgesendetes temperature mit HTTP 400 — das sähe wie Modell-Versagen aus.
function requestBody(messages) {
  const body = { model, messages, temperature: 0.6,
    // Ausgabe-Budget wächst mit der Kartenzahl (~700 Token je Karte inkl. Denk-
    // Tokens): mit festen 8000 schneidet eine 20-Karten-Lektion mitten im JSON ab.
    max_tokens: Math.max(8000, MAX_CARDS * 700), ...bodyExtra };
  for (const k of Object.keys(body)) if (body[k] === null) delete body[k];
  return body;
}

// Request-Timeout des Generator-Calls: Denk-Modelle brauchen für eine volle Lektion
// legitim >10 min (Header kommen sofort, der Body erst nach der Generierung) — ein
// zu knapper Timeout wirft eine fertig generierte und BEZAHLTE Antwort weg. Die
// harte Grenze bleibt beim Aufrufer (bench.mjs: 25-min-Lauf-Deckel, Worker: Job-Deadline).
const GEN_TIMEOUT_MS = 20 * 60 * 1000;

let firstCall = true;
async function llm(messages) {
  if (isAnthropic) return anthropicChat(messages);   // kein Free-Tier-Pacing nötig
  // Pacing gehört an den Host: NIM drosselt den Free-Tier aggressiv, fremde
  // Endpunkte brauchen nur Anstands-Abstand (nim.mjs defaultPace).
  if (!firstCall) await new Promise((ok) => setTimeout(ok, defaultPace(BASE)));
  firstCall = false;
  for (let i = 0; i < 8; i++) {
    let res, data, errBody;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: "POST", headers: HEADERS,
        body: JSON.stringify(requestBody(messages)),
        // Echter Abbruch statt hängender Socket: ohne Signal läuft ein toter Request
        // weiter und frisst die Job-Deadline des Workers.
        signal: attemptSignal(null, GEN_TIMEOUT_MS),
      });
      // Der Body-Read steht unter demselben Abbruch-Signal wie der fetch — ein
      // Timeout hier ist genauso transient und darf den Prozess nicht ungefangen
      // töten (hat beide Kimi-K3-Bench-Läufe bei exakt 600 s gekostet).
      if (res.ok) data = await res.json();
      else errBody = (await res.text()).slice(0, 300);
    } catch (e) {
      // Netz kurz weg oder Request-Timeout — transient, wie 5xx behandeln.
      const wait = 15000 * (i + 1);
      console.log(`${isAbortError(e) ? "REQUEST-TIMEOUT" : "NETZ-FEHLER"}: ${e.message} — warte ${wait / 1000}s…`);
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    // Rest-Panzerung: falls ein Thinking-Modell trotz Abschaltung <think>-Blöcke
    // inline liefert, fliegen sie hier raus — sonst bricht die JSON-Extraktion
    // und der Denk-Ballast bläht die Folge-Requests auf. content kann null sein,
    // wenn das Denken das komplette Output-Budget gefressen hat (z. B. gpt-oss).
    if (res.ok) {
      // Leere oder abgeschnittene Antwort benennen: sonst erscheint sie weiter
      // unten nur als „kein JSON-Objekt" und die nächste Runde rät.
      warnAbgeschnitten(data, model);
      collectUsage(stats.usage.gen, data);
      const msg = data.choices?.[0]?.message;
      const text = (msg?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (!text) console.log(`LEERE ANTWORT (${model}, finish_reason=${data.choices?.[0]?.finish_reason})`
        + ` — ${data.usage?.completion_tokens ?? "?"} Ausgabe-Tokens`);
      return text;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = 30000 * (i + 1);
      console.log(`API ${res.status} — warte ${wait / 1000}s…`);
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    // Ursache am Fehler mitführen (leeres Konto/falscher Key ≠ schlechtes Modell).
    const err = new Error(`API ${res.status}: ${errBody}`);
    err.infra = infraFault(res.status);
    throw err;
  }
  const err = new Error("API: Rate-Limit hält an.");
  err.infra = "net";
  throw err;
}

// Contract-Prüfung IMMER mit der bestellten Tiefe — sonst prüft die Pipeline gegen
// einen anderen Bereich, als sie bestellt hat.
const contract = (l) => validateLesson(l, { depth });

function parseAndValidate(raw, tag) {
  writeFileSync(`${OUT}/${TAG}-raw-${tag}.txt`, raw);
  let json;
  try { json = extractJson(raw); }         // Zäune/Denk-Blöcke/kaputte Quotes: nim.mjs
  catch (e) { return { errors: [e.message] }; }
  const lesson = normalizeLesson(json);
  const errs = contract(lesson);
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
  const last = /^\d+$/.test(toks.at(-1)) ? Number(toks.at(-1)) : toks.at(-1);
  // null LÖSCHT ein Feld (Projekt-Konvention wie im Request-Body): Patch-Runden
  // können damit Felder entfernen — ohne das blieb `"at": null` als ungültiger
  // Wert stehen und die Kopplungs-Sackgasse (at/afterStop/stop) schloss sich nie.
  // Array-Elemente löschen wäre ein Struktur-Eingriff — bewusst nicht per Patch.
  if (value === null && typeof last === "string") delete cur[last];
  else cur[last] = value;
};

// Fehlende Karten sind ein ADDITIVER Struktur-Fehler: sie heilen durch Anhängen,
// nicht durch Voll-Regeneration (die würde die bereits geprüften Karten neu würfeln).
const isTooFewCards = (e) => e.startsWith("cards: zu wenig Karten");

/// Ergänzungs-Runde: das Modell liefert NUR die fehlenden Karten als JSON-Array.
/// Sie werden vor quiz+insight eingesetzt; bestehende Karten bleiben unangetastet.
async function addCardsRound(current, tag) {
  const need = MIN_CARDS - current.cards.length;
  const vorhanden = current.cards.map((c, i) => `${i + 1}. [${c.relation ?? c.type}] ${c.text ?? c.title ?? c.question ?? c.quote ?? ""}`.slice(0, 120)).join("\n");
  const auftrag = `Deine Lektion hat ${current.cards.length} Karten, der Contract verlangt ${MIN_CARDS}–${MAX_CARDS}${depth ? ` (Tiefe „${depth}")` : ""}.

Ergänze GENAU ${need} weitere Diagramm-Karten zu Aspekten des Dossiers, die noch nicht vorkommen. Ändere KEINE bestehende Karte — du sendest ausschließlich die neuen.

Bereits vorhanden (nicht wiederholen):
${vorhanden}

Regeln wie gehabt: jede neue Karte trägt eine \`relation\` (kein \`type\`), einen Lehrsatz \`text\` mit genau einem Gedanken, eine \`caption\` mit Alltagsbeispiel, alle Längen-Limits, alle Fakten aus dem Dossier. Variiere die Relationen gegenüber den vorhandenen Karten.

Antworte AUSSCHLIESSLICH mit einem JSON-Array der ${need} neuen Karten: [ { … }, … ]`;
  const { value, raw: araw } = await chatJson(llm, [...messages, { role: "assistant", content: JSON.stringify(current) }, { role: "user", content: auftrag }]);
  writeFileSync(`${OUT}/${TAG}-raw-v2-${tag}.txt`, araw);
  // Nur so viele übernehmen wie angefordert: liefert das Modell großzügig mehr,
  // kippt die Lektion sonst in „zu viele Karten" und damit in einen Voll-Retry.
  const geliefert = Array.isArray(value) ? value : Array.isArray(value.cards) ? value.cards : null;
  if (!geliefert?.length) throw new Error("Ergänzungs-Runde lieferte kein Karten-Array");
  const neue = geliefert.slice(0, MAX_CARDS - current.cards.length);
  // Einsetzen vor quiz+insight — die Reihenfolge-Regel des Contracts bleibt erhalten.
  const kopf = current.cards.slice(0, -2), schwanz = current.cards.slice(-2);
  const ergaenzt = normalizeLesson({ ...current, cards: [...kopf, ...neue, ...schwanz] });
  console.log(`  ${neue.length} Karte(n) ergänzt (${current.cards.length} → ${ergaenzt.cards.length})`);
  return ergaenzt;
}

const MAX_FULL = 3, MAX_PATCH = 3, MAX_ADD = 2;
const messages = [{ role: "system", content: system }, { role: "user", content: userBase }];
let lesson = null, raw = null, r = null;

if (fromFile) {
  // Prüf-Stufen-Modus: bestehende Lektion, keine Generierung.
  lesson = normalizeLesson(JSON.parse(readFileSync(fromFile, "utf8")));
  raw = JSON.stringify(lesson);
  messages.push({ role: "assistant", content: raw });
  const errs = contract(lesson);
  stats.contractErsterWurf = { fehler: errs.length, liste: errs };
  console.log(errs.length ? `Eingangs-Contract: ${errs.length} Fehler (werden am Ende erneut geprüft)` : "Eingangs-Contract: PASS");
}

full: for (let i = 1; fromFile ? false : i <= MAX_FULL; i++) {
  raw = await llm(messages);
  r = parseAndValidate(raw, `v2-try${i}`);
  if (i === 1) stats.contractErsterWurf = { fehler: r.errors?.length ?? 0, liste: r.errors ?? [] };
  if (!r.errors) { console.log(`VERSUCH ${i}: Contract PASS`); break; }
  console.log(`VERSUCH ${i} — ${r.errors.length} Contract-Fehler:\n` + r.errors.map((e) => "- " + e).join("\n"));

  // Zu wenig Karten: gezielt ergänzen statt neu würfeln. Danach normal weiter —
  // Feld-Fehler der neuen Karten fangen die Patch-Runden unten ab.
  for (let ar = 1; ar <= MAX_ADD && r.lesson && r.errors.some(isTooFewCards); ar++) {
    console.log(`→ Ergänzungs-Runde ${ar} (bestehende Karten unangetastet)…`);
    stats.runden.ergaenzungsRunden++;
    try {
      const ergaenzt = await addCardsRound(r.lesson, `add${i}-${ar}`);
      raw = JSON.stringify(ergaenzt);
      const errs = contract(ergaenzt);
      r = errs.length ? { lesson: ergaenzt, errors: errs } : { lesson: ergaenzt };
    } catch (e) { console.log("Ergänzungs-Runde fehlgeschlagen:", e.message); break; }
    if (!r.errors) { console.log(`Ergänzungs-Runde ${ar}: Contract PASS`); break full; }
    console.log(`Ergänzungs-Runde ${ar} — ${r.errors.length} Fehler verbleiben:\n` + r.errors.map((e) => "- " + e).join("\n"));
  }

  if (r.lesson && r.errors.every(isFieldError)) {
    lesson = r.lesson;
    for (let pr = 1; pr <= MAX_PATCH; pr++) {
      console.log(`→ Patch-Runde ${pr} (nur fehlerhafte Felder)…`);
      stats.runden.patchRunden++;
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: `Korrigiere NUR die fehlerhaften Felder. Fehlerliste:\n${r.errors.map((e) => "- " + e).join("\n")}\n\nAntworte mit einem flachen JSON-Objekt { "<pfad>": <neuer Wert>, … } — Pfade exakt wie in der Fehlerliste (z. B. "cards[4].left.sub"); nennt eine Fehlermeldung MEHRERE zusammengehörige Pfade, patche sie alle zusammen. Ein Wert von null löscht das jeweilige Feld. Nur das JSON, nichts sonst.` });
      let patch;
      try { const g = await chatJson(llm, messages); patch = g.value; raw = g.raw; }
      catch (e) { console.log("Patch nicht parsebar:", e.message); continue; }
      writeFileSync(`${OUT}/${TAG}-raw-v2-patch${pr}.txt`, raw);
      for (const [path, value] of Object.entries(patch)) {
        try { setPath(lesson, path, value); } catch { console.log(`Patch-Pfad ungültig, übersprungen: ${path}`); }
      }
      r = { lesson, errors: contract(lesson) };
      if (!r.errors.length) { r = { lesson }; console.log(`Patch-Runde ${pr}: Contract PASS`); break full; }
      console.log(`Patch-Runde ${pr} — ${r.errors.length} Fehler verbleiben:\n` + r.errors.map((e) => "- " + e).join("\n"));
    }
    console.log("Pipeline lehnt ab (Patch-Runden erschöpft).");
    reject("contract", "Patch-Runden erschöpft"); process.exit(1);
  }

  if (i === MAX_FULL) {
    console.log("Pipeline lehnt ab (max. Versuche erreicht).");
    reject("contract", "max. Voll-Versuche erreicht"); process.exit(1);
  }
  console.log("→ Struktur-Fehler: voller Retry…");
  stats.runden.vollRetries++;
  messages.push({ role: "assistant", content: raw });
  messages.push({ role: "user", content: `Deine Antwort verletzt den Contract. Fehlerliste:\n${r.errors.map((e) => "- " + e).join("\n")}\n\nKorrigiere alle Fehler und sende das VOLLSTÄNDIGE JSON-Objekt erneut — nur das JSON, nichts sonst.` });
}
lesson = r?.lesson ?? lesson;

// Eine Generator-Patch-Runde für eine gegebene Fehlerliste (für Nach-Judge-Verstöße).
async function generatorPatchRound(errorList) {
  stats.runden.generatorPatches++;
  messages.push({ role: "assistant", content: JSON.stringify(lesson) });
  messages.push({ role: "user", content: `Korrigiere NUR die fehlerhaften Felder. Fehlerliste:\n${errorList.map((e) => "- " + e).join("\n")}\n\nAntworte mit einem flachen JSON-Objekt { "<pfad>": <neuer Wert>, … } — Pfade exakt wie in der Fehlerliste; nennt eine Fehlermeldung MEHRERE zusammengehörige Pfade, patche sie alle zusammen. Ein Wert von null löscht das jeweilige Feld. Nur das JSON, nichts sonst.` });
  let patch;
  try { patch = (await chatJson(llm, messages)).value; }
  catch (e) { console.log("Patch nicht parsebar:", e.message); return contract(lesson); }
  for (const [path, value] of Object.entries(patch)) {
    try { setPath(lesson, path, value); } catch { console.log(`Patch-Pfad ungültig, übersprungen: ${path}`); }
  }
  return contract(lesson);
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
  stats.spellVerdacht = wf.suspicious.map((s) => s.word);
  try {
    messages.push({ role: "assistant", content: JSON.stringify(lesson) });
    messages.push({ role: "user", content: `Rechtschreib-Prüfung deiner Lektion. Diese Wörter sind verdächtig (können aber korrekte Fachbegriffe sein):\n${wf.suspicious.map((s) => `- "${s.word}" (${s.path})`).join("\n")}\n\nPrüfe jedes Wort im Kontext seines Felds. Sind alle korrekt geschrieben, antworte exakt mit: OK\nSonst antworte mit einem flachen Patch-JSON { "<pfad>": "<vollständiger korrigierter Feldwert>", … } NUR für die fehlerhaften Felder. Die Längen-Limits des Contracts gelten unverändert — sprengt die korrekte Schreibweise das Limit, wähle ein kürzeres Synonym; NIEMALS ein Wort abschneiden. Nur das JSON bzw. OK, nichts sonst.` });
    const antwort = await llm(messages);
    if (antwort.trim() !== "OK") {
      let patch = null;
      try { patch = extractJson(antwort); }
      catch (e) { console.log("Spellfix-Patch nicht parsebar — behalte vorige Fassung:", e.message); }
      if (patch) {
        for (const [path, value] of Object.entries(patch)) {
          try { setPath(lesson, path, value); } catch { console.log(`Patch-Pfad ungültig, übersprungen: ${path}`); }
        }
        let errs = contract(lesson);
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
  if (!findings.length) return [];
  const getPath = (obj, path) => path.match(/[^.\[\]]+/g).reduce((c, t) => c?.[/^\d+$/.test(t) ? Number(t) : t], obj);
  const tagCount = (s) => (String(s).match(/<(b|strong|span)[\s>]/g) || []).length;
  // Harte Befunde (wrong/unsupported), die keinen anwendbaren fix tragen, gehen
  // zurück an den Aufrufer — sie dürfen nicht lautlos durchrutschen (Queue-Lauf
  // „Himmel" 14.08.: afterStop-Widerspruch überlebte den eigenen Befund als done).
  const hart = (f) => f.verdict === "wrong" || f.verdict === "unsupported";
  let applied = 0;
  const lostMarkup = [], unfixed = [];
  for (const f of findings) {
    console.log(`  [${f.verdict}] ${f.path}: ${f.problem}`);
    if (!f.fix || !f.path) { if (hart(f)) unfixed.push(f); continue; }
    try {
      const original = getPath(lesson, f.path);
      setPath(lesson, f.path, f.fix); applied++;
      if (typeof original === "string" && tagCount(original) > tagCount(f.fix))
        lostMarkup.push({ path: f.path, original, value: f.fix });
    } catch { console.log(`  Fix-Pfad ungültig: ${f.path}`); if (hart(f)) unfixed.push(f); }
  }
  console.log(`  → ${applied}/${findings.length} Fixes gepatcht`);
  // Fixes dürfen die Farb-Auszeichnung nicht still verlieren — gezielt restaurieren.
  if (lostMarkup.length) {
    console.log(`  Markup verloren in ${lostMarkup.length} Feld(ern) — restauriere…`);
    try {
      const restored = await restoreMarkup(lostMarkup, judgeOpts);
      for (const it of lostMarkup) {
        const v = restored[it.path];
        const stripEq = (s) => String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (typeof v === "string" && stripEq(v) === stripEq(it.value)) { setPath(lesson, it.path, v); console.log(`  ✓ ${it.path}`); }
        else console.log(`  ✗ ${it.path}: Restaurierung verändert Wortlaut oder fehlt — behalte Fix ohne Tags`);
      }
    } catch (e) { console.log("  Markup-Restaurierung nicht möglich (API):", e.message); }
  }
  return unfixed;
}

const judgeFlags = [
  ...factFlags(lesson, dossier),
  ...wordFindings(lesson).composita.map((c) => ({ kind: "wort-sinn", path: c.path,
    detail: `Wort "${c.word}" ist nur als Kompositum herleitbar — existiert es als deutsches Wort und verdreht es keinen bestehenden Begriff? (Alltagsbeispiele ohne Dossier-Bezug sind ok)` })),
  // Geometrie-Sinn: die zweite Hälfte der Klasse „Text widerspricht dem Bild" —
  // notecheck misst nur an Note-Positionen, hier kommen Lehrsatz, Caption und
  // Achsen-Beschriftung gegen die deklarierte Kurven-/Waagen-Geometrie.
  ...geometryFlags(lesson),
];
// Judge-Runde protokollieren: Zahl der Aufträge, Befunde und deren verdict-Verteilung.
const judgeRunde = (checks, findings) => stats.judge.push({
  checks: checks.length, findings: findings.length,
  verdicts: findings.reduce((a, f) => ({ ...a, [f.verdict ?? "ohne"]: (a[f.verdict ?? "ohne"] ?? 0) + 1 }), {}),
});
const { findings, checks, model: judgeModel } = await judgeLesson(lesson, dossier, { flags: judgeFlags, ...judgeOpts });
stats.judgeModel = judgeModel;
judgeRunde(checks, findings);
console.log(`Judge (${judgeModel}): ${checks.length} Checks, ${findings.length} Fakten-Befund(e)`);
const unfixed = await applyJudgeFindings(findings);

// Harte Befunde ohne anwendbaren Judge-Fix: der Generator korrigiert sie selbst
// (Patch-Runde), eine Judge-Nachprüfung verifiziert — der Fix ist eine Behauptung.
// Bleibt der Befund hart und unfixbar, wird abgelehnt statt still durchgereicht.
if (unfixed.length) {
  console.log(`${unfixed.length} harte(r) Befund(e) ohne anwendbaren Fix → Generator-Patch-Runde…`);
  const errs = await generatorPatchRound(unfixed.map((f) => `${f.path}: ${f.problem}${f.rechnung ? ` (${f.rechnung})` : ""}`));
  if (errs.length) console.log(`Contract nach Befund-Patch (${errs.length}) — heilt die reguläre Schlussprüfung.`);
  const r2 = await judgeLesson(lesson, dossier, { ...judgeOpts, flags: unfixed.map((f) => ({
    kind: "nachpruefung", path: f.path,
    detail: `${f.problem} — der Generator hat nachgebessert: ist der Befund jetzt beseitigt?` })) });
  judgeRunde(r2.checks, r2.findings);
  const still = await applyJudgeFindings(r2.findings);
  if (still.length) {
    console.log("Pipeline lehnt ab — harter Befund überlebt Generator-Patch + Nachprüfung: " + still.map((f) => f.path).join(", "));
    writeFileSync(`${OUT}/${TAG}-lesson-v2-rejected.json`, JSON.stringify(lesson, null, 2));
    reject("fakten", "harter Befund ohne wirksamen Fix: " + still.map((f) => f.path).join(", "));
    process.exit(1);
  }
}

// Detektor-Re-Run: steht auf einem gefixten Pfad weiter eine unbelegte Zahl, hat der
// Fix den Befund nicht beseitigt → zweite Judge-Runde mit verschärftem Auftrag; bleibt
// es danach unbelegt UND vom Judge nicht ausdrücklich freigegeben → Ablehnung.
const fixedPaths = new Set(findings.filter((f) => f.fix && f.path).map((f) => f.path));
let post = factFlags(lesson, dossier).filter((f) => f.kind === "ungedeckte-zahl" && fixedPaths.has(f.path));
if (post.length) {
  console.log(`Detektor-Re-Run: ${post.length} Judge-Fix(e) lassen unbelegte Zahlen stehen — zweite Judge-Runde…`);
  const vorher = post.length;
  const r2 = await judgeLesson(lesson, dossier, { ...judgeOpts, flags: post.map((f) => ({ ...f,
    detail: f.detail + " — der vorige Fix hat das NICHT beseitigt: Dossier-Zahl verwenden oder ohne Zahl formulieren" })) });
  judgeRunde(r2.checks, r2.findings);
  await applyJudgeFindings(r2.findings);
  post = factFlags(lesson, dossier).filter((f) => f.kind === "ungedeckte-zahl" && fixedPaths.has(f.path));
  const stillBad = post.filter((f) => !r2.checks.some((c) => String(c.auftrag).includes(f.path) && c.ergebnis === "ok"));
  stats.detektorReRun = { vorher, nachher: post.length, offen: stillBad.length };
  if (stillBad.length) {
    console.log("Pipeline lehnt ab — unbelegte Zahl überlebt zwei Judge-Runden: " + stillBad.map((f) => f.path).join(", "));
    writeFileSync(`${OUT}/${TAG}-lesson-v2-rejected.json`, JSON.stringify(lesson, null, 2));
    reject("fakten", "unbelegte Zahl überlebt zwei Judge-Runden: " + stillBad.map((f) => f.path).join(", "));
    process.exit(1);
  }
}
let finalErrs = contract(lesson);
if (finalErrs.length) {
  console.log(`Contract nach Fakten-Fixes — ${finalErrs.length} Fehler:\n` + finalErrs.map((e) => "- " + e).join("\n") + "\n→ Generator-Patch-Runde…");
  try { finalErrs = await generatorPatchRound(finalErrs); }
  catch (e) { console.log("Patch-Runde nicht möglich (API):", e.message); }
  if (finalErrs.length) {
    console.log("Pipeline lehnt ab — verbleibende Contract-Fehler:\n" + finalErrs.map((e) => "- " + e).join("\n"));
    writeFileSync(`${OUT}/${TAG}-lesson-v2-rejected.json`, JSON.stringify(lesson, null, 2));
    reject("fakten", `Contract nach Fakten-Fixes verletzt (${finalErrs.length})`);
    process.exit(1);
  }
  console.log("Contract PASS nach Patch-Runde");
}

// Die Titel-Karte verspricht dem Nutzer eine Kartenzahl — sie muss der Lektion
// entsprechen. Deterministisch nachziehen statt das Modell darum zu bitten
// (Modelle schreiben hier zuverlässig die Zahl aus dem Beispiel des Prompts).
const titel = lesson.cards?.[0];
if (titel?.type === "title" && typeof titel.stats === "string") {
  const soll = `${lesson.cards.length} Karten · ${lesezeit(lesson.cards.length)} Minuten`;
  if (titel.stats !== soll) { console.log(`stats korrigiert: "${titel.stats}" → "${soll}"`); titel.stats = soll; }
}
// Die Tiefe wandert ins Artefakt: nachgelagerte Prüfungen (Worker vor dem Insert)
// kennen damit denselben Soll-Bereich, gegen den generiert wurde.
if (depth) lesson.depth = depth;

const file = `${OUT}/${TAG}-lesson-v2.json`;
writeFileSync(file, JSON.stringify(lesson, null, 2));
console.log("→", file);

// Bild-Text-Zahl-Konsistenz: Note-Claims gegen das gerenderte Kurvenniveau.
// Erreichbare Claims fixt notecheck deterministisch (t-Versatz, kein API-Call);
// HART = Claim auf der Kurve unerreichbar → das Modell muss Zahl/Serie ändern.
async function runNotecheck() {
  let out;
  try {
    out = execFileSync("node", [`${DIR}/notecheck.mjs`, file, "--fix"], { encoding: "utf8" }).trim();
    console.log(out);
    return [];
  } catch (e) {
    out = (e.stdout || e.message).trim();
    console.log(out);
    // Die HART-Zeilen tragen ihre Korrektur bereits im Text — sie gehen unverändert
    // als Fehlerliste in die Generator-Patch-Runde (Level- wie Richtungs-Befunde).
    return out.split("\n").filter((l) => l.startsWith("HART ")).map((l) => "- " + l.slice(6));
  } finally {
    // Maschinen-Zeile von notecheck: getrennte Zählung statt Nachzählen der Prosa.
    const z = /ZÄHLUNG ok=(\d+) fix=(\d+) hart=(\d+) hart-richtung=(\d+)/.exec(out ?? "");
    if (z) stats.notecheck.push({ ok: +z[1], fix: +z[2], hart: +z[3], hartRichtung: +z[4] });
    lesson = JSON.parse(readFileSync(file, "utf8"));   // t-Fixe zurücklesen
  }
}
let hardClaims = await runNotecheck();
if (hardClaims.length) {
  console.log("→ Generator-Patch-Runde für unerreichbare Note-Claims…");
  try {
    const errs = await generatorPatchRound(hardClaims);
    if (errs.length) {
      console.log("Pipeline lehnt ab — Contract-Fehler nach Note-Patch:\n" + errs.map((e) => "- " + e).join("\n"));
      reject("notecheck", `Contract-Fehler nach Note-Patch (${errs.length})`); process.exit(1);
    }
    writeFileSync(file, JSON.stringify(lesson, null, 2));
    hardClaims = await runNotecheck();
  } catch (e) { console.log("Patch-Runde nicht möglich (API):", e.message); }
  if (hardClaims.length) {
    console.log("Pipeline lehnt ab — Bild-Text-Widerspruch bleibt.");
    writeFileSync(`${OUT}/${TAG}-lesson-v2-rejected.json`, JSON.stringify(lesson, null, 2));
    reject("notecheck", `${hardClaims.length} HART-Befund(e) überleben die Patch-Runde`);
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
