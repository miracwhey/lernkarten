// Bild-Text-Zahl-Konsistenz (deterministisch): Zahlen-Claims in Kurven-Notes
// ("NOCH 25% AKTIV", "DIE HÄLFTE") gegen das tatsächlich gerenderte Kurvenniveau
// an der Note-Position messen. Referenz ist das Maximum der eigenen Serie — die
// einzige visuell verfügbare Bezugsgröße im achsenlosen Chart. Geometrie-Quelle
// ist der Renderer selbst (window.__curveDebug), keine Zweit-Implementierung.
// Erreichbare Claims → t deterministisch versetzt (--fix schreibt in die Datei);
// unerreichbare Claims (HART) muss das Modell lösen (Zahl oder Serie ändern).
// Nutzung: node notecheck.mjs <lesson.json> [--fix]
// Exit 0 = konsistent (bzw. alles fixbar und gefixt), 2 = Befunde offen.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, renameSync } from "fs";
import { resolve } from "path";
import { normalizeLesson } from "./validate-lesson.mjs";

const TOL = 0.10;   // ±10 Punkte relativ zum Serien-Maximum — qualitative Kurve, keine Achsen-Skala

// Level-Claim aus dem Note-Text: Prozentzahl oder Bruchwort. Vergleiche mit
// anderer Serie ("HALB SO HOCH") sind kein Selbst-Claim — Judge-Territorium.
export function claimedFraction(label) {
  const plain = String(label).replace(/<[^>]+>/g, " ");
  if (/\bso\s+(hoch|viel|stark|groß|tief|niedrig)\b/i.test(plain)) return null;
  const pct = plain.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (pct) return parseFloat(pct[1].replace(",", ".")) / 100;
  if (/\bh[äa]lfte\b|\bhalb(e|es|er)?\b/i.test(plain)) return 0.5;
  if (/\bviertel\b/i.test(plain)) return 0.25;
  if (/\bdrittel\b/i.test(plain)) return 1 / 3;
  return null;
}

// Lineare Interpolation auf den Renderer-Punkten (Polyline = lineare Segmente).
const levelAt = (pts, t) => {
  for (let i = 1; i < pts.length; i++) if (pts[i][0] >= t) {
    const [ta, ya] = pts[i - 1], [tb, yb] = pts[i];
    return tb > ta ? ya + (yb - ya) * ((t - ta) / (tb - ta)) : ya;
  }
  return pts[pts.length - 1][1];
};

// Alle t, an denen die Kurve das Ziel-Niveau kreuzt; nächstes zum Original-t gewinnt.
function solveT(pts, target, nearT) {
  const cands = [];
  for (let i = 1; i < pts.length; i++) {
    const [ta, ya] = pts[i - 1], [tb, yb] = pts[i];
    if (ya === target) cands.push(ta);
    else if ((ya - target) * (yb - target) < 0)
      cands.push(ta + (tb - ta) * ((target - ya) / (yb - ya)));
  }
  if (pts[pts.length - 1][1] === target) cands.push(pts[pts.length - 1][0]);
  if (!cands.length) return null;
  cands.sort((a, b) => Math.abs(a - nearT) - Math.abs(b - nearT));
  return cands[0];
}

// Misst pro Note das gerenderte Niveau + die Serien-Punkte über den echten Renderer.
export async function noteMeasurements(lesson) {
  const normalized = normalizeLesson(JSON.parse(JSON.stringify(lesson)));
  const targets = normalized.cards
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.type === "curve" && c.notes?.length);
  if (!targets.length) return [];

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("file://" + resolve(new URL(".", import.meta.url).pathname, "karten-grammatik.html"));
  await page.waitForTimeout(150);

  const out = [];
  for (const { c, i } of targets) {
    const rows = await page.evaluate((card) => {
      area.innerHTML = RENDERERS[card.type](card);
      const { samples, yOnCurve } = window.__curveDebug;
      return card.notes.map((n) => {
        // Serien-Auflösung exakt wie im Renderer.
        const sm = samples[typeof n.series === "number" ? n.series
          : Math.max(0, card.series.findIndex((s) => s.label === n.series))];
        return { label: n.label, t: n.t, level: yOnCurve(sm, n.t),
                 seriesLabel: sm.s.label, pts: sm.pts };
      });
    }, c);
    rows.forEach((r, j) => out.push({ card: i, note: j, ...r }));
  }
  await browser.close();
  return out;
}

// Befunde: OK (konsistent) / FIX (t-Versatz löst es) / HART (Claim unerreichbar).
export async function noteFindings(lesson) {
  const findings = [];
  for (const m of await noteMeasurements(lesson)) {
    const claimed = claimedFraction(m.label);
    if (claimed == null) continue;
    const max = Math.max(...m.pts.map((p) => p[1]));
    const actual = m.level / max;
    const base = { path: `cards[${m.card}].notes[${m.note}]`, label: m.label,
                   t: m.t, claimed, actual, series: m.seriesLabel };
    if (Math.abs(actual - claimed) <= TOL) { findings.push({ ...base, kind: "OK" }); continue; }
    let tFix = solveT(m.pts, claimed * max, m.t);
    if (tFix != null) {
      // Runden, aber die gerundete Position muss den Claim noch erfüllen.
      const t2 = Math.round(tFix * 100) / 100;
      tFix = Math.abs(levelAt(m.pts, t2) / max - claimed) <= TOL ? t2 : Math.round(tFix * 1000) / 1000;
      findings.push({ ...base, kind: "FIX", tFix });
    } else findings.push({ ...base, kind: "HART" });
  }
  return findings;
}

export function reportLine(f) {
  const pc = (x) => Math.round(x * 100) + "%";
  if (f.kind === "OK")
    return `OK    ${f.path} "${f.label}": ${pc(f.actual)} vom Maximum (behauptet ${pc(f.claimed)}) — konsistent`;
  if (f.kind === "FIX")
    return `FIX   ${f.path}.t: "${f.label}" sitzt bei ${pc(f.actual)} vom Maximum von "${f.series}", behauptet ${pc(f.claimed)} — setze t=${f.tFix} (war ${f.t})`;
  return `HART  ${f.path}.label: "${f.label}" behauptet ${pc(f.claimed)} vom Maximum — auf der Kurve "${f.series}" unerreichbar; Zahl im Note-Text oder die Serie ändern (t-Versatz löst das nicht)`;
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const file = process.argv[2];
  const fix = process.argv.includes("--fix");
  const raw = JSON.parse(readFileSync(file, "utf8"));   // Fix editiert die Roh-Datei, nie die normalisierte Fassung
  const findings = await noteFindings(raw);
  const claims = findings.length;
  if (!claims) { console.log("NOTECHECK OK — keine Zahlen-Claims in Notes"); process.exit(0); }
  for (const f of findings) console.log(reportLine(f));
  const fixable = findings.filter((f) => f.kind === "FIX");
  const hard = findings.filter((f) => f.kind === "HART");
  if (fix && fixable.length) {
    for (const f of fixable) {
      const [, ci, ni] = f.path.match(/cards\[(\d+)\]\.notes\[(\d+)\]/);
      raw.cards[ci].notes[ni].t = f.tFix;
    }
    writeFileSync(file + ".tmp", JSON.stringify(raw, null, 2));
    renameSync(file + ".tmp", file);
    console.log(`→ ${fixable.length} t-Fix(e) geschrieben nach ${file}`);
  }
  const open = hard.length + (fix ? 0 : fixable.length);
  console.log(open ? `NOTECHECK FAIL — ${open} Befund(e) offen` : `NOTECHECK PASS — ${claims} Claim(s) geprüft`);
  process.exit(open ? 2 : 0);
}
