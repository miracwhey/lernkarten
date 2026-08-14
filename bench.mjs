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
const RUNS = 2;
const PARALLEL = 2;
const DOSSIER = "facts/why-we-sleep.md";
const DEPTH = null;                        // ohne Tiefe = Bestands-Contract (7–8 Karten)
// Die Backoff-Ketten der Pipeline (8 Versuche mit wachsender Wartezeit) können einen
// toten Lauf über eine halbe Stunde festhalten — hier ist Schluss.
const RUN_TIMEOUT_MS = 25 * 60 * 1000;
// Reasoning-Modelle zahlen Denk-Tokens aus demselben Budget; mit 8000 schneidet das
// JSON mitten in der Lektion ab. KEINE reasoning-Drossel: jedes Modell soll sein
// Normalverhalten zeigen (warnAbgeschnitten weist Denk-Tokens ohnehin aus).
const MAX_TOKENS = 16000;
// Laut OpenRouter-supported_parameters kennt die GPT-5.6-Reihe kein temperature —
// explizites null LÖSCHT das Feld im Request (glm-generate.mjs, requestBody).
const OHNE_TEMP = { max_tokens: MAX_TOKENS, temperature: null };
const MODELS = [
  { id: "moonshotai/kimi-k3", body: { max_tokens: MAX_TOKENS } },
  { id: "qwen/qwen3.8-max", body: { max_tokens: MAX_TOKENS } },
  { id: "openai/gpt-5.6-terra-pro", body: OHNE_TEMP },
  { id: "x-ai/grok-4.20", body: { max_tokens: MAX_TOKENS } },
  { id: "z-ai/glm-5.2", body: { max_tokens: MAX_TOKENS } },
  { id: "deepseek/deepseek-v4-pro-0813", body: { max_tokens: MAX_TOKENS } },
  { id: "openai/gpt-5.6-luna-pro", body: OHNE_TEMP },
  { id: "deepseek/deepseek-v4-flash-0731", body: { max_tokens: MAX_TOKENS } },
  { id: "minimax/minimax-m3", body: { max_tokens: MAX_TOKENS } },
];
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
                    ctx: m.context_length, params: m.supported_parameters });
  return map;
}
const kosten = (p, inTok, outTok) =>
  p && Number.isFinite(p.in) && Number.isFinite(p.out) ? inTok * p.in + outTok * p.out : null;
const usd = (v) => v == null ? "—" : "$" + v.toFixed(4);

// ── Trockenlauf ──────────────────────────────────────────────────────────────
async function trockenlauf() {
  const ts = stempel();
  const plan = plane(ts);
  console.log(`BENCH — TROCKENLAUF (nichts wird ausgeführt)\n`);
  console.log(`Basis      ${BASE}\nKey-Env    ${KEY_ENV} (aus jarvis/.env)\nJudge      ${JUDGE}`);
  console.log(`Modelle    ${MODELS.length} × ${RUNS} Läufe = ${plan.length} geplante Läufe`);
  console.log(`Parallel   ${PARALLEL} · Timeout je Lauf ${RUN_TIMEOUT_MS / 60000} min · cwd ${DIR}`);
  console.log(`Dossier    ${DOSSIER} · Tiefe ${DEPTH ?? "(Bestands-Contract 7–8 Karten)"}\n`);

  console.log(`## Lauf-Plan (${plan.length} Kommandozeilen)\n`);
  for (const p of plan) console.log(kommando(p.model, p.outdir));

  console.log(`\n## Kostenschätzung (Annahme je Lauf: Generator ${EST.gen.in} in / ${EST.gen.out} out,`
    + ` Judge ${EST.judge.in} in / ${EST.judge.out} out)\n`);
  let katalog = null, fehler = null;
  try { katalog = await preise(); } catch (e) { fehler = e.message; }
  if (!katalog) {
    console.log(`Preise nicht abrufbar: ${fehler}`);
    console.log(`→ Ohne Katalog KEINE Schätzung (eine erfundene Zahl wäre schlimmer als keine).`);
    return;
  }
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
  const plan = plane(ts);
  const wurzel = `${DIR}/bench-runs/${ts}`;
  mkdirSync(wurzel, { recursive: true });
  let katalog = null;
  try { katalog = await preise(); } catch (e) { console.log("Preise nicht abrufbar:", e.message); }

  console.log(`BENCH — ${plan.length} geplante Läufe (${MODELS.length} Modelle × ${RUNS}), Parallelität ${PARALLEL}`);
  const warteschlange = [...plan];
  const ergebnisse = [];
  let budgetStopp = false;

  const arbeiter = async () => {
    while (warteschlange.length) {
      if (budgetStopp) return;
      const p = warteschlange.shift();
      console.log(`▶ ${p.model.id} r${p.lauf}`);
      const e = await starte(p);
      const stats = leseStats(p);
      // Reihenfolge der Wahrheit: ein Kill von außen schlägt die Selbstauskunft des
      // Prozesses; fehlt sie ganz, wird das benannt statt als Modellfehler verbucht.
      const outcome = e.getoetet ? "infra-timeout"
        : stats?.outcome ?? (/API 402/.test(e.log) ? "infra-budget" : "ohne-stats");
      const eintrag = { modell: p.model.id, lauf: p.lauf, outdir: p.outdir, exit: e.exit,
        dauerMs: e.dauerMs, outcome, stats };
      ergebnisse.push(eintrag);
      appendFileSync(`${wurzel}/results.jsonl`, JSON.stringify(eintrag) + "\n");
      console.log(`■ ${p.model.id} r${p.lauf}: ${outcome} (exit ${e.exit}, ${(e.dauerMs / 1000).toFixed(0)}s)`);
      // 402 = Konto-Limit: jeder weitere Lauf liefe in denselben Fehler und
      // verfälschte die Messung. Sofort anhalten, Rest als „nicht gelaufen" führen.
      if (outcome === "infra-budget" || /API 402/.test(e.log)) {
        budgetStopp = true;
        console.log("BUDGET-STOPP: HTTP 402 — keine weiteren Läufe.");
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, arbeiter));

  const nichtGelaufen = warteschlange.map((p) => ({ modell: p.model.id, lauf: p.lauf, outdir: p.outdir,
    exit: null, dauerMs: 0, outcome: budgetStopp ? "nicht gelaufen (Budget)" : "nicht gelaufen", stats: null }));
  for (const n of nichtGelaufen) appendFileSync(`${wurzel}/results.jsonl`, JSON.stringify(n) + "\n");

  const md = report(ts, plan, ergebnisse, nichtGelaufen, katalog);
  writeFileSync(`${wurzel}/report.md`, md);
  console.log(`\nSoll ${plan.length} · Ist ${ergebnisse.length} gelaufen · ${nichtGelaufen.length} nicht gelaufen`);
  console.log(`→ ${wurzel}/report.md`);
}

// ── Report (reine Messung) ───────────────────────────────────────────────────
function report(ts, plan, ergebnisse, nichtGelaufen, katalog) {
  const z = (v) => v == null ? "—" : String(v);
  const kopf = ["Modell", "Lauf", "Outcome", "Exit", "Erstwurf-Fehler", "Runden v/p/e/g",
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
      s ? `${s.runden.vollRetries}/${s.runden.patchRunden}/${s.runden.ergaenzungsRunden}/${s.runden.generatorPatches}` : "—",
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
  return `# Modell-Bench ${ts}

Basis \`${BASE}\` · Judge \`${JUDGE}\` · Dossier \`${DOSSIER}\` · Tiefe ${DEPTH ?? "Bestands-Contract (7–8 Karten)"} · ${RUNS} Läufe je Modell

**Soll/Ist:** ${plan.length} geplant · ${ergebnisse.length} gelaufen · ${nichtGelaufen.length} nicht gelaufen

Reine Messung — keine Wertung, kein Ranking. \`infra-*\` heißt: Ursache lag in der
Infrastruktur (Konto, Key, Netz, Zeit), nicht beim Modell; solche Läufe sind zu wiederholen.

## Läufe

| ${kopf.join(" | ")} |
| ${kopf.map(() => "---").join(" | ")} |
${zeilen.map((r) => `| ${r.join(" | ")} |`).join("\n")}

**Kosten gesamt (echte Tokens):** ${usd(summeKosten)}

## Ausgänge

${Object.entries(outcomes).map(([k, n]) => `- ${k}: ${n}`).join("\n")}

## Spalten

- **Erstwurf-Fehler** — Contract-Fehler der ERSTEN Modell-Antwort (vor jeder Reparatur-Runde).
- **Runden v/p/e/g** — Voll-Retries / Feld-Patch-Runden / Ergänzungs-Runden / Generator-Patch-Runden.
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
