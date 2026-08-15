// Beweis, dass die Library-Assets die ABGENOMMENE Optik tragen: dieselbe Seite,
// dasselbe Telefon, derselbe Schritt — einmal die handgebaute Mockup-Karte (Design-Gate,
// von Leon abgenommen) und einmal dieselbe Karte über renderCardInto aus der Library.
// Verglichen wird PIXELWEISE, nicht per Augenmaß: ein Bild, das „ungefähr gleich"
// aussieht, hat die Normalisierung nicht bewiesen.
//
// Die Bilder werden zusätzlich gegen die GESPEICHERTEN Mockup-Shots gehalten. Wäre der
// Nachbau der Mockup-Seite selbst schon anders, verglichen wir zwei Neuheiten
// miteinander und nennten das Gleichheit.
// Nutzung: node probes/asset-mockup-diff.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const OUT = resolve(HIER, "asset-diff");
mkdirSync(OUT, { recursive: true });

const lesson = JSON.parse(readFileSync(resolve(REPO, "probes/asset-demo-lesson.json"), "utf8"));
const KARTEN = { "panel-a": lesson.cards[1], "panel-c": lesson.cards[2] };
const TOLERANZ = 8;   // 0–255 je Kanal: unter dieser Schwelle ist kein sichtbarer Unterschied

const browser = await chromium.launch();
// Exakt die Bedingungen von probes/v3-mockup/shot-v3.mjs — sonst vergleichen wir
// Rasterungen, nicht Bilder.
const page = await browser.newPage({ viewport: { width: 1460, height: 1150 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto("file://" + resolve(REPO, "probes/v3-mockup/v3-mockup.html"));
await page.waitForTimeout(600);
await page.addScriptTag({ path: resolve(REPO, "assets/assets.js") });
// ALLE Panels sofort einfrieren: die Seite spielt beim Erscheinen von selbst ab
// (trigger:auto). Ein noch laufender Timer eines anderen Panels macht den Vergleich
// zeitabhängig — und ein Gate, dessen Ergebnis vom Zeitpunkt abhängt, misst nichts.
await page.evaluate(() => window.__panels.forEach((p, i) => window.__gotoStep(i, p.steps)));
await page.waitForTimeout(150);

// Pixel-Vergleich im Browser (kein Bild-Paket im Projekt): beide PNGs auf Canvas,
// Kanal für Kanal. Gezählt werden Pixel über der Toleranz, gemeldet der größte Ausreißer.
const vergleich = async (aB64, bB64) => page.evaluate(async ([a, b, tol]) => {
  const lade = (d) => new Promise((ok, fehl) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fehl; i.src = "data:image/png;base64," + d; });
  const [ia, ib] = await Promise.all([lade(a), lade(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height)
    return { masse: `${ia.width}×${ia.height} vs ${ib.width}×${ib.height}`, anders: -1 };
  const px = (img) => { const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
  const A = px(ia), B = px(ib);
  // Rasterkarte der Abweichung: ein Prozentwert sagt nicht, WO das Bild anders ist.
  // Zellen von 12×12 Pixeln, benachbarte Zellen werden zu Regionen verschmolzen —
  // jede Region wird mit Kasten und Pixelzahl gemeldet und ist damit benennbar.
  const Z = 12, gw = Math.ceil(ia.width / Z), gh = Math.ceil(ia.height / Z);
  const zelle = new Int32Array(gw * gh);
  let anders = 0, max = 0;
  for (let i = 0; i < A.length; i += 4) {
    const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]), Math.abs(A[i + 3] - B[i + 3]));
    if (d > max) max = d;
    if (d > tol) {
      anders++;
      const p = i / 4, x = p % ia.width, y = (p - x) / ia.width;
      zelle[Math.floor(y / Z) * gw + Math.floor(x / Z)]++;
    }
  }
  const gesehen = new Uint8Array(gw * gh), regionen = [];
  for (let c = 0; c < zelle.length; c++) {
    if (!zelle[c] || gesehen[c]) continue;
    const stapel = [c]; gesehen[c] = 1;
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0, n = 0;
    while (stapel.length) {
      const k = stapel.pop(), kx = k % gw, ky = (k - kx) / gw;
      n += zelle[k];
      x0 = Math.min(x0, kx); x1 = Math.max(x1, kx); y0 = Math.min(y0, ky); y1 = Math.max(y1, ky);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = kx + dx, ny = ky + dy, nk = ny * gw + nx;
        if (nx >= 0 && nx < gw && ny >= 0 && ny < gh && zelle[nk] && !gesehen[nk]) { gesehen[nk] = 1; stapel.push(nk); }
      }
    }
    regionen.push({ n, kasten: [x0 * Z, y0 * Z, (x1 + 1) * Z, (y1 + 1) * Z] });
  }
  regionen.sort((a, b) => b.n - a.n);
  // Sichtbare Karte der Abweichung: das zweite Bild, abweichende Pixel rot übermalt.
  // Eine Zahl über die Bildposition sagt nichts über den Bildinhalt — das hier schon.
  const c = new OffscreenCanvas(ia.width, ia.height), cx = c.getContext("2d");
  cx.drawImage(ib, 0, 0);
  const bild = cx.getImageData(0, 0, ia.width, ia.height);
  for (let i = 0; i < A.length; i += 4) {
    const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]), Math.abs(A[i + 3] - B[i + 3]));
    if (d > tol) { bild.data[i] = 255; bild.data[i + 1] = 0; bild.data[i + 2] = 220; bild.data[i + 3] = 255; }
  }
  cx.putImageData(bild, 0, 0);
  const blob = await c.convertToBlob({ type: "image/png" });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ""; for (const b of buf) bin += String.fromCharCode(b);
  return { masse: `${ia.width}×${ia.height}`, gesamt: A.length / 4, anders, max, regionen: regionen.slice(0, 6), karte: btoa(bin) };
}, [aB64, bB64, TOLERANZ]);

// Punktwolke der GEZEICHNETEN Geometrie eines Panels, in Karten-Koordinaten (viewBox).
// Pixel können durch Rasterung an Rundungen abweichen, ohne dass die Geometrie anders
// ist — hier wird deshalb die Geometrie selbst verglichen, nicht ihr Anti-Aliasing.
const wolke = (panelId) => page.evaluate((id) => {
  const svg = document.querySelector(`#${id} .diagram svg`);
  const m0 = svg.getScreenCTM().inverse();
  const pts = [];
  for (const el of svg.querySelectorAll("path, line, polyline, polygon, circle")) {
    const cs = getComputedStyle(el);
    const malt = (cs.stroke !== "none" && parseFloat(cs.strokeWidth) > 0) || (cs.fill !== "none" && cs.fill !== "rgba(0, 0, 0, 0)");
    if (!malt || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
    const m = m0.multiply(el.getScreenCTM());
    const hin = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    // Abgetastet wird in KARTEN-Einheiten: im platzierten Asset ist eine lokale Einheit
    // zwei Karten-Einheiten wert. Gleiche Schrittweite im lokalen System hieße halbe
    // Dichte — der Vergleich mäße dann seine eigene Abtastung statt der Geometrie.
    const s = Math.hypot(m.a, m.b) || 1, schritt = 0.25 / s;   // 0.25 Karten-Einheiten
    if (el.getTotalLength) {
      const L = el.getTotalLength();
      for (let d = 0; d <= L; d += schritt) { const p = el.getPointAtLength(d); pts.push(hin(p.x, p.y)); }
    }
  }
  return pts;
}, panelId);

/// Hausdorff-Abstand beider Wolken: der größte Abstand, den ein Punkt der einen zur
/// nächsten Tinte der anderen hat. 0 heißt: dieselben Linien an derselben Stelle.
const hausdorff = (A, B) => {
  const halb = (X, Y) => {
    let max = 0;
    for (const [x, y] of X) {
      let best = Infinity;
      for (const [u, v] of Y) { const d = (x - u) ** 2 + (y - v) ** 2; if (d < best) best = d; }
      max = Math.max(max, Math.sqrt(best));
    }
    return max;
  };
  return Math.max(halb(A, B), halb(B, A));
};

let fehler = 0;
for (const [panelId, karte] of Object.entries(KARTEN)) {
  const idx = panelId === "panel-a" ? 0 : 2;
  const N = karte.sequence.length;
  const phone = page.locator(`#${panelId} .phone`);

  // 1) Mockup-Zustand einnehmen und gegen den gespeicherten Shot halten (Kontrolle der
  //    Messanordnung selbst).
  await page.evaluate(([i, s]) => window.__gotoStep(i, s), [idx, N]);
  await page.waitForTimeout(120);
  const mockShot = await phone.screenshot();
  const wolkeMock = await wolke(panelId);
  const gespeichert = readFileSync(resolve(REPO, `probes/v3-mockup/shots/${panelId}-s${N}.png`));
  const kontrolle = await vergleich(gespeichert.toString("base64"), mockShot.toString("base64"));
  const kontrolleOk = kontrolle.anders === 0;
  console.log(`${panelId}  Messanordnung: gespeicherter Shot ≡ frisch gerendertes Mockup? `
    + `${kontrolleOk ? "JA" : `NEIN (${kontrolle.anders} Pixel, max ${kontrolle.max})`} [${kontrolle.masse}]`);
  if (!kontrolleOk) fehler++;
  writeFileSync(resolve(OUT, `${panelId}-mockup.png`), mockShot);

  // 2) Dieselbe Karte aus der Library in dasselbe Telefon rendern, Endzustand einfrieren.
  await page.evaluate((k) => {
    const area = document.querySelector(`#${k.panelId} .cardarea`);
    renderCardInto(area, k.karte, { onAdvance: () => {} });
    window.__seqGoto(k.n);
  }, { panelId, karte, n: N });
  await page.waitForTimeout(200);
  const libShot = await phone.screenshot();
  writeFileSync(resolve(OUT, `${panelId}-library.png`), libShot);
  const wolkeLib = await wolke(panelId);
  const hd = hausdorff(wolkeMock, wolkeLib);
  console.log(`${panelId}  Geometrie: ${wolkeMock.length} vs ${wolkeLib.length} Stuetzpunkte, `
    + `Hausdorff-Abstand ${hd.toFixed(4)} Karten-Einheiten`);
  if (hd > 0.2) { fehler++; console.log(`${panelId}  GEOMETRIE WEICHT AB (Schwelle 0.2 = halbe Abtastweite 0.125 plus Reserve)`); }

  const d = await vergleich(mockShot.toString("base64"), libShot.toString("base64"));
  const anteil = d.anders >= 0 ? (100 * d.anders / d.gesamt).toFixed(3) : "?";
  console.log(`${panelId}  Mockup vs. Library: ${d.anders} von ${d.gesamt} Pixeln über Toleranz ${TOLERANZ} (${anteil} %), `
    + `größte Kanal-Differenz ${d.max}`);
  // Die Regionen sind in Geräte-Pixeln (deviceScaleFactor 2); in Klammern die CSS-Pixel
  // des Telefons, damit die Stelle im Bild benennbar ist.
  if (d.karte) writeFileSync(resolve(OUT, `${panelId}-abweichung.png`), Buffer.from(d.karte, "base64"));
  for (const r of (d.regionen || [])) {
    const [x0, y0, x1, y1] = r.kasten;
    console.log(`    Region ${String(r.n).padStart(5)} px  Kasten ${x0},${y0}–${x1},${y1}  `
      + `(CSS ${x0 / 2},${y0 / 2}–${x1 / 2},${y1 / 2})`);
  }
}
await browser.close();
console.log(fehler ? `MOCKUP-DIFF: Messanordnung unsicher (${fehler})` : "MOCKUP-DIFF: Messanordnung bestätigt");
process.exit(fehler ? 1 : 0);
