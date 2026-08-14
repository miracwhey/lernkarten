// Abnahme-Gate für eine beliebige Lektions-JSON: rendert jede Karte über den
// echten Renderer, misst Text-Überlappungen/Clipping im DOM, screenshottet.
// Befunde hier sind SYSTEM-Fehler (Solver/Renderer), keine LLM-Fehler.
// Nutzung: node audit-lesson.mjs <lesson.json> [outdir]
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { resolve, basename } from "path";
import { normalizeLesson } from "./validate-lesson.mjs";

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
  const report = await page.evaluate((c) => {
    area.innerHTML = RENDERERS[c.type](c);
    const svg = document.querySelector(".diagram svg");
    if (!svg) return null;   // reine HTML-Karte — kein Geometrie-Audit
    const vb = svg.viewBox.baseVal;
    const out = [];
    const texts = [...svg.querySelectorAll("text")].map((el) => {
      const b = el.getBBox();
      return { label: el.textContent.trim(), x: b.x, y: b.y, w: b.width, h: b.height };
    });
    for (const a of texts) {
      if (a.x < vb.x || a.y < vb.y || a.x + a.w > vb.x + vb.width || a.y + a.h > vb.y + vb.height)
        out.push(`CLIP  "${a.label}"`);
    }
    for (let x = 0; x < texts.length; x++) for (let y = x + 1; y < texts.length; y++) {
      const a = texts[x], b = texts[y], p = -2;
      if (!(a.x + a.w + p < b.x || b.x + b.w + p < a.x || a.y + a.h + p < b.y || b.y + b.h + p < a.y))
        out.push(`TEXT² "${a.label}" × "${b.label}"`);
    }
    const strokes = [...svg.querySelectorAll("polyline, line:not(.leader)")];
    for (const a of texts) for (const el of strokes) {
      const len = el.getTotalLength ? el.getTotalLength() : 0;
      if (!len) continue;
      for (let d = 0; d <= len; d += 3) {
        const pt = el.getPointAtLength(d);
        if (pt.x >= a.x - 1.5 && pt.x <= a.x + a.w + 1.5 && pt.y >= a.y - 1.5 && pt.y <= a.y + a.h + 1.5) {
          out.push(`PATH  "${a.label}" × ${el.tagName}`); break;
        }
      }
    }
    return out;
  }, card);
  await page.locator(".phone").screenshot({ path: `${outdir}/c${i + 1}-${card.type}.png` });
  if (report === null) { console.log(`c${i + 1} ${card.type}: (HTML-Karte)`); continue; }
  if (report.length === 0) console.log(`c${i + 1} ${card.type}: OK`);
  else { findings += report.length; console.log(`c${i + 1} ${card.type}:\n  ` + report.join("\n  ")); }
}
await browser.close();
console.log(findings === 0 ? `AUDIT PASS — Screenshots in ${outdir}/` : `AUDIT FAIL — ${findings} Befunde (System-Fehler, nicht LLM)`);
process.exit(findings === 0 ? 0 : 1);
