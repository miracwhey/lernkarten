// Werkbank für die Bausteine der Szenen-Karten: jeder Gegenstand groß und einzeln, damit
// er beurteilbar ist, bevor er in einer Karte klein zwischen Text sitzt.
//
// Anlass: die erste Szenen-Runde hatte drei Fehler, die in der fertigen Karte alle gleich
// aussehen („wirkt unfertig") und verschiedene Ursachen haben — eine kaputte Form (der Mond
// war ein offener Bogen, weil ein Innenradius kleiner war als die halbe Sehne und der
// Browser ihn stillschweigend hochskaliert), eine Beschriftung ohne Platzprüfung, und ein
// Motiv, das die Fläche nicht füllt. Einzeln gezeichnet fällt jeder davon sofort auf.
//
// Nutzung: node probes/formen-werkbank.mjs [outdir=formen-werkbank-shots]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = process.argv[2] || "formen-werkbank-shots";
mkdirSync(outdir, { recursive: true });
const K = { ink: "var(--ink)", muted: "var(--muted)", line: "var(--line)", card: "var(--card)" };

// ——— Mond: zwei Bögen, beide Radien größer als die halbe Sehne ———
// Der Außenbogen ist der Kreis selbst, der Innenbogen ist FLACHER (größerer Radius) und
// schneidet die Sichel heraus. Wird der Innenradius kleiner als die halbe Sehne gewählt,
// darf der Browser ihn hochskalieren — dann liegen beide Bögen aufeinander und es bleibt
// eine Linie übrig. Genau das war der Fehler.
const mond = (x, y, r, fill = "var(--ueberich-soft)", stroke = "var(--ueberich)", bauch = 1.25) => {
  const dy = r * 0.96, dx = r * 0.28, R = r * bauch;
  return `<path d="M${(x + dx).toFixed(1)},${(y - dy).toFixed(1)} A${r},${r} 0 1 0 ${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`
    + ` A${R.toFixed(1)},${R.toFixed(1)} 0 0 1 ${(x + dx).toFixed(1)},${(y - dy).toFixed(1)} Z"`
    + ` fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
};

// ——— Hand am Schalter: Handrücken, Daumen, ein ausgestreckter Zeigefinger ———
// Die Referenz zeichnet Körperteile als flache Fläche mit zwei bis drei Innenlinien. Der
// erste Versuch war eine Kapsel — die liest sich als Klumpen, weil ihr die Silhouette
// fehlt, die eine Hand ausmacht: der Finger muss AUS der Faust herausstehen.
const hand = (x, y, deg = 0, haut = "var(--es-soft)") => `<g transform="rotate(${deg} ${x} ${y})">
    <path d="M${x},${y} h-30 q-16,0 -16,15 v20 q0,15 16,15 h34 q14,0 14,-13 v-8"
      fill="${haut}" stroke="${K.ink}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M${x + 18},${y + 29} q13,-3 13,-13 q0,-9 -12,-9 h-9"
      fill="${haut}" stroke="${K.ink}" stroke-width="2.4"/>
    <path d="M${x},${y} h-8 q-9,0 -9,7 q0,7 9,7 h10" fill="${haut}" stroke="${K.ink}" stroke-width="2.2"/>
    <path d="M${x - 26},${y + 22} h16 M${x - 26},${y + 32} h13" stroke="${K.ink}" stroke-width="1.3" opacity="0.45"/>
  </g>`;

// ——— Kippschalter in einer Platte: Rahmen, Wippe mit Kante, Fase ———
const kippschalter = (x, y, an, farbe) => {
  const soft = `var(--${farbe}-soft)`;
  return `<rect x="${x - 26}" y="${y - 34}" width="52" height="68" rx="6" fill="var(--chrome)" stroke="${K.ink}" stroke-width="2.5"/>
    <rect x="${x - 19}" y="${y - 27}" width="38" height="54" rx="4" fill="var(--card)" stroke="${K.ink}" stroke-width="1.8"/>
    ${an
      ? `<path d="M${x - 19},${y + 6} h38 l-6,-31 h-26 z" fill="${soft}" stroke="${K.ink}" stroke-width="2.4"/>
         <line x1="${x - 13}" y1="${y - 25}" x2="${x + 13}" y2="${y - 25}" stroke="${K.ink}" stroke-width="1.6" opacity="0.5"/>`
      : `<path d="M${x - 19},${y - 6} h38 l-6,31 h-26 z" fill="${soft}" stroke="${K.ink}" stroke-width="2.4"/>
         <line x1="${x - 13}" y1="${y + 25}" x2="${x + 13}" y2="${y + 25}" stroke="${K.ink}" stroke-width="1.6" opacity="0.5"/>`}
    <text class="svglabel" x="${x}" y="${an ? y + 24 : y - 14}" font-size="9" text-anchor="middle"
      fill="var(--${farbe})" font-weight="700">${an ? "AN" : "AUS"}</text>`;
};

// ——— Drehdimmer: Knopf mit Griffkerbe, Skala rundherum, Zeigerstrich ———
const dimmer = (x, y, farbe) => `<g>
    ${Array.from({ length: 7 }, (_, i) => {
      const a = (-210 + i * 40) * Math.PI / 180;
      return `<line x1="${(x + Math.cos(a) * 32).toFixed(1)}" y1="${(y + Math.sin(a) * 32).toFixed(1)}"`
        + ` x2="${(x + Math.cos(a) * 38).toFixed(1)}" y2="${(y + Math.sin(a) * 38).toFixed(1)}"`
        + ` stroke="${K.muted}" stroke-width="${i === 3 ? 2.2 : 1.5}"/>`;
    }).join("")}
    <circle cx="${x}" cy="${y}" r="26" fill="var(--${farbe}-soft)" stroke="${K.ink}" stroke-width="2.5"/>
    <circle cx="${x}" cy="${y}" r="19" fill="none" stroke="${K.ink}" stroke-width="1.4" opacity="0.4"/>
    <line x1="${x}" y1="${y}" x2="${(x + 17).toFixed(1)}" y2="${(y - 17).toFixed(1)}" stroke="${K.ink}" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="${x}" cy="${y}" r="3.4" fill="${K.ink}"/>
  </g>`;

// ——— Glühlampe mit Fassung, Wendel und Strahlen ———
const lampe = (x, y, zustand, farbe) => {
  const glas = zustand === "an" ? `var(--${farbe}-soft)` : zustand === "halb" ? "var(--ueberich-soft)" : "var(--card)";
  const strahlen = zustand === "an" ? 7 : zustand === "halb" ? 4 : 0;
  const len = zustand === "an" ? 16 : 9;
  return `<g>
    <line x1="${x}" y1="${y - 62}" x2="${x}" y2="${y - 34}" stroke="${K.ink}" stroke-width="2.2"/>
    <path d="M${x - 11},${y - 34} h22 l-2,13 h-18 z" fill="var(--chrome)" stroke="${K.ink}" stroke-width="2.2"/>
    <line x1="${x - 10}" y1="${y - 27}" x2="${x + 10}" y2="${y - 27}" stroke="${K.ink}" stroke-width="1.2" opacity="0.5"/>
    <circle cx="${x}" cy="${y}" r="24" fill="${glas}" stroke="${K.ink}" stroke-width="2.5"/>
    <path d="M${x - 8},${y - 12} v10 q8,10 16,0 v-10" fill="none" stroke="${K.ink}" stroke-width="1.6" opacity="0.7"/>
    <path d="M${x - 4},${y + 6} q4,5 8,0" fill="none" stroke="${K.ink}" stroke-width="1.4" opacity="0.5"/>
    ${Array.from({ length: strahlen }, (_, i) => {
      const a = (-152 + i * (304 / Math.max(1, strahlen - 1))) * Math.PI / 180;
      return `<line x1="${(x + Math.cos(a) * 31).toFixed(1)}" y1="${(y + Math.sin(a) * 31).toFixed(1)}"`
        + ` x2="${(x + Math.cos(a) * (31 + len)).toFixed(1)}" y2="${(y + Math.sin(a) * (31 + len)).toFixed(1)}"`
        + ` stroke="var(--${zustand === "halb" ? "ueberich" : farbe})" stroke-width="2.2" stroke-linecap="round"/>`;
    }).join("")}
  </g>`;
};

// ——— Schlafende Person im Profil, mit Körper unter der Decke ———
// Der erste Versuch hatte einen runden Kopf ohne Körper — die Person schwebte über dem
// Bett. Ein Profil braucht Nase, Kinn und Hals, und die Decke braucht eine Schulter, unter
// der sie liegt.
const schlaefer = (x, y, haut = "var(--es-soft)") => `<g>
    <path d="M${x},${y} q-4,-30 22,-38 q28,-9 40,14 q6,12 2,24 l6,4 q3,3 -2,5 l-7,2
             q-1,10 -10,13 q-12,4 -24,-2 q-22,-10 -27,-22 z"
      fill="${haut}" stroke="${K.ink}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M${x - 3},${y - 6} q0,-30 26,-34 q30,-5 36,15 q-24,-14 -62,19 z" fill="${K.ink}"/>
    <circle cx="${x + 42}" cy="${y - 6}" r="4.2" fill="${K.ink}"/>
    <path d="M${x + 56},${y + 14} q-9,6 -18,3" fill="none" stroke="${K.ink}" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M${x + 22},${y + 26} q-6,14 -20,18" fill="none" stroke="${K.ink}" stroke-width="2.2"/>
  </g>`;

// ——— Auge, groß, mit Spiegelung des Displays in der Pupille ———
// Der Profilkopf des ersten Versuchs wurde zum Zipfelgesicht: ein Profil braucht Stirn,
// Nasenwurzel, Kinn und Hals, und jedes davon ist eine eigene Kurve. Die Referenz löst
// dasselbe Problem anders — Karte 07 zeigt Gefühle als AUSSCHNITT (nur Auge, nur Mund),
// groß und sorgfältig. Ein Auge ist zeichenbar: Ober- und Unterlid, Iris, Pupille, Wimpern.
// Und es trägt hier die Aussage, weil das Display sich darin spiegelt — die Spiegelung ist
// das Detail, das die Karte behauptet, und kein Schmuck.
const auge = (x, y, s = 1, spiegel = true) => {
  const g = (v) => (v * s).toFixed(1);
  return `<g>
    <path d="M${x - +g(58)},${y} q${g(58)},${g(-46)} ${g(116)},0 q${g(-58)},${g(44)} ${g(-116)},0 z"
      fill="var(--card)" stroke="${K.ink}" stroke-width="${(2.6 * s).toFixed(1)}" stroke-linejoin="round"/>
    <clipPath id="augapfel${Math.round(x)}"><path d="M${x - +g(58)},${y} q${g(58)},${g(-46)} ${g(116)},0 q${g(-58)},${g(44)} ${g(-116)},0 z"/></clipPath>
    <g clip-path="url(#augapfel${Math.round(x)})">
      <circle cx="${x}" cy="${y - +g(4)}" r="${g(23)}" fill="var(--ich-soft)" stroke="${K.ink}" stroke-width="${(2 * s).toFixed(1)}"/>
      <circle cx="${x}" cy="${y - +g(4)}" r="${g(11)}" fill="${K.ink}"/>
      ${spiegel
        ? `<rect x="${x - +g(7)}" y="${y - +g(13)}" width="${g(11)}" height="${g(17)}" rx="${g(2)}"
             fill="var(--ueberich-soft)" stroke="var(--ueberich)" stroke-width="${(1.2 * s).toFixed(1)}"/>`
        : `<circle cx="${x + +g(7)}" cy="${y - +g(11)}" r="${g(4)}" fill="var(--card)" opacity="0.9"/>`}
    </g>
    <!-- Oberlid liegt VOR dem Augapfel, sonst schwimmt die Iris über der Kante -->
    <path d="M${x - +g(58)},${y} q${g(58)},${g(-46)} ${g(116)},0" fill="none" stroke="${K.ink}" stroke-width="${(3 * s).toFixed(1)}" stroke-linecap="round"/>
    <path d="M${x - +g(58)},${y} q${g(6)},${g(-13)} ${g(15)},${g(-17)}" fill="none" stroke="${K.ink}" stroke-width="${(2 * s).toFixed(1)}" stroke-linecap="round"/>
    <path d="M${x + +g(20)},${y - +g(30)} q${g(8)},${g(-6)} ${g(17)},${g(-4)}" fill="none" stroke="${K.ink}" stroke-width="${(1.8 * s).toFixed(1)}" stroke-linecap="round"/>
    <path d="M${x - +g(70)},${y - +g(18)} q${g(10)},${g(-3)} ${g(16)},${g(2)}" fill="none" stroke="${K.ink}" stroke-width="${(1.6 * s).toFixed(1)}" opacity="0.6"/>
  </g>`;
};

const FORMEN = [
  ["mond", `${mond(70, 80, 34)}${mond(180, 80, 34, "var(--ueberich-soft)", "var(--ueberich)", 1.6)}${mond(290, 80, 34, "var(--card)", K.ink, 1.12)}`],
  ["auge", `${auge(110, 90, 0.85)}${auge(280, 90, 0.85, false)}`],
  ["hand", `${hand(120, 60)}${hand(280, 70, 155)}`],
  ["schalter", `${kippschalter(70, 80, true, "es")}${kippschalter(180, 80, false, "ich")}${dimmer(290, 80, "ueberich")}`],
  ["lampe", `${lampe(70, 100, "an", "es")}${lampe(180, 100, "aus", "ich")}${lampe(290, 100, "halb", "ueberich")}`],
  ["schlaefer", `${schlaefer(90, 70)}`]
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 460, height: 260 }, deviceScaleFactor: 2 });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.addStyleTag({ path: repo + "/renderer.css" });
const fehler = [];
page.on("pageerror", (e) => { fehler.push(e.message); console.error("PAGEERROR:", e.message); });

for (const [name, inhalt] of FORMEN) {
  await page.setContent(`<body style="margin:0;background:var(--card)">
    <svg id="s" viewBox="0 0 380 180" width="460" height="218">${inhalt}</svg></body>`);
  await page.addStyleTag({ path: repo + "/renderer.css" });
  await page.waitForTimeout(80);
  await page.locator("#s").screenshot({ path: `${outdir}/${name}.png` });
  console.log(`${name.padEnd(12)} gezeichnet`);
}
await browser.close();
if (fehler.length) { console.error(`${fehler.length} Seitenfehler`); process.exit(1); }
console.log(`Shots -> ${outdir}`);
