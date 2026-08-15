// Abnahme-Gate für eine beliebige Lektions-JSON: rendert jede Karte über den
// echten Renderer, misst im DOM (Überlappung, Clipping, Label-Bindung), screenshottet.
//
// Die Befunde tragen ZWEI Schuldfragen, und dieses Gate entscheidet sie nicht:
//   System — Überlappung, Clipping, Leader, Bindung: das kann kein Karten-JSON heilen,
//            das ist ein Bug im Solver/Renderer.
//   LEER   — ein Label/eine Note steht in einem Schritt-Zustand, in dem ihr Gegenstand
//            noch nicht gezeichnet ist. Seit der Generator `sequence` selbst schreibt,
//            ist das die AUSSAGE der Karte (falsche Reihenfolge), nicht die Mechanik.
// Hier wird deshalb nur getrennt und benannt; wer aus einem LEER eine Patch-Runde und
// wer daraus einen System-Abbruch macht, entscheidet die Pipeline (glm-generate.mjs).
// Die HART-LEER-Zeilen tragen den JSON-Pfad und die Korrektur im Text — sie gehen
// unverändert in die Generator-Patch-Runde.
// Gemessen wird mit demselben Chokepoint wie in adversarial.mjs — siehe label-audit.mjs.
//
// Trägt eine Karte `sequence`, ist das fertige Bild nur der LETZTE von N+1 Zuständen.
// Jeder Schritt-Endzustand wird deshalb zusätzlich eingenommen (__seqGoto) und mit
// derselben Mechanik gemessen — ein Schritt, der Labels überdeckt oder ein Label ohne
// seinen Gegenstand zeigt, ist ein System-Bug wie jeder andere. Karten ohne `sequence`
// laufen unverändert durch: kein Schritt-Loop, keine zusätzliche Zeile.
// Nutzung: node audit-lesson.mjs <lesson.json> [outdir]
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { resolve, basename } from "path";
import { normalizeLesson } from "./validate-lesson.mjs";
import { auditCurveCard } from "./label-audit.mjs";

const file = process.argv[2];
const outdir = process.argv[3] || basename(file, ".json") + "-shots";
mkdirSync(outdir, { recursive: true });
const lesson = normalizeLesson(JSON.parse(readFileSync(file, "utf8")));

const url = "file://" + resolve("karten-grammatik.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto(url);
await page.waitForTimeout(150);

let findings = 0, leer = 0;
const hart = [];      // maschinenlesbare LEER-Zeilen mit JSON-Pfad und Korrektur
for (let i = 0; i < lesson.cards.length; i++) {
  const card = lesson.cards[i];
  const { out: report } = await page.evaluate(auditCurveCard, { card });
  await page.locator(".phone").screenshot({ path: `${outdir}/c${i + 1}-${card.type}.png` });
  const seq = Array.isArray(card.sequence) ? card.sequence : [];
  if (report === null) {
    console.log(`c${i + 1} ${card.type}: (HTML-Karte)${seq.length ? " — sequence ohne SVG-Geometrie, kein Schritt-Audit" : ""}`);
    continue;
  }
  // INFO beschreibt eine Lage, die kein Solver besser lösen kann (Serien als ein Band,
  // Leader-verbundenes Label) — sichtbar, aber kein Befund.
  const echt = report.filter((o) => !o.startsWith("INFO"));
  if (report.length === 0) console.log(`c${i + 1} ${card.type}: OK`);
  else { findings += echt.length; console.log(`c${i + 1} ${card.type}: ${echt.length ? "" : "OK "}\n  ` + report.join("\n  ")); }

  // ——— Schritt-Endzustände: jeder Zustand ist ein eigenes Bild ———
  // Ohne `sequence` endet die Karte hier — derselbe Pfad, dieselbe Ausgabe wie bisher.
  if (!seq.length) continue;
  for (let s = 0; s <= seq.length; s++) {
    const { out: schritt } = await page.evaluate(auditCurveCard, { card, seqStep: s });
    await page.locator(".phone").screenshot({ path: `${outdir}/c${i + 1}-${card.type}-s${s}.png` });
    const st = seq[s - 1];
    const was = s === 0 ? "(Ausgangszustand)" : `${st.verb} ${st.target ?? `${st.from}→${st.to}`}`;
    const echtS = schritt.filter((o) => !o.startsWith("INFO"));
    findings += echtS.length;
    console.log(`  Schritt ${s}/${seq.length} ${was.padEnd(38)} ${echtS.length ? "" : "OK"}`
      + (schritt.length ? "\n    " + schritt.join("\n    ") : ""));
    // Ein LEER hängt an DIESEM Schritt: der Gegenstand ist bis hier nicht gezeichnet.
    // Der Pfad zeigt deshalb auf den Schritt, nicht auf die Beschriftung — dort wird
    // korrigiert (früher zeichnen), oder die Aussage fällt weg.
    for (const o of echtS.filter((x) => x.startsWith("LEER"))) {
      leer++;
      const pfad = s === 0 ? `cards[${i}].sequence[0]` : `cards[${i}].sequence[${s - 1}]`;
      hart.push(`HART-LEER ${pfad}: ${o.replace(/^LEER\s+/, "")} — im Zustand nach Schritt ${s}/${seq.length}`
        + `${s === 0 ? " (Ausgangszustand, vor dem ersten Schritt)" : ` (${was})`}. `
        + `Zeichne den Gegenstand FRÜHER (ein reveal/pulse, das ihn sichtbar macht, muss vor diesem Schritt stehen) `
        + `ODER nimm die Aussage aus der Karte. Reihenfolge und Schrittzahl (max 6) bleiben deine Entscheidung.`);
    }
  }
}
await browser.close();
const system = findings - leer;
// Maschinen-Zeile für die Pipeline: getrennte Zählung statt Nachzählen der Prosa.
console.log(`ZÄHLUNG befunde=${findings} leer=${leer} system=${system}`);
if (hart.length) console.log(hart.join("\n"));
console.log(findings === 0 ? `AUDIT PASS — Screenshots in ${outdir}/`
  : `AUDIT FAIL — ${findings} Befunde (${leer} LEER = Aussage der Karte, ${system} System-Fehler)`);
process.exit(findings === 0 ? 0 : 1);
