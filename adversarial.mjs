// Adversarial-Fälle gegen den Label-Solver: Maximal-Längen, Randlagen, Deckungsgleichheit.
// Dazu die EREIGNIS-MATRIX: die Nach-Stop-Geometrie über verschiedene Startniveaus,
// Stop-Zeitpunkte und Apex-Höhen — damit kein Einzelfall-Fix als Lösung durchgeht.
// Rendert Testkarten direkt über RENDERERS.curve, misst im DOM, screenshottet.
// Gemessen wird je Fall: Clipping (Text UND Geometrie), Text-Kollisionen,
// Text×Kurve, sowie die ZUORDENBARKEIT (liegt ein Label näher an einer fremden
// Serie als an der eigenen?). Zusätzlich protokolliert die Matrix Apex-Höhe und
// steilsten Winkel des Asts — enge Kombinationen dürfen die FORM degradieren
// (steiler), nie die deklarierte Höhe.
// Nutzung: node adversarial.mjs [outdir=adv]
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";
import { auditCurveCard } from "./label-audit.mjs";
import { ASSETS } from "./validate-lesson.mjs";

// Text auf genau `max` Zeichen bringen — mit dem Beispieltext des Platzes, weil der
// Deckel mit realistischem Label-Text gemessen wurde (Breite ≠ Zeichenzahl).
const fuellText = (beispiel, max) =>
  (beispiel + " ").repeat(Math.ceil(max / (beispiel.length + 1)) + 1).slice(0, max).trim().padEnd(max, "N");

const outdir = process.argv[2] || "adv";
mkdirSync(outdir, { recursive: true });

const CASES = [
  ["max-lengths", {
    type: "curve", text: "Maximal lange Labels überall.",
    xlabel: "ZWÖLFZEICHEN", ylabel: "MAXIMALLÄNGE",
    stop: { t: 0.5, label: "VIERZEHNZEICHN" },
    series: [
      { label: "Sechzehn Zeichen", color: "es", shape: "linear-rise", afterStop: "collapse", area: true },
      { label: "Auch sechzehn Ze", color: "ich", shape: "saturating-rise" }
    ],
    notes: [
      { label: "ZWEIUNDZWANZIG ZEICHEN", series: 1, t: 0.5, side: "above" },
      { label: "NOCH EINE LANGE NOTIZ", series: 0, t: 0.4, side: "below" }
    ],
    caption: "Stresstest."
  }],
  ["stop-left-edge", {
    type: "curve", text: "Stop ganz links.",
    xlabel: "ZEIT", ylabel: "WERT",
    stop: { t: 0.15, label: "FRÜHES ENDE" },
    series: [{ label: "Serie A", color: "es", shape: "compound-rise", afterStop: "rebound" }],
    notes: [{ label: "NOTIZ AM LINKEN RAND", series: 0, t: 0.02, side: "above" }]
  }],
  ["stop-right-edge", {
    type: "curve", text: "Stop ganz rechts.",
    xlabel: "ZEIT", ylabel: "WERT",
    stop: { t: 0.9, label: "SPÄTES ENDE MAX" },
    series: [
      { label: "Steigt lange an", color: "ich", shape: "saturating-rise", afterStop: "reset", area: true }
    ],
    notes: [{ label: "NOTIZ AM RECHTEN RAND", series: 0, t: 0.98, side: "above" }]
  }],
  ["identical-flat", {
    type: "curve", text: "Zwei deckungsgleiche Serien.",
    xlabel: "ZEIT", ylabel: "WERT",
    series: [
      { label: "Erste flache", color: "es", shape: "flat", from: "mid" },
      { label: "Zweite flache", color: "ich", shape: "flat", from: "mid", dash: true }
    ]
  }],
  ["crowded-top", {
    type: "curve", text: "Alles drängt nach oben.",
    xlabel: "ZEIT", ylabel: "WERT",
    stop: { t: 0.55, label: "MITTIG OBEN" },
    series: [
      { label: "Hoch und flach", color: "es", shape: "saturating-rise", from: "mid", to: "high" },
      { label: "Auch ganz oben", color: "ueberich", shape: "linear-rise", from: "mid", to: "high", dash: true }
    ],
    notes: [{ label: "OBEN IST ES ENG", series: 0, t: 0.75, side: "above" }]
  }],
  // ——— Asset-Karten: jeder Label-Platz auf seinem DECKEL ———
  // Die Deckel stehen im Manifest und sind gemessen (probes/asset-slot-max.mjs); hier
  // werden sie ausgereizt. Sie werden NICHT abgeschrieben, sondern gelesen — eine
  // zweite Zahlenliste im Test wäre beim nächsten Nachmessen still veraltet (genau das
  // ist beim ersten Versuch passiert).
  ...Object.entries(ASSETS).filter(([, a]) => !a.verbraucher).flatMap(([ref, a]) =>
    (a.rollen || ["hero"]).map((rolle) => [`asset-${ref.split(".").pop()}-${rolle}-maxlabels`, {
      type: "asset", relation: "object",
      text: `Alle Label-Plätze von ${ref} auf ihrem Deckel (${rolle}).`,
      asset: {
        ref, role: rolle,
        labels: Object.fromEntries((a.labelSlots || []).map((s) => [s.id, fuellText(s.beispiel, s.max)]))
      },
      caption: "Stresstest der Label-Plätze."
    }])),
  // ——— Asset-Karten: Label UND Sub-Zeile gleichzeitig auf ihrem Deckel ———
  // Der Sub-Deckel steht JE ROLLE im Manifest (inline staucht die Komposition). Auch er
  // wird gelesen, nicht abgeschrieben. Plätze mit Deckel 0 tragen in dieser Rolle keine
  // Sub-Zeile und bleiben leer — das ist die gemessene Eigenschaft des Objekts.
  ...Object.entries(ASSETS).filter(([, a]) => !a.verbraucher).flatMap(([ref, a]) =>
    (a.rollen || ["hero"]).map((rolle) => [`asset-${ref.split(".").pop()}-${rolle}-maxsubs`, {
      type: "asset", relation: "object",
      text: `Label und Sub-Zeile von ${ref} auf ihrem Deckel (${rolle}).`,
      asset: {
        ref, role: rolle,
        labels: Object.fromEntries((a.labelSlots || []).map((s) => [s.id, fuellText(s.beispiel, s.max)])),
        subs: Object.fromEntries((a.labelSlots || [])
          .filter((s) => (s.subMax?.[rolle] ?? 0) > 0)
          .map((s) => [s.id, fuellText(s.subBeispiel || s.beispiel, s.subMax[rolle])]))
      },
      caption: "Stresstest der Sub-Zeilen."
    }])),
  // ——— Asset-Notes: eine Note an JEDEM Anker-Typ des Objekts ———
  // Ein Anker-Typ, der nie geprüft wurde, ist eine Zusage ohne Deckung: `region:` ist eine
  // Fläche, `ray:` ein Strahl, `node:` ein Punkt — sie stellen dem Solver verschiedene
  // Aufgaben. Der Note-Deckel kommt aus dem Manifest und gilt am ENGSTEN Anker.
  ...Object.entries(ASSETS).filter(([, a]) => !a.verbraucher && a.noteMax > 0).flatMap(([ref, a]) =>
    (a.anker || []).map((ank) => [`asset-${ref.split(".").pop()}-note-${ank.replace(":", "-")}`, {
      type: "asset", relation: "object",
      text: `Note am Anker ${ank} von ${ref}, auf ihrem Deckel.`,
      asset: {
        ref, role: (a.rollen || ["hero"])[0],
        labels: Object.fromEntries((a.labelSlots || []).map((s) => [s.id, s.beispiel]))
      },
      notes: [{ anker: ank, text: fuellText((a.labelSlots || [])[0]?.beispiel || "ANMERKUNG", a.noteMax) }],
      caption: "Stresstest der Anker-Notes."
    }])),
  ["decay-vs-flat", {
    type: "curve", text: "Zerfall trifft flache Linie.",
    xlabel: "STUNDEN", ylabel: "PEGEL",
    series: [
      { label: "Halbwertszeit", color: "ueberich", shape: "decay-halflife", area: true },
      { label: "Grenzwert", color: "es", shape: "flat", from: "low", dash: true, faded: true }
    ],
    notes: [{ label: "SCHNITTPUNKT HIER", series: 0, t: 0.6, side: "below" }]
  }]
];

// ————— Ereignis-Matrix: Startniveau × Stop-Zeitpunkt × Apex-Höhe —————
// Jede Kombination trägt eine Referenzserie (damit Zuordenbarkeit messbar ist), ein
// Stop-Ereignis und eine apex-verankerte Note (der Solver muss das Apex-Label auch
// in der Ecke unterbringen).
const EVENT_BASES = [
  ["flat-low", { shape: "flat", from: "low" }],
  ["flat-mid", { shape: "flat", from: "mid" }],
  ["flat-high", { shape: "flat", from: "high" }],
  ["supp-mid-low", { shape: "suppressed", from: "mid", to: "low" }],
  ["supp-high-floor", { shape: "suppressed", from: "high", to: "floor" }],
  ["supp-low", { shape: "suppressed", from: "low" }],
  ["rise-low-mid", { shape: "saturating-rise", from: "low", to: "mid" }]
];
const STOPS = [0.2, 0.5, 0.9];
const REBOUND_TO = ["low", "mid", "high"];
// Basen, die auch collapse/reset durchlaufen — die beiden Formen sind unverändert,
// müssen aber über dieselben Startniveaus/Zeitpunkte sauber bleiben.
const PLAIN_BASES = ["flat-low", "supp-mid-low", "rise-low-mid"];
// Extremkombinationen, von denen zusätzlich ein Bild abgelegt wird.
const SHOT = new Set([
  "reb-flat-low-t0.9-high",      // engste Breite, größte Höhe → steilster Ast
  "reb-flat-high-t0.9-high",     // Apex oben rechts, direkt an der Plot-Ecke
  "reb-flat-low-t0.2-high",      // längster Ast, flachster Schwung
  "reb-supp-high-floor-t0.5-low",// kleinster Hub: von floor auf low
  "reb-supp-mid-low-t0.9-mid",   // spät + mittlere Höhe
  "reb-rise-low-mid-t0.5-mid",   // Ereignis unterbricht einen Anstieg
  "collapse-rise-low-mid-t0.9",  // Bestandsform spät
  "reset-supp-mid-low-t0.2"      // Bestandsform früh
]);

// Weitere Fallnamen als Argumente → zusätzlich screenshotten (Nachschau bei Befunden).
for (const n of process.argv.slice(3)) SHOT.add(n);

const matrixCard = (label, base, t, afterStop, reboundTo) => ({
  type: "curve",
  text: `Ereignis-Matrix ${label}: Startniveau, Zeitpunkt und Apex-Höhe variiert.`,
  xlabel: "ZEIT", ylabel: "NIVEAU",
  stop: { t, label: "EREIGNIS" },
  series: [
    { label: "Referenz", color: "es", shape: "linear-rise", from: "low", to: "high", dash: true },
    { label: "Ereignis", color: "ueberich", ...base, afterStop, ...(reboundTo ? { reboundTo } : {}) }
  ],
  notes: [{ label: "APEX-NOTE", series: 1, at: "apex" }],
  caption: label
});

const MATRIX = [];
for (const [bn, base] of EVENT_BASES) for (const t of STOPS) {
  for (const r of REBOUND_TO) {
    const name = `reb-${bn}-t${t}-${r}`;
    MATRIX.push([name, matrixCard(name, base, t, "rebound", r)]);
  }
  if (PLAIN_BASES.includes(bn)) for (const a of ["collapse", "reset"]) {
    const name = `${a}-${bn}-t${t}`;
    MATRIX.push([name, matrixCard(name, base, t, a, null)]);
  }
}

// Gemessen wird mit demselben Chokepoint wie in audit-lesson.mjs (label-audit.mjs):
// Text-Kollision/Clipping, Geometrie-Clipping, Zuordenbarkeit, Leader-Deckel und das
// Sticky-Gate der Serien-Label-Bindung.

// ————— Sequenz-Stresstests: Prüfling ist der SCHRITT-Endzustand —————
// Konstruktionen, die Zwischenzustände hart machen. Zwei Erwartungen sind möglich:
//   erwartet: null      — jeder Schritt muss sauber sein; jeder Befund ist ein Fehler.
//   erwartet: {schritt, muster} — NEGATIV-KONTROLLE: dieser Schritt MUSS den Befund
//                         tragen. Bleibt er aus, ist das Gate blind und der Fall fällt
//                         durch — ein Gate, das nie feuert, beweist nichts.
const SEQ_CASES = [
  // Note vor ihrer Kurve: der Leader zeigt auf eine Serie, die dieser Schritt noch
  // nicht gezogen hat. Die unsichtbare Kurve darf dabei KEINE Kollision erzeugen.
  ["seq-note-vor-trace", {
    type: "curve", text: "Note erscheint vor ihrer Serie.",
    xlabel: "ZEIT", ylabel: "WERT",
    series: [
      { label: "SCHON DA", color: "es", shape: "linear-rise", from: "low", to: "high" },
      { label: "KOMMT SPAET", color: "ich", shape: "decay-halflife", from: "high", to: "floor" }
    ],
    notes: [{ label: "HAENGT IN DER LUFT", series: 1, t: 0.5, side: "above" }],
    trigger: "auto",
    sequence: [
      { verb: "reveal", target: "note:haengt-in-der-luft" },
      { verb: "trace", target: "series:kommt-spaet" }
    ]
  }, { schritt: 1, muster: /^LEER/ }],
  // Apex-Note auf dem Nach-Stop-Ast, gezeigt bevor der Ast gezogen ist: die Serie IST
  // sichtbar (Hauptast), ihr Punkt aber nicht — Serien-Sichtbarkeit allein genügt nicht.
  ["seq-note-auf-ungezogenem-ast", {
    type: "curve", text: "Apex-Note vor dem Nach-Stop-Ast.",
    xlabel: "ZEIT", ylabel: "PEGEL",
    stop: { t: 0.5, label: "EREIGNIS" },
    series: [{ label: "STEIGT DANN FAELLT", color: "ueberich", shape: "linear-rise", from: "low", to: "mid", afterStop: "rebound", reboundTo: "high" }],
    notes: [{ label: "APEX-NOTE", series: 0, at: "apex" }],
    trigger: "auto",
    sequence: [
      { verb: "trace", target: "series:steigt-dann-faellt" },
      { verb: "reveal", target: "note:apex-note" },
      { verb: "trace", target: "series:steigt-dann-faellt" }
    ]
  }, { schritt: 2, muster: /^LEER/ }],
  // dim nimmt zurück, es entfernt nicht: die gedimmte Serie bleibt Geometrie, über die
  // eine später gezeigte Note nicht laufen darf.
  ["seq-dim-unter-note", {
    type: "curve", text: "Note über gedimmter Serie.",
    xlabel: "ZEIT", ylabel: "WERT",
    series: [
      { label: "TRITT ZURUECK", color: "es", shape: "saturating-rise", from: "low", to: "high", area: true },
      { label: "BLEIBT VORN", color: "ich", shape: "linear-rise", from: "low", to: "mid" }
    ],
    notes: [{ label: "SPAETE NOTIZ", series: 0, t: 0.62, side: "above" }],
    trigger: "auto",
    sequence: [
      { verb: "dim", target: "series:tritt-zurueck" },
      { verb: "reveal", target: "note:spaete-notiz" }
    ]
  }, null],
  // highlight legt eine sichtbare Kontur um die Glyphen — das Label wächst. Direkt
  // daneben steht ein zweites; die Tinte darf es nicht erreichen.
  ["seq-highlight-dichter-nachbar", {
    type: "curve", text: "Aufglühen neben dichtem Nachbarn.",
    xlabel: "ZEIT", ylabel: "WERT",
    series: [
      { label: "OBERE SERIE", color: "es", shape: "saturating-rise", from: "mid", to: "high" },
      { label: "UNTERE SERIE", color: "ich", shape: "saturating-rise", from: "mid", to: "high", dash: true }
    ],
    notes: [{ label: "ENG DANEBEN", series: 0, t: 0.5, side: "above" }],
    trigger: "auto",
    sequence: [
      { verb: "highlight", target: "label:obere-serie" },
      { verb: "highlight", target: "label:untere-serie" }
    ]
  }, null],
  // Asset-Anker als Sequenz-Ziel: reveal auf das Objekt, Puls auf dem gezeichneten Weg,
  // highlight auf einem Label-Platz. Jeder Zwischenzustand muss sauber sein.
  ["seq-asset-anker", {
    type: "asset", relation: "object",
    text: "Sequenz-Verben docken an die Anker des Objekts an.",
    asset: { ref: "biology.neuron", role: "hero", labels: { reize: "REIZE KOMMEN AN", feuert: "AB HIER FEUERT ES", sprung: "SIGNAL SPRINGT ÜBER" } },
    caption: "Anker aus dem Manifest.",
    trigger: "auto",
    sequence: [
      { verb: "reveal", target: "asset:neuron" },
      { verb: "pulse", from: "node:dendrit", to: "node:soma" },
      { verb: "pulse", from: "node:soma", to: "node:synapse" },
      { verb: "highlight", target: "label:sprung" }
    ]
  }, null],
  // NEGATIV-KONTROLLE: das Label wird VOR seinem Gegenstand gezeigt. Schritt 1 hat dann
  // eine Beschriftung im leeren Bild — genau der Befund, den die Deckkraft-Messung
  // sehen muss. Bleibt sie stumm, prüft das Asset-Gate die Zwischenzustände nicht.
  ["seq-asset-label-vor-objekt", {
    type: "asset", relation: "object",
    text: "Beschriftung erscheint vor ihrem Gegenstand.",
    asset: { ref: "physics.sky-scatter", role: "hero", labels: { blau: "BLAU — IN ALLE RICHTUNGEN" } },
    caption: "Negativ-Kontrolle.",
    trigger: "auto",
    sequence: [
      { verb: "reveal", target: "label:blau" },
      { verb: "reveal", target: "region:scatter" }
    ]
  }, { schritt: 1, muster: /^LEER/ }],
  // NEGATIV-KONTROLLE: Sub-Zeile und Note hängen an demselben Gegenstand wie ihr Label.
  // Erscheint der erst später, stehen BEIDE im leeren Bild. Ohne diese Kontrolle wäre
  // nicht gemessen, ob die neuen Elemente überhaupt an der Sichtbarkeit teilnehmen — ein
  // Punkt-Marker ohne sein Objekt ist derselbe Fehler wie ein Label ohne seins.
  ["seq-asset-sub-und-note-vor-objekt", {
    type: "asset", relation: "object",
    text: "Sub-Zeile und Note erscheinen vor ihrem Gegenstand.",
    asset: {
      ref: "psyche.person", role: "hero",
      labels: { aussen: "WAS DU ZEIGST" },
      subs: { aussen: "WORTE, GESTIK, TATEN" }
    },
    notes: [{ anker: "node:koerper", text: "MELDET SICH ALS GEFÜHL", ton: "es" }],
    caption: "Negativ-Kontrolle.",
    trigger: "auto",
    sequence: [
      { verb: "reveal", target: "sub:aussen" },
      { verb: "reveal", target: "node:koerper" }
    ]
  }, { schritt: 1, muster: /^LEER/ }],
  // Der Zug leiht sich die Strichelung der Serie für seine Bewegung. Am Ende muss die
  // Gestaltung wieder gelten — sonst stehen „gestrichelt" und „durchgezogen" gleich da.
  ["seq-trace-dash-serie", {
    type: "curve", text: "Zug auf einer gestrichelten Serie.",
    xlabel: "ZEIT", ylabel: "WERT",
    series: [
      { label: "GESTRICHELT", color: "ich", shape: "linear-rise", from: "low", to: "high", dash: true },
      { label: "DURCHGEZOGEN", color: "es", shape: "flat", from: "mid" }
    ],
    trigger: "auto",
    sequence: [{ verb: "trace", target: "series:gestrichelt" }]
  }, null]
];

const url = "file://" + resolve("karten-grammatik.html");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto(url);
await page.waitForTimeout(150);

let findings = 0;
const run = async (name, card, shot) => {
  const { out, ast } = await page.evaluate(auditCurveCard, { card });
  if (shot) await page.locator(".phone").screenshot({ path: `${outdir}/${name}.png` });
  const kennz = ast ? `  [${ast.art} apex=${ast.niveau} maxWinkel=${ast.maxDeg}°]` : "";
  const echt = out.filter((o) => !o.startsWith("INFO"));
  if (out.length === 0) console.log(`${name}: OK${kennz}`);
  else { findings += echt.length; console.log(`${name}: ${echt.length ? "" : "OK "}${kennz}\n  ` + out.join("\n  ")); }
  return ast;
};

console.log("——— Solver-Stresstests ———");
for (const [name, card] of CASES) await run(name, card, true);

console.log("——— Sequenz-Stresstests (je Schritt-Endzustand) ———");
for (const [name, card, erwartet] of SEQ_CASES) {
  const N = card.sequence.length;
  let gefeuert = false;
  for (let s = 0; s <= N; s++) {
    const { out } = await page.evaluate(auditCurveCard, { card, seqStep: s });
    if (out === null) { console.log(`${name} s${s}: (keine SVG-Geometrie)`); continue; }
    const passt = (o) => erwartet && s === erwartet.schritt && erwartet.muster.test(o);
    const echt = out.filter((o) => !o.startsWith("INFO") && !passt(o));
    if (out.some(passt)) gefeuert = true;
    findings += echt.length;
    const st = card.sequence[s - 1];
    const was = s === 0 ? "(Ausgangszustand)" : `${st.verb} ${st.target ?? `${st.from}→${st.to}`}`;
    console.log(`${name} s${s}/${N} ${was}: ${echt.length ? "" : "OK"}`
      + (out.length ? "\n  " + out.join("\n  ") : ""));
  }
  await page.evaluate(auditCurveCard, { card, seqStep: N });
  await page.locator(".phone").screenshot({ path: `${outdir}/${name}-s${N}.png` });
  // Eine Negativ-Kontrolle, die nicht feuert, hat nichts geprüft.
  if (erwartet && !gefeuert) {
    findings++;
    console.log(`${name}: NEGATIV-KONTROLLE STUMM — Schritt ${erwartet.schritt} sollte ${erwartet.muster} tragen`);
  }
}

console.log("——— Ereignis-Matrix ———");
const asts = [];
for (const [name, card] of MATRIX) {
  const ast = await run(name, card, SHOT.has(name));
  if (ast) asts.push({ name, ...ast });
}
const rebs = asts.filter((a) => a.art === "rebound");
const steil = [...rebs].sort((a, b) => b.maxDeg - a.maxDeg).slice(0, 5);
console.log(`MATRIX ${MATRIX.length} Kombinationen, davon ${rebs.length} rebound`);
console.log("Steilste Äste: " + steil.map((a) => `${a.name}=${a.maxDeg}°`).join("  "));
console.log(`Apex-Niveaus: min=${Math.min(...rebs.map((a) => a.niveau))} max=${Math.max(...rebs.map((a) => a.niveau))}`);

await browser.close();
console.log(findings === 0 ? "ADVERSARIAL PASS" : `ADVERSARIAL FAIL — ${findings} Befunde`);
process.exit(findings === 0 ? 0 : 1);
