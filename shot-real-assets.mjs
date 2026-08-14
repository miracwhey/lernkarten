// Echte Renderer-Karten als randlose Assets fürs App-Mockup (eine Geometrie-Quelle, kein Nachmalen).
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const outdir = "app-mockup-assets";
mkdirSync(outdir, { recursive: true });

const url = "file://" + resolve("karten-grammatik.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 }, deviceScaleFactor: 2 });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

await page.goto(`${url}?lesson=5&card=2`);
await page.waitForTimeout(300);
// Rahmen strippen: das Mockup-Phone liefert Radius/Border selbst. JSON-Debug-Pille ist Renderer-Werkzeug, kein App-UI.
await page.addStyleTag({ content: `
  .phone { border: none !important; border-radius: 0 !important; box-shadow: none !important; }
  .jsonbtn { visibility: hidden; }
` });
await page.locator(".phone").screenshot({ path: `${outdir}/s5-lernen.png` });
await page.locator(".cardarea").screenshot({ path: `${outdir}/s6-card.png` });
await browser.close();
console.log("done");
