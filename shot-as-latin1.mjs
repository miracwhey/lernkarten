// Reproduziert die Safari-file://-Ansicht: Bytes als windows-1252 interpretiert.
import { chromium } from "playwright";
import { readFileSync } from "fs";

const body = readFileSync(process.env.HOME + "/Workspace/lernkarten/app-mockup.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 1400 }, deviceScaleFactor: 2 });
await page.route("**/*", route => route.fulfill({ body, contentType: "text/html; charset=windows-1252" }));
await page.goto("http://mock.local/app-mockup.html");
await page.waitForTimeout(300);
await page.screenshot({ path: process.env.HOME + "/Workspace/lernkarten/app-mockup-shots/as-latin1.png" });
await browser.close();
console.log("done");
