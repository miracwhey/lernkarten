// Abnahme-Gate für eine beliebige Lektions-JSON: rendert jede Karte über den
// echten Renderer, misst im DOM (Überlappung, Clipping, Label-Bindung), screenshottet.
// Befunde hier sind SYSTEM-Fehler (Solver/Renderer), keine LLM-Fehler.
// Gemessen wird mit demselben Chokepoint wie in adversarial.mjs — siehe label-audit.mjs.
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

let findings = 0;
for (let i = 0; i < lesson.cards.length; i++) {
  const card = lesson.cards[i];
  const { out: report } = await page.evaluate(auditCurveCard, { card });
  await page.locator(".phone").screenshot({ path: `${outdir}/c${i + 1}-${card.type}.png` });
  if (report === null) { console.log(`c${i + 1} ${card.type}: (HTML-Karte)`); continue; }
  // INFO beschreibt eine Lage, die kein Solver besser lösen kann (Serien als ein Band,
  // Leader-verbundenes Label) — sichtbar, aber kein Befund.
  const echt = report.filter((o) => !o.startsWith("INFO"));
  if (report.length === 0) console.log(`c${i + 1} ${card.type}: OK`);
  else { findings += echt.length; console.log(`c${i + 1} ${card.type}: ${echt.length ? "" : "OK "}\n  ` + report.join("\n  ")); }
}
await browser.close();
console.log(findings === 0 ? `AUDIT PASS — Screenshots in ${outdir}/` : `AUDIT FAIL — ${findings} Befunde (System-Fehler, nicht LLM)`);
process.exit(findings === 0 ? 0 : 1);
