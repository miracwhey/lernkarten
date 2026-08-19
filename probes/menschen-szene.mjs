// Eine Karte mit MENSCHEN und HANDLUNG — Leons nächste Stufe nach der Szenen-Wende.
//
// Was diese Karte beantworten soll: kommen wir an das Niveau heran, auf dem Imprint Menschen
// einsetzt, und was kostet das? Die Werkbank (probes/menschen-werkbank.mjs) hat die Frage
// schon zur Hälfte beantwortet, und die Antwort war unerwartet:
//
// Die Referenz benutzt Menschen in ZWEI Modi. Karte 09 (Sofa) ist der teure — große Figuren
// in Dreiviertel-Ansicht, Kleidungsfalten, einzelne Finger, Brille, Zopf von hinten. Drei
// Anläufe an einer solchen Figur blieben eine Vektor-Figur; das ist Illustrator-Arbeit und
// war nie die Wette. Karte 11 (Pflanze) ist der billige: die zwei Gießenden sind WINZIG neben
// einem Topf, der die halbe Karte füllt, ohne Gesicht und ohne Anatomie. Und sie tragen die
// Karte trotzdem, weil die Handlung nicht im Körper steckt, sondern in der REQUISITE — der
// Wasserstrahl erzählt „gießen", nicht der Arm.
//
// Diese Karte baut deshalb Modus 2: ein großes Trägerobjekt aus dem Thema, kleine Figuren
// darin, jede mit einem Gegenstand in der Hand. Das ist zugleich die Antwort auf die
// Bibliotheks-Frage — ein neues Thema kostet dann eine neue Requisite, keine neue Figur.
//
// Nutzung: node probes/menschen-szene.mjs [outdir=menschen-szene-shots]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { K, klein, eimer, kiste } from "./menschen-formen.mjs";
import { pruefen } from "./beschriftung-pruefen.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = process.argv[2] || "menschen-szene-shots";
mkdirSync(outdir, { recursive: true });

const karte = (text, svg, caption) => `<div class="card">
  <p class="lehrsatz">${text}</p>
  <div class="diagram">${svg}</div>
  ${caption ? `<p class="caption">${caption}</p>` : ""}
</div>`;
const t = (x, y, txt, { size = 12, anchor = "middle", fill = K.ink, weight = 700, deg = 0, op = 1 } = {}) =>
  `<text class="svglabel" x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${fill}"`
  + ` font-weight="${weight}"${op !== 1 ? ` opacity="${op}"` : ""}`
  + `${deg ? ` transform="rotate(${deg} ${x} ${y})"` : ""}>${txt}</text>`;

// ————————————————————— Das Trägerobjekt: ein Kopf im Profil —————————————————————
// Er ist Gegenstand aus dem Thema UND Raum: die Nachtschicht findet in ihm statt. Der erste
// Szenen-Anlauf hatte an einem Profilgesicht ein „Zipfelgesicht" produziert; der Unterschied
// hier ist die Größe — bei dieser Höhe hat jede Kurve (Stirn, Nasenwurzel, Nase, Lippen,
// Kinn, Kiefer) Platz, um als das gelesen zu werden, was sie ist.
// Der Werkstattboden liegt auf HÖHE DER SCHÄDELBASIS, nicht am Kinn. Zweiter Anlauf hatte
// ihn unten im Hals — dort ist ein Profilkopf keine 180 Einheiten breit, die linke Figur
// stand neben der Kontur im Nichts, und darunter blieb ein offener Kasten stehen.
// Oberhalb der Augen ist der Kopf am breitesten; alles darunter bleibt Gesicht und erzählt
// weiter, dass hier jemand schläft.
const BODEN = 224;
// Der Kopf braucht eine EIGENE Fläche. Der erste Anlauf füllte ihn mit `--card` — derselben
// Farbe wie die Karte darunter. Damit war er keine Form, sondern nur eine Kontur auf dem
// Nichts, und der Innenraum las nicht als Raum. Der Prüfer meldete trotzdem „sauber": er
// misst Beschriftung gegen Geometrie, nicht Fläche gegen Untergrund.
// Der Hals läuft bewusst ÜBER die viewBox hinaus (470 > 440): endet er genau auf der Kante,
// zeichnet der Abschlussstrich einen Kasten unter das Kinn. Angeschnitten wird er zum Rand.
// Proportionen nach dem dritten Anlauf korrigiert: dort saß die Augenlinie bei zwei Dritteln
// der Kopfhöhe, wodurch der Schädel schrumpfte und das Gesicht die halbe Karte füllte — ein
// Ballon mit Strichen darin. Bei einem Profil liegt die Augenlinie auf HALBER Höhe; damit ist
// die obere Hälfte Werkstatt und die untere bleibt Gesicht.
const kopfProfil = `
  <path d="M156,470 L150,402 Q146,384 126,374 Q106,364 92,350
           Q78,340 82,330 L78,318
           Q58,312 40,296 Q58,278 66,254 L70,228
           Q74,150 132,104 Q226,44 314,110 Q368,152 362,232
           Q356,300 302,342 Q276,362 268,404 L272,470 Z"
    fill="var(--chrome)" stroke="${K.ink}" stroke-width="3"/>`;
// Geschlossenes Auge, Braue, Ohr: drei Striche, die aus dem Raum einen schlafenden Menschen
// machen. Ohne sie wäre das eine Höhle.
const gesicht = `
  <path d="M78,250 q17,-11 35,-3" fill="none" stroke="${K.ink}" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M80,272 q17,13 35,3" fill="none" stroke="${K.ink}" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M88,284 q6,6 12,5" fill="none" stroke="${K.ink}" stroke-width="1.7" stroke-linecap="round" opacity="0.55"/>
  <path d="M78,336 q12,5 22,1" fill="none" stroke="${K.ink}" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M196,266 q21,-7 25,10 q5,18 -13,20 q-7,1 -9,-5" fill="none" stroke="${K.ink}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M201,281 q9,-2 10,6" fill="none" stroke="${K.ink}" stroke-width="1.6" opacity="0.5"/>`;
// Haar als eigene Fläche auf dem Schädel, wie bei den Figuren — sie gibt dem Kopf die
// Silhouette, die ein reines Oval nicht hat.
const haar = `
  <path d="M70,228 Q74,150 132,104 Q226,44 314,110 Q346,135 358,182
           Q312,116 230,102 Q136,88 86,228 Z" fill="${K.ink}"/>`;

// ————————————————————— Der Raum: Boden, Werkstatt, Staub —————————————————————
// Der erste Anlauf ließ den Innenraum leer und stellte drei Figuren an den unteren Rand —
// eine Bühne ohne Bühnenbild. Eine Werkstatt braucht das Zeug, mit dem gearbeitet wird:
// Leitungen, aus denen gespült wird, Regale, in die eingeräumt wird, Ventile, an denen
// gestellt wird. Jedes Stück gehört zu genau einer der drei Arbeiten.
const raum = `
  <!-- Leitung an der Stirninnenseite: von hier kommt die Spülung -->
  <path d="M84,140 q24,16 26,44 q2,20 -4,32" fill="none" stroke="${K.ink}" stroke-width="3.2" opacity="0.75"/>
  <path d="M106,196 h12" stroke="${K.ink}" stroke-width="2.2"/>
  <circle cx="124" cy="196" r="6" fill="var(--ich-soft)" stroke="${K.ink}" stroke-width="2"/>
  <!-- Regalwand am Hinterkopf: hierhin wandern die Kisten des Tages -->
  <path d="M256,156 h72 M256,192 h72" stroke="${K.ink}" stroke-width="2.6" stroke-linecap="round"/>
  ${[[262, 156, 18, 13], [286, 156, 21, 15], [312, 156, 14, 10],
     [262, 192, 21, 15], [289, 192, 17, 12]].map(([bx, by, bw, bh]) =>
    `<rect x="${bx}" y="${by - bh}" width="${bw}" height="${bh}"
       fill="var(--ueberich-soft)" stroke="${K.ink}" stroke-width="1.8"/>`).join("")}
  <line x1="70" y1="${BODEN}" x2="344" y2="${BODEN}" stroke="${K.ink}" stroke-width="2.8"/>
  ${Array.from({ length: 12 }, (_, i) =>
    `<line x1="${82 + i * 22}" y1="${BODEN + 2}" x2="${76 + i * 22}" y2="${BODEN + 11}"
       stroke="${K.line}" stroke-width="1.7"/>`).join("")}
  <!-- Staubflocken, die noch nicht weggespült sind: Kleinkram, der nichts erklärt -->
  <circle cx="176" cy="211" r="2.6" fill="${K.line}"/>
  <circle cx="189" cy="217" r="1.8" fill="${K.line}"/>
  <circle cx="212" cy="213" r="2.2" fill="${K.line}"/>`;

// Requisite Nummer drei: ein Handrad an einem Rohr. „Stellt die Hormone" braucht einen
// Gegenstand, den man DREHT — ein Etikett hätte dieselbe Aussage behauptet statt gezeigt.
const handrad = (x, y, u = 1, f = 1) => {
  const g = (v) => +(v * u).toFixed(1);
  return `<g>
    <path d="M${x + g(3) * f},${y + g(6)} v${g(16)}" stroke="${K.ink}" stroke-width="${g(4)}" stroke-linecap="round"/>
    <circle cx="${x + g(3) * f}" cy="${y + g(2)}" r="${g(9)}" fill="none" stroke="${K.ink}" stroke-width="${g(2.6)}"/>
    <path d="M${x + g(3) * f},${y - g(7)} v${g(18)} M${x - g(6) * f},${y + g(2)} h${g(18) * f}"
      stroke="${K.ink}" stroke-width="${g(1.8)}"/>
  </g>`;
};

// ————————————————————— Die drei Arbeiten —————————————————————
// Jede ist eine Figur mit einem Gegenstand, und der Gegenstand ist die Aussage. Die
// Beschriftung sagt, WAS die Handlung bewirkt — ganze Sätze, wie in der Referenz, keine
// Etiketten.
// `kastenY` ist die Oberkante des Callout-Kastens, `leader` seine Ankerseite an der Figur.
// Der erste Anlauf setzte die Sätze frei in den Innenraum — sie schwebten, und keiner war
// einer Figur zuzuordnen. Die Referenz macht es umgekehrt: gefüllter Kasten plus dünne Linie
// zur Stelle, die er meint (Befund 1 der Analyse, Primitive 1 und 2).
// Die Kästen steigen von links unten nach rechts oben, damit kein Leader einen anderen
// kreuzt — der zweite Anlauf hatte sie frei verteilt, und zwei Linien liefen quer durch einen
// fremden Kasten und über eine fremde Figur.
const FIGURH = 48;
// Zwei Figuren, nicht drei. Der dritte Anlauf hatte drei Arbeiten nebeneinander und war damit
// wieder ein Raster; die Referenz setzt auf ihrer Menschen-Karte genau ZWEI, und die beiden
// tun dasselbe an einem gemeinsamen Gegenstand. Die dritte Aussage („stellt die Hormone")
// trägt jetzt der Lehrsatz — das ist ihr Ort, nicht das Bild.
const ARBEIT = [
  { x: 132, stoff: "var(--ich-soft)", farbe: "var(--ich)", ton: "var(--ich-soft)", winkel: 44,
    requisite: eimer({ strahl: 13 }), zeilen: ["spült weg, was", "der Tag ablegt"], kastenX: 74, kastenY: 104 },
  { x: 240, stoff: "var(--es-soft)", farbe: "var(--es)", winkel: 62, zopf: true, ton: "var(--es-soft)",
    requisite: kiste(""), zeilen: ["räumt ein,", "was bleiben soll"], kastenX: 196, kastenY: 66 },
];
const callout = (a) => {
  const w = 104, h = a.zeilen.length * 14 + 10;
  return `<line x1="${a.kastenX + w / 2}" y1="${a.kastenY + h}" x2="${a.x + 2}" y2="${BODEN - FIGURH + 4}"
      stroke="${K.ink}" stroke-width="1.4" opacity="0.75"/>
    <rect x="${a.kastenX}" y="${a.kastenY}" width="${w}" height="${h}" rx="3"
      fill="${a.ton}" stroke="${a.farbe}" stroke-width="1.8"/>
    ${a.zeilen.map((z, i) => t(a.kastenX + w / 2, a.kastenY + 16 + i * 14, z, { size: 10, fill: K.ink, weight: 700 })).join("")}`;
};

const szene = karte(
  `Während du schläfst, ist niemand untätig: der <b>Nachtdienst</b> spült, räumt ein und stellt nach — und keine dieser Arbeiten läuft, solange du wach bist.`,
  `<svg viewBox="0 0 400 440" role="img" aria-label="Kopf im Profil als Werkstatt, in der drei kleine Figuren arbeiten">
    ${t(360, 44, "Z", { size: 19, fill: K.muted, deg: -14, op: 0.8 })}
    ${t(380, 70, "z", { size: 13, fill: K.muted, deg: -10, op: 0.65 })}
    ${kopfProfil}
    ${haar}
    ${gesicht}
    ${raum}
    ${ARBEIT.map((a) => callout(a)).join("")}
    ${ARBEIT.map((a) => klein(a.x, BODEN, FIGURH, {
      stoff: a.stoff, armWinkel: a.winkel, zopf: a.zopf, requisite: a.requisite,
    })).join("")}
  </svg>`,
  `Erst im Tiefschlaf öffnen sich die Spalten zwischen den Zellen — die Spülung braucht den Zustand, den ein Nickerchen nicht erreicht.`);

const FAELLE = [["1-nachtdienst", szene]];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 }, deviceScaleFactor: 2 });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.setContent('<div class="phone"><div class="topbar"><div class="progress"></div></div><div class="cardarea" id="area"></div></div>');
await page.addStyleTag({ path: repo + "/renderer.css" });
const fehler = [];
page.on("pageerror", (e) => { fehler.push(e.message); console.error("PAGEERROR:", e.message); });

let befundeGesamt = 0;
for (const [name, html] of FAELLE) {
  await page.evaluate((h) => { document.getElementById("area").innerHTML = h; }, html);
  await page.waitForTimeout(120);
  await page.locator(".phone").screenshot({ path: `${outdir}/${name}.png` });
  const befunde = await pruefen(page);
  befundeGesamt += befunde.length;
  console.log(`${name.padEnd(16)} ${befunde.length ? `${befunde.length} Befund(e)` : "sauber"}`);
  befunde.forEach((b) => console.log(`   ${b}`));
}
await browser.close();
if (fehler.length) { console.error(`${fehler.length} Seitenfehler`); process.exit(1); }
console.log(`\nShots -> ${outdir}${befundeGesamt ? ` — ${befundeGesamt} Beschriftungs-Befund(e)` : ""}`);
