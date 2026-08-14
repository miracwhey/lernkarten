// Safari-Engine-Beweis: file:// in WebKit — mit meta charset (Fix) vs. ohne (Kontrolle).
import { webkit } from "playwright";
import { readFileSync, writeFileSync } from "fs";

const home = process.env.HOME;
const src = home + "/Workspace/lernkarten/app-mockup.html";
const noMeta = "/tmp/appmockup-nometa.html";
writeFileSync(noMeta, readFileSync(src, "utf-8").replace('<meta charset="utf-8">\n', ""));

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 1100 }, deviceScaleFactor: 2 });

await page.goto("file://" + src);
await page.waitForTimeout(300);
await page.screenshot({ path: home + "/Workspace/lernkarten/app-mockup-shots/webkit-fixed.png" });

await page.goto("file://" + noMeta);
await page.waitForTimeout(300);
await page.screenshot({ path: home + "/Workspace/lernkarten/app-mockup-shots/webkit-nometa.png" });

await browser.close();
console.log("done");
