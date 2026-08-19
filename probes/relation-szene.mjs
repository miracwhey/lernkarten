// Die vier Relationen als SZENE statt als Schaubild — zweite Runde.
//
// Warum überhaupt neu (erster Entwurf: probes/relation-mockup.mjs): dort waren die vier
// Relationen nach dem Kriterium „konstruierbar ohne Illustrator" ausgewählt UND gezeichnet.
// Damit stand das Ergebnis vorher fest — Ring, Balken, drei Formen in einer Reihe, Kegel.
// Leons Urteil (19.08.): „da fehlt Liebe, Detail und Sinn, nicht nur Geometrie". Das ist
// dieselbe Kritik-Klasse wie am 14.08. bei den Assets („Andeutung statt gestaltetes
// Objekt"): der Filter hat die Individualität wegsortiert.
//
// Was die Referenz tatsächlich tut (alle 12 Karten in docs/referenz-imprint/shots gesichtet):
//   1. Der Bildkörper ist ein GEGENSTAND aus dem Thema, kein Schema darüber — Blumentopf für
//      Beziehungen, Fuß im Wasser für Gesprächstiefe, drei Schuhe auf Häusern für Verachtung.
//      Nur 2 von 12 sind reine Geometrie, und die eine lässt die Form selbst die Metapher
//      tragen (der schwarze Klecks IST ein Schatten).
//   2. Die FOLGE ist mitgezeichnet: Risse in den Häusern, umgestürzte Blumentöpfe.
//   3. Beschriftung liegt AUF dem Objekt und folgt seiner Neigung.
//   4. Es passiert etwas: zwei Menschen gießen, ein Fuß tritt ins Wasser.
//   5. Kleinkram, der nichts erklärt — Gänseblümchen, Wellenringe, Schuhnähte, Trümmer.
//      Das ist die „Liebe": sie kostet Striche, keine Logik.
//   6. Konkrete Sätze im Bild statt Etiketten („macht das Feuern wahrscheinlicher").
//   7. Kontur plus Farbfläche, teils versetzt (Risograph-Fehldruck).
//   8. Das Motiv füllt die Fläche und wird am Rand angeschnitten.
//
// Bausteine sind in probes/formen-werkbank.mjs einzeln geprüft, bevor sie hier klein
// zwischen Text sitzen — der erste Anlauf hatte eine kaputte Mondsichel (Innenradius kleiner
// als die halbe Sehne, der Browser skaliert stillschweigend hoch), eine Hand, die als
// Klumpen las, und ein Profilgesicht ohne Kinn. Der Mond ist repariert, Hand und Profil sind
// ersetzt: Hände braucht keine dieser Karten, und statt eines Gesichts steht jetzt ein
// AUSSCHNITT — ein großes Auge, wie die Referenz Gefühle als Augen- und Mundpartie zeigt.
//
// Gleiche Inhalte wie im ersten Entwurf, damit das Delta am Bild liegt und nicht am Thema.
// ZIEL-Rendertechnik: Karten-Hülle, renderer.css, Palette, echte Textmaße.
//
// Nutzung: node probes/relation-szene.mjs [outdir=relation-szene-shots]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = process.argv[2] || "relation-szene-shots";
mkdirSync(outdir, { recursive: true });

const karte = (text, svg, caption) => `<div class="card">
  <p class="lehrsatz">${text}</p>
  <div class="diagram">${svg}</div>
  ${caption ? `<p class="caption">${caption}</p>` : ""}
</div>`;

// ————————————————————————— Zeichen-Werkzeug —————————————————————————
const K = { ink: "var(--ink)", muted: "var(--muted)", line: "var(--line)", card: "var(--card)", chrome: "var(--chrome)" };
const t = (x, y, txt, { size = 12, anchor = "middle", fill = K.ink, weight = 700, deg = 0, op = 1 } = {}) =>
  `<text class="svglabel" x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${fill}"`
  + ` font-weight="${weight}"${op !== 1 ? ` opacity="${op}"` : ""}`
  + `${deg ? ` transform="rotate(${deg} ${x} ${y})"` : ""}>${txt}</text>`;
// Sichel aus zwei Bögen: der Innenbogen ist FLACHER als der Außenbogen. Wäre sein Radius
// kleiner als die halbe Sehne, dürfte der Browser ihn hochskalieren — dann liegen beide
// Bögen aufeinander und übrig bleibt ein Strich (der Fehler der ersten Runde).
const mond = (x, y, r, fill = "var(--ueberich-soft)", stroke = "var(--ueberich)", bauch = 1.15) => {
  const dy = r * 0.96, dx = r * 0.28, R = r * bauch;
  return `<path d="M${(x + dx).toFixed(1)},${(y - dy).toFixed(1)} A${r},${r} 0 1 0 ${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`
    + ` A${R.toFixed(1)},${R.toFixed(1)} 0 0 1 ${(x + dx).toFixed(1)},${(y - dy).toFixed(1)} Z"`
    + ` fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
};
const stern = (x, y, r = 3, fill = K.muted) =>
  `<path d="M${x},${y - r} L${x + r * 0.26},${y - r * 0.26} L${x + r},${y} L${x + r * 0.26},${y + r * 0.26}`
  + ` L${x},${y + r} L${x - r * 0.26},${y + r * 0.26} L${x - r},${y} L${x - r * 0.26},${y - r * 0.26} Z" fill="${fill}"/>`;
// Schattenschraffur, wie in der Referenz unter Möbeln: kurze Parallelen, flach liegend.
const schraffur = (x, y, n, len = 14, dx = 9, stroke = K.line) =>
  Array.from({ length: n }, (_, i) =>
    `<line x1="${(x + i * dx).toFixed(1)}" y1="${y}" x2="${(x + i * dx - len * 0.55).toFixed(1)}" y2="${(y + len).toFixed(1)}"`
    + ` stroke="${stroke}" stroke-width="1.7"/>`).join("");

// ═══════════════ 1 — composition: der Wecker ═══════════════
// „Eine Nacht besteht aus drei Schlafarten." Die Anteile brauchen einen Kreis — aber ein
// Kreis muss kein Kuchendiagramm sein. Hier ist er das Zifferblatt eines Weckers: ein Ding,
// das auf dem Nachttisch steht und selbst von der Nacht erzählt. Glocken, Standfüße,
// Minutenstriche, Zeiger und Aufziehschraube gehören zum Gegenstand, nicht zur Aussage.
const W = { cx: 200, cy: 232, r: 136, rk: 48 };
const TEILE = [["LEICHT", "ich", 50], ["TIEF", "ueberich", 25], ["REM", "es", 25]];
const SUM = TEILE.reduce((s, x) => s + x[2], 0);
const winkel = (i) => {
  const vor = TEILE.slice(0, i).reduce((s, x) => s + x[2], 0);
  return [(vor / SUM) * 2 * Math.PI - Math.PI / 2, ((vor + TEILE[i][2]) / SUM) * 2 * Math.PI - Math.PI / 2];
};
const pol = (a, rad) => [W.cx + Math.cos(a) * rad, W.cy + Math.sin(a) * rad];
const p2 = (a, rad) => pol(a, rad).map((v) => v.toFixed(1)).join(",");
const RING_A = W.r - 20;                       // Sektoren enden vor der Gehäusekante:
const sektor = (i) => {                        // der Streifen dazwischen trägt die Minutenstriche
  const [a0, a1] = winkel(i), farbe = TEILE[i][1], gross = a1 - a0 > Math.PI ? 1 : 0;
  return `<path d="M${p2(a0, RING_A)} A${RING_A},${RING_A} 0 ${gross} 1 ${p2(a1, RING_A)}`
    + ` L${p2(a1, W.rk)} A${W.rk},${W.rk} 0 ${gross} 0 ${p2(a0, W.rk)} Z"`
    + ` fill="var(--${farbe}-soft)" stroke="var(--${farbe})" stroke-width="2.5"/>`;
};
const sektorText = (i) => {
  const [a0, a1] = winkel(i), a = (a0 + a1) / 2;
  const [x, y] = pol(a, W.rk + (RING_A - W.rk) * 0.52);
  return t(x, y - 2, TEILE[i][0], { size: 13 })
    + t(x, y + 15, `${TEILE[i][2]} %`, { size: 11, fill: `var(--${TEILE[i][1]})` });
};
const ticks = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * 2 * Math.PI - Math.PI / 2, lang = i % 2 === 0;
  return `<line x1="${p2(a, W.r - 7).split(",")[0]}" y1="${p2(a, W.r - 7).split(",")[1]}"`
    + ` x2="${p2(a, W.r - (lang ? 17 : 12)).split(",")[0]}" y2="${p2(a, W.r - (lang ? 17 : 12)).split(",")[1]}"`
    + ` stroke="${K.ink}" stroke-width="${lang ? 2 : 1.3}" opacity="${lang ? 0.75 : 0.45}"/>`;
}).join("");
const composition = karte(
  `Eine Nacht ist kein Zustand, sondern <b>drei Schlafarten</b>, die einander ablösen — fehlt eine, fehlt ihre Arbeit.`,
  `<svg viewBox="0 0 400 440" role="img" aria-label="Weckerzifferblatt, in drei Schlafphasen aufgeteilt">
    ${mond(40, 38, 23)}
    ${stern(84, 24, 3)}${stern(22, 84, 2.3)}${stern(96, 62, 2)}
    ${t(340, 40, "Z", { size: 21, fill: K.muted, deg: -14, op: 0.85 })}
    ${t(362, 68, "z", { size: 14, fill: K.muted, deg: -10, op: 0.7 })}
    ${t(378, 90, "z", { size: 10, fill: K.muted, op: 0.55 })}
    <!-- Bügel und Glocken, hinter dem Gehäuse -->
    <path d="M${W.cx - 122},${W.cy - 108} a40,40 0 0 1 59,-35" fill="none" stroke="${K.ink}" stroke-width="2.5"/>
    <path d="M${W.cx + 122},${W.cy - 108} a40,40 0 0 0 -59,-35" fill="none" stroke="${K.ink}" stroke-width="2.5"/>
    <path d="M${W.cx - 155},${W.cy - 87} a33,28 0 0 1 66,0 z" fill="${K.chrome}" stroke="${K.ink}" stroke-width="2.5"/>
    <path d="M${W.cx + 89},${W.cy - 87} a33,28 0 0 1 66,0 z" fill="${K.chrome}" stroke="${K.ink}" stroke-width="2.5"/>
    <line x1="${W.cx}" y1="${W.cy - 150}" x2="${W.cx}" y2="${W.cy - 127}" stroke="${K.ink}" stroke-width="2.5"/>
    <circle cx="${W.cx}" cy="${W.cy - 155}" r="7.6" fill="${K.chrome}" stroke="${K.ink}" stroke-width="2.5"/>
    <!-- Aufziehschraube rechts hinten: Requisit ohne Aussage -->
    <line x1="${W.cx + 131}" y1="${W.cy - 40}" x2="${W.cx + 152}" y2="${W.cy - 52}" stroke="${K.ink}" stroke-width="2.5"/>
    <circle cx="${W.cx + 156}" cy="${W.cy - 54}" r="6.5" fill="${K.chrome}" stroke="${K.ink}" stroke-width="2.2"/>
    <!-- Füße, nach außen gestellt, Schatten darunter -->
    <path d="M${W.cx - 84},${W.cy + 115} l-21,45 h28 z" fill="${K.chrome}" stroke="${K.ink}" stroke-width="2.5"/>
    <path d="M${W.cx + 84},${W.cy + 115} l21,45 h-28 z" fill="${K.chrome}" stroke="${K.ink}" stroke-width="2.5"/>
    <ellipse cx="${W.cx}" cy="${W.cy + 166}" rx="104" ry="7" fill="${K.ink}" opacity="0.1"/>
    <!-- Gehäuse: Farbfläche einen Hauch versetzt unter der Kontur (Fehldruck-Look) -->
    <circle cx="${W.cx + 4}" cy="${W.cy + 4}" r="${W.r}" fill="${K.chrome}"/>
    <circle cx="${W.cx}" cy="${W.cy}" r="${W.r}" fill="${K.card}" stroke="${K.ink}" stroke-width="3"/>
    <circle cx="${W.cx}" cy="${W.cy}" r="${W.r - 9}" fill="none" stroke="${K.ink}" stroke-width="1.4" opacity="0.35"/>
    ${ticks}
    ${TEILE.map((_, i) => sektor(i)).join("\n    ")}
    <!-- Der Kern bleibt leer und die Zeiger kommen aus der Mitte: zwei Striche, die am
         Kernrand ansetzen, lesen sich als Marken, nicht als Uhrzeiger. Beide liegen im
         großen Sektor, wo kein Label steht — welche Richtung frei ist, sagt die Messung am
         Ende dieser Datei, nicht das Augenmaß. Dass die Nacht das GANZE ist, sagt der
         Lehrsatz; ein Wort in der Zifferblattmitte wiederholt es nur. -->
    <circle cx="${W.cx}" cy="${W.cy}" r="${W.rk}" fill="${K.card}" stroke="${K.ink}" stroke-width="2.5"/>
    ${[[-68, 92, 3.6], [74, 104, 2.6]].map(([deg, len, sw]) => {
      const a = deg * Math.PI / 180;
      const [x2, y2] = pol(a, len);
      return `<line x1="${W.cx}" y1="${W.cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"`
        + ` stroke="${K.ink}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }).join("\n    ")}
    <circle cx="${W.cx}" cy="${W.cy}" r="6" fill="${K.ink}"/>
    <circle cx="${W.cx}" cy="${W.cy}" r="2" fill="${K.card}"/>
    ${TEILE.map((_, i) => sektorText(i)).join("\n    ")}
  </svg>`,
  `Der Anteil verschiebt sich über die Nacht — Tiefschlaf früh, REM gegen Morgen.`);

// ═══════════════ 2 — typology: die Schalterwand ═══════════════
// „Es gibt N Sorten, jede erkennst du an Y." Die Referenz zeigt Sorten nie als abstrakte
// Formen, sondern an dem, was sie TUN — drei Schuhe, die auf Häuser treten; zwei
// Gesichtspartien je Gefühl. Hier: dieselbe Wand, dieselbe Bauart, drei Stellungen — und
// die Lampe darunter zeigt das Ergebnis. Die Sorte IST die Wirkung.
const SORTEN = [
  { x: 68, name: "ERREGEND", farbe: "es", art: "an", w1: "macht das Feuern", w2: "wahrscheinlicher" },
  { x: 200, name: "HEMMEND", farbe: "ich", art: "aus", w1: "hält das Feuern", w2: "zurück" },
  { x: 332, name: "MODULIEREND", farbe: "ueberich", art: "dimm", w1: "verstellt, wie stark", w2: "beide wirken" }
];
const P_Y = 148, L_Y = 320;
const kippschalter = (x, y, an, farbe) => {
  const soft = `var(--${farbe}-soft)`;
  return `<rect x="${x - 26}" y="${y - 34}" width="52" height="68" rx="6" fill="${K.chrome}" stroke="${K.ink}" stroke-width="2.5"/>
    <rect x="${x - 19}" y="${y - 27}" width="38" height="54" rx="4" fill="${K.card}" stroke="${K.ink}" stroke-width="1.8"/>
    ${an
      ? `<path d="M${x - 19},${y + 8} h38 l-7,-35 h-24 z" fill="${soft}" stroke="${K.ink}" stroke-width="2.4"/>`
      : `<path d="M${x - 19},${y - 8} h38 l-7,35 h-24 z" fill="${soft}" stroke="${K.ink}" stroke-width="2.4"/>`}
    ${t(x, an ? y + 24 : y - 14, an ? "AN" : "AUS", { size: 9, fill: `var(--${farbe})` })}`;
};
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
// Strahlen nur zur Seite und nach unten: oben sitzt das Kabel, und ein Strahl, der es
// kreuzt, sah in der ersten Runde nach Zeichenfehler aus.
const lampe = (x, y, zustand, farbe) => {
  const glas = zustand === "an" ? `var(--${farbe}-soft)` : zustand === "halb" ? "var(--ueberich-soft)" : K.card;
  const n = zustand === "an" ? 5 : zustand === "halb" ? 3 : 0, len = zustand === "an" ? 15 : 9;
  return `<g>
    <path d="M${x - 11},${y - 34} h22 l-2,13 h-18 z" fill="${K.chrome}" stroke="${K.ink}" stroke-width="2.2"/>
    <line x1="${x - 10}" y1="${y - 27}" x2="${x + 10}" y2="${y - 27}" stroke="${K.ink}" stroke-width="1.2" opacity="0.5"/>
    <circle cx="${x}" cy="${y}" r="24" fill="${glas}" stroke="${K.ink}" stroke-width="2.5"/>
    <path d="M${x - 8},${y - 12} v10 q8,10 16,0 v-10" fill="none" stroke="${K.ink}" stroke-width="1.6" opacity="0.7"/>
    <path d="M${x - 4},${y + 7} q4,5 8,0" fill="none" stroke="${K.ink}" stroke-width="1.4" opacity="0.5"/>
    ${Array.from({ length: n }, (_, i) => {
      // Strahlen nur zur Seite und nach unten: oben sitzt das Kabel, und ein Strahl, der es
      // kreuzt, sah in der ersten Runde nach Zeichenfehler aus.
      const a = (18 + i * (144 / Math.max(1, n - 1))) * Math.PI / 180;
      return `<line x1="${(x + Math.cos(a) * 31).toFixed(1)}" y1="${(y + Math.sin(a) * 31).toFixed(1)}"`
        + ` x2="${(x + Math.cos(a) * (31 + len)).toFixed(1)}" y2="${(y + Math.sin(a) * (31 + len)).toFixed(1)}"`
        + ` stroke="var(--${zustand === "halb" ? "ueberich" : farbe})" stroke-width="2.2" stroke-linecap="round"/>`;
    }).join("")}
  </g>`;
};
// Die Schalterwand war sauber gezeichnet und trotzdem der schwächste Entwurf: eine
// Alltagsmetapher, die vom Thema wegführt, statt es zu zeigen. Die Referenz macht es anders
// — Karte 07 zeigt drei Gefühle als dreimal DASSELBE Objekt (Auge, Mund) in drei Zuständen.
// Also dreimal dieselbe Zelle, und die Reaktion ist mitgezeichnet: eine feuert, eine bleibt
// still, eine feuert gedämpft. Die Sorte erkennt man an der Zelle, nicht an einem Sinnbild.
const zelle = (x, y, zustand, farbe) => {
  const f = `var(--${farbe})`, soft = `var(--${farbe}-soft)`;
  const soma = zustand === "an" ? soft : zustand === "halb" ? "var(--ueberich-soft)" : K.card;
  // Dendriten: drei Äste, jeder einmal gegabelt. Ein einzelner Strich wäre eine Andeutung.
  const dendrit = (deg, len) => {
    const a = deg * Math.PI / 180, x1 = x + Math.cos(a) * 22, y1 = y + Math.sin(a) * 22;
    const x2 = x + Math.cos(a) * (22 + len), y2 = y + Math.sin(a) * (22 + len);
    const g = (dd, l) => {
      const b = (deg + dd) * Math.PI / 180;
      return `<line x1="${x2.toFixed(1)}" y1="${y2.toFixed(1)}" x2="${(x2 + Math.cos(b) * l).toFixed(1)}"`
        + ` y2="${(y2 + Math.sin(b) * l).toFixed(1)}" stroke="${K.ink}" stroke-width="1.8" stroke-linecap="round"/>`;
    };
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"`
      + ` stroke="${K.ink}" stroke-width="2.2" stroke-linecap="round"/>${g(-30, 11)}${g(28, 9)}`;
  };
  return `<g>
    ${[-168, -132, -90, -48, -12].map((d, i) => dendrit(d, [22, 30, 34, 30, 22][i])).join("")}
    <!-- Axon nach unten, mit Endknöpfchen: der Weg, auf dem die Zelle antwortet -->
    <path d="M${x},${y + 24} v38 q0,11 10,13" fill="none" stroke="${K.ink}" stroke-width="2.4"/>
    <circle cx="${x + 15}" cy="${y + 77}" r="5.5" fill="${zustand === "aus" ? K.card : soft}" stroke="${K.ink}" stroke-width="2"/>
    <circle cx="${x}" cy="${y}" r="26" fill="${soma}" stroke="${K.ink}" stroke-width="2.6"/>
    <circle cx="${x}" cy="${y}" r="10" fill="none" stroke="${K.ink}" stroke-width="1.5" opacity="0.45"/>
    ${zustand === "an" ? [33, 43].map((r, i) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${f}" stroke-width="${2 - i * 0.5}"
           opacity="${0.65 - i * 0.25}"/>`).join("")
      : zustand === "halb" ? `<circle cx="${x}" cy="${y}" r="34" fill="none" stroke="var(--ueberich)"
           stroke-width="1.8" stroke-dasharray="5 6" opacity="0.75"/>`
      // Riegel AUF dem Axon, nicht daneben: ein Sperrzeichen, das neben dem Weg schwebt,
      // sperrt nichts. Zwei Querstriche über der Leitung lesen sich als „hier ist Schluss".
      : `<line x1="${x - 11}" y1="${y + 44}" x2="${x + 11}" y2="${y + 40}" stroke="${f}" stroke-width="3" stroke-linecap="round"/>
         <line x1="${x - 11}" y1="${y + 53}" x2="${x + 11}" y2="${y + 49}" stroke="${f}" stroke-width="3" stroke-linecap="round"/>`}
    <!-- Das ankommende Signal: ein Pfeil in der Farbe seiner Sorte -->
    <path d="M${x - 46},${y - 54} l26,26" stroke="${f}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M${x - 26},${y - 22} l-3,-11 l11,3 z" fill="${f}"/>
    <circle cx="${x - 50}" cy="${y - 58}" r="6" fill="${soft}" stroke="${f}" stroke-width="2"/>
  </g>`;
};
const typology = karte(
  `Nicht jedes Signal will dasselbe: <b>drei Sorten</b> treffen auf dieselbe Zelle — und du erkennst sie an ihrer Wirkung.`,
  `<svg viewBox="0 0 400 440" role="img" aria-label="Dreimal dieselbe Nervenzelle: eine feuert, eine bleibt still, eine feuert gedämpft">
    ${SORTEN.map((s) => t(s.x, 44, s.name, { size: 11.5, fill: `var(--${s.farbe})` })).join("\n    ")}
    ${SORTEN.map((s) => zelle(s.x, 168, s.art === "dimm" ? "halb" : s.art, s.farbe)).join("\n    ")}
    ${SORTEN.map((s) => t(s.x, 316, s.w1, { size: 10.5, fill: K.muted, weight: 600 })
      + t(s.x, 332, s.w2, { size: 10.5, fill: K.muted, weight: 600 })).join("\n    ")}
    <!-- Trennlinien: drei Fälle, nicht ein Ablauf -->
    <line x1="134" y1="30" x2="134" y2="344" stroke="${K.line}" stroke-width="1.5"/>
    <line x1="266" y1="30" x2="266" y2="344" stroke="${K.line}" stroke-width="1.5"/>
  </svg>`,
  `Dieselbe Zelle, drei Absender — die Summe entscheidet.`);

// ═══════════════ 3 — zone-axis: die Nachtstraße ═══════════════
// „Zwischen A und B liegen benannte Bereiche." Der erste Entwurf war ein Balken mit drei
// Kästchen. Die Karte handelt aber vom Heimfahren — also ist die Strecke eine STRASSE, die
// Zonen sind Abschnitte, und die Marke ist ein Auto, das gerade dort fährt. Die Laternen
// gehen nach rechts aus und die Mittelstreifen werden kürzer: die Erschöpfung, die die Karte
// behauptet, steckt in der Zeichnung, nicht nur in den Wörtern.
const S = { y: 268, h: 84, x0: -8, x1: 408 };
// Der dritte Zonenname sitzt nicht in der Mitte seines Abschnitts: dort fährt das Auto, und
// in der ersten Runde stand „ÜBERMÜDET" zur Hälfte hinter der Karosserie. Ein Label, das
// sich den Platz mit einem Gegenstand teilt, verliert — also bekommt es einen eigenen.
const ZONEN = [["FRISCH", "ich", 0.34, 0.5], ["TRÄGE", "ueberich", 0.30, 0.5], ["ÜBERMÜDET", "es", 0.36, 0.2]];
let zx = S.x0;
const strasse = ZONEN.map(([name, farbe, anteil, wo]) => {
  const w = (S.x1 - S.x0) * anteil, x = zx; zx += w;
  return `<rect x="${x.toFixed(1)}" y="${S.y}" width="${w.toFixed(1)}" height="${S.h}"
      fill="var(--${farbe}-soft)" stroke="var(--${farbe})" stroke-width="2"/>
    ${t(x + w * wo, S.y + 28, name, { size: 12.5 })}`;
}).join("\n    ");
const mittelstreifen = Array.from({ length: 13 }, (_, i) => {
  const x = 4 + i * 32, len = 21 - i * 1.1;
  return `<line x1="${x}" y1="${S.y + 54}" x2="${x + len}" y2="${S.y + 54}"
    stroke="${K.card}" stroke-width="4" stroke-linecap="round" opacity="${(0.95 - i * 0.045).toFixed(2)}"/>`;
}).join("");
const laterne = (x, an) => `<g>
    ${an ? `<path d="M${x + 17},${S.y - 84} l-22,${84} h44 z" fill="var(--ueberich-soft)" opacity="0.45"/>` : ""}
    <line x1="${x}" y1="${S.y}" x2="${x}" y2="${S.y - 96}" stroke="${K.ink}" stroke-width="2.6"/>
    <path d="M${x},${S.y - 96} q0,-14 16,-14" fill="none" stroke="${K.ink}" stroke-width="2.6"/>
    <ellipse cx="${x + 18}" cy="${S.y - 108}" rx="8" ry="5.5" fill="${an ? "var(--ueberich-soft)" : K.chrome}"
      stroke="${K.ink}" stroke-width="2"/>
  </g>`;
// Auto von hinten, am rechten Rand angeschnitten — es fährt aus dem Bild, und der Zonenname
// bleibt lesbar (in der ersten Runde stand das Auto darauf).
// Etwas kleiner und weniger weit angeschnitten: bei x=390 blieb vom Auto ein Fragment, bei
// x=368 überdeckte es den Zonennamen. Zone (150 breit), Name (80) und Auto (68) gehen
// zusammen auf — aber nur knapp, und das entscheidet die Messung, nicht das Gefühl.
const A = { x: 364, y: S.y + 30 };
const auto = `<g transform="translate(${A.x} ${A.y}) scale(0.86) translate(${-A.x} ${-A.y})">
    <ellipse cx="${A.x - 4}" cy="${A.y + 30}" rx="46" ry="6" fill="${K.ink}" opacity="0.14"/>
    <path d="M${A.x - 36},${A.y - 4} l8,-24 h50 l8,24 z" fill="var(--es-soft)" stroke="${K.ink}" stroke-width="2.5"/>
    <rect x="${A.x - 24}" y="${A.y - 26}" width="44" height="20" rx="3" fill="${K.card}" stroke="${K.ink}" stroke-width="2"/>
    <rect x="${A.x - 40}" y="${A.y - 6}" width="80" height="30" rx="7" fill="var(--es)" stroke="${K.ink}" stroke-width="2.5"/>
    <rect x="${A.x - 36}" y="${A.y + 2}" width="11" height="8" rx="2.5" fill="var(--ueberich-soft)" stroke="${K.ink}" stroke-width="1.5"/>
    <rect x="${A.x + 25}" y="${A.y + 2}" width="11" height="8" rx="2.5" fill="var(--ueberich-soft)" stroke="${K.ink}" stroke-width="1.5"/>
    <circle cx="${A.x - 24}" cy="${A.y + 26}" r="10" fill="${K.ink}"/>
    <circle cx="${A.x - 24}" cy="${A.y + 26}" r="4" fill="${K.chrome}"/>
    <circle cx="${A.x + 26}" cy="${A.y + 26}" r="10" fill="${K.ink}"/>
    <circle cx="${A.x + 26}" cy="${A.y + 26}" r="4" fill="${K.chrome}"/>
    <circle cx="${A.x - 54}" cy="${A.y + 14}" r="4.5" fill="none" stroke="${K.muted}" stroke-width="1.5" opacity="0.65"/>
    <circle cx="${A.x - 66}" cy="${A.y + 8}" r="2.8" fill="none" stroke="${K.muted}" stroke-width="1.3" opacity="0.45"/>
  </g>`;
const zoneAxis = karte(
  `Zwischen <b>ausgeschlafen</b> und <span class="w-es">übermüdet</span> liegt kein Schalter, sondern eine Strecke — und du merkst erst am Ende, wie weit du gegangen bist.`,
  `<svg viewBox="0 0 400 440" role="img" aria-label="Nachtstraße in drei Abschnitten, ein Auto auf dem letzten Abschnitt">
    <rect x="-8" y="-8" width="416" height="${S.y + 8}" fill="var(--ich-soft)" opacity="0.35"/>
    ${mond(52, 52, 24)}
    ${stern(108, 30, 3)}${stern(146, 68, 2.3)}${stern(92, 92, 2)}${stern(192, 26, 2.4)}${stern(232, 72, 1.9)}
    ${laterne(52, true)}${laterne(158, true)}${laterne(246, false)}
    <!-- Über die Laternenköpfe gesetzt: auf Höhe der Straße kreuzte der Text den Mast der
         dritten Laterne — gemeldet von der Prüfung unten, nicht vom Augenmaß. -->
    ${t(392, 136, "HIER FÄHRST DU HEIM", { size: 11.5, anchor: "end" })}
    <path d="M362,146 v${S.y - 144}" fill="none" stroke="${K.ink}" stroke-width="1.4"/>
    <circle cx="362" cy="${S.y + 4}" r="3" fill="${K.ink}"/>
    ${strasse}
    ${mittelstreifen}
    <line x1="${S.x0}" y1="${S.y}" x2="${S.x1}" y2="${S.y}" stroke="${K.ink}" stroke-width="2.5"/>
    <line x1="${S.x0}" y1="${S.y + S.h}" x2="${S.x1}" y2="${S.y + S.h}" stroke="${K.ink}" stroke-width="2.5"/>
    ${auto}
    ${t(6, S.y + S.h + 28, "0 STUNDEN WACH", { size: 11, anchor: "start", fill: K.muted })}
    ${t(394, S.y + S.h + 28, "19 STUNDEN WACH", { size: 11, anchor: "end", fill: K.muted })}
    <!-- Straßenrand-Kleinkram: drei Grasbüschel und ein Schlagloch. Die Leitpfosten der
         Vorrunde standen als zwei kleine Rechtecke unter dem Bordstein und lasen sich als
         Ziffern — ein Detail, das nach Beschriftung aussieht, ist keins. -->
    ${[36, 128, 296].map((x) => `<path d="M${x},${S.y + S.h + 11} l2,-9 M${x + 5},${S.y + S.h + 11} l0,-11`
      + ` M${x + 10},${S.y + S.h + 11} l4,-8 M${x + 15},${S.y + S.h + 11} l1,-10"`
      + ` stroke="${K.muted}" stroke-width="1.4" fill="none" opacity="0.8"/>`).join("\n    ")}
    <ellipse cx="150" cy="${S.y + S.h - 18}" rx="11" ry="3.8" fill="${K.ink}" opacity="0.13"/>
    <ellipse cx="204" cy="${S.y + S.h - 10}" rx="6" ry="2.4" fill="${K.ink}" opacity="0.1"/>
  </svg>`,
  `Ab 17 Stunden wach reagierst du wie mit 0,5 Promille.`);

// ═══════════════ 4 — projection: das Display im Auge ═══════════════
// „A wirft etwas auf B." Der erste Entwurf hatte ein Rechteck, einen Kegel und eine Ellipse.
// Die Karte handelt aber von jemandem, der abends im Bett liegt — also liegt hier ein Handy
// auf der Decke, und was ankommt, steht nicht nur auf dem Kegel: es SPIEGELT sich in der
// Pupille. Der Mond hängt draußen im Fenster und kommt nicht an. Das ist die Aussage, und
// sie braucht kein weiteres Wort.
const auge = (x, y, s = 1) => {
  const g = (v) => (v * s).toFixed(1);
  return `<g>
    <path d="M${x - +g(58)},${y} q${g(58)},${g(-46)} ${g(116)},0 q${g(-58)},${g(44)} ${g(-116)},0 z"
      fill="${K.card}" stroke="${K.ink}" stroke-width="${(2.6 * s).toFixed(1)}" stroke-linejoin="round"/>
    <clipPath id="apfel"><path d="M${x - +g(58)},${y} q${g(58)},${g(-46)} ${g(116)},0 q${g(-58)},${g(44)} ${g(-116)},0 z"/></clipPath>
    <g clip-path="url(#apfel)">
      <circle cx="${x}" cy="${y - +g(4)}" r="${g(23)}" fill="var(--ich-soft)" stroke="${K.ink}" stroke-width="${(2 * s).toFixed(1)}"/>
      <circle cx="${x}" cy="${y - +g(4)}" r="${g(11)}" fill="${K.ink}"/>
      <rect x="${x - +g(7)}" y="${y - +g(13)}" width="${g(11)}" height="${g(17)}" rx="${g(2)}"
        fill="var(--ueberich-soft)" stroke="var(--ueberich)" stroke-width="${(1.2 * s).toFixed(1)}"/>
    </g>
    <path d="M${x - +g(58)},${y} q${g(58)},${g(-46)} ${g(116)},0" fill="none" stroke="${K.ink}" stroke-width="${(3 * s).toFixed(1)}" stroke-linecap="round"/>
    <path d="M${x - +g(58)},${y} q${g(6)},${g(-13)} ${g(15)},${g(-17)}" fill="none" stroke="${K.ink}" stroke-width="${(2 * s).toFixed(1)}" stroke-linecap="round"/>
    <path d="M${x + +g(22)},${y - +g(31)} q${g(9)},${g(-6)} ${g(18)},${g(-4)}" fill="none" stroke="${K.ink}" stroke-width="${(1.8 * s).toFixed(1)}" stroke-linecap="round"/>
  </g>`;
};
const AU = { x: 286, y: 176 }, HANDY = { x: 40, y: 260 };
const projection = karte(
  `Der Bildschirm wirft <b>Tageslicht</b> in ein Auge, das gerade Nacht melden soll — und die Meldung bleibt aus.`,
  `<svg viewBox="0 0 400 440" role="img" aria-label="Handy auf der Bettdecke, sein Licht trifft ein Auge, in dessen Pupille sich das Display spiegelt">
    <!-- Fenster, am linken Rand angeschnitten und mit Fensterbank: frei schwebend sah es
         aus wie ein hineingelegtes Rechteck. Die Nacht ist da — sie kommt nur nicht an. -->
    <rect x="-8" y="26" width="132" height="108" fill="var(--ich-soft)" stroke="${K.ink}" stroke-width="2.5" opacity="0.6"/>
    <line x1="58" y1="26" x2="58" y2="134" stroke="${K.ink}" stroke-width="2" opacity="0.4"/>
    <line x1="-8" y1="80" x2="124" y2="80" stroke="${K.ink}" stroke-width="2" opacity="0.4"/>
    <path d="M-8,140 h140 l-6,9 h-134 z" fill="${K.chrome}" stroke="${K.ink}" stroke-width="2.2"/>
    ${mond(96, 54, 17)}
    ${stern(28, 48, 2.6)}${stern(34, 108, 2.2)}${stern(102, 110, 2)}
    <!-- Lichtkegel vom Display zum Auge, unter allem anderen. Er endet AM Lid, nicht davor:
         in der Vorrunde blieb eine Lücke, und ein Licht, das sein Ziel nicht berührt,
         behauptet das Gegenteil der Karte. -->
    <path d="M108,256 L${AU.x - 46},${AU.y - 44} L${AU.x - 46},${AU.y + 30} L108,312 Z" fill="var(--ueberich-soft)" opacity="0.9"/>
    <path d="M108,256 L${AU.x - 46},${AU.y - 44}" stroke="var(--ueberich)" stroke-width="1.6" opacity="0.75"/>
    <path d="M108,312 L${AU.x - 46},${AU.y + 30}" stroke="var(--ueberich)" stroke-width="1.6" opacity="0.75"/>
    ${t(178, 232, "BLAUES LICHT", { size: 12.5, deg: -26 })}
    ${t(174, 250, "so hell wie Mittag", { size: 10.5, fill: K.muted, weight: 600, deg: -26 })}
    ${auge(AU.x, AU.y, 0.95)}
    <!-- Bettdecke, angeschnitten, mit Falten und der Kante des Kissens. Das Handy liegt darauf. -->
    <path d="M-8,440 v-92 q86,-32 168,-17 q104,19 248,-9 v118 z" fill="${K.chrome}" stroke="${K.ink}" stroke-width="2.5"/>
    <path d="M14,378 q80,-25 156,-12" fill="none" stroke="${K.line}" stroke-width="1.8"/>
    <path d="M52,404 q88,-21 176,-9" fill="none" stroke="${K.line}" stroke-width="1.6"/>
    <path d="M246,356 q66,6 116,-5" fill="none" stroke="${K.line}" stroke-width="1.6"/>
    <path d="M120,428 q70,-18 148,-9" fill="none" stroke="${K.line}" stroke-width="1.5"/>
    <path d="M286,392 q52,4 90,-4" fill="none" stroke="${K.line}" stroke-width="1.5"/>
    <g transform="rotate(-13 ${HANDY.x + 31} ${HANDY.y + 20})">
      <rect x="${HANDY.x}" y="${HANDY.y - 34}" width="62" height="104" rx="10" fill="var(--ich)" stroke="${K.ink}" stroke-width="2.5"/>
      <rect x="${HANDY.x + 6}" y="${HANDY.y - 27}" width="50" height="84" rx="4" fill="var(--ueberich-soft)"/>
      <!-- Uhrzeit auf dem Display: ein Detail, das die Geschichte erzählt, ohne sie zu
           behaupten — niemand liest um diese Zeit noch aus Versehen. -->
      ${t(HANDY.x + 31, HANDY.y - 8, "01:14", { size: 13, fill: "var(--ueberich)" })}
      <path d="M${HANDY.x + 14},${HANDY.y + 6} h34 M${HANDY.x + 14},${HANDY.y + 18} h34 M${HANDY.x + 14},${HANDY.y + 30} h22"
        stroke="var(--ueberich)" stroke-width="2" opacity="0.7"/>
      <circle cx="${HANDY.x + 31}" cy="${HANDY.y + 63}" r="4" fill="none" stroke="${K.card}" stroke-width="1.6"/>
    </g>
  </svg>`,
  `Eine Stunde Bildschirm am Abend verschiebt die Melatonin-Ausschüttung um bis zu drei Stunden.`);

const FAELLE = [["1-composition", composition], ["2-typology", typology],
                ["3-zone-axis", zoneAxis], ["4-projection", projection]];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 }, deviceScaleFactor: 2 });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.setContent('<div class="phone"><div class="topbar"><div class="progress"></div></div><div class="cardarea" id="area"></div></div>');
await page.addStyleTag({ path: repo + "/renderer.css" });
const fehler = [];
page.on("pageerror", (e) => { fehler.push(e.message); console.error("PAGEERROR:", e.message); });

import { pruefen } from "./beschriftung-pruefen.mjs";

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
