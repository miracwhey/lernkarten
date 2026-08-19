// Hält `decay-halflife` seine eigene Behauptung? Der Name ist eine Zusage: nach EINER
// Halbwertszeit die Hälfte, nach zweien ein Viertel. Wer die Zusage im Namen führt, muss
// sie im Bild halten — sonst steht eine Zahl im Text auf einer Höhe, die die Kurve nicht
// hat, und keine Prüfung sieht es.
//
// BEFUND (18.08.): sie hielt sie nicht. Die Form war Zeichen für Zeichen dieselbe wie
// `saturating-rise`, nur gespiegelt; bei einem Drittel der Strecke stand die Kurve auf
// 39 % statt 50 %, bei zwei Dritteln auf 13 % statt 25 %.
// AUFGELÖST (19.08., Leon-Entscheid): der Zerfall wird gerechnet, `to` sagt, WIE WEIT er
// läuft — floor = 3 Halbwertszeiten, low = 2, mid = 1. Seither ist dieses Skript kein
// Diagnose-Zettel mehr, sondern das Gate dazu: es misst, was der Renderer zeichnet, gegen
// das, was die Form verspricht.
//
// Bezugsgröße ist das STARTNIVEAU der Serie — dieselbe, die notecheck.mjs benutzt (dort
// das Serien-Maximum, bei einer fallenden Kurve derselbe Punkt). Die frühere Fassung
// normierte auf die gezeichnete SPANNE (Start bis tiefster Punkt); damit hing die
// gemessene Zahl daran, wo die Kurve endet, und dieselbe Kurve bekam je nach Endhöhe zwei
// verschiedene Prozentwerte.
// Nutzung: node probes/kurve-treue.mjs
// Exit 0 = jede Stufe hält ihre Zusage, 2 = mindestens eine weicht ab.
import { chromium } from "playwright";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Toleranz in Prozentpunkten. Die Kurve wird aus 57 Stützpunkten gezeichnet und die Probe
// greift den nächstliegenden — ein halber Punkt Abweichung ist Abtastung, kein Formfehler.
const TOL = 1.0;
// Die Stufen und ihre Zusage: `to` bestimmt die Zahl der Halbwertszeiten (renderer.js,
// HALBWERTSZEITEN). Erwartet wird 0.5^k bei t = k/n — die Zahlen stehen NICHT abgeschrieben
// da, sie werden aus n gerechnet; eine Tabelle könnte gegen den Renderer verrutschen.
const STUFEN = [["floor", 3], ["low", 2], ["mid", 1]];

const karte = (to) => ({
  type: "curve", relation: "trend", text: "Zerfall.", xlabel: "STUNDEN", ylabel: "REST",
  series: [{ label: "KOFFEIN", color: "es", shape: "decay-halflife", from: "high", to }],
  caption: "Probe."
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto("file://" + resolve(repo, "karten-grammatik.html"));
await page.waitForTimeout(150);

let offen = 0;
for (const [to, n] of STUFEN) {
  // Gemessen wird an der GEZEICHNETEN Polyline, nicht an der Rechnung dahinter: das Gate
  // soll das Bild prüfen, nicht die Formel gegen sich selbst.
  const out = await page.evaluate((c) => {
    renderCardInto(area, c, { onAdvance: () => {} });
    const el = document.querySelector(".diagram svg polyline[data-series]");
    const pts = el.getAttribute("points").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    const xs = pts.map((p) => p[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const yStart = pts.find((p) => p[0] === x0)[1];
    // y wächst im SVG nach unten; die Achse liegt bei y=244 (PLOT.y0), der Nullpunkt der
    // Skala. Anteil = Höhe über der Achse, geteilt durch die Starthöhe über der Achse.
    const ACHSE = 244;
    const anteilBei = (f) => {
      const zx = x0 + (x1 - x0) * f;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p[0] - zx) < Math.abs(best[0] - zx)) best = p;
      return (ACHSE - best[1]) / (ACHSE - yStart);
    };
    return { punkte: pts.length, mess: [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1]
      .map((f) => [f, +anteilBei(f).toFixed(4)]) };
  }, karte(to));

  console.log(`to="${to}" — ${n} Halbwertszeit${n > 1 ? "en" : ""} über die Breite (${out.punkte} Punkte)`);
  for (const k of Array.from({ length: n }, (_, i) => i + 1)) {
    const f = k / n, soll = Math.pow(0.5, k);
    const treffer = out.mess.reduce((a, b) => Math.abs(b[0] - f) < Math.abs(a[0] - f) ? b : a);
    const ist = treffer[1];
    const ab = Math.abs(ist - soll) * 100;
    const ok = ab <= TOL;
    if (!ok) offen++;
    console.log(`  ${ok ? "OK  " : "FAIL"} nach ${k} HWZ (t=${f.toFixed(2)}): ${(ist * 100).toFixed(1)} %`
      + ` — Zusage ${(soll * 100).toFixed(1)} % (ab ${ab.toFixed(1)} Punkte)`);
  }
  const ende = out.mess.at(-1)[1], endeSoll = Math.pow(0.5, n);
  const endeAb = Math.abs(ende - endeSoll) * 100;
  if (endeAb > TOL) offen++;
  console.log(`  ${endeAb <= TOL ? "OK  " : "FAIL"} Ende (t=1): ${(ende * 100).toFixed(1)} % — Zusage ${(endeSoll * 100).toFixed(1)} %`);
}
await browser.close();

console.log(offen ? `KURVE-TREUE FAIL — ${offen} Abweichung(en) über ${TOL} Punkte`
  : `KURVE-TREUE PASS — jede Stufe hält ihre Zusage (±${TOL} Punkte)`);
process.exit(offen ? 2 : 0);
