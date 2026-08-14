// Voll-Referenz: screenshottet JEDE Karte JEDER Lektion (Pixel-Beweis für Renderer-Umbauten).
// Nutzung: node shot-all.mjs <outdir>
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const outdir = process.argv[2] || "all-shots";
mkdirSync(outdir, { recursive: true });

const url = "file://" + resolve("karten-grammatik.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE:", m.text()); });

await page.goto(url);
const counts = await page.evaluate(() => LESSONS.map((l) => l.cards.length));

let n = 0;
for (let li = 1; li <= counts.length; li++) {
  for (let ci = 1; ci <= counts[li - 1]; ci++) {
    await page.goto(`${url}?lesson=${li}&card=${ci}`);
    await page.waitForTimeout(200);
    await page.locator(".phone").screenshot({ path: `${outdir}/l${li}-c${ci}.png` });
    n++;
  }
}
console.log(`${n} Shots -> ${outdir} (Lektionen: ${counts.join(",")})`);
await browser.close();
