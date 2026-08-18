// Verdichtet einen Bench-Lauf (bench-runs/<stempel>) von EINER Zeile je Lauf auf EINE
// Zeile je Modell. Der Lauf-Report daneben bleibt die Rohmessung; hier steht, was über
// die Wiederholungen hinweg stabil ist — Streuung inklusive, denn ein Modell, das
// einmal glänzt und zweimal abstürzt, ist etwas anderes als eines, das dreimal solide
// liefert, und in einer Mittelwert-Spalte sähen beide gleich aus.
//
// Zusätzlich zur Rohmessung: die TYP-WAHL. Der Contract prüft, ob eine Lektion gültig
// ist — nicht, ob sie visuell abwechslungsreich ist. Genau das ist aber das Kriterium,
// an dem sich der Generator entscheidet: welche der 9 Diagramm-Typen greift ein Modell
// von sich aus, und wiederholt es sich? Ohne diese Spalte fällt die Wahl auf ein Modell,
// das den Contract erfüllt und dabei dreimal dieselbe Kurve zeichnet.
//
// Nutzung: node bench-report.mjs [bench-runs/<stempel>]   (ohne Argument: der jüngste)
//          node bench-report.mjs <dir> --json             (Maschinen-Fassung)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";

const DIR = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const alsJson = process.argv.includes("--json");

const juengster = () => {
  const wurzel = `${DIR}/bench-runs`;
  const dirs = readdirSync(wurzel).filter((d) => existsSync(`${wurzel}/${d}/results.jsonl`)).sort();
  if (!dirs.length) throw new Error("Kein Lauf mit results.jsonl in bench-runs/");
  return `${wurzel}/${dirs.at(-1)}`;
};
const lauf = args[0] ? (args[0].startsWith("/") ? args[0] : `${DIR}/${args[0]}`) : juengster();

// ── Diagramm-Grammatik ───────────────────────────────────────────────────────
/// Die 9 Diagramm-Typen des Katalogs. title/quiz/insight sind Struktur und zählen
/// nicht mit — sie stehen in jeder Lektion und sagen nichts über die Bildsprache.
const DIAGRAMM_TYPEN = ["curve", "balance", "compare", "venn", "cycle", "fanout", "flow", "layers", "asset"];

/// Die Lektion eines Laufs — auch die ABGELEHNTE. Eine Lektion, die am Contract
/// scheitert, hat ihre Typen trotzdem gewählt; sie hier zu übergehen hieße, genau
/// die Modelle aus der Typ-Statistik zu werfen, deren Verhalten man verstehen will.
function lektion(outdir) {
  const p = `${DIR}/${outdir}`;
  if (!existsSync(p)) return null;
  const dateien = readdirSync(p);
  const name = dateien.find((n) => n.endsWith("-lesson-v2.json"))
            ?? dateien.find((n) => n.endsWith("-lesson-v2-rejected.json"))
            ?? dateien.find((n) => n.endsWith("-lesson-v2-partial.json"));
  if (!name) return null;
  try { return JSON.parse(readFileSync(`${p}/${name}`, "utf8")); } catch { return null; }
}

/// Typ-Wahl einer Lektion: welche Diagramm-Typen kommen vor, wie oft.
const typen = (l) => (l?.cards ?? []).map((c) => c.type).filter((t) => DIAGRAMM_TYPEN.includes(t));

/// Fehler-Kurve über die Reparatur-Runden, aus dem Lauf-Protokoll. Sie beantwortet die
/// Frage, die ein blankes „reject-contract" verschweigt: Hat das Verfahren VERSAGT oder
/// wurde es UNTERBROCHEN? Ein Lauf, der 27 → 18 → 10 → 2 Fehler abbaut und dann am
/// Runden-Deckel endet, misst unsere Grenze, nicht das Können des Modells — er gehört
/// anders gelesen als einer, der bei 27 → 26 → 27 stehenbleibt.
function fehlerKurve(outdir) {
  const p = `${DIR}/${outdir}/lauf.log`;
  if (!existsSync(p)) return null;
  const log = readFileSync(p, "utf8");
  const start = Number(/VERSUCH 1 — (\d+) Contract-Fehler/.exec(log)?.[1]);
  const runden = [...log.matchAll(/Patch-Runde \d+ — (\d+) Fehler verbleiben/g)].map((m) => Number(m[1]));
  if (!Number.isFinite(start) || !runden.length) return null;
  const rest = runden.at(-1);
  const erschoepft = /Patch-Runden erschöpft/.test(log);
  return {
    start, verlauf: [start, ...runden], rest, erschoepft,
    // Monoton fallend UND noch im Fallen, als der Deckel kam: dann hätte eine weitere
    // Runde plausibel geholfen. „Plausibel" — bewiesen wäre es erst durch einen Lauf
    // mit höherem Deckel, und diese Spalte behauptet das nicht.
    imFallen: erschoepft && runden.every((v, i, a) => i === 0 ? v < start : v < a[i - 1]),
  };
}

// ── Preise ───────────────────────────────────────────────────────────────────
const BASE = "https://openrouter.ai/api/v1";
const JUDGE = "openai/gpt-oss-120b";

/// Live-Preise. Ohne Katalog bleiben die Kostenspalten LEER — eine geschätzte Zahl
/// in einer Spalte, die „so viel kostet das" verspricht, wäre schlimmer als keine.
async function preise() {
  try {
    const key = readFileSync("/Users/leonvalentin/Workspace/jarvis/.env", "utf8")
      .split("\n").find((l) => l.startsWith("OPENROUTER_API_KEY="))?.split("=").slice(1).join("=").trim();
    const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return null;
    const map = new Map();
    for (const m of (await res.json()).data ?? [])
      map.set(m.id, { in: Number(m.pricing?.prompt), out: Number(m.pricing?.completion) });
    return map;
  } catch { return null; }
}
const KATALOG = await preise();
const preisVon = (id) => KATALOG?.get(id) ?? null;
const kostenAus = (p, i, o) => p && Number.isFinite(p.in) && Number.isFinite(p.out) ? i * p.in + o * p.out : null;

/// Echte Abrechnung schlägt Listenpreis: OpenRouter liefert `cost` je Aufruf und hat
/// den Cache-Rabatt darin schon verrechnet (luna-pro gemessen: 99 % Cache-Treffer =
/// ein Neuntel des Prompt-Preises). Tokens × Liste würde solche Modelle im Vergleich
/// systematisch zu teuer aussehen lassen.
/// Fehlt auch nur EIN Betrag (NIM liefert keinen, Altläufe vor der Erfassung auch
/// nicht), ist die Summe ein Teilbetrag — dann lieber ganz zurück auf die Liste als
/// eine zu niedrige Zahl auszuweisen, die wie ein Preisvorteil aussieht.
const echteSumme = (eintraege, rolle) => {
  let cost = 0, gesehen = false;
  for (const e of eintraege) {
    const u = e.stats.usage?.[rolle];
    if (!u?.calls) continue;
    if ((u.costCalls ?? 0) !== u.calls) return null;
    cost += u.cost ?? 0;
    gesehen = true;
  }
  return gesehen ? cost : null;
};
const usd = (v, stellen = 4) => v == null ? "—" : "$" + v.toFixed(stellen);

// ── Einsammeln ───────────────────────────────────────────────────────────────
const zeilen = readFileSync(`${lauf}/results.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));

const proModell = new Map();
for (const e of zeilen) {
  if (!proModell.has(e.modell)) proModell.set(e.modell, []);
  proModell.get(e.modell).push(e);
}

const summe = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };
/// Spanne statt Mittelwert, wo die Streuung die Aussage ist: „0" und „0–7" sind
/// verschiedene Befunde, ein Mittelwert von 2,3 verwischt beide zur selben Zahl.
const spanne = (xs) => !xs.length ? "—" : Math.min(...xs) === Math.max(...xs)
  ? String(Math.min(...xs)) : `${Math.min(...xs)}–${Math.max(...xs)}`;

const verdichte = (modell, laeufe) => {
  const mitStats = laeufe.filter((e) => e.stats);
  const gelaufen = laeufe.filter((e) => !String(e.outcome).startsWith("nicht gelaufen"));
  const ausgang = {};
  for (const e of laeufe) ausgang[e.outcome] = (ausgang[e.outcome] ?? 0) + 1;

  // Erstwurf: die Contract-Fehler der ERSTEN Antwort, vor jeder Reparatur. Das ist
  // das eigentliche Können — alles danach misst die Reparatur-Fähigkeit der Pipeline.
  //
  // ACHTUNG, sonst rankt diese Spalte falsch herum: der Validator prüft die Felder
  // NUR bei passender Kartenzahl (validate-lesson.mjs: `if (n >= minCards && n <=
  // maxCards)`). Eine Lektion mit 9 statt 8 Karten meldet deshalb GENAU EINEN Fehler
  // — nicht weil sie fast perfekt ist, sondern weil niemand hingesehen hat. Gemessen
  // an solar-pro4 r2 (17.08.): „1 Fehler" im Erstwurf, nach der Kürzung 17. Solche
  // Läufe werden gezählt, aber getrennt ausgewiesen statt mit den geprüften vermischt.
  const maskiert = (e) => (e.stats.contractErsterWurf?.liste ?? [])
    .some((f) => /^cards: (zu wenig|zu viele) Karten/.test(f));
  const geprueft = mitStats.filter((e) => !maskiert(e));
  const ungeprueft = mitStats.filter(maskiert).length;
  const erstwurf = geprueft.map((e) => e.stats.contractErsterWurf?.fehler).filter((n) => Number.isFinite(n));
  const runden = mitStats.map((e) => {
    const r = e.stats.runden ?? {};
    return (r.vollRetries ?? 0) + (r.patchRunden ?? 0) + (r.ergaenzungsRunden ?? 0)
         + (r.kuerzungsRunden ?? 0) + (r.generatorPatches ?? 0);
  });

  // Judge-Befunde nach Schwere getrennt: wrong/unsupported sind Fakten-Fehler,
  // imprecise ist Unschärfe. Sie in eine Zahl zu addieren verschweigt den Unterschied.
  let schwer = 0, leicht = 0, checks = 0;
  for (const e of mitStats) for (const r of e.stats.judge ?? []) {
    checks += r.checks ?? 0;
    for (const [k, n] of Object.entries(r.verdicts ?? {})) {
      if (k === "wrong" || k === "unsupported") schwer += n; else if (k === "imprecise") leicht += n;
    }
  }
  const notecheck = mitStats.map((e) => (e.stats.notecheck ?? []).at(-1)).filter(Boolean);

  // Läufe, die am Runden-Deckel endeten, obwohl die Fehlerzahl noch fiel.
  const kurven = laeufe.map((e) => ({ lauf: e.lauf, outcome: e.outcome, k: fehlerKurve(e.outdir) }))
    .filter((x) => x.k);
  const amDeckel = kurven.filter((x) => x.k.imFallen);

  // Typ-Wahl über alle Läufe dieses Modells. `ausLektionen` zählt mit, WIE VIELE
  // Lektionen überhaupt zum Messen da waren: ein Modell, dessen Läufe platzten, bevor
  // eine Datei geschrieben war, hat keine Typen GEWÄHLT — es ist ununtersucht. Ohne
  // diese Zahl steht es mit derselben leeren Zelle da wie eines, das jede Vielfalt
  // vermeidet, und die beiden Befunde sind das Gegenteil voneinander.
  const lektionen = laeufe.map((e) => lektion(e.outdir)).filter(Boolean);
  const alleTypen = lektionen.flatMap((l) => typen(l));
  const haeufigkeit = {};
  for (const t of alleTypen) haeufigkeit[t] = (haeufigkeit[t] ?? 0) + 1;
  const verschieden = Object.keys(haeufigkeit).length;
  // Anteil des meistgenutzten Typs: 1,0 hieße „immer dasselbe Bild".
  const konzentration = alleTypen.length ? Math.max(...Object.values(haeufigkeit)) / alleTypen.length : null;

  const tokIn = summe(mitStats.map((e) => e.stats.usage?.gen?.in ?? 0));
  const tokOut = summe(mitStats.map((e) => e.stats.usage?.gen?.out ?? 0));
  const provider = [...new Set(mitStats.flatMap((e) => e.stats.usage?.gen?.providers ?? []))];

  // ── Kosten ─────────────────────────────────────────────────────────────────
  // Zwei verschiedene Zahlen, die gern verwechselt werden:
  //   je LAUF        — was ein Durchgang kostet, ob er etwas liefert oder nicht.
  //   je LEKTION     — was eine BRAUCHBARE Lektion kostet. Hier zählen die verworfenen
  //                    Läufe mit, denn sie sind bezahlt und liefern nichts. Ein Modell,
  //                    das zwei von drei Läufen verwirft, kostet je Lektion das
  //                    Dreifache seines Laufpreises — ein billiges Modell kann so
  //                    teurer werden als ein teures, das jedes Mal durchläuft.
  // Der Judge läuft auf einem festen bezahlten Modell. Bei einem `:free`-Generator ist
  // er der EINZIGE Kostenblock — „kostenlos" ist die Lektion darum nie.
  const pGen = preisVon(modell), pJudge = preisVon(JUDGE);
  const genEcht = echteSumme(mitStats, "gen"), judgeEcht = echteSumme(mitStats, "judge");
  const genKosten = genEcht ?? summe(mitStats.map((e) => kostenAus(pGen, e.stats.usage?.gen?.in ?? 0, e.stats.usage?.gen?.out ?? 0) ?? 0));
  const judgeKosten = judgeEcht ?? summe(mitStats.map((e) => kostenAus(pJudge, e.stats.usage?.judge?.in ?? 0, e.stats.usage?.judge?.out ?? 0) ?? 0));
  // Ohne Katalogpreis UND ohne Abrechnung gibt es keine Gesamtsumme.
  const gesamt = (pGen == null && genEcht == null) ? null : genKosten + judgeKosten;
  const bestanden = ausgang.pass ?? 0;
  const genIn = summe(mitStats.map((e) => e.stats.usage?.gen?.in ?? 0));
  const kosten = {
    gesamt, gen: (pGen == null && genEcht == null) ? null : genKosten, judge: judgeKosten,
    // Woher die Zahl stammt, gehört neben die Zahl: „Liste" überschätzt jedes Modell
    // mit stabilem Systemprompt, weil sie den Cache-Rabatt nicht kennt.
    quelle: genEcht != null ? "abgerechnet" : "Liste",
    // „0 %" und „nicht erfasst" sind zwei verschiedene Aussagen: Läufe von vor der
    // Cache-Erfassung dürfen keinen Nulltreffer behaupten, den nie jemand gemessen hat.
    cacheAnteil: genIn && mitStats.some((e) => e.stats.usage?.gen?.cached != null)
      ? summe(mitStats.map((e) => e.stats.usage?.gen?.cached ?? 0)) / genIn : null,
    jeLauf: gesamt == null || !mitStats.length ? null : gesamt / mitStats.length,
    // Ohne einen einzigen bestandenen Lauf gibt es keinen Preis je Lektion —
    // die Division wäre unendlich, und „—" sagt genau das Richtige.
    jeLektion: gesamt == null || !bestanden ? null : gesamt / bestanden,
    judgeAnteil: gesamt ? judgeKosten / gesamt : null,
  };

  return {
    modell, laeufe: laeufe.length, gelaufen: gelaufen.length,
    pass: ausgang.pass ?? 0,
    ausgang,
    erstwurfFehler: { median: median(erstwurf), spanne: spanne(erstwurf), n: erstwurf.length, ungeprueft },
    reparaturRunden: { median: median(runden), spanne: spanne(runden) },
    judge: { checks, schwer, leicht },
    notecheckHart: summe(notecheck.map((n) => n.hart ?? 0)),
    richtungHart: summe(notecheck.map((n) => n.hartRichtung ?? 0)),
    typen: { verschieden, vonMoeglichen: DIAGRAMM_TYPEN.length, haeufigkeit, konzentration,
             ausLektionen: lektionen.length, kartenGezaehlt: alleTypen.length },
    tokens: { in: tokIn, out: tokOut },
    kosten,
    amDeckel: amDeckel.map((x) => ({ lauf: x.lauf, verlauf: x.k.verlauf, rest: x.k.rest })),
    dauerMedianS: median(gelaufen.map((e) => Math.round(e.dauerMs / 1000))),
    provider,
  };
};

const daten = [...proModell].map(([m, l]) => verdichte(m, l));

// Sortierung nach bestandenen Läufen, dann nach Erstwurf-Fehlern. Das ist eine
// ORDNUNG, kein Score: beide Größen sind gemessen, keine ist gewichtet oder verrechnet.
daten.sort((a, b) => b.pass - a.pass || (a.erstwurfFehler.median ?? 99) - (b.erstwurfFehler.median ?? 99));

if (alsJson) {
  writeFileSync(`${lauf}/uebersicht.json`, JSON.stringify({ lauf, daten }, null, 2));
  console.log(`${lauf}/uebersicht.json`);
} else {
  const pct = (v) => v == null ? "—" : `${Math.round(v * 100)} %`;
  const kopf = ["Modell", "bestanden", "Erstwurf-Fehler", "Reparatur-Runden", "Judge schwer/leicht",
                "notecheck hart", "Typen", "häufigster Typ", "$/Lauf", "$/Lektion", "Dauer", "Provider"];
  const tab = daten.map((d) => [
    d.modell, `${d.pass}/${d.laeufe}`,
    (d.erstwurfFehler.n ? `${d.erstwurfFehler.median} (${d.erstwurfFehler.spanne})` : "—")
      + (d.erstwurfFehler.ungeprueft ? ` +${d.erstwurfFehler.ungeprueft}?` : ""),
    `${d.reparaturRunden.median ?? "—"} (${d.reparaturRunden.spanne})`,
    `${d.judge.schwer}/${d.judge.leicht}`,
    `${d.notecheckHart}${d.richtungHart ? ` (${d.richtungHart} Richtung)` : ""}`,
    d.typen.ausLektionen ? `${d.typen.verschieden}/${d.typen.vonMoeglichen}` : "keine Lektion",
    d.typen.ausLektionen ? pct(d.typen.konzentration) : "—",
    usd(d.kosten.jeLauf), usd(d.kosten.jeLektion),
    d.dauerMedianS == null ? "—" : `${d.dauerMedianS}s`,
    d.provider.join(",") || "—",
  ]);
  const breit = kopf.map((h, i) => Math.max(h.length, ...tab.map((z) => z[i].length)));
  const zeile = (z) => z.map((c, i) => c.padEnd(breit[i])).join("  ");
  console.log(`ÜBERSICHT — ${lauf.split("/").at(-1)}\n`);
  console.log(zeile(kopf));
  console.log(breit.map((b) => "-".repeat(b)).join("  "));
  for (const z of tab) console.log(zeile(z));
  if (daten.some((d) => d.erstwurfFehler.ungeprueft)) {
    console.log(`\n  „+N?" bei Erstwurf-Fehler: N Läufe hatten die falsche KARTENZAHL — der Validator`);
    console.log(`  überspringt dann alle Feldprüfungen, die gemeldete Fehlerzahl ist also nicht vergleichbar`);
    console.log(`  (gemessen: „1 Fehler" im Erstwurf, nach der Kürzung 17). Sie sind aus Median/Spanne heraus.`);
  }
  console.log(`\nAusgänge je Modell:`);
  for (const d of daten) console.log(`  ${d.modell}: ` + Object.entries(d.ausgang).map(([k, n]) => `${k}×${n}`).join(", "));
  const deckel = daten.filter((d) => d.amDeckel.length);
  if (deckel.length) {
    console.log(`\n## Am Runden-Deckel abgebrochen, nicht am Können\n`);
    console.log(`  Diese Läufe bauten Contract-Fehler bis zuletzt ab und endeten trotzdem als`);
    console.log(`  „reject-contract" — die Patch-Runden (MAX_PATCH) waren vorher zu Ende.\n`);
    for (const d of deckel) for (const l of d.amDeckel)
      console.log(`  ${d.modell} r${l.lauf}: ${l.verlauf.join(" → ")} Fehler, ${l.rest} offen bei Abbruch`);
  }
  console.log(`\n## Preis je Lektion\n`);
  if (!KATALOG) console.log("  Katalog nicht erreichbar — keine Preisangaben (eine geschätzte Zahl wäre hier schlimmer als keine).");
  else {
    console.log(`  „je Lektion" enthält die VERWORFENEN Läufe: sie sind bezahlt und liefern nichts.`);
    console.log(`  Der Judge (${JUDGE}) läuft auf jedem Modell mit und kostet auch bei :free-Generatoren.\n`);
    const pk = ["Modell", "je Lauf", "je Lektion", "davon Judge", "1000 Lektionen", "Quelle", "Cache-Treffer"];
    const pt = daten.map((d) => [d.modell, usd(d.kosten.jeLauf), usd(d.kosten.jeLektion),
      d.kosten.judgeAnteil == null ? "—" : `${Math.round(d.kosten.judgeAnteil * 100)} %`,
      usd(d.kosten.jeLektion == null ? null : d.kosten.jeLektion * 1000, 2),
      d.kosten.quelle,
      d.kosten.cacheAnteil == null ? "—" : `${Math.round(d.kosten.cacheAnteil * 100)} %`]);
    const pb = pk.map((h, i) => Math.max(h.length, ...pt.map((z) => z[i].length)));
    console.log(pk.map((c, i) => c.padEnd(pb[i])).join("  "));
    console.log(pb.map((b) => "-".repeat(b)).join("  "));
    for (const z of pt) console.log(z.map((c, i) => c.padEnd(pb[i])).join("  "));
    const ohne = daten.filter((d) => d.kosten.jeLektion == null && d.kosten.gesamt != null);
    if (ohne.length) console.log(`\n  Ohne Preis je Lektion (kein Lauf bestanden): ${ohne.map((d) => d.modell).join(", ")}`);
    // Die Herkunft der Zahl entscheidet, ob zwei Zeilen überhaupt vergleichbar sind.
    if (daten.some((d) => d.kosten.quelle === "Liste") && daten.some((d) => d.kosten.quelle === "abgerechnet"))
      console.log(`\n  ⚠️ GEMISCHTE QUELLEN: „Liste" kennt den Cache-Rabatt NICHT und liegt darum zu hoch.`
        + `\n     Zeilen mit „Liste" gegen Zeilen mit „abgerechnet" zu stellen, verzerrt zugunsten der Liste-Zeile.`);
  }
  console.log(`\nTyp-Wahl (Diagramm-Karten, alle Läufe zusammen):`);
  for (const d of daten) console.log(`  ${d.modell}: ` + (Object.entries(d.typen.haeufigkeit)
    .sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join(", ")
    || `— (keine Lektion geschrieben, ${d.laeufe} Läufe)`)
    + (d.typen.ausLektionen && d.typen.ausLektionen < d.laeufe
      ? `   [nur ${d.typen.ausLektionen} von ${d.laeufe} Läufen lieferten eine Lektion]` : ""));
}
