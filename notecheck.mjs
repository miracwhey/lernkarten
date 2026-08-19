// Bild-Text-Konsistenz (deterministisch) für Kurven-Notes, zwei Prüfungen:
// (1) Zahlen-Claims ("NOCH 25% AKTIV", "DIE HÄLFTE") gegen das gerenderte Niveau —
//     Referenz ist das Maximum der eigenen Serie, die einzige visuell verfügbare
//     Bezugsgröße im achsenlosen Chart.
// (2) Richtungs-Claims ("SENKT", "STEIGT") gegen die gerenderte Steigung an der
//     Note-Position — die Fehlerklasse „Text behauptet das Gegenteil der Kurve".
// Geometrie-Quelle ist in beiden Fällen der Renderer selbst (window.__curveDebug),
// keine Zweit-Implementierung.
// Erreichbare Zahlen-Claims → t deterministisch versetzt (--fix schreibt in die Datei);
// unerreichbare Claims und Richtungs-Widersprüche (HART) muss das Modell lösen —
// ein Richtungs-Widerspruch ist inhaltlich, dafür gibt es KEINEN Auto-Fix.
// Nutzung: node notecheck.mjs <lesson.json> [--fix]
// Exit 0 = konsistent (bzw. alles fixbar und gefixt), 2 = Befunde offen.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, renameSync } from "fs";
import { resolve } from "path";
// Was ein Claim IST, steht im Validator (er braucht dieselbe Auskunft für die
// Erklär-Schicht) — hier wird nur gemessen, nicht zweitdefiniert.
import { normalizeLesson, claimedDirection, claimedFraction, plainLabel, DIRECTION_WORDS, ankerSlug } from "./validate-lesson.mjs";
export { claimedDirection, claimedFraction, plainLabel, DIRECTION_WORDS };

const TOL = 0.10;   // ±10 Punkte relativ zum Serien-Maximum — qualitative Kurve, keine Achsen-Skala

// Halbes Mess-Fenster für die Steigung (in t) — ein Sechstel der Plotbreite je Seite:
// die Größenordnung, über die das Auge „steigt/fällt" an einer Note-Position liest.
const DIR_DT = 0.08;
// Unter dieser Rate (Anteil des Serien-Maximums je t-Einheit) gilt ein Abschnitt als
// flach. Gemessen kalibriert, nicht geschätzt (probes/calibrate-direction.mjs): die
// flachsten ECHT gerichteten Stellen der Formen — Start von compound-rise, Auslauf von
// saturating-rise/decay-halflife — liegen knapp beim Doppelten dieses Werts; ein
// höherer Wert erklärte sie fälschlich zu „flach" und erzeugte falsche HART-Befunde.
const FLAT_RATE = 0.0625;
// Eine Serie gilt als GLOBAL flach, wenn ihr Verlauf über die ganze Breite unter
// diesem Anteil ihres Maximums bleibt (shape "flat" liefert exakt 0).
const GLOBAL_FLAT = 0.02;

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

/// Welche Serie und welche Stelle meint eine Annotation? Beantwortbar ist das nur für
/// Anker, die auf eine Serie zeigen:
///   `series:<slug>` — die Aussage gilt dem ganzen VERLAUF ("NACHFRAGE BRICHT EIN").
///   `note:<slug>`   — die Aussage gilt der STELLE, an der die Anmerkung sitzt.
/// Bei `axis`, `stop` oder Ankern ohne Serie (bei zwei Serien wüsste niemand, welche
/// gemeint ist) gibt es keine messbare Zuordnung — dort prüft hier nichts, statt zu raten.
/// Gelesen wird nur `an`, also praktisch der Callout: ein `pfeil` sagt „A wirkt auf B",
/// sein Text beschreibt die WIRKUNG, nicht den Verlauf des Ziels („ZIEHT AB" am
/// Ereignis) — dieselbe Trennung, aus der die Eingriffs-Verben aus dem Lexikon
/// herausgehalten sind.
function annotZiel(card, a) {
  const anker = a?.an;
  if (typeof anker !== "string") return null;
  if (anker.startsWith("series:")) {
    const si = (card.series || []).findIndex((s, i) => ankerSlug(s.label, String(i)) === anker.slice(7));
    return si >= 0 ? { si, t: null } : null;
  }
  if (anker.startsWith("note:")) {
    const ni = (card.notes || []).findIndex((n, i) => ankerSlug(n.label, String(i)) === anker.slice(5));
    if (ni < 0) return null;
    const n = card.notes[ni];
    const si = typeof n.series === "number" ? n.series
      : (card.series || []).findIndex((s) => s.label === n.series);
    return si >= 0 ? { si, t: n.at === "apex" ? null : n.t, apex: n.at === "apex" } : null;
  }
  return null;
}

// Misst pro Note das gerenderte Niveau, die Serien-Punkte und die Niveaus an den
// Rändern des Richtungs-Fensters — alles über den echten Renderer, in EINEM Lauf.
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
    const rows = await page.evaluate(({ card, dt }) => {
      area.innerHTML = RENDERERS[card.type](card);
      const { samples, yOnCurve } = window.__curveDebug;
      return card.notes.map((n) => {
        // Serien-Auflösung exakt wie im Renderer.
        const sm = samples[typeof n.series === "number" ? n.series
          : Math.max(0, card.series.findIndex((s) => s.label === n.series))];
        // Das Mess-Fenster endet, wo der gezeichnete Verlauf endet (afterStop-Schwänze
        // laufen nicht zwingend bis t=1) — sonst misst es die Klemmung, nicht die Kurve.
        const tMax = sm.pts[sm.pts.length - 1][0];
        // at:"apex" hat kein freies t: die Note sitzt am Ende des Nach-Stop-Asts.
        // Gemessen wird trotzdem — nur eben an genau diesem Punkt.
        const atApex = n.at === "apex";
        const tAnchor = atApex ? tMax : n.t;
        const tc = Math.min(Math.max(tAnchor, 0), tMax);
        const tL = Math.max(0, tc - dt), tR = Math.min(tMax, tc + dt);
        return { label: n.label, t: tAnchor, atApex, level: yOnCurve(sm, tAnchor),
                 seriesLabel: sm.s.label, pts: sm.pts,
                 fenster: { tL, tc, tR, yL: yOnCurve(sm, tL), yC: yOnCurve(sm, tc), yR: yOnCurve(sm, tR) } };
      });
    }, { card: c, dt: DIR_DT });
    rows.forEach((r, j) => out.push({ card: i, note: j, ...r }));
  }
  await browser.close();
  return out;
}

/// Dieselbe Messung für die ERKLÄR-SCHICHT. Mengen sind dort seit dem 19.08. gar nicht
/// mehr erlaubt (der Validator lehnt sie auf Kurven-Karten ab: ein Callout hat keinen Ort,
/// an dem eine Prozentzahl gälte). Eine RICHTUNG behauptet dagegen nichts über eine Höhe,
/// sondern über den Verlauf — und der ist messbar, sobald der Anker sagt, welche Serie
/// gemeint ist. Ohne diese Prüfung stand „NACHFRAGE BRICHT EIN" ungeprüft auf einer
/// Kurve, während notecheck nur `notes` ansah.
export async function annotMeasurements(lesson) {
  const normalized = normalizeLesson(JSON.parse(JSON.stringify(lesson)));
  const targets = normalized.cards
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.type === "curve" && c.annotations?.length
      && c.annotations.some((a) => typeof a?.text === "string" && claimedDirection(a.text) && annotZiel(c, a)));
  if (!targets.length) return [];

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("file://" + resolve(new URL(".", import.meta.url).pathname, "karten-grammatik.html"));
  await page.waitForTimeout(150);

  const out = [];
  for (const { c, i } of targets) {
    const ziele = c.annotations.map((a, j) => ({ j, a, z: annotZiel(c, a) }))
      .filter(({ a, z }) => z && typeof a.text === "string" && claimedDirection(a.text));
    const rows = await page.evaluate(({ card, auftrag, dt }) => {
      area.innerHTML = RENDERERS[card.type](card);
      const { samples, yOnCurve } = window.__curveDebug;
      return auftrag.map(({ j, text, z }) => {
        const sm = samples[z.si];
        const tMax = sm.pts[sm.pts.length - 1][0];
        // Ohne eigene Stelle gilt die Aussage dem ganzen Verlauf: das Fenster ist dann die
        // volle Breite, und „steigt/fällt" heißt, was die Kurve von Anfang bis Ende tut.
        const ganz = z.t == null;
        const tc = ganz ? tMax / 2 : Math.min(Math.max(z.t, 0), tMax);
        const tL = ganz ? 0 : Math.max(0, tc - dt);
        const tR = ganz ? tMax : Math.min(tMax, tc + dt);
        return { annot: j, text, ganz, t: ganz ? null : z.t, seriesLabel: sm.s.label, pts: sm.pts,
                 fenster: { tL, tc, tR, yL: yOnCurve(sm, tL), yC: yOnCurve(sm, tc), yR: yOnCurve(sm, tR) } };
      });
    }, { card: c, dt: DIR_DT,
         auftrag: ziele.map(({ j, a, z }) => ({ j, text: a.text, z })) });
    rows.forEach((r) => out.push({ card: i, ...r }));
  }
  await browser.close();
  return out;
}

/// Gerenderte Richtung an der Note-Position: "up" | "down" | "flat" | "unklar".
/// Beide Fenster-Hälften einzeln bewerten: widersprechen sie einander (Knick, etwa
/// direkt am Stop-Ereignis), ist die Stelle nicht beurteilbar — dort behauptet ein
/// Text weder Steigen noch Fallen nachweislich falsch.
export function measuredDirection(m) {
  const levels = m.pts.map((p) => p[1]);
  const max = Math.max(...levels), min = Math.min(...levels);
  const global = max > 0 && (max - min) / max <= GLOBAL_FLAT ? "flat" : null;
  const eps = FLAT_RATE * max;
  const f = m.fenster;
  const seite = (t1, y1, t2, y2) => {
    if (t2 - t1 < DIR_DT * 0.5) return null;          // Rand des Verlaufs: zu kurz zum Messen
    const rate = (y2 - y1) / (t2 - t1);
    return { dir: Math.abs(rate) <= eps ? "flat" : rate > 0 ? "up" : "down", rate };
  };
  const seiten = [seite(f.tL, f.yL, f.tc, f.yC), seite(f.tc, f.yC, f.tR, f.yR)].filter(Boolean);
  const rate = seiten.length ? (f.tR - f.tL > 0 ? (f.yR - f.yL) / (f.tR - f.tL) : 0) : 0;
  const dirs = seiten.map((s) => s.dir);
  const dir = !dirs.length ? "unklar"
    : dirs.includes("up") && dirs.includes("down") ? "unklar"
    : dirs.includes("up") ? "up" : dirs.includes("down") ? "down" : "flat";
  return { dir, rate, max, globalFlat: global === "flat" };
}

// Befunde: OK (konsistent bzw. nicht beurteilbar) / FIX (t-Versatz löst es) /
// HART (Claim unerreichbar oder Richtung widerspricht der Kurve).
// check unterscheidet die beiden Prüfungen — eine Note kann beide Befunde tragen.
export async function noteFindings(lesson) {
  const findings = [];
  for (const m of await noteMeasurements(lesson)) {
    const base = { path: `cards[${m.card}].notes[${m.note}]`, label: m.label, t: m.t,
                   series: m.seriesLabel, atApex: m.atApex };

    const claimed = claimedFraction(m.label);
    if (claimed != null) {
      const max = Math.max(...m.pts.map((p) => p[1]));
      const actual = m.level / max;
      const lvl = { ...base, check: "level", claimed, actual };
      if (Math.abs(actual - claimed) <= TOL) findings.push({ ...lvl, kind: "OK" });
      // Apex-Notes tragen kein freies t — ein t-Versatz ist hier kein verfügbarer Fix.
      // Der Zahlen-Claim bleibt aber messbar: er gilt für den Apex-Punkt.
      else if (m.atApex) findings.push({ ...lvl, kind: "HART" });
      else {
        let tFix = solveT(m.pts, claimed * max, m.t);
        if (tFix != null) {
          // Runden, aber die gerundete Position muss den Claim noch erfüllen.
          const t2 = Math.round(tFix * 100) / 100;
          tFix = Math.abs(levelAt(m.pts, t2) / max - claimed) <= TOL ? t2 : Math.round(tFix * 1000) / 1000;
          findings.push({ ...lvl, kind: "FIX", tFix });
        } else findings.push({ ...lvl, kind: "HART" });
      }
    }

    const richtung = claimedDirection(m.label);
    if (richtung) {
      const mess = measuredDirection(m);
      const dir = { ...base, check: "richtung", claimed: richtung, actual: mess.dir,
                    rate: mess.rate, globalFlat: mess.globalFlat };
      // Widerspruch nur, wenn die Kurve nachweislich anders läuft: Gegenrichtung, oder
      // eine über die ganze Breite flache Serie. Ein bloß lokal flacher Abschnitt
      // (Sättigungs-Auslauf, Boden nach collapse) ist KEIN Gegenbeweis.
      const widerspruch = (mess.dir === "up" && richtung === "down")
        || (mess.dir === "down" && richtung === "up")
        || mess.globalFlat;
      findings.push({ ...dir, kind: widerspruch ? "HART" : "OK" });
    }
  }
  // Zweite Schicht, gleiche Regel: eine Annotation, die eine Richtung behauptet, gegen
  // den Verlauf, den sie bezeichnet.
  for (const m of await annotMeasurements(lesson)) {
    const richtung = claimedDirection(m.text);
    const mess = measuredDirection(m);
    const widerspruch = (mess.dir === "up" && richtung === "down")
      || (mess.dir === "down" && richtung === "up")
      || mess.globalFlat;
    findings.push({ path: `cards[${m.card}].annotations[${m.annot}]`, label: m.text, t: m.t,
                    series: m.seriesLabel, ganz: m.ganz, check: "richtung-schicht",
                    claimed: richtung, actual: mess.dir, rate: mess.rate,
                    globalFlat: mess.globalFlat, kind: widerspruch ? "HART" : "OK" });
  }
  return findings;
}

const DIR_WORT = { up: "STEIGEND", down: "FALLEND", flat: "FLACH", unklar: "nicht beurteilbar" };

export function reportLine(f) {
  const pc = (x) => Math.round(x * 100) + "%";
  const stelle = f.atApex ? `am Apex (t=${Number(f.t).toFixed(2)})` : `bei t=${f.t}`;
  if (f.check === "richtung-schicht") {
    // Die Korrektur nennt beide Wege und den Pfad, der zu patchen ist: der Text der
    // Annotation ODER die Serie. Ein t gibt es hier nicht — die Schicht hat keins.
    const wo = f.ganz ? "über den ganzen Verlauf" : `bei t=${f.t}`;
    const gemessen = f.globalFlat ? "verläuft über die ganze Breite FLACH"
      : `verläuft ${wo} ${DIR_WORT[f.actual]} (${f.rate >= 0 ? "+" : ""}${f.rate.toFixed(1)} Niveau-Punkte je t-Einheit)`;
    if (f.kind === "OK")
      return `OK    ${f.path} "${f.label}": Claim ${DIR_WORT[f.claimed]}, Kurve "${f.series}" ${gemessen} — kein Widerspruch`;
    return `HART  ${f.path}.text: "${f.label}" behauptet ${DIR_WORT[f.claimed]}, die Serie "${f.series}" ${gemessen}`
      + ` — schreibe den Text der Annotation auf die gezeigte Richtung um ODER ändere die Serie (shape/from/to),`
      + ` sodass sie ${f.claimed === "down" ? "fällt" : "steigt"}; eine Annotation hat kein t zum Verschieben`;
  }
  if (f.check === "richtung") {
    const gemessen = f.globalFlat ? "verläuft über die ganze Breite FLACH"
      : `verläuft ${stelle} ${DIR_WORT[f.actual]} (${f.rate >= 0 ? "+" : ""}${f.rate.toFixed(1)} Niveau-Punkte je t-Einheit)`;
    if (f.kind === "OK")
      return `OK    ${f.path} "${f.label}": Claim ${DIR_WORT[f.claimed]}, Kurve "${f.series}" ${gemessen} — kein Widerspruch`;
    return `HART  ${f.path}.label: "${f.label}" behauptet ${DIR_WORT[f.claimed]}, die Serie "${f.series}" ${gemessen}`
      + ` — schreibe den Note-Text auf die gezeigte Richtung um ODER ändere die Serie (shape/from/to), sodass sie hier ${f.claimed === "down" ? "fällt" : "steigt"};`
      + ` ein t-Versatz löst das nicht`;
  }
  if (f.kind === "OK")
    return `OK    ${f.path} "${f.label}": ${pc(f.actual)} vom Maximum (behauptet ${pc(f.claimed)}) — konsistent`;
  if (f.kind === "FIX")
    return `FIX   ${f.path}.t: "${f.label}" sitzt bei ${pc(f.actual)} vom Maximum von "${f.series}", behauptet ${pc(f.claimed)} — setze t=${f.tFix} (war ${f.t})`;
  if (f.atApex)
    return `HART  ${f.path}.label: "${f.label}" behauptet ${pc(f.claimed)} vom Maximum, der Apex von "${f.series}" liegt bei ${pc(f.actual)}`
      + ` — at:"apex" hat kein t zum Verschieben; ändere die Zahl im Note-Text oder reboundTo der Serie`;
  return `HART  ${f.path}.label: "${f.label}" behauptet ${pc(f.claimed)} vom Maximum — auf der Kurve "${f.series}" unerreichbar; Zahl im Note-Text oder die Serie ändern (t-Versatz löst das nicht)`;
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const file = process.argv[2];
  const fix = process.argv.includes("--fix");
  const raw = JSON.parse(readFileSync(file, "utf8"));   // Fix editiert die Roh-Datei, nie die normalisierte Fassung
  const findings = await noteFindings(raw);
  const claims = findings.length;
  // Die vier ersten Felder stehen in dieser Reihenfolge fest: glm-generate.mjs liest sie
  // als Präfix. `hart-schicht` kommt hinten dazu, damit die Erklär-Schicht in der
  // Statistik nicht unter den Note-Befunden verschwindet.
  const zaehlung = (fs) => `ZÄHLUNG ok=${fs.filter((f) => f.kind === "OK").length}`
    + ` fix=${fs.filter((f) => f.kind === "FIX").length}`
    + ` hart=${fs.filter((f) => f.kind === "HART" && f.check === "level").length}`
    + ` hart-richtung=${fs.filter((f) => f.kind === "HART" && f.check === "richtung").length}`
    + ` hart-schicht=${fs.filter((f) => f.kind === "HART" && f.check === "richtung-schicht").length}`;
  if (!claims) { console.log("NOTECHECK OK — keine prüfbaren Claims in Notes oder Erklär-Schicht"); console.log(zaehlung([])); process.exit(0); }
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
  console.log(zaehlung(findings));
  console.log(open ? `NOTECHECK FAIL — ${open} Befund(e) offen` : `NOTECHECK PASS — ${claims} Claim(s) geprüft`);
  process.exit(open ? 2 : 0);
}
