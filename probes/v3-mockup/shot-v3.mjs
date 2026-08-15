// Shots des v3-Design-Gate-Mockups: pro Panel jeder Schritt-ENDZUSTAND über den
// deterministischen Hook __gotoStep (noanim + Zustand) — nie Mid-Flight-Frames.
// Nutzung: node probes/v3-mockup/shot-v3.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "shots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1460, height: 1150 }, deviceScaleFactor: 2 });
await page.goto("file://" + resolve(HERE, "v3-mockup.html"));
await page.waitForTimeout(600);

const panels = await page.evaluate(() => window.__panels);
console.log("Panels:", JSON.stringify(panels));

for (let i = 0; i < panels.length; i++) {
  for (let s = 0; s <= panels[i].steps; s++) {
    await page.evaluate(([i, s]) => window.__gotoStep(i, s), [i, s]);
    await page.waitForTimeout(120);
    const phone = page.locator(`#${panels[i].id} .phone`);
    await phone.screenshot({ path: `${OUT}/${panels[i].id}-s${s}.png` });
  }
  console.log(`${panels[i].id}: ${panels[i].steps + 1} Schritt-Shots`);
}

// Übersicht: alle drei Panels im Endzustand
for (let i = 0; i < panels.length; i++)
  await page.evaluate(([i, s]) => window.__gotoStep(i, s), [i, panels[i].steps]);
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/overview.png`, fullPage: true });
console.log("overview.png");

await browser.close();
