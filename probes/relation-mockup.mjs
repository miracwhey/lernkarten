// Mockups der vier fehlenden Relationen aus docs/referenz-imprint/analyse.md
// (Komposition, Typologie, Zonen an einer Achse, Projektion — alle Klasse A, also aus
// Primitiven konstruierbar, ohne einen Strich zu zeichnen).
//
// ZIEL-Rendertechnik, nicht Bildbearbeitung: dieselbe Karten-Hülle, dieselbe renderer.css,
// dieselbe Palette und dieselben Textmaße wie im Produkt. Was hier steht, ist gezeichnet
// wie es später aussieht — nur die Geometrie ist von Hand gesetzt statt aus einem Contract
// berechnet. So entscheidet die Abnahme über den LOOK, bevor Renderer, Validator, Prompt
// und Werkbank für vier Typen gebaut werden.
//
// Jede Karte trägt echten Inhalt aus dem Bestand (Schlaf/Koffein, Neuron), keinen
// Platzhalter: eine Relation, deren Aussage man nicht liest, kann man nicht beurteilen.
//
// Nutzung: node probes/relation-mockup.mjs [outdir=relation-mockup-shots]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = process.argv[2] || "relation-mockup-shots";
mkdirSync(outdir, { recursive: true });

const karte = (text, svg, caption) => `<div class="card">
  <p class="lehrsatz">${text}</p>
  <div class="diagram">${svg}</div>
  ${caption ? `<p class="caption">${caption}</p>` : ""}
</div>`;

// ——— composition: „X besteht aus diesen N Teilen" (Imprint 06 EQ, 11 Pflanze) ———
// Die Scheibe ist das Ganze, die Sektoren sind die Teile. Gegen `loop` abgegrenzt: keine
// Pfeile, keine Richtung — ein Kreislauf sagt „danach", eine Komposition sagt „darin".
// Gegen `multiplication` abgegrenzt: kein Ausgang, keine Wirkung, die irgendwo ankommt.
const MITTE = [200, 186], R_AUSSEN = 132, R_KERN = 46;
// Der Anteil ist die AUSSAGE, nicht die Beschriftung daneben: drei gleich große Sektoren
// unter den Zahlen 50/25/25 zeigen etwas anderes, als sie behaupten. Die Winkel folgen
// deshalb den Anteilen. Ein Contract ohne Anteile zeichnet gleich große Teile — und dann
// steht auch keine Zahl darunter.
const TEILE = [["LEICHT", "ich", 50], ["TIEF", "ueberich", 25], ["REM", "es", 25]];
const SUMME = TEILE.reduce((s, t) => s + t[2], 0);
const winkel = (i) => {
  const vor = TEILE.slice(0, i).reduce((s, t) => s + t[2], 0);
  return [(vor / SUMME) * 2 * Math.PI - Math.PI / 2, ((vor + TEILE[i][2]) / SUMME) * 2 * Math.PI - Math.PI / 2];
};
const sektor = (i, farbe) => {
  const [cx, cy] = MITTE, [a0, a1] = winkel(i);
  const p = (a, rad) => `${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad).toFixed(1)}`;
  const gross = a1 - a0 > Math.PI ? 1 : 0;
  return `<path d="M${p(a0, R_AUSSEN)} A${R_AUSSEN},${R_AUSSEN} 0 ${gross} 1 ${p(a1, R_AUSSEN)} L${p(a1, R_KERN)} A${R_KERN},${R_KERN} 0 ${gross} 0 ${p(a0, R_KERN)} Z"
        fill="var(--${farbe}-soft)" stroke="var(--${farbe})" stroke-width="2.5"/>`;
};
// Die Beschriftung sitzt IM Sektor, nicht außen: außen hängt ihre Lage an der Textbreite,
// und „LEICHTSCHLAF" lief am ersten Entwurf aus der Karte. Innen ist der Platz durch die
// Geometrie garantiert — dasselbe Argument wie beim Label-Platz einer Asset-Karte.
const sektorLabel = (i, txt, teil) => {
  const [cx, cy] = MITTE, [a0, a1] = winkel(i);
  const a = (a0 + a1) / 2, rad = (R_AUSSEN + R_KERN) / 2;
  const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
  return `<text class="svglabel" x="${x.toFixed(1)}" y="${(y - 1).toFixed(1)}" font-size="12" text-anchor="middle" fill="var(--ink)">${txt}</text>
    <text class="svglabel" x="${x.toFixed(1)}" y="${(y + 15).toFixed(1)}" font-size="10.5" text-anchor="middle" fill="var(--muted)">${teil} %</text>`;
};
const composition = karte(
  `Eine Nacht ist kein Zustand, sondern <b>drei Schlafarten</b>, die einander ablösen — fehlt eine, fehlt ihre Arbeit.`,
  `<svg viewBox="0 0 400 340" role="img" aria-label="Schlaf besteht aus Leichtschlaf, Tiefschlaf und REM">
    ${TEILE.map(([, f], i) => sektor(i, f)).join("\n    ")}
    <circle cx="${MITTE[0]}" cy="${MITTE[1]}" r="${R_KERN}" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/>
    <text class="svglabel" x="${MITTE[0]}" y="${MITTE[1] + 5}" font-size="14" text-anchor="middle" fill="var(--ink)">SCHLAF</text>
    ${TEILE.map(([t, , anteil], i) => sektorLabel(i, t, anteil)).join("\n    ")}
  </svg>`,
  `Der Anteil verschiebt sich über die Nacht — Tiefschlaf früh, REM gegen Morgen.`);

// ——— typology: „es gibt N Sorten, jede erkennst du an Y" (Imprint 07) ———
// Drei gleichrangige Felder. Der Unterschied zu `contrast`: dort stehen ZWEI Seiten
// gegeneinander, hier stehen N Sorten NEBENEINANDER — keine wiegt schwerer, keine ist die
// Antwort auf die andere. Das Erkennungszeichen ist eine Form, nicht ein Bild: ein Icon je
// Sorte hieße zeichnen; eine Form je Sorte ist konstruierbar und trägt trotzdem.
const SORTEN = [
  { form: `<circle cx="0" cy="0" r="34" fill="var(--es-soft)" stroke="var(--es)" stroke-width="2.5"/>`,
    titel: "ERREGEND", merk: "macht das Feuern wahrscheinlicher", farbe: "es" },
  { form: `<rect x="-31" y="-31" width="62" height="62" rx="6" fill="var(--ich-soft)" stroke="var(--ich)" stroke-width="2.5"/>`,
    titel: "HEMMEND", merk: "hält das Feuern zurück", farbe: "ich" },
  { form: `<path d="M0,-37 L34,21 L-34,21 Z" fill="var(--ueberich-soft)" stroke="var(--ueberich)" stroke-width="2.5" stroke-linejoin="round"/>`,
    titel: "MODULIEREND", merk: "verstellt, wie stark beide wirken", farbe: "ueberich" }
];
const typology = karte(
  `Nicht jedes Signal will dasselbe: <b>drei Sorten</b> treffen auf dieselbe Zelle — und du erkennst sie an ihrer Wirkung.`,
  `<svg viewBox="0 0 400 300" role="img" aria-label="Drei Sorten von Signalen: erregend, hemmend, modulierend">
    ${SORTEN.map((s, i) => {
      const x = 67 + i * 133;
      return `<g transform="translate(${x} 74)">${s.form}</g>
    <text class="svglabel" x="${x}" y="160" font-size="13" text-anchor="middle" fill="var(--${s.farbe})">${s.titel}</text>
    <text class="svglabel" x="${x}" y="190" font-size="11" text-anchor="middle" fill="var(--muted)">${
        s.merk.split(" ").reduce((z, w) => {
          const l = z[z.length - 1];
          if (l && (l + " " + w).length <= 18) z[z.length - 1] = l + " " + w; else z.push(w);
          return z;
        }, []).map((z, k) => `<tspan x="${x}" dy="${k ? 15 : 0}">${z}</tspan>`).join("")}</text>`;
    }).join("\n    ")}
    <line x1="133" y1="34" x2="133" y2="236" stroke="var(--line)" stroke-width="1.5"/>
    <line x1="266" y1="34" x2="266" y2="236" stroke="var(--line)" stroke-width="1.5"/>
  </svg>`,
  `Dieselbe Zelle, drei Absender — die Summe entscheidet.`);

// ——— zone-axis: „zwischen A und B liegen benannte Bereiche" (Imprint 02, 12) ———
// Ein Spektrum, kein Verlauf: die Zonen haben NAMEN und Grenzen, sonst wäre es ein
// Farbverlauf ohne Aussage. Der Marker sagt, wo man gerade steht — er ist optional,
// aber er macht aus einer Skala eine Lage.
// Kein Untertitel in der Zone: die schmalste Zone bestimmt, was hineinpasst, und drei
// Wörter unter „ÜBERMÜDET" liefen in die Nachbarzone. Eine Zone trägt ihren NAMEN; was
// sie bedeutet, sagt der Lehrsatz darüber. (Im gebauten Typ wäre das ein gemessener
// Deckel je Zonenbreite, keine Schätzung.)
const ZONEN = [["FRISCH", "ich", 0.30], ["TRÄGE", "ueberich", 0.34], ["ÜBERMÜDET", "es", 0.36]];
const Z_X0 = 32, Z_BREITE = 336, Z_Y = 132, Z_H = 78;
let zx = Z_X0;
const zoneBaender = ZONEN.map(([t, f, anteil]) => {
  const w = anteil * Z_BREITE, x = zx; zx += w;
  return `<rect x="${x.toFixed(1)}" y="${Z_Y}" width="${w.toFixed(1)}" height="${Z_H}" fill="var(--${f}-soft)" stroke="var(--${f})" stroke-width="2"/>
    <text class="svglabel" x="${(x + w / 2).toFixed(1)}" y="${Z_Y + 45}" font-size="12.5" text-anchor="middle" fill="var(--ink)">${t}</text>`;
}).join("\n    ");
const zoneAxis = karte(
  `Zwischen <b>ausgeschlafen</b> und <span class="w-es">übermüdet</span> liegt kein Schalter, sondern eine Strecke — und du merkst erst am Ende, wie weit du gegangen bist.`,
  `<svg viewBox="0 0 400 320" role="img" aria-label="Skala von ausgeschlafen bis übermüdet mit drei Zonen">
    ${zoneBaender}
    <text class="svglabel" x="${Z_X0}" y="${Z_Y + Z_H + 30}" font-size="11.5" text-anchor="start" fill="var(--muted)">0 STUNDEN WACH</text>
    <text class="svglabel" x="${Z_X0 + Z_BREITE}" y="${Z_Y + Z_H + 30}" font-size="11.5" text-anchor="end" fill="var(--muted)">19 STUNDEN WACH</text>
    <g transform="translate(${(Z_X0 + Z_BREITE * 0.9).toFixed(1)} ${Z_Y})">
      <line x1="0" y1="-30" x2="0" y2="${Z_H}" stroke="var(--ink)" stroke-width="2"/>
      <circle cx="0" cy="-34" r="5.5" fill="var(--ink)"/>
      <text class="svglabel" x="8" y="-50" font-size="12" text-anchor="end" fill="var(--ink)">HIER FÄHRST DU HEIM</text>
    </g>
  </svg>`,
  `Ab 17 Stunden wach reagierst du wie mit 0,5 Promille.`);

// ——— projection: „A wirft etwas auf B" (Imprint 01) ———
// Zwei Gegenstände und der Kegel dazwischen. Der Kegel ist die Aussage: er hat eine
// Quelle, eine Richtung und eine TREFFERFLÄCHE, auf der etwas benannt wird. Gegen `pfeil`
// aus der Erklär-Schicht abgegrenzt — ein Pfeil sagt „wirkt auf", eine Projektion zeigt,
// WAS ankommt und wie weit es reicht.
const projection = karte(
  `Der Bildschirm wirft <b>Tageslicht</b> in ein Auge, das gerade Nacht melden soll — und die Meldung bleibt aus.`,
  `<svg viewBox="0 0 400 330" role="img" aria-label="Bildschirmlicht projiziert auf das Auge, Melatonin bleibt aus">
    <path d="M112,84 L296,36 L296,264 L112,216 Z" fill="var(--ueberich-soft)" opacity="0.8"/>
    <rect x="38" y="98" width="74" height="104" rx="7" fill="var(--ich-soft)" stroke="var(--ich)" stroke-width="2.5"/>
    <text class="svglabel" x="75" y="228" font-size="12.5" text-anchor="middle" fill="var(--ich)">BILDSCHIRM</text>
    <ellipse cx="320" cy="150" rx="44" ry="66" fill="var(--card)" stroke="var(--ink)" stroke-width="2.5"/>
    <circle cx="320" cy="150" r="22" fill="var(--es-soft)" stroke="var(--es)" stroke-width="2.5"/>
    <text class="svglabel" x="320" y="244" font-size="12.5" text-anchor="middle" fill="var(--ink)">AUGE</text>
    <text class="svglabel" x="204" y="144" font-size="13" text-anchor="middle" fill="var(--ink)">BLAUES LICHT</text>
    <text class="svglabel" x="204" y="166" font-size="11" text-anchor="middle" fill="var(--muted)">so hell wie Mittag</text>
  </svg>`,
  `Eine Stunde Bildschirm am Abend verschiebt die Melatonin-Ausschüttung um bis zu drei Stunden.`);

const FAELLE = [
  ["1-composition", composition],
  ["2-typology", typology],
  ["3-zone-axis", zoneAxis],
  ["4-projection", projection]
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.setContent('<div class="phone"><div class="topbar"><div class="progress"></div></div><div class="cardarea" id="area"></div></div>');
await page.addStyleTag({ path: repo + "/renderer.css" });
const fehler = [];
page.on("pageerror", (e) => { fehler.push(e.message); console.error("PAGEERROR:", e.message); });

for (const [name, html] of FAELLE) {
  await page.evaluate((h) => { document.getElementById("area").innerHTML = h; }, html);
  await page.waitForTimeout(120);
  await page.locator(".phone").screenshot({ path: `${outdir}/${name}.png` });
  console.log(`${name.padEnd(16)} gezeichnet`);
}
await browser.close();
if (fehler.length) { console.error(`${fehler.length} Seitenfehler`); process.exit(1); }
console.log(`Shots -> ${outdir}`);
