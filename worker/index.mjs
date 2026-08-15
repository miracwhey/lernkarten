// Generierungs-Worker: zieht Jobs aus generation_jobs (claim_next_job, FOR UPDATE
// SKIP LOCKED), baut pro Job erst ein Fakten-Dossier und lässt darauf die
// UNVERÄNDERTE Pipeline (glm-generate.mjs) laufen. Ergebnis wandert als Row nach
// public.lessons, der Job auf done bzw. failed mit nutzerlesbarem Fehler.
// Läuft lokal als Daemon: node worker/index.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { randomBytes } from "crypto";
import { DEPTH_CARDS, normalizeLesson, validateLesson } from "../validate-lesson.mjs";
import { CHAIN, JUDGE, NIM_BASE } from "./models.mjs";
import { makeDossier } from "./make-dossier.mjs";

const DIR = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const REPO = `${DIR}/..`;
const JOBS = `${DIR}/jobs`;

const POLL_MS = 5000;
// Die Dossier-Stufe enthält seit dem Zahlen-Gate ZWEI Modell-Stufen (Erzeugung +
// unabhängiger Judge, dazu ggf. eine Reparatur- und eine Detektor-Re-Run-Runde).
// Gemessen: Tiefe „tief" braucht ~4 Min für beide zusammen — 6 Min wären die Frist
// von vorher, gesetzt für die Erzeugung allein.
const DOSSIER_TIMEOUT_MS = 12 * 60 * 1000;
const PIPELINE_TIMEOUT_MS = 30 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 2;

// ── Env ──────────────────────────────────────────────────────────────────────
for (const line of readFileSync(`${DIR}/.env`, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
for (const need of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[need]) { console.error(`${need} fehlt in worker/.env — siehe worker/README.md`); process.exit(1); }
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Fehlertexte, die der Nutzer in der Bibliothekszeile liest ────────────────
const USER_ERROR = {
  dossier: "Zu diesem Thema ließen sich keine belastbaren Quellen zusammentragen. Formuliere es enger.",
  technik: "Technischer Fehler bei der Generierung. Versuch es gleich noch einmal.",
  quota: "Alle Modelle sind gerade am Kontingent-Limit. Versuch es später noch einmal.",
  reject: "Die Karten haben die Faktenprüfung nicht bestanden. Versuch es mit einem engeren Thema.",
  render: "Interner Fehler beim Zeichnen der Diagramme.",
  save: "Die Lektion konnte nicht gespeichert werden.",
};

// ── Job-Zustand ──────────────────────────────────────────────────────────────
// Wichtig: async-Funktionen, keine zurückgegebenen Query-Builder. Ein Builder von
// supabase-js schickt erst beim await los — die Stufen-Meldung aus dem stdout-
// Handler wird nicht awaited und wäre als Builder spurlos verpufft.
async function patchJob(id, fields, was) {
  const { error } = await db.from("generation_jobs").update(fields).eq("id", id);
  if (error) console.error(`${was} fehlgeschlagen (${id}):`, error.message);
  return !error;
}
const setStage = (id, stage) => patchJob(id, { stage }, `Stufe → ${stage}`);
const failJob = (id, error) => patchJob(id, { status: "failed", stage: null, error: error.slice(0, 500) }, "Job → failed");
const doneJob = (id, lesson_id) => patchJob(id, { status: "done", stage: null, error: null, lesson_id }, "Job → done");

/// Jobs, die ein abgestürzter Worker auf 'running' stehen ließ: unter dem
/// Versuchs-Deckel zurück in die Queue, darüber endgültig als Fehler.
async function requeueStale() {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await db.from("generation_jobs")
    .select("id, attempts").eq("status", "running").lt("updated_at", cutoff);
  if (error) { console.error("Stale-Prüfung fehlgeschlagen:", error.message); return; }
  for (const job of data ?? []) {
    if (job.attempts >= MAX_ATTEMPTS) {
      await failJob(job.id, "Der Bau wurde abgebrochen und der Versuch nicht wiederholt.");
      console.log(`Job ${job.id}: stale, Versuche erschöpft → failed`);
    } else {
      await patchJob(job.id, { status: "queued", stage: null }, "Job → queued");
      console.log(`Job ${job.id}: stale → zurück in die Queue`);
    }
  }
}

// ── Pipeline-Aufruf ──────────────────────────────────────────────────────────
/// Startet glm-generate.mjs mit dem Job-Dossier und liest den Fortschritt mit.
/// cwd = Repo-Wurzel, weil audit-lesson.mjs karten-grammatik.html relativ auflöst.
function runPipeline({ model, topic, depth, dossierPath, outdir, logPath, onStage }) {
  const args = [
    `${REPO}/glm-generate.mjs`, model.id,
    "--key", model.keyName,
    "--topic", topic,
    "--depth", depth,
    "--dossier", dossierPath,
    "--outdir", outdir,
    "--judge", JUDGE.id, "--judgekey", JUDGE.keyName,
  ];
  if (JUDGE.base) args.push("--judgebase", JUDGE.base);
  if (model.base !== NIM_BASE) args.push("--base", model.base);
  if (Object.keys(model.body).length) args.push("--body", JSON.stringify(model.body));

  return new Promise((resolve) => {
    const child = spawn("node", args, { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", stageSwitched = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, PIPELINE_TIMEOUT_MS);

    const consume = (buf) => {
      const text = String(buf);
      out += text;
      appendFileSync(logPath, text);
      process.stdout.write(text.replace(/^/gm, "    "));
      // Contract PASS = Karten stehen, ab hier laufen nur noch Prüf-Stufen.
      if (!stageSwitched && /Contract PASS/.test(out)) { stageSwitched = true; onStage("pruefen"); }
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: timedOut ? "timeout" : code, out }); });
  });
}

/// Zuordnung Pipeline-Ausgang → (weiterprobieren?, Nutzertext).
function deuteExit(code, out) {
  if (code === 0) return { ok: true };
  if (code === 3) return { ok: false, weiter: false, grund: USER_ERROR.render };
  if (code === "timeout") return { ok: false, weiter: true, grund: "Zeitüberschreitung beim Bau." };
  if (/Rate-Limit hält an|API 429|API 40[13]/.test(out)) return { ok: false, weiter: true, grund: USER_ERROR.quota };
  return { ok: false, weiter: true, grund: USER_ERROR.reject };
}

// ── Ein Job ──────────────────────────────────────────────────────────────────
const asciiSlug = (s) => s.toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "lektion";

async function runJob(job) {
  // Die Tiefe steuert Dossier-Dichte UND Kartenzahl. Ein unbekannter Wert würde
  // sonst erst tief in der Pipeline auffallen — und dort die ganze Modell-Kette
  // durchbrennen, weil jeder Versuch am selben Argument scheitert.
  if (!DEPTH_CARDS[job.depth]) {
    console.error(`Job ${job.id}: unbekannte Tiefe "${job.depth}"`);
    return failJob(job.id, `Unbekannte Tiefe „${job.depth}" — erlaubt: ${Object.keys(DEPTH_CARDS).join(", ")}.`);
  }
  const dir = `${JOBS}/${job.id}`;
  mkdirSync(dir, { recursive: true });
  const logPath = `${dir}/run.log`;
  writeFileSync(logPath, `Job ${job.id} · ${job.kind} · Tiefe ${job.depth} · Versuch ${job.attempts}\n`);
  const log = (m) => { console.log("   ", m); appendFileSync(logPath, m + "\n"); };

  // Foto-Jobs tragen beides: der OCR-Block (source_text) speist das Dossier, das
  // vom Nutzer bestätigte Thema führt die Karten-Stufe. Nur bei kind='text' gibt es
  // kein Thema — dort bleibt der Platzhalter, der auf das Dossier verweist.
  const input = job.kind === "topic" ? job.topic : job.source_text;
  const topic = job.kind === "text" ? "Der vom Nutzer eingereichte Text (siehe Dossier)" : job.topic;

  // 1 — Quellen sammeln. Kette auch hier: das Dossier ist der teuerste Einzel-Call.
  const dossierPath = `${dir}/dossier.md`;
  let dossierModel = null, dossierInhaltlich = false;
  for (const model of CHAIN) {
    try {
      log(`Dossier mit ${model.id}…`);
      const md = await mitDeadline(
        (signal) => makeDossier({ kind: job.kind, input, depth: job.depth, topic: job.topic, model, log, signal }),
        DOSSIER_TIMEOUT_MS, `Dossier-Stufe (${model.id})`);
      writeFileSync(dossierPath, md);
      dossierModel = model;
      break;
    } catch (e) {
      log(`Dossier mit ${model.id} fehlgeschlagen: ${e.message}`);
      if (e.inhaltlich) dossierInhaltlich = true;
    }
  }
  // „Keine Quellen" nur, wenn wirklich der Inhalt scheiterte — ein API-/Netz-
  // Fehler ist ein Technik-Fehler und darf das Thema nicht beschuldigen.
  if (!dossierModel) return failJob(job.id, dossierInhaltlich ? USER_ERROR.dossier : USER_ERROR.technik);

  // 2 — Karten schreiben + prüfen. Pipeline unverändert, nur andere Eingaben.
  await setStage(job.id, "karten");
  let letzterGrund = USER_ERROR.quota;
  for (const model of CHAIN) {
    log(`Pipeline mit ${model.id}…`);
    const { code, out } = await runPipeline({
      model, topic, depth: job.depth, dossierPath, outdir: dir, logPath,
      onStage: () => { setStage(job.id, "pruefen"); log("Stufe → Fakten & Bilder prüfen"); },
    });
    const urteil = deuteExit(code, out);
    if (urteil.ok) return await speichern(job, dir, model, log);
    log(`Pipeline (${model.id}) endete mit ${code}: ${urteil.grund}`);
    letzterGrund = urteil.grund;
    if (!urteil.weiter) break;
    await setStage(job.id, "karten");
  }
  return failJob(job.id, letzterGrund);
}

/// Die fertige Lektion in public.lessons legen. Der Validator läuft hier ein
/// zweites Mal — die Datei ist nach dem Notecheck-Fix zurückgeschrieben worden.
async function speichern(job, dir, model, log) {
  const tag = model.id.split("/").pop().toLowerCase().replace(/[^a-z0-9.-]/g, "");
  const file = `${dir}/${tag}-lesson-v2.json`;
  if (!existsSync(file)) { log(`Pipeline meldet Erfolg, aber ${file} fehlt.`); return failJob(job.id, USER_ERROR.save); }

  const lesson = normalizeLesson(JSON.parse(readFileSync(file, "utf8")));
  // Mit der bestellten Tiefe prüfen — sonst misst der Insert-Gate die 20-Karten-
  // Lektion am 7–8-Karten-Bestandscontract und lehnt sie ab.
  const errs = validateLesson(lesson, { depth: job.depth });
  if (errs.length) { log("Contract-Fehler nach der Pipeline:\n" + errs.join("\n")); return failJob(job.id, USER_ERROR.reject); }

  // Slug ist die Identität der Lektion im SRS (CardKey.slug) — global eindeutig
  // und stabil, darum eigener Zufalls-Suffix statt der Modell-Id.
  const slug = `${asciiSlug(lesson.id || lesson.title)}-${randomBytes(3).toString("hex")}`;
  const { data, error } = await db.from("lessons").insert({
    user_id: job.user_id,
    slug,
    title: lesson.title,
    // Die vom Nutzer bestätigte Quelle schlägt den Titel, den sich das Modell aus
    // dem Dossier ableitet. job.source trägt nur ein Foto-Job (bei topic/text ist
    // die Spalte NULL, dann bleibt es bei lesson.source).
    source: job.source ?? lesson.source ?? "",
    cards: lesson.cards,
  }).select("id").single();
  if (error) { log("Insert fehlgeschlagen: " + error.message); return failJob(job.id, USER_ERROR.save); }

  log(`Lektion gespeichert: ${slug} · ${lesson.cards.length} Karten · „${lesson.title}"`);
  return doneJob(job.id, data.id);
}

/// Deadline mit ECHTEM Abbruch: das Signal geht bis in den fetch. Ein Promise.race
/// beendet nur das Warten — der verlorene Request lief weiter und verbrannte
/// Kontingent, während die Kette schon das nächste Modell anfasste.
async function mitDeadline(fn, ms, was) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error(`${was}: Zeitüberschreitung nach ${ms / 60000} Min`)), ms);
  try { return await fn(ctl.signal); }
  finally { clearTimeout(timer); }
}

// ── Schleife ─────────────────────────────────────────────────────────────────
mkdirSync(JOBS, { recursive: true });
console.log("Worker startet · Kette:", CHAIN.map((m) => m.id).join(" → "), "· Judge:", JUDGE.id);
if (process.env.OPENROUTER_API_KEY) {
  console.log("HINWEIS: OPENROUTER_API_KEY ist gesetzt, wird aber ignoriert — glm-generate.mjs löst Keys"
    + " ausschließlich über jarvis/.env auf. Siehe worker/README.md.");
}
await requeueStale();

let stop = false;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { console.log("\nWorker hält an…"); stop = true; });

while (!stop) {
  let job = null;
  try {
    const { data, error } = await db.rpc("claim_next_job");
    if (error) throw new Error(error.message);
    // SETOF: leere Queue = leeres Array. Die id-Prüfung bleibt als zweite Schranke —
    // ein Composite-NULL käme als Row aus lauter NULL-Spalten an, also truthy.
    job = (Array.isArray(data) ? data[0] : data)?.id ? (Array.isArray(data) ? data[0] : data) : null;
  } catch (e) {
    console.error("claim_next_job fehlgeschlagen:", e.message);
  }
  if (!job) { await new Promise((ok) => setTimeout(ok, POLL_MS)); continue; }

  console.log(`\n▶ Job ${job.id} · ${job.kind} · Tiefe ${job.depth} · Versuch ${job.attempts}`);
  const t0 = Date.now();
  try {
    if (job.attempts > MAX_ATTEMPTS) await failJob(job.id, "Der Bau ist mehrfach fehlgeschlagen.");
    else await runJob(job);
  } catch (e) {
    console.error("Job-Fehler:", e);
    await failJob(job.id, "Unerwarteter Fehler beim Bau.");
  }
  console.log(`◼ Job ${job.id} beendet nach ${Math.round((Date.now() - t0) / 1000)}s`);
}
process.exit(0);
