// Stationszahlen am BILD: `loop` trägt 3–5 Stationen, `multiplication` 3–6 Ziele.
// Die Contract-Grenzen sind eine Behauptung, solange niemand die Randfälle gezeichnet
// gesehen hat — der Renderer rechnet Plätze und Bögen aus der Zahl, und ob die Boxen
// bei fünf Stationen noch nebeneinander passen, sagt kein Syntax-Check.
// Legt je Zahl ein PNG ab; zusätzlich misst der Lauf Box-Überlappung und Rand-Austritt,
// damit ein Fehler auch dann auffällt, wenn niemand hinsieht.
// Nutzung: node probes/stationszahlen-shots.mjs [outdir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const repo = resolve(new URL("..", import.meta.url).pathname);
const outdir = resolve(process.argv[2] || `${repo}/probes/stationszahlen-shots`);
mkdirSync(outdir, { recursive: true });

// Echter Stoff aus dem Schlaf-Dossier, nicht "Station 1/2/3": Label-Längen sind der
// Grund, warum Boxen kollidieren, und Platzhalter hätten die falsche Länge.
const KREIS = [
  { label: "ADENOSIN", sub: "sammelt sich an", color: "es" },
  { label: "SCHLAFDRUCK", sub: "wächst mit jeder Stunde", color: "es" },
  { label: "SCHLAF", sub: "baut es ab", color: "ich" },
  { label: "WACH", sub: "der Druck ist weg", color: "ueberich" },
  { label: "ERSTE MÜDE", sub: "am frühen Abend", color: "es" },
];

const loopKarte = (n) => ({
  type: "cycle", relation: "loop",
  text: `Der Kreislauf hat <b>${n} Stationen</b> — so viele, wie er wirklich hat.`,
  steps: KREIS.slice(0, n),
  caption: "Wer um 16 Uhr Kaffee trinkt, verschiebt nur den Abbau.",
});

const fanoutKarte = (n) => ({
  type: "fanout", relation: "multiplication",
  text: `Ein Input, <b>${n} Getroffene</b> — die Zahl trägt die Aussage.`,
  source: { label: "SCHLAF", sub: "eine Nacht", color: "ich" },
  count: n,
  result: { label: "WIRKT ÜBERALL" },
  caption: "Eine Nacht mit vier Stunden senkt die Killerzellen um 70 %.",
});

// Benannte Ziele: die längsten Namen, die der Contract zulässt (16 Zeichen), und breite
// Versalien — ein Test mit „ABWEHR" beweist nichts über „LEISTUNGSFÄHIG".
const ZIELE = ["GEDÄCHTNIS", "IMMUNABWEHR", "AM STEUER", "LEBENSERWARTUNG", "STIMMUNG", "MUSKELAUFBAU"];
const mitZielen = (n) => ({ ...fanoutKarte(n), targets: ZIELE.slice(0, n).map((label) => ({ label })) });

const faelle = [
  ...[3, 4, 5].map((n) => ({ name: `loop-${n}`, card: loopKarte(n) })),
  ...[3, 4, 5, 6].map((n) => ({ name: `multiplication-${n}`, card: fanoutKarte(n) })),
  ...[3, 4, 6].map((n) => ({ name: `multiplication-${n}-benannt`, card: mitZielen(n) })),
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
// Die volle Hülle, nicht nur der Karten-Container: `.card` ist `position:absolute;
// inset:0` und kollabiert ohne `.phone` zu einem Strich — mit einwandfreier
// SVG-Geometrie im leeren Bild. Der Shot nimmt deshalb die Phone-Hülle wie shot-cards.mjs.
await page.setContent('<div class="stage"><div class="phone"><div class="cardarea" id="area"></div></div></div>');
await page.addStyleTag({ path: repo + "/renderer.css" });
await page.addScriptTag({ path: repo + "/assets/assets.js" });
await page.addScriptTag({ path: repo + "/renderer.js" });
await page.emulateMedia({ reducedMotion: "reduce" });
let seitenfehler = 0;
page.on("pageerror", (e) => { seitenfehler++; console.error("PAGEERROR:", e.message); });

let befunde = 0;
for (const { name, card } of faelle) {
  // Gemessen wird im SVG-Koordinatensystem: Boxen sind die <rect> der Stationen bzw.
  // die <circle> der Ziel-Personen, die Karte ist die viewBox.
  const mess = await page.evaluate((c) => {
    document.getElementById("area").innerHTML = RENDERERS[c.type](c);
    const svg = document.querySelector("#area svg");
    const [, , vbW, vbH] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    const kasten = c.type === "cycle"
      ? [...svg.querySelectorAll("g[data-idx] > rect")].map((r) => ({
          x1: +r.getAttribute("x"), y1: +r.getAttribute("y"),
          x2: +r.getAttribute("x") + +r.getAttribute("width"),
          y2: +r.getAttribute("y") + +r.getAttribute("height") }))
      // Die Personen-Figur ragt unter den Kreis (Schultern): Unterkante mitmessen,
      // sonst meldet der Test Luft, wo sich die Körper schon berühren.
      : [...svg.querySelectorAll("g[data-idx] > circle:first-child")].map((k) => ({
          x1: +k.getAttribute("cx") - +k.getAttribute("r"), y1: +k.getAttribute("cy") - +k.getAttribute("r"),
          x2: +k.getAttribute("cx") + +k.getAttribute("r"), y2: +k.getAttribute("cy") + 15.5 }));
    const paare = [];
    for (let i = 0; i < kasten.length; i++)
      for (let j = i + 1; j < kasten.length; j++) {
        const a = kasten[i], b = kasten[j];
        const dx = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const dy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        if (dx > 0 && dy > 0) paare.push(`${i}/${j} überlappen ${dx.toFixed(1)}×${dy.toFixed(1)} px`);
      }
    const raus = kasten.map((k, i) => (k.x1 < 0 || k.y1 < 0 || k.x2 > vbW || k.y2 > vbH)
      ? `${i} läuft aus der Karte (${k.x1.toFixed(0)},${k.y1.toFixed(0)})–(${k.x2.toFixed(0)},${k.y2.toFixed(0)}) bei ${vbW}×${vbH}` : null).filter(Boolean);
    // Engste Lücke: sagt, wie viel Luft der Randfall noch hat.
    let eng = Infinity;
    for (let i = 0; i < kasten.length; i++)
      for (let j = i + 1; j < kasten.length; j++) {
        const a = kasten[i], b = kasten[j];
        const dx = Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2);
        const dy = Math.max(a.y1, b.y1) - Math.min(a.y2, b.y2);
        if (dx > 0 || dy > 0) eng = Math.min(eng, Math.max(dx, dy));
      }
    // Pfeilköpfe: die Stationen werden NACH den Bögen gezeichnet — endet ein Bogen
    // unter einer Box, ist sein Kopf unsichtbar und der Kreislauf verliert seine
    // Richtung. Das war im Bild zu sehen und in keiner Zahl. Jetzt in einer Zahl.
    const koepfe = [...document.querySelectorAll("#area path[data-idx]")].map((p, i) => {
      const len = p.getTotalLength();
      const e = p.getPointAtLength(len);
      const verdeckt = kasten.some((k) => e.x > k.x1 && e.x < k.x2 && e.y > k.y1 && e.y < k.y2);
      // Der Marker ist rund 16 px lang (9 × stroke-width 1.8): ein kürzerer Bogen ist
      // nur noch Kopf und liest sich nicht mehr als Weg.
      return verdeckt ? `Pfeil ${i}: Kopf liegt unter einer Station`
        : len < 20 ? `Pfeil ${i}: Bogen nur ${len.toFixed(0)} px lang` : null;
    }).filter(Boolean);
    // Text gegen die Kartenkante: der Contract deckelt ZEICHEN, gezeichnet werden
    // PIXEL, und breite Versalien brauchen fast doppelt so viel Platz wie schmale.
    // Ein Label, das rechts hinausläuft, wird still abgeschnitten.
    const texte = [...svg.querySelectorAll("text")].map((t) => {
      const b = t.getBBox();
      return (b.x < -0.5 || b.x + b.width > vbW + 0.5)
        ? `"${t.textContent.trim().slice(0, 18)}" reicht bis x=${(b.x + b.width).toFixed(0)} (Karte ${vbW})` : null;
    }).filter(Boolean);
    return { n: kasten.length, paare, raus, koepfe, texte, eng: eng === Infinity ? null : +eng.toFixed(1) };
  }, card);

  const phone = page.locator(".phone");
  const box = await phone.boundingBox();
  // Ein Shot von einem Strich ist kein Beweis: die Hülle muss echte Fläche haben,
  // sonst ist das PNG leer und die Geometrie-Zahlen oben trotzdem grün.
  if (!box || box.width < 300 || box.height < 500)
    throw new Error(`Karten-Hülle ist ${box ? `${box.width}×${box.height}` : "nicht da"} — der Shot wäre leer.`);
  await phone.screenshot({ path: `${outdir}/${name}.png` });
  const schlimm = mess.paare.length || mess.raus.length || mess.koepfe.length || mess.texte.length;
  if (schlimm) befunde++;
  console.log(`${schlimm ? "✗" : "✓"} ${name}: ${mess.n} Kästen, engste Lücke ${mess.eng ?? "—"} px`
    + (mess.paare.length ? `\n    ÜBERLAPPUNG: ${mess.paare.join(" · ")}` : "")
    + (mess.raus.length ? `\n    RAND: ${mess.raus.join(" · ")}` : "")
    + (mess.koepfe.length ? `\n    PFEIL: ${mess.koepfe.join(" · ")}` : "")
    + (mess.texte.length ? `\n    TEXT: ${mess.texte.join(" · ")}` : ""));
}
await browser.close();

console.log(`\n→ ${outdir}`);
if (seitenfehler) console.log(`⚠️  ${seitenfehler} Seitenfehler — der Renderer hat geworfen.`);
console.log(befunde || seitenfehler
  ? `✗ ${befunde} Fall/Fälle mit Geometrie-Befund — die Bilder trotzdem ansehen.`
  : "✓ Geometrie sauber. Die Bilder trotzdem ansehen — Zahlen sagen nichts über den Bildinhalt.");
process.exit(befunde || seitenfehler ? 1 : 0);
