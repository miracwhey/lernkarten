// Feld-Stresstest: trägt die Pipeline auch außerhalb der Felder, an denen sie gewachsen ist?
//
// Alle bisherigen Themen (Schlaf, Neuron, Wärmeinsel, Graffiti, Einkreisung) sind Biologie,
// Psyche oder Stadtklima — Stoff mit Mechanismen, Verläufen und Messwerten. Ob Recht,
// Geschichte, Wirtschaft oder Musik durch dieselbe Pipeline kommen, ist bisher Vermutung.
// Dieser Lauf misst es, statt darüber zu argumentieren.
//
// Gefahren wird der PRODUKTIONSPFAD: dieselbe Modell-Kette, dieselbe Dossier-Stufe,
// dieselbe Pipeline, dieselbe Tiefe wie ein Job aus der App. Was fehlt, ist nur die
// Queue und der Insert in public.lessons — der Test soll Leons Bibliothek nicht füllen.
//
// Nutzung: node probes/feld-stresstest.mjs            → Plan, führt NICHTS aus
//          node probes/feld-stresstest.mjs --go       → Läufe ausführen
//          node probes/feld-stresstest.mjs --nur recht,musik
//          node probes/feld-stresstest.mjs --report   → nur auswerten, was schon gelaufen ist
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { CHAIN, JUDGE } from "../worker/models.mjs";
import { makeDossier } from "../worker/make-dossier.mjs";
import { NIM_BASE } from "../nim.mjs";

const DIR = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT = `${DIR}/runs/feld-stresstest`;

// Vier Felder, bewusst nach Härte gegen das gewachsene System gewählt — jedes bricht
// eine andere Annahme, auf der die bisherigen Themen still beruhten:
//
//   Recht       — kein Naturverlauf. Der Stoff ist eine Begriffshierarchie mit
//                 Bedingungen ("nur wenn"), nichts steigt oder fällt über Zeit.
//                 Härtester Test gegen die Kurven-Lastigkeit (46–57 % curve im Bench).
//   Geschichte  — Kausalketten zwischen Akteuren statt Mechanismen in einem System.
//                 Zeitachse ja, aber ohne Messwerte, die eine Kurve tragen könnten.
//   Wirtschaft  — zahlenlastig. Trifft direkt den offenen Zahlen-Befund: Labels
//                 behaupten Größen, die die gezeichnete Geometrie nicht hergibt.
//   Musik       — Wahrnehmung und Ästhetik. Am wenigsten "Mechanismus" von allen;
//                 die Nagelprobe darauf, ob das Dossier-Format überhaupt greift.
const FELDER = [
  { key: "recht",      feld: "Recht",       topic: "Notwehr im deutschen Strafrecht" },
  { key: "geschichte", feld: "Geschichte",  topic: "Warum die Weimarer Republik scheiterte" },
  { key: "wirtschaft", feld: "Wirtschaft",  topic: "Wie Inflation entsteht" },
  { key: "musik",      feld: "Musik",       topic: "Warum Moll traurig klingt" },
];

const DEPTH = "standard";           // der Regelfall der App
const DOSSIER_TIMEOUT_MS = 4 * 60 * 1000;
const PIPELINE_TIMEOUT_MS = 20 * 60 * 1000;
const PARALLEL = 2;                 // bezahlte Modelle, kein :free-Kontingent im Spiel

const flagWert = (name) => { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : null; };
const GO = process.argv.includes("--go");
const NUR_REPORT = process.argv.includes("--report");
const NUR = (flagWert("nur") || "").split(",").map((s) => s.trim()).filter(Boolean);
const BEHALTEN = process.argv.includes("--dossier-behalten");
const felder = NUR.length ? FELDER.filter((f) => NUR.includes(f.key)) : FELDER;

const tagVon = (id) => id.split("/").pop().toLowerCase().replace(/[^a-z0-9.-]/g, "");

// ── Pipeline-Aufruf ──────────────────────────────────────────────────────────
/// Bewusst nachgebaut statt importiert: worker/index.mjs hat keinen Modul-Guard und
/// startet seinen Queue-Loop schon beim Import — ein Import würde hier einen ZWEITEN
/// Arbeiter gegen Leons Produktions-Queue setzen. Was driften könnte (Modell-Kette,
/// Judge, Tiefe), kommt darum aus den echten Quellen; nur die Argumentliste steht hier.
function runPipeline({ model, topic, dossierPath, outdir, logPath }) {
  const args = [
    `${DIR}/glm-generate.mjs`, model.id,
    "--key", model.keyName,
    "--topic", topic,
    "--depth", DEPTH,
    "--dossier", dossierPath,
    "--outdir", outdir,
    "--judge", JUDGE.id, "--judgekey", JUDGE.keyName,
  ];
  if (JUDGE.base) args.push("--judgebase", JUDGE.base);
  if (model.base !== NIM_BASE) args.push("--base", model.base);
  if (Object.keys(model.body).length) args.push("--body", JSON.stringify(model.body));

  return new Promise((resolve) => {
    const child = spawn("node", args, { cwd: DIR, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, PIPELINE_TIMEOUT_MS);
    const consume = (buf) => { out += String(buf); appendLog(logPath, String(buf)); };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: timedOut ? -1 : code, out, timedOut }); });
  });
}

function appendLog(path, text) {
  writeFileSync(path, (existsSync(path) ? readFileSync(path, "utf8") : "") + text);
}

// ── Ein Feld ─────────────────────────────────────────────────────────────────
async function fahre(f) {
  const dir = `${OUT}/${f.key}`;
  mkdirSync(dir, { recursive: true });
  const logPath = `${dir}/run.log`;
  writeFileSync(logPath, `${f.feld} · „${f.topic}" · Tiefe ${DEPTH}\n`);
  const log = (m) => { console.log(`  [${f.key}] ${m}`); appendLog(logPath, m + "\n"); };
  const t0 = Date.now();

  // 1 — Dossier. Kette wie in Produktion: fällt ein Modell aus, rückt das nächste nach.
  // `--dossier-behalten` überspringt die Stufe, wenn schon eins daliegt: für die
  // Gegenprobe nach einem Code-Fix muss die EINGABE dieselbe bleiben, sonst misst der
  // zweite Lauf ein neues Dossier statt der Änderung.
  const dossierPath = `${dir}/dossier.md`;
  let dossierModel = null, dossierFehler = [];
  if (BEHALTEN && existsSync(dossierPath)) {
    log(`Dossier übernommen (${readFileSync(dossierPath, "utf8").length} Zeichen) — Stufe übersprungen.`);
    dossierModel = { id: "(übernommen)" };
  }
  for (const model of dossierModel ? [] : CHAIN) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), DOSSIER_TIMEOUT_MS);
    try {
      log(`Dossier mit ${model.id}…`);
      const md = await makeDossier({ kind: "topic", input: f.topic, depth: DEPTH, topic: f.topic, model, log, signal: ctrl.signal });
      writeFileSync(dossierPath, md);
      dossierModel = model;
      break;
    } catch (e) {
      log(`Dossier mit ${model.id} fehlgeschlagen: ${e.message}`);
      dossierFehler.push(`${model.id}: ${e.message}`);
    } finally { clearTimeout(t); }
  }
  if (!dossierModel) {
    return { ...f, ausgang: "dossier-tot", dauer: Math.round((Date.now() - t0) / 1000), dossierFehler };
  }

  // 2 — Karten schreiben und prüfen.
  let ergebnis = null;
  for (const model of CHAIN) {
    log(`Pipeline mit ${model.id}…`);
    const { code, timedOut } = await runPipeline({ model, topic: f.topic, dossierPath, outdir: dir, logPath });
    if (code === 0) { ergebnis = { ausgang: "pass", model: model.id }; break; }
    log(`Pipeline (${model.id}) endete mit ${code}${timedOut ? " (Zeitlimit)" : ""}`);
    // Exit 3 = Systemfehler (unsere Geometrie), nicht Modell-Versagen: das nächste
    // Modell würde denselben Renderer-Fall auslösen. Kette hier abbrechen.
    if (code === 3) { ergebnis = { ausgang: "system-bug", model: model.id }; break; }
    ergebnis = { ausgang: timedOut ? "timeout" : `exit-${code}`, model: model.id };
  }

  return {
    ...f, ...ergebnis,
    dossierModel: dossierModel.id,
    dauer: Math.round((Date.now() - t0) / 1000),
  };
}

// ── Auswertung ───────────────────────────────────────────────────────────────
/// Reine Messung, wie beim Modell-Bench: keine Wertung, keine Rangliste. Was die
/// Zahlen bedeuten, entscheidet ein Mensch, der die Karten gesehen hat.
function auswerten() {
  const zeilen = [];
  for (const f of FELDER) {
    const dir = `${OUT}/${f.key}`;
    if (!existsSync(dir)) continue;
    const z = { ...f, typen: {}, karten: 0, statsDatei: null };
    for (const model of CHAIN) {
      const p = `${dir}/${tagVon(model.id)}-lesson-v2.json`;
      if (!existsSync(p)) continue;
      const lesson = JSON.parse(readFileSync(p, "utf8"));
      z.karten = lesson.cards.length;
      z.titel = lesson.title;
      for (const c of lesson.cards) {
        const t = c.relation || c.type || "?";
        z.typen[t] = (z.typen[t] || 0) + 1;
      }
      const sp = `${dir}/${tagVon(model.id)}-stats.json`;
      if (existsSync(sp)) z.stats = JSON.parse(readFileSync(sp, "utf8"));
      z.statsDatei = p;
      break;
    }
    if (existsSync(`${dir}/dossier.md`)) {
      const md = readFileSync(`${dir}/dossier.md`, "utf8");
      z.dossierZeichen = md.length;
      z.strukturen = (md.split("## Strukturen (im Stoff enthalten)")[1] || "").split("\n## ")[0]
        .split("\n").filter((l) => l.trim().startsWith("- ")).length;
      z.zahlen = (md.split("## Zahlen (belegt)")[1] || "").split("\n## ")[0]
        .split("\n").filter((l) => l.trim().startsWith("- ")).length;
    }
    zeilen.push(z);
  }

  console.log("\n╔══ FELD-STRESSTEST — MESSUNG ══════════════════════════════════════════\n");
  for (const z of zeilen) {
    console.log(`▌ ${z.feld} — „${z.topic}"`);
    console.log(`  Lektion:  ${z.titel ? `„${z.titel}" · ${z.karten} Karten` : "KEINE"}`);
    console.log(`  Dossier:  ${z.dossierZeichen ?? "—"} Zeichen · ${z.strukturen ?? "—"} Strukturen · ${z.zahlen ?? "—"} Zahlen`);
    const typen = Object.entries(z.typen).sort((a, b) => b[1] - a[1]);
    console.log(`  Formen:   ${typen.length ? typen.map(([t, n]) => `${t}×${n}`).join(" · ") : "—"}`);
    if (z.stats?.audit?.length) {
      const a = z.stats.audit.at(-1);
      console.log(`  Audit:    ${a.befunde} Befunde · ${a.leer} leer · ${a.system} System`);
    }
    if (z.stats?.runden) {
      const r = z.stats.runden;
      console.log(`  Runden:   ${r.patchRunden ?? 0} Patch · ${r.vollRetries ?? 0} Voll-Retry · ${r.generatorPatches ?? 0} Generator-Patch`);
    }
    console.log("");
  }

  // Die Frage hinter dem ganzen Lauf: zeichnet das System auf fremden Feldern
  // dieselben zwei, drei Formen wie auf Schlaf und Wärmeinsel?
  const alle = {};
  for (const z of zeilen) for (const [t, n] of Object.entries(z.typen)) alle[t] = (alle[t] || 0) + n;
  const gesamt = Object.values(alle).reduce((a, b) => a + b, 0);
  console.log("▌ Formen über alle Felder");
  for (const [t, n] of Object.entries(alle).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(3)} × ${t}  (${Math.round((n / gesamt) * 100)} %)`);
  console.log(`\n  ${Object.keys(alle).length} verschiedene Formen auf ${gesamt} Karten.\n`);
  writeFileSync(`${OUT}/messung.json`, JSON.stringify(zeilen, null, 2));
  console.log(`Rohdaten: runs/feld-stresstest/messung.json\n`);
}

// ── Lauf ─────────────────────────────────────────────────────────────────────
if (NUR_REPORT) { auswerten(); process.exit(0); }

if (!GO) {
  console.log("\nFeld-Stresstest — Plan (Trockenlauf, es läuft nichts)\n");
  console.log(`Tiefe ${DEPTH} · Kette: ${CHAIN.map((m) => m.id).join(" → ")} · Judge ${JUDGE.id}\n`);
  for (const f of felder) console.log(`  ${f.feld.padEnd(12)} „${f.topic}"`);
  console.log(`\n${felder.length} Läufe, je Dossier + Pipeline. Erfahrungswert ~2–3 ct und 4–8 min je Lauf.`);
  console.log(`Ausgabe nach runs/feld-stresstest/<key>/ — KEIN Insert in die Bibliothek.\n`);
  console.log("Ausführen mit --go\n");
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
console.log(`\nFeld-Stresstest: ${felder.length} Felder, ${PARALLEL} parallel, Tiefe ${DEPTH}\n`);
const ergebnisse = [];
for (let i = 0; i < felder.length; i += PARALLEL) {
  const gruppe = felder.slice(i, i + PARALLEL);
  console.log(`── Gruppe ${i / PARALLEL + 1}: ${gruppe.map((f) => f.feld).join(", ")}`);
  ergebnisse.push(...await Promise.all(gruppe.map(fahre)));
}

console.log("\n── Ausgänge ────────────────────────────────────────────");
for (const e of ergebnisse) console.log(`  ${e.feld.padEnd(12)} ${String(e.ausgang).padEnd(12)} ${e.dauer}s  ${e.model ?? ""}`);
writeFileSync(`${OUT}/ausgaenge.json`, JSON.stringify(ergebnisse, null, 2));
auswerten();
