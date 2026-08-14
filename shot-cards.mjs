// Screenshot-Harness: rendert Karten headless und legt PNGs ab.
// Nutzung: node shot-cards.mjs <outdir> [lesson:card ...]   (ohne Liste: alle curve-Karten)
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const outdir = process.argv[2] || "shots";
mkdirSync(outdir, { recursive: true });

// lesson:card 1-indexiert, passend zu ?lesson=&card=
const DEFAULT_TARGETS = [
  "2:2", "2:3",       // Naval: Gehalt, Entkopplung
  "3:2", "3:3",       // Habits: Zinseszins, Tal
  "5:2", "5:3",       // Schlaf: Adenosin, Koffein-Maskierung
  "6:3", "6:5"        // GLM: Adenosin, Koffein-Halbwertszeit
];
const targets = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_TARGETS;

const url = "file://" + resolve("karten-grammatik.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE:", m.text()); });

for (const t of targets) {
  const [lesson, card] = t.split(":");
  await page.goto(`${url}?lesson=${lesson}&card=${card}`);
  await page.waitForTimeout(250);
  const phone = page.locator(".phone");
  await phone.screenshot({ path: `${outdir}/l${lesson}-c${card}.png` });
  console.log(`${outdir}/l${lesson}-c${card}.png`);
}
await browser.close();
