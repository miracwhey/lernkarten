// Geometrie-Beweis: misst im gerenderten DOM, ob SVG-Texte einander oder
// Kurvenpfade schneiden und ob sie in der viewBox liegen. Soll: 0 Befunde.
// Nutzung: node audit-overlap.mjs [lesson:card ...]   (ohne Args: alle curve-Karten)
import { chromium } from "playwright";
import { resolve } from "path";

const DEFAULT_TARGETS = ["2:2", "2:3", "3:2", "3:3", "5:2", "5:3", "6:3", "6:5"];
const targets = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_TARGETS;

const url = "file://" + resolve("karten-grammatik.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

let findings = 0;
for (const t of targets) {
  const [lesson, card] = t.split(":");
  await page.goto(`${url}?lesson=${lesson}&card=${card}`);
  await page.waitForTimeout(200);
  const report = await page.evaluate(() => {
    const svg = document.querySelector(".diagram svg");
    if (!svg) return { skip: true };
    const vb = svg.viewBox.baseVal;
    const out = [];
    const texts = [...svg.querySelectorAll("text")].map((el) => {
      const b = el.getBBox();
      return { label: el.textContent.trim(), x: b.x, y: b.y, w: b.width, h: b.height };
    });
    // Text vs. viewBox
    for (const a of texts) {
      if (a.x < vb.x || a.y < vb.y || a.x + a.w > vb.x + vb.width || a.y + a.h > vb.y + vb.height)
        out.push(`CLIP  "${a.label}" ragt aus viewBox (${a.x.toFixed(0)},${a.y.toFixed(0)},${a.w.toFixed(0)}×${a.h.toFixed(0)})`);
    }
    // Text vs. Text (2px Toleranz)
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j], p = -2;
      if (!(a.x + a.w + p < b.x || b.x + b.w + p < a.x || a.y + a.h + p < b.y || b.y + b.h + p < a.y))
        out.push(`TEXT² "${a.label}" × "${b.label}"`);
    }
    // Text vs. Linienpfade (polyline/line/path ohne Fläche), 1.5px Puffer
    const strokes = [...svg.querySelectorAll("polyline, line:not(.leader)")];
    for (const a of texts) {
      for (const el of strokes) {
        const len = el.getTotalLength ? el.getTotalLength() : 0;
        if (!len) continue;
        let hit = false;
        for (let d = 0; d <= len; d += 3) {
          const pt = el.getPointAtLength(d);
          if (pt.x >= a.x - 1.5 && pt.x <= a.x + a.w + 1.5 && pt.y >= a.y - 1.5 && pt.y <= a.y + a.h + 1.5) { hit = true; break; }
        }
        if (hit) out.push(`PATH  "${a.label}" wird von ${el.tagName}[${el.getAttribute("stroke") || ""}] geschnitten`);
      }
    }
    return { out };
  });
  if (report.skip) { console.log(`l${lesson}-c${card}: (kein SVG — übersprungen)`); continue; }
  if (report.out.length === 0) console.log(`l${lesson}-c${card}: OK`);
  else { findings += report.out.length; console.log(`l${lesson}-c${card}:\n  ` + report.out.join("\n  ")); }
}
await browser.close();
console.log(findings === 0 ? "AUDIT PASS — 0 Überlappungen" : `AUDIT FAIL — ${findings} Befunde`);
process.exit(findings === 0 ? 0 : 1);
