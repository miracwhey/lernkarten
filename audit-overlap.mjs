// Geometrie-Beweis für die Bestands-Lektionen der Mockup-Seite (karten-grammatik.html).
// Misst über den EINEN Mess-Chokepoint (label-audit.mjs) — dieselbe Funktion wie
// audit-lesson.mjs und adversarial.mjs. Die frühere Eigen-Messung hier las getBBox
// OHNE CTM und meldete Phantom-CLIPs, sobald die Label-Schicht Texte per Transform
// positionierte; zwei Messungen wären zwei Gates, die auseinanderlaufen.
// Soll: 0 Befunde (INFO zählt nicht — beschreibende Lage, kein Fehler).
// Nutzung: node audit-overlap.mjs [lesson:card ...]   (ohne Args: alle curve-Karten)
import { chromium } from "playwright";
import { resolve } from "path";
import { auditCurveCard } from "./label-audit.mjs";

const DEFAULT_TARGETS = ["2:2", "2:3", "3:2", "3:3", "5:2", "5:3", "6:3", "6:5"];
const targets = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_TARGETS;

const url = "file://" + resolve("karten-grammatik.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto(url);
await page.waitForTimeout(150);

let findings = 0;
for (const t of targets) {
  const [lesson, card] = t.split(":").map(Number);
  // Karten sind reine Daten (LESSONS-Global der Seite) — gemessen wird dieselbe
  // Karte, die die Seite rendert, über denselben Render-Pfad wie die anderen Gates.
  const cardJson = await page.evaluate(([l, c]) => (typeof LESSONS !== "undefined" && LESSONS[l - 1]?.cards?.[c - 1]) || null, [lesson, card]);
  if (!cardJson) { findings += 1; console.log(`l${lesson}-c${card}: FEHLT — Ziel existiert nicht in LESSONS`); continue; }
  const { out } = await page.evaluate(auditCurveCard, { card: cardJson });
  if (out === null) { console.log(`l${lesson}-c${card}: (HTML-Karte — kein Geometrie-Audit)`); continue; }
  const echt = out.filter((o) => !o.startsWith("INFO"));
  if (out.length === 0) console.log(`l${lesson}-c${card}: OK`);
  else { findings += echt.length; console.log(`l${lesson}-c${card}: ${echt.length ? "" : "OK "}\n  ` + out.join("\n  ")); }
}
await browser.close();
console.log(findings === 0 ? "AUDIT PASS — 0 Überlappungen" : `AUDIT FAIL — ${findings} Befunde`);
process.exit(findings === 0 ? 0 : 1);
