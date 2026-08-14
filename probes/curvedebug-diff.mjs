// Mess-Hook-Vergleich: liest window.__curveDebug.yOnCurve an festen t-Werten, einmal
// mit dem committeten Renderer (git show HEAD:renderer.js) und einmal mit dem
// Arbeitsstand. Unveränderte Formen MÜSSEN identisch messen; suppressed/rebound
// ändern sich absichtlich — der Diff zeigt, WELCHE Serie sich wie ändert.
// Nutzung: node probes/curvedebug-diff.mjs <lesson.json> [t1 t2 ...]
import { chromium } from "playwright";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { normalizeLesson } from "../validate-lesson.mjs";

const repo = resolve(new URL("..", import.meta.url).pathname);
const file = process.argv[2];
const TS = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [0.3, 0.6];
const lesson = normalizeLesson(JSON.parse(readFileSync(file, "utf8")));
const cards = lesson.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.type === "curve");

const oldPath = "/tmp/renderer-HEAD.js";
writeFileSync(oldPath, execFileSync("git", ["-C", repo, "show", "HEAD:renderer.js"]));

const browser = await chromium.launch();
const measure = async (rendererPath) => {
  const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
  await page.setContent('<div id="area"></div>');
  await page.addStyleTag({ path: repo + "/renderer.css" });
  await page.addScriptTag({ path: rendererPath });
  const out = [];
  for (const { c, i } of cards) {
    const rows = await page.evaluate(({ card, ts }) => {
      document.getElementById("area").innerHTML = RENDERERS.curve(card);
      const { samples, yOnCurve } = window.__curveDebug;
      return samples.map((sm) => ({
        label: sm.s.label, shape: sm.s.shape, afterStop: sm.s.afterStop || "-",
        vals: ts.map((t) => +yOnCurve(sm, t).toFixed(3)),
        end: [+sm.pts[sm.pts.length - 1][0].toFixed(3), +sm.pts[sm.pts.length - 1][1].toFixed(3)]
      }));
    }, { card: c, ts: TS });
    rows.forEach((r, si) => out.push({ card: i, si, ...r }));
  }
  await page.close();
  return out;
};

const alt = await measure(oldPath);
const neu = await measure(repo + "/renderer.js");
await browser.close();

console.log(`# ${file} — yOnCurve bei t=${TS.join(", ")} (HEAD vs. Arbeitsstand)`);
let gleich = 0, anders = 0;
for (let k = 0; k < neu.length; k++) {
  const a = alt[k], b = neu[k];
  const same = JSON.stringify(a.vals) === JSON.stringify(b.vals) && JSON.stringify(a.end) === JSON.stringify(b.end);
  same ? gleich++ : anders++;
  console.log(`${same ? "GLEICH " : "GEÄNDERT"} c${b.card}.series[${b.si}] "${b.label}" (${b.shape}${b.afterStop !== "-" ? "+" + b.afterStop : ""})`);
  console.log(`   HEAD  y=${JSON.stringify(a.vals)} ende=${JSON.stringify(a.end)}`);
  if (!same) console.log(`   NEU   y=${JSON.stringify(b.vals)} ende=${JSON.stringify(b.end)}`);
}
console.log(`ZÄHLUNG gleich=${gleich} geaendert=${anders}`);
