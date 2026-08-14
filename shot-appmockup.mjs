import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.HOME + '/Workspace/lernkarten/app-mockup-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 2 });
await page.goto('file://' + process.env.HOME + '/Workspace/lernkarten/app-mockup.html');
await page.waitForTimeout(400);

await page.screenshot({ path: OUT + '/full.png', fullPage: true });

const slots = await page.$$('.slot');
for (let i = 0; i < slots.length; i++) {
  await slots[i].scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await slots[i].screenshot({ path: OUT + `/s${i + 1}.png` });
}
await browser.close();
console.log('done', slots.length, 'slots');
