// Nahaufnahme einzelner Karten über den ECHTEN Renderer (karten-grammatik.html als
// Host, wie Audits und App-Canvas). Schießt zusätzlich zur Telefon-Ansicht das
// Diagramm allein in 3× Auflösung — Marker, Leader und Chip sind sonst nicht prüfbar.
// Nutzung: node probes/shot-curve.mjs <lesson.json> <outdir> [kartenIndex ...]
//          (ohne Indizes: alle curve-Karten)
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { resolve, basename } from "path";
import { normalizeLesson } from "../validate-lesson.mjs";

const file = process.argv[2];
const outdir = process.argv[3] || "probes/shots";
mkdirSync(outdir, { recursive: true });
const lesson = normalizeLesson(JSON.parse(readFileSync(file, "utf8")));
const tag = basename(file, ".json");

const picked = process.argv.slice(4).map(Number);
const idx = picked.length ? picked
  : lesson.cards.map((c, i) => (c.type === "curve" ? i : -1)).filter((i) => i >= 0);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 }, deviceScaleFactor: 3 });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto("file://" + resolve("karten-grammatik.html"));
await page.waitForTimeout(150);

for (const i of idx) {
  const card = lesson.cards[i];
  await page.evaluate((c) => { area.innerHTML = RENDERERS[c.type](c); }, card);
  await page.waitForTimeout(80);
  const p1 = `${outdir}/${tag}-c${i}-phone.png`;
  const p2 = `${outdir}/${tag}-c${i}-zoom.png`;
  await page.locator(".phone").screenshot({ path: p1 });
  await page.locator(".diagram").screenshot({ path: p2 });
  console.log(p1);
  console.log(p2);
}
await browser.close();
