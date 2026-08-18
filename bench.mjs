// Modell-Bench über OpenRouter: jedes Modell fährt die UNVERÄNDERTE Pipeline
// (glm-generate.mjs) als eigener Kindprozess; gemessen wird, was die Pipeline ohnehin
// protokolliert (<outdir>/<tag>-stats.json). Der Report ist reine Messung — keine
// Wertung, kein Score, keine Empfehlung; die Interpretation macht ein Mensch.
// Nutzung: node bench.mjs              → Trockenlauf: Plan + Kostenschätzung, führt NICHTS aus
//          node bench.mjs --preflight  → je Modell EIN Mini-Call (kostet echtes Geld)
//          node bench.mjs --go         → Läufe ausführen
import { spawn } from "child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { cardRange } from "./validate-lesson.mjs";
import { loadKey } from "./nim.mjs";

// ── Konfiguration ────────────────────────────────────────────────────────────
const DIR = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const BASE = "https://openrouter.ai/api/v1";
const KEY_ENV = "OPENROUTER_API_KEY";      // liegt in jarvis/.env, wie alle Keys
const JUDGE = "openai/gpt-oss-120b";       // fest: der Judge darf nie das Generator-Modell sein
/// `--runs N` und `--nur <teil,teil>` schneiden das Feld zu. Gedacht für den
/// Vorher/Nachher-Vergleich EINER Änderung an Prompt oder Contract: dort ist die
/// Frage „welche Relationen kommen jetzt", nicht „wie stabil ist das Modell" — und
/// für die Typ-Verteilung reicht ein Lauf je Kandidat. Ohne die Flags bleibt es der
/// volle Bench (3 Läufe, alle Modelle), damit ein zugeschnittener Lauf niemals
/// unbemerkt als Referenzmessung durchgeht.
const flagWert = (name) => { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : null; };
const RUNS = Number(flagWert("runs")) || 3;
const NUR = (flagWert("nur") || "").split(",").map((s) => s.trim()).filter(Boolean);
// Die `:free`-Varianten teilen sich EIN Konto-Kontingent von 20 Anfragen je Minute —
// zwei davon gleichzeitig erzeugten die eigenen 429er und schrieben sie den Modellen
// ins Zeugnis. Die BEZAHLTEN Modelle zählen nicht in dieses Kontingent, dürfen also
// nebenher laufen; die Regel „nie zwei kostenlose gleichzeitig" steht im Arbeiter.
const PARALLEL = 2;
// `--dossier <pfad> --topic <text>` fährt das Feld gegen ein anderes Thema. Beide
// zusammen oder keins: das Thema steht sonst NUR im Default von glm-generate.mjs
// („Why We Sleep"), und ein fremdes Dossier liefe unter falscher Überschrift — das
// Modell bekäme Wärmeinsel-Fakten zu einem Auftrag über Schlaf und sähe aus, als
// könne es keine Lektion schreiben.
const DOSSIER = flagWert("dossier") || "facts/why-we-sleep.md";
const TOPIC_ARG = flagWert("topic");
if ((flagWert("dossier") == null) !== (TOPIC_ARG == null))
  throw new Error("--dossier und --topic gehören zusammen: ein fremdes Dossier ohne eigenes Thema läuft unter der falschen Überschrift.");
const DEPTH = null;                        // ohne Tiefe = Bestands-Contract (7–8 Karten)
// Die Backoff-Ketten der Pipeline (8 Versuche mit wachsender Wartezeit) können einen
// toten Lauf über eine halbe Stunde festhalten — hier ist Schluss.
const RUN_TIMEOUT_MS = 25 * 60 * 1000;
// Ausgabe-Deckel je Anfrage. Er ist KEINE Drossel des Denkens, sondern ein Kosten-
// Backstop: gemessen brauchte der ausgabestärkste Bestandslauf (deepseek-v4-pro,
// 42 783 Token über 3 Anfragen) rund 14 000 je Anfrage. 32 000 lässt jedem Denk-
// Modell das Doppelte davon. Der echte Deckel je Modell ist der KLEINERE Wert aus
// diesem und dem, was der Katalog für das Modell erlaubt (siehe deckel()) — eine
// feste 16 000 für alle erstickte genau die Modelle, die viel denken, und ließ sie
// mit leerer Antwort wie Versager aussehen.
const MAX_TOKENS = 32000;
// Kosten-Notbremse für die bezahlten Modelle: das Konto hat ein knappes Restguthaben,
// und ein Denk-Modell mit teurer Ausgabe (ring-2.6-1t: $0,625 je 1M) kann es in
// wenigen Läufen aufbrauchen. Überschreitet die laufende Summe diesen Wert, endet
// der Bench geordnet, statt in eine 402-Wand zu laufen.
const KOSTEN_STOPP_USD = 0.40;
// Laut OpenRouter-supported_parameters kennt die GPT-5.6-Reihe kein temperature —
// explizites null LÖSCHT das Feld im Request (glm-generate.mjs, requestBody).
// `frei` = `:free`-Variante: kostet nichts, zahlt aber auf das gemeinsame Tages-
// Kontingent des Kontos ein (50 Anfragen unter 10 gekauften Credits, sonst 1000).
// Reihenfolge = Kostenrampe: die kostenlosen zuerst, dann aufsteigend nach Preis —
// ein Systemfehler soll auffliegen, bevor er Guthaben kostet.
// Die REFERENZZEILE steht bewusst mit im Feld: ohne das Produktionsmodell im selben
// Bench (gleiches Dossier, gleiche Pipeline, gleiche Laufzahl) vergleicht jede Aussage
// „Kandidat X ist besser" zwei verschiedene Messungen miteinander.
// KEIN eigener body für die Referenz: `ruesteModelle()` gibt jedem Modell denselben
// Katalog-Deckel und setzt `temperature: null` selbst, wo der Katalog kein temperature
// meldet. Der Produktionswert 16000 stünde hier gegen 32000 bei allen anderen — ein
// abgeschnittener Lauf ginge dann als Modell-Schwäche in die Wertung statt als Deckel.
const ALLE_MODELS = [
  { id: "z-ai/glm-5.2:free", frei: true },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", frei: true },
  { id: "nvidia/nemotron-3.5-lightning:free", frei: true },
  { id: "poolside/laguna-s-2.1:free", frei: true },
  { id: "cohere/north-mini-code:free", frei: true },
  { id: "inclusionai/ling-3.0-flash" },
  { id: "inclusionai/ring-2.6-1t" },
  { id: "openai/gpt-5.6-luna-pro" },
];
// Ein `--nur`, das nichts trifft, ist ein Tippfehler und kein leeres Feld: sonst
// meldet der Bench fröhlich „0 Läufe geplant" und sieht aus wie ein sauberer Lauf.
const MODELS = NUR.length ? ALLE_MODELS.filter((m) => NUR.some((n) => m.id.includes(n))) : ALLE_MODELS;
if (NUR.length && MODELS.length !== NUR.length)
  throw new Error(`--nur ${NUR.join(",")} trifft ${MODELS.length} Modell(e): ${MODELS.map((m) => m.id).join(", ") || "(keins)"}`);
// Aus dem Feld genommen nach dem Lauf 17.08. (bench-runs/ENDSTAND-2026-08-17):
// `inclusionai/ling-2.6-flash` und `upstage/solar-pro4` schrieben in 3 von 3 Läufen
// keine einzige Lektion (reject-contract) — weitere Läufe kosten Zeit ohne Erkenntnis.
// Schätzgrößen NUR für den Trockenlauf (Erfahrungswert eines Laufs inkl. Reparatur-
// Runden). Die Abrechnung im Report rechnet mit echten Token-Zahlen aus stats.json.
const EST = { gen: { in: 25000, out: 4000 }, judge: { in: 20000, out: 3000 } };

const slug = (m) => m.split("/").pop().toLowerCase().replace(/[^a-z0-9.-]/g, "");

/// EINE Quelle für die Kommandozeile: der Trockenlauf druckt exakt das, was --go startet.
const runArgs = (m, outdir) => [
  "glm-generate.mjs", m.id,
  "--base", BASE, "--key", KEY_ENV,
  "--judge", JUDGE, "--judgebase", BASE, "--judgekey", KEY_ENV,
  "--dossier", DOSSIER, "--outdir", outdir,
  ...(TOPIC_ARG ? ["--topic", TOPIC_ARG] : []),
  ...(DEPTH ? ["--depth", DEPTH] : []),
  ...(Object.keys(m.body ?? {}).length ? ["--body", JSON.stringify(m.body)] : []),
];
const zitiere = (a) => /[^\w.\/-]/.test(a) ? `'${a.replace(/'/g, `'\\''`)}'` : a;
const kommando = (m, outdir) => "node " + runArgs(m, outdir).map(zitiere).join(" ");

const stempel = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const plane = (ts) => MODELS.flatMap((m) => Array.from({ length: RUNS }, (_, i) => ({
  model: m, lauf: i + 1, outdir: `bench-runs/${ts}/${slug(m.id)}-r${i + 1}`,
})));

// ── Preise (live) ────────────────────────────────────────────────────────────
/// OpenRouter-Katalog: Preise je Token als Strings. Kein Preis im Katalog heißt
/// „unbekannt" — dann bleibt die Kostenspalte leer, statt eine 0 zu erfinden.
async function preise() {
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${loadKey(KEY_ENV)}` } });
  if (!res.ok) throw new Error(`OpenRouter /models: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const map = new Map();
  for (const m of (await res.json()).data ?? [])
    map.set(m.id, { in: Number(m.pricing?.prompt), out: Number(m.pricing?.completion),
                    ctx: m.context_length, maxOut: m.top_provider?.max_completion_tokens,
                    params: m.supported_parameters });
  return map;
}
const kosten = (p, inTok, outTok) =>
  p && Number.isFinite(p.in) && Number.isFinite(p.out) ? inTok * p.in + outTok * p.out : null;
const usd = (v) => v == null ? "—" : "$" + v.toFixed(4);

/// Ausgabe-Deckel dieses Modells: der kleinere Wert aus dem Bench-Backstop und dem,
/// was der Anbieter für das Modell überhaupt zulässt. Ein Deckel ÜBER dem Anbieter-
/// Limit quittiert manches Deployment mit HTTP 400 — das sähe wie Modell-Versagen aus.
const deckel = (p) => Math.min(MAX_TOKENS, p?.maxOut ?? MAX_TOKENS);

/// Rüstet jedes Modell mit dem Request-Body aus, mit dem es laufen wird. Der Deckel
/// stammt aus dem LIVE-Katalog, nicht aus einer gepflegten Liste: eine Zahl im Code
/// veraltet still, und ein zu kleiner Deckel erstickt genau die Denk-Modelle.
/// Ohne Katalog wird NICHT geraten — dann bricht der Bench ab.
async function ruesteModelle() {
  const katalog = await preise();
  for (const m of MODELS) {
    const p = katalog.get(m.id);
    if (!p) throw new Error(`${m.id} steht nicht im OpenRouter-Katalog — Modell-ID prüfen.`);
    // temperature: null löscht das Feld (Modelle ohne temperature-Unterstützung
    // antworten sonst mit HTTP 400); alles andere behält den Pipeline-Default.
    m.body = { max_tokens: deckel(p), ...(p.params?.includes("temperature") ? {} : { temperature: null }), ...(m.body ?? {}) };
    m.preis = p;
  }
  return katalog;
}

// ── Free-Kontingent ──────────────────────────────────────────────────────────
/// Gemessen an den Bestandsläufen (bench-runs, `usage.gen.calls`) braucht EIN Lauf
/// 2–6 Generator-Anfragen; Median 4. Reparatur-Runden können mehr werden, darum ist
/// die Planzahl die obere Kante des Gemessenen, nicht der Median.
const CALLS_JE_LAUF = 6;

/// Hält das Free-Kontingent des Kontos gegen den geplanten Bedarf. OpenRouter deckelt
/// `:free`-Varianten auf 20 Anfragen je Minute und je Tag auf 50 — 1000 erst ab 10
/// jemals gekauften Credits. Reißt der Bench dieses Limit mittendrin, tragen die
/// zuletzt geplanten Modelle ein Konto-Problem als Ergebnis davon. Darum steht die
/// Rechnung VOR dem Lauf und nicht als Überraschung darin.
async function freiKontingent() {
  const freie = MODELS.filter((m) => m.frei).length;
  if (!freie) return { ok: true };
  const bedarf = freie * RUNS * CALLS_JE_LAUF;
  let gekauft = null;
  try {
    const res = await fetch(`${BASE}/credits`, { headers: { Authorization: `Bearer ${loadKey(KEY_ENV)}` } });
    if (res.ok) gekauft = (await res.json()).data?.total_credits;
  } catch { /* unten als „unbekannt" behandelt */ }
  const limit = gekauft == null ? null : gekauft >= 10 ? 1000 : 50;
  console.log(`\n## Free-Kontingent\n`);
  console.log(`Kostenlose Modelle  ${freie} × ${RUNS} Läufe × ~${CALLS_JE_LAUF} Anfragen = ~${bedarf} Anfragen`);
  console.log(`Gekaufte Credits    ${gekauft ?? "unbekannt"} → Tages-Limit ${limit ?? "unbekannt"} Anfragen`);
  if (limit == null) { console.log(`→ Ohne Auskunft über das Konto keine Aussage — Lauf auf eigenes Risiko.`); return { ok: null }; }
  if (bedarf <= limit) { console.log(`→ Bedarf passt ins Tages-Limit.`); return { ok: true }; }
  console.log(`→ ⚠️  BEDARF ÜBER LIMIT. Der Bench reißt das Kontingent nach etwa`
    + ` ${Math.floor(limit / CALLS_JE_LAUF)} von ${freie * RUNS} kostenlosen Läufen; alles danach misst`
    + ` das Konto, nicht die Modelle.\n   Abhilfe: Credits auf ≥ 10 aufstocken (Limit springt auf 1000/Tag)`
    + ` — oder die kostenlosen Modelle auf mehrere Tage verteilen.`);
  return { ok: false };
}

// ── Trockenlauf ──────────────────────────────────────────────────────────────
async function trockenlauf() {
  const ts = stempel();
  let katalog = null, fehler = null;
  try { katalog = await ruesteModelle(); } catch (e) { fehler = e.message; }
  const plan = plane(ts);
  console.log(`BENCH — TROCKENLAUF (nichts wird ausgeführt)\n`);
  console.log(`Basis      ${BASE}\nKey-Env    ${KEY_ENV} (aus jarvis/.env)\nJudge      ${JUDGE}`);
  console.log(`Modelle    ${MODELS.length} × ${RUNS} Läufe = ${plan.length} geplante Läufe`
    + ` (${MODELS.filter((m) => m.frei).length} davon kostenlos)`);
  console.log(`Parallel   ${PARALLEL} · Timeout je Lauf ${RUN_TIMEOUT_MS / 60000} min · cwd ${DIR}`);
  console.log(`Dossier    ${DOSSIER} · Tiefe ${DEPTH ?? "(Bestands-Contract 7–8 Karten)"}\n`);
  if (!katalog) {
    console.log(`Katalog nicht nutzbar: ${fehler}`);
    console.log(`→ Ohne Katalog kein Lauf-Plan: Ausgabe-Deckel und Preise stünden sonst auf Raten.`);
    return;
  }
  await freiKontingent();

  console.log(`\n## Lauf-Plan (${plan.length} Kommandozeilen)\n`);
  for (const p of plan) console.log(kommando(p.model, p.outdir));

  console.log(`\n## Kostenschätzung (Annahme je Lauf: Generator ${EST.gen.in} in / ${EST.gen.out} out,`
    + ` Judge ${EST.judge.in} in / ${EST.judge.out} out)\n`);
  const jp = katalog.get(JUDGE);
  const jeJudge = kosten(jp, EST.judge.in, EST.judge.out);
  let summe = 0, unbekannt = 0;
  const zeilen = [];
  for (const m of MODELS) {
    const p = katalog.get(m.id);
    const gen = kosten(p, EST.gen.in, EST.gen.out);
    const proLauf = gen == null || jeJudge == null ? null : gen + jeJudge;
    if (proLauf == null) unbekannt++; else summe += proLauf * RUNS;
    zeilen.push([m.id, p ? `${(p.in * 1e6).toFixed(2)}/${(p.out * 1e6).toFixed(2)}` : "nicht im Katalog",
      usd(gen), usd(jeJudge), usd(proLauf), usd(proLauf == null ? null : proLauf * RUNS)]);
  }
  const kopf = ["Modell", "$/1M in/out", "Gen", "Judge", "je Lauf", `× ${RUNS}`];
  const breit = kopf.map((h, i) => Math.max(h.length, ...zeilen.map((z) => z[i].length)));
  const zeile = (z) => z.map((c, i) => c.padEnd(breit[i])).join("  ");
  console.log(zeile(kopf));
  console.log(breit.map((b) => "-".repeat(b)).join("  "));
  for (const z of zeilen) console.log(zeile(z));
  console.log(`\nSUMME (${plan.length} Läufe): ${usd(summe)}`
    + (unbekannt ? ` — ${unbekannt} Modell(e) ohne Katalog-Preis, NICHT enthalten` : ""));
  console.log(`\nAusführen mit: node bench.mjs --go`);
}

// ── Preflight ────────────────────────────────────────────────────────────────
/// Ein Mini-Call je Modell mit EXAKT den Parametern des echten Laufs: erreichbar,
/// Parameter akzeptiert, content nicht null, welcher Unter-Anbieter antwortet.
/// Beantwortet vor der Bench-Nacht die Frage, ob ein Fehlschlag am Modell liegt
/// oder an einem Parameter, den dieses Deployment nicht kennt.
async function preflight() {
  const key = loadKey(KEY_ENV);
  await ruesteModelle();                     // Mini-Call mit DEM Body, mit dem gelaufen wird
  const [, maxCards] = cardRange(DEPTH);
  // Der Judge fährt mit den Werten der Judge-Stufe (judge.mjs chatOpts: temperature
  // 0.1, max_tokens aus dem nim.mjs-Default) — nicht mit denen des Generators.
  const ziele = [...MODELS.map((m) => ({ id: m.id, body: m.body ?? {}, rolle: "Generator" })),
                 { id: JUDGE, body: { temperature: 0.1 }, rolle: "Judge" }];
  console.log(`BENCH — PREFLIGHT: ${ziele.length} Mini-Calls gegen ${BASE} (kostet echtes Geld)\n`);
  const zeilen = [];
  for (const z of ziele) {
    // Body-Merge exakt wie glm-generate.mjs requestBody() — inklusive null-Löschung.
    const body = { model: z.id, messages: [{ role: "user", content: "Antworte nur mit OK" }],
      temperature: 0.6, max_tokens: Math.max(8000, maxCards * 700), ...z.body };
    for (const k of Object.keys(body)) if (body[k] === null) delete body[k];
    const t0 = Date.now();
    let status = "?", inhalt = "—", provider = "—", params = "?";
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
      });
      const text = await res.text();
      status = String(res.status);
      if (res.ok) {
        const data = JSON.parse(text);
        const c = data.choices?.[0]?.message?.content;
        inhalt = c == null ? "NULL" : JSON.stringify(String(c).slice(0, 20));
        provider = data.provider ?? "—";
        params = "akzeptiert";
      } else params = text.slice(0, 120).replace(/\s+/g, " ");
    } catch (e) { status = "FEHLER"; params = e.message.slice(0, 120); }
    zeilen.push([z.rolle, z.id, status, params, inhalt, provider, `${((Date.now() - t0) / 1000).toFixed(1)}s`]);
    console.log(zeilen.at(-1).join(" · "));
  }
  console.log(`\n${zeilen.filter((z) => z[2] === "200").length}/${zeilen.length} erreichbar und Parameter akzeptiert.`);
}

// ── Ausführung ───────────────────────────────────────────────────────────────
function starte(p) {
  return new Promise((fertig) => {
    const outdir = `${DIR}/${p.outdir}`;
    mkdirSync(outdir, { recursive: true });
    const logPath = `${outdir}/lauf.log`;
    const t0 = Date.now();
    const child = spawn("node", runArgs(p.model, p.outdir), { cwd: DIR, stdio: ["ignore", "pipe", "pipe"] });
    let log = "", getoetet = false;
    const timer = setTimeout(() => { getoetet = true; child.kill("SIGKILL"); }, RUN_TIMEOUT_MS);
    const lies = (b) => { const t = String(b); log += t; appendFileSync(logPath, t); };
    child.stdout.on("data", lies);
    child.stderr.on("data", lies);
    child.on("close", (code) => {
      clearTimeout(timer);
      fertig({ ...p, exit: getoetet ? null : code, getoetet, dauerMs: Date.now() - t0, log });
    });
  });
}

/// Statistik des Laufs einsammeln. Fehlt sie, ist der Prozess gestorben, bevor sein
/// Exit-Handler lief (SIGKILL) — das ist ein eigener Befund, kein Grund zum Raten.
function leseStats(p) {
  const dir = `${DIR}/${p.outdir}`;
  try {
    const f = readdirSync(dir).find((n) => n.endsWith("-stats.json"));
    return f ? JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) : null;
  } catch { return null; }
}

async function ausfuehren() {
  const ts = stempel();
  const katalog = await ruesteModelle();     // ohne Katalog kein Lauf: siehe ruesteModelle
  await freiKontingent();
  const plan = plane(ts);
  const wurzel = `${DIR}/bench-runs/${ts}`;
  mkdirSync(wurzel, { recursive: true });

  console.log(`BENCH — ${plan.length} geplante Läufe (${MODELS.length} Modelle × ${RUNS}), Parallelität ${PARALLEL}`);
  const warteschlange = [...plan];
  const ergebnisse = [];
  // Zwei getrennte Stopps, weil zwei getrennte Kontingente reißen können: das
  // Tages-Limit der `:free`-Varianten trifft NUR die kostenlosen Modelle — die
  // bezahlten dürfen weiterlaufen, sonst verlöre der Bench sie ohne Grund.
  let budgetStopp = false, freiStopp = false, ausgegeben = 0;
  const laufKosten = (s) => {
    const g = s?.usage?.gen, j = s?.usage?.judge;
    return (g ? kosten(katalog.get(s.model), g.in, g.out) ?? 0 : 0)
         + (j ? kosten(katalog.get(JUDGE), j.in, j.out) ?? 0 : 0);
  };

  // Wie viele kostenlose Läufe GERADE laufen. Sie teilen sich das Minuten-Kontingent
  // des Kontos, also darf immer nur einer davon unterwegs sein — die bezahlten
  // nebenher, die zählen in einen anderen Topf.
  let freiAktiv = 0;
  const arbeiter = async () => {
    while (warteschlange.length) {
      if (budgetStopp) return;
      // Kostenlose Läufe überspringen, sobald das Tages-Kontingent weg ist; die
      // bezahlten in der Warteschlange laufen weiter.
      const machbar = (p) => !(freiStopp && p.model.frei) && !(p.model.frei && freiAktiv > 0);
      const i = warteschlange.findIndex(machbar);
      if (i < 0) {
        // Nichts machbar: entweder blockiert der andere Arbeiter gerade den einen
        // erlaubten kostenlosen Lauf (dann kurz warten) — oder der Rest ist gestoppt.
        if (warteschlange.every((p) => freiStopp && p.model.frei)) return;
        await new Promise((ok) => setTimeout(ok, 3000));
        continue;
      }
      const p = warteschlange.splice(i, 1)[0];
      if (p.model.frei) freiAktiv++;
      console.log(`▶ ${p.model.id} r${p.lauf}`);
      const e = await starte(p).finally(() => { if (p.model.frei) freiAktiv--; });
      const stats = leseStats(p);
      // Reihenfolge der Wahrheit: ein Kill von außen schlägt die Selbstauskunft des
      // Prozesses; fehlt sie ganz, wird das benannt statt als Modellfehler verbucht.
      const outcome = e.getoetet ? "infra-timeout"
        : stats?.outcome ?? (/API 402/.test(e.log) ? "infra-budget" : "ohne-stats");
      const eintrag = { modell: p.model.id, lauf: p.lauf, outdir: p.outdir, exit: e.exit,
        dauerMs: e.dauerMs, outcome, stats };
      ergebnisse.push(eintrag);
      ausgegeben += laufKosten(stats);
      appendFileSync(`${wurzel}/results.jsonl`, JSON.stringify(eintrag) + "\n");
      console.log(`■ ${p.model.id} r${p.lauf}: ${outcome} (exit ${e.exit}, ${(e.dauerMs / 1000).toFixed(0)}s`
        + `, bisher ${usd(ausgegeben)})`);
      // 402 = Konto-Limit: jeder weitere Lauf liefe in denselben Fehler und
      // verfälschte die Messung. Sofort anhalten, Rest als „nicht gelaufen" führen.
      if (outcome === "infra-budget" || /API 402/.test(e.log)) {
        budgetStopp = true;
        console.log("BUDGET-STOPP: HTTP 402 — keine weiteren Läufe.");
      } else if (outcome === "infra-ratelimit" && p.model.frei && !freiStopp) {
        freiStopp = true;
        console.log("FREI-STOPP: Tages-Kontingent der :free-Varianten erschöpft —"
          + " die kostenlosen Modelle sind für heute durch, die bezahlten laufen weiter.");
      } else if (ausgegeben >= KOSTEN_STOPP_USD && !budgetStopp) {
        budgetStopp = true;
        console.log(`KOSTEN-STOPP: ${usd(ausgegeben)} erreicht die Grenze von ${usd(KOSTEN_STOPP_USD)}.`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, arbeiter));

  const grund = (p) => budgetStopp ? "nicht gelaufen (Budget)"
    : p.model.frei && freiStopp ? "nicht gelaufen (Free-Kontingent)" : "nicht gelaufen";
  const nichtGelaufen = warteschlange.map((p) => ({ modell: p.model.id, lauf: p.lauf, outdir: p.outdir,
    exit: null, dauerMs: 0, outcome: grund(p), stats: null }));
  for (const n of nichtGelaufen) appendFileSync(`${wurzel}/results.jsonl`, JSON.stringify(n) + "\n");

  const md = report(ts, plan, ergebnisse, nichtGelaufen, katalog);
  writeFileSync(`${wurzel}/report.md`, md);
  console.log(`\nSoll ${plan.length} · Ist ${ergebnisse.length} gelaufen · ${nichtGelaufen.length} nicht gelaufen`);
  console.log(`→ ${wurzel}/report.md`);
}

// ── Report (reine Messung) ───────────────────────────────────────────────────
function report(ts, plan, ergebnisse, nichtGelaufen, katalog) {
  const z = (v) => v == null ? "—" : String(v);
  const kopf = ["Modell", "Lauf", "Outcome", "Exit", "Erstwurf-Fehler", "Runden v/p/e/k/g",
    "Judge c/f", "schwer (wrong+unsup)", "leicht (imprecise)", "Notecheck ok/fix/hart",
    "Richtungs-HART", "Tokens gen in/out", "Tokens judge in/out", "Kosten", "Dauer", "Provider"];
  const zeilen = [...ergebnisse, ...nichtGelaufen].map((e) => {
    const s = e.stats;
    const v = (s?.judge ?? []).reduce((a, r) => {
      for (const [k, n] of Object.entries(r.verdicts ?? {})) a[k] = (a[k] ?? 0) + n;
      return a;
    }, {});
    const nc = (s?.notecheck ?? []).at(-1);
    const gen = s?.usage?.gen, ju = s?.usage?.judge;
    const p = katalog?.get(e.modell), pj = katalog?.get(JUDGE);
    const k = gen && ju ? (kosten(p, gen.in, gen.out) ?? 0) + (kosten(pj, ju.in, ju.out) ?? 0) : null;
    const prov = [...(gen?.providers ?? []), ...(ju?.providers ?? [])];
    return [e.modell, `r${e.lauf}`, e.outcome, z(e.exit),
      s?.contractErsterWurf ? String(s.contractErsterWurf.fehler) : "—",
      s ? `${s.runden.vollRetries}/${s.runden.patchRunden}/${s.runden.ergaenzungsRunden}`
        + `/${s.runden.kuerzungsRunden ?? 0}/${s.runden.generatorPatches}` : "—",
      s?.judge?.length ? `${s.judge.reduce((a, r) => a + r.checks, 0)}/${s.judge.reduce((a, r) => a + r.findings, 0)}` : "—",
      s?.judge?.length ? String((v.wrong ?? 0) + (v.unsupported ?? 0)) : "—",
      s?.judge?.length ? String(v.imprecise ?? 0) : "—",
      nc ? `${nc.ok}/${nc.fix}/${nc.hart}` : "—",
      nc ? String(nc.hartRichtung) : "—",
      gen ? `${gen.in}/${gen.out}` : "—", ju ? `${ju.in}/${ju.out}` : "—",
      k == null ? "—" : usd(k), e.dauerMs ? `${(e.dauerMs / 1000).toFixed(0)}s` : "—",
      prov.length ? [...new Set(prov)].join(",") : "—"];
  });
  const summeKosten = zeilen.reduce((a, r) => a + (r[13].startsWith("$") ? Number(r[13].slice(1)) : 0), 0);
  const outcomes = {};
  for (const e of [...ergebnisse, ...nichtGelaufen]) outcomes[e.outcome] = (outcomes[e.outcome] ?? 0) + 1;
  // Provider-Streuung: OpenRouter routet dieselbe Modell-ID auf wechselnde Anbieter.
  // Läuft ein Modell über mehrere, vergleichen die Läufe womöglich verschieden
  // quantisierte Deployments — das gehört neben die Zahlen, nicht in eine Fußnote.
  const proModell = new Map();
  for (const e of ergebnisse) {
    const prov = [...(e.stats?.usage?.gen?.providers ?? [])];
    if (!proModell.has(e.modell)) proModell.set(e.modell, new Set());
    for (const p of prov) proModell.get(e.modell).add(p);
  }
  const gestreut = [...proModell].filter(([, s]) => s.size > 1)
    .map(([m, s]) => `- \`${m}\`: ${[...s].join(", ")}`);

  return `# Modell-Bench ${ts}

Basis \`${BASE}\` · Judge \`${JUDGE}\` · Dossier \`${DOSSIER}\` · Tiefe ${DEPTH ?? "Bestands-Contract (7–8 Karten)"} · ${RUNS} Läufe je Modell

**Soll/Ist:** ${plan.length} geplant · ${ergebnisse.length} gelaufen · ${nichtGelaufen.length} nicht gelaufen

**Bedingungen je Modell** (Ausgabe-Deckel = kleinerer Wert aus Bench-Backstop ${MAX_TOKENS} und Anbieter-Limit):

${MODELS.map((m) => `- \`${m.id}\`${m.frei ? " (kostenlos)" : ""} — max_tokens ${m.body?.max_tokens ?? "?"}`
    + `${m.body?.temperature === null ? ", ohne temperature" : ""}`).join("\n")}

Reine Messung — keine Wertung, kein Ranking. \`infra-*\` heißt: Ursache lag in der
Infrastruktur (Konto, Key, Netz, Zeit, Kontingent), nicht beim Modell; solche Läufe sind zu wiederholen.
\`infra-ratelimit\` heißt konkret: das Tages-Kontingent der \`:free\`-Varianten war weg.

${gestreut.length ? `**⚠️ Provider-Streuung** — diese Modelle liefen über mehr als einen Anbieter,\nihre Läufe sind untereinander nur eingeschränkt vergleichbar:\n\n${gestreut.join("\n")}\n` : ""}

## Läufe

| ${kopf.join(" | ")} |
| ${kopf.map(() => "---").join(" | ")} |
${zeilen.map((r) => `| ${r.join(" | ")} |`).join("\n")}

**Kosten gesamt (echte Tokens):** ${usd(summeKosten)}

## Ausgänge

${Object.entries(outcomes).map(([k, n]) => `- ${k}: ${n}`).join("\n")}

## Spalten

- **Erstwurf-Fehler** — Contract-Fehler der ERSTEN Modell-Antwort (vor jeder Reparatur-Runde).
- **Runden v/p/e/k/g** — Voll-Retries / Feld-Patch-Runden / Ergänzungs-Runden / Kürzungs-Runden / Generator-Patch-Runden.
- **Judge c/f** — Prüfaufträge (checks) / Befunde (findings) über alle Judge-Runden.
- **schwer/leicht** — Judge-verdicts: wrong+unsupported gegen imprecise.
- **Notecheck ok/fix/hart** — Befunde des letzten notecheck-Laufs; **Richtungs-HART** davon die Richtungs-Widersprüche.
- **Provider** — von OpenRouter gemeldete Unter-Anbieter (verschiedene Hosts = ggf. verschiedene Quantisierung).
`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv.includes("--go")) await ausfuehren();
else if (process.argv.includes("--preflight")) await preflight();
else await trockenlauf();
