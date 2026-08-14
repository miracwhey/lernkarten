// Screenshots des Label-Mockups: Gesamtseite + je Fall eine Zeile (4 Varianten
// nebeneinander) + je Zelle einzeln in 3× — fürs Detail-Urteil.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "shots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1980, height: 1400 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE:", m.text()); });
await page.goto("file://" + resolve(HERE, "label-mockup.html"));
await page.waitForTimeout(250);

await page.screenshot({ path: OUT + "/seite.png", fullPage: true });
console.log("seite.png");
for (const id of ["A", "B", "C"]) {
  const cells = ["ist", "sticky", "color", "legend"].map((m) => `#cell-${id}-${m}`);
  const boxes = [];
  for (const sel of cells) boxes.push(await page.locator(sel).boundingBox());
  const x = Math.min(...boxes.map((b) => b.x)) - 8, y = Math.min(...boxes.map((b) => b.y)) - 8;
  const r = Math.max(...boxes.map((b) => b.x + b.width)) + 8, bo = Math.max(...boxes.map((b) => b.y + b.height)) + 8;
  await page.screenshot({ path: `${OUT}/zeile-${id}.png`, clip: { x, y, width: r - x, height: bo - y } });
  console.log(`zeile-${id}.png`);
  for (const m of ["sticky", "color", "legend"]) {
    await page.locator(`#cell-${id}-${m}`).screenshot({ path: `${OUT}/zoom-${id}-${m}.png` });
  }
}
await browser.close();
console.log("fertig:", OUT);
