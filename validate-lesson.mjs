// Türsteher der Pipeline: prüft Generator-JSON gegen den Karten-Contract v2.
// v2: Diagramm-Karten tragen `relation` (das System leitet den Typ ab); `curve`
// ist rein semantisch (Form, Niveaus, Ereignis-Zeitpunkt, Anker) — keine Koordinaten.
// Nutzung: node validate-lesson.mjs <lesson.json> [--depth kompakt|standard|tief]
//          → Exit 0 + "OK" oder Exit 1 + Fehlerliste.
// Als Modul: import { RELATION_TO_TYPE, DEPTH_CARDS, normalizeLesson, validateLesson }.
import { appendFileSync, readFileSync } from "fs";

// Kartenzahl je Tiefe — dieselbe Zusage, die die Kachel im Erstellen-Sheet macht
// („ca. 7 / 12 / 20 Karten", CreateSheetView.Depth.estimate). EINE Quelle: Prompt,
// Validator und Ergänzungs-Runde lesen ihren Sollwert hier.
export const DEPTH_CARDS = { kompakt: [6, 8], standard: [11, 13], tief: [18, 22] };
// Ohne Tiefe (Alt-Lektionen, CLI-Blindtests ohne --depth) gilt der Bestands-Contract.
export const DEFAULT_CARDS = [7, 8];

/// Soll-Bereich zu einer Tiefe. `null`/`undefined` = Bestands-Contract; ein
/// unbekannter Wert ist ein Aufruf-Fehler und wird NICHT still auf einen
/// Default gebogen (sonst trüge die neue Tiefe die Zusage der alten).
export function cardRange(depth) {
  if (depth === undefined || depth === null || depth === "") return DEFAULT_CARDS;
  const r = DEPTH_CARDS[depth];
  if (!r) throw new Error(`Unbekannte Tiefe "${depth}" (erlaubt: ${Object.keys(DEPTH_CARDS).join(", ")})`);
  return r;
}

/// Minutenangabe der Titel-Karte, aus der Kartenzahl abgeleitet (≈36 s je Karte —
/// trifft die Kachel-Zusagen 7→4, 12→7, 20→12 Minuten).
export const lesezeit = (n) => Math.max(2, Math.round(n * 0.6));

export const RELATION_TO_TYPE = {
  "trend": "curve",           // eine Größe entwickelt sich über Zeit/Menge
  "weighing": "balance",      // zwei Größen, eine wiegt schwerer
  "contrast": "compare",      // zwei Kategorien nebeneinander
  "intersection": "venn",     // die Schnittmenge ist die Aussage
  "loop": "cycle",            // Kreislauf, der sich selbst füttert
  "multiplication": "fanout", // ein Input wirkt vielfach
  "descent": "flow",          // Schritte, der letzte sinkt unter eine Grenze
  "depth-layers": "layers",   // Sichtbares oben, Verborgenes unten
  "object": "asset"           // der Gegenstand selbst ist die Aussage (Asset-Karte)
};
const STRUCT_TYPES = new Set(["title", "quiz", "insight"]);

// ————————————————————— v3: Asset-Registry —————————————————————
// Die kuratierte Library ist assets/manifest.json — dieselbe Datei, die der Renderer
// über assets/assets.js bekommt. Das LLM kann keine Assets erfinden: ein ref, den die
// Registry nicht kennt, ist ein Fehler, BEVOR gerendert wird.
export const ASSET_ROLLEN = ["hero", "inline"];
function ladeAssets() {
  try {
    return JSON.parse(readFileSync(new URL("./assets/manifest.json", import.meta.url), "utf8")).assets || {};
  } catch (e) {
    // Kein stiller Leerlauf: ohne Registry ist JEDER ref unbekannt, und der Fehlertext
    // unten nennt dann die Ursache statt „ref existiert nicht".
    ASSET_LADEFEHLER = e.message;
    return {};
  }
}
let ASSET_LADEFEHLER = null;
export const ASSETS = ladeAssets();
/// Assets, die ein Karten-JSON referenzieren darf: die intern verbrauchten (Waage,
/// Eisberg gehören ihren Karten-Typen) stehen dem LLM NICHT zur Verfügung.
export const ASSET_REFS = Object.entries(ASSETS).filter(([, a]) => !a.verbraucher).map(([ref]) => ref);

// ————————————————————— v3: Breiten-Maß der Label-Plätze —————————————————————
// Ein Zeichen-Deckel misst die falsche Größe. Die Label-Plätze eines Assets stehen STATISCH
// (Position und Ausrichtung stehen als `data-slot` in der SVG-Datei, es gibt keinen Solver,
// der ausweichen könnte) — ob ein Text dort hineinpasst, entscheidet seine BREITE. Gemessen:
// „NICHT WAHRGENOMMEN" hielt den Deckel (18 ≤ 20) und lief trotzdem rechts aus der Karte,
// „WÜNSCHE · ÄNGSTE · ALTE MUSTER" (30 Zeichen) passt bequem. Breite Versalien sprengen den
// Platz bei legaler Zeichenzahl; einen engeren Deckel zu setzen wäre die falsche Antwort, er
// verböte auch die schmalen langen Texte. Der Deckel bleibt als Richtwert, die Breite kommt dazu.
//
// assets/textmasse.json trägt die Vorschübe der echten Wirtsschrift (erzeugt und geprüft von
// probes/asset-slot-max.mjs). Damit steht die Breite HIER fest, ohne Browser — und genau
// deshalb ist ein zu breiter Text eine Contract-Verletzung, die in die Patch-Runde geht,
// statt später im Audit als CLIP die Kette mit einem System-Fehler abzubrechen.
let TEXTMASSE_LADEFEHLER = null;
function ladeTextmasse() {
  try {
    return JSON.parse(readFileSync(new URL("./assets/textmasse.json", import.meta.url), "utf8")).masse || null;
  } catch (e) {
    TEXTMASSE_LADEFEHLER = e.message;
    return null;
  }
}
export const TEXTMASSE = ladeTextmasse();

/// Breite eines Textes in Karten-Einheiten: Summe der Zeichen-Vorschübe plus das Kerning
/// der Nachbarpaare. Alle Werte der Tabelle sind nach OBEN gerundet, das Ergebnis liegt
/// deshalb nie unter dem, was der Browser zeichnet — das Gate urteilt nie lockerer als das
/// Audit, das dieselbe Box misst. Was die Tabelle nicht kennt, macht es strenger: ein
/// unbekanntes Zeichen zählt als breitester je gemessener Glyph, ein unbekanntes Paar mit
/// dem am stärksten spreizenden Kerning.
export function textBreite(text, ebene) {
  const m = TEXTMASSE?.[ebene];
  if (!m) return null;
  const cs = [...String(text)];
  let summe = 0;
  for (let i = 0; i < cs.length; i++) {
    const v = m.vorschub[cs[i]];
    summe += v === undefined ? m.fremd : v;
    if (i + 1 < cs.length) {
      const beide = m.vorschub[cs[i]] !== undefined && m.vorschub[cs[i + 1]] !== undefined;
      summe += beide ? (m.kern[cs[i] + cs[i + 1]] ?? 0) : m.maxKernPlus;
    }
  }
  return summe;
}

/// Wachstums-Backlog: jeder echte Miss wird protokolliert — er ist die Bestellung für
/// die nächste Asset-Runde (generieren → normalisieren → QA → einlagern), nicht bloß
/// ein Fehler. Schreibfehler dürfen NIE die Validierung kippen: das Backlog ist ein
/// Beobachter, kein Türsteher.
export function logMiss(art, wunsch, kontext = {}) {
  const ziel = process.env.LERNKARTEN_BACKLOG
    || new URL("./assets/backlog.jsonl", import.meta.url).pathname;
  try {
    appendFileSync(ziel, JSON.stringify({ ts: new Date().toISOString(), art, wunsch, ...kontext }) + "\n");
  } catch { /* Backlog ist optional (read-only FS im Worker) */ }
}

// ————————————————————— v3: Anker-Registry —————————————————————
// Jeder Karten-Typ trägt stabile Anker-Namen im Schema `typ:id`, DETERMINISTISCH aus
// dem Karten-JSON abgeleitet — ohne Rendern. Der Validator prüft Sequenz-Targets damit,
// bevor irgendetwas gezeichnet wird.
//
// ZWEITER PRODUZENT: renderer.js setzt dieselben Namen konstruktiv als `data-anchor`
// beim ERZEUGEN der Elemente (nachträgliches Klassifizieren wäre fehleranfällig — die
// Serien-Geometrie ist eine klassenlose polyline, `.c-series` ist das Text-Label).
// Dass beide Produzenten dasselbe sagen, bleibt eine Behauptung, solange sie niemand
// misst: `node probes/anker-check.mjs` vergleicht Registry gegen DOM für JEDEN Typ.
//
// Slug: lowercase, Umlaute bleiben (keine Transliteration), Leerzeichen → "-",
// Satzzeichen/Markup fallen weg. Gleicher Slug zweimal auf einer Karte → "-2", "-3".
export const ankerSlug = (v, fallback = "") => {
  const s = String(v ?? "").replace(/<[^>]+>/g, " ").trim().toLowerCase()
    .replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]/gu, "").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return s || fallback;
};

// Serien-Index einer Note (Index ODER Label — beide Formen erlaubt der Contract).
const noteSerie = (card, n) => typeof n.series === "number" ? n.series
  : (card.series || []).findIndex((s) => s.label === n.series);

// Je Typ knapp definiert, ausschließlich aus vorhandenen Feldern:
//   anker  — alle gültigen Namen (Reihenfolge = Bau-Reihenfolge im Renderer)
//   paare  — welche Anker der Typ als VERBUNDEN deklariert (nur dort ist `pulse` wahr)
//   aeste  — wie viele Striche ein trace-fähiger Anker nacheinander zeichnen kann
const ANKER_MODELL = {
  curve(card, A, m) {
    const serien = (card.series || []).map((s, i) => {
      const n = A(`series:${ankerSlug(s.label, String(i))}`);
      m.aeste[n] = 1 + (s.afterStop && card.stop ? 1 : 0);   // Haupt-Ast + Nach-Stop-Ast
      m.traceBar.push(n);
      return n;
    });
    (card.series || []).forEach((s, i) => { if (s.label !== undefined) A(`label:${ankerSlug(s.label, String(i))}`); });
    if (card.stop) { A("stop"); A(`label:${ankerSlug(card.stop.label, "ereignis")}`); }
    const notes = (card.notes || []).map((n, i) => ({ name: A(`note:${ankerSlug(n.label, String(i))}`), si: noteSerie(card, n) }));
    A("axis");
    // Verbunden sind zwei Notes DERSELBEN Serie: der Puls läuft auf deren Strich von
    // der einen zur anderen. Quer über zwei Serien gibt es keinen Weg — nur einen Sprung.
    for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++)
      if (notes[i].si >= 0 && notes[i].si === notes[j].si) m.paare.push([notes[i].name, notes[j].name]);
    void serien;
  },
  balance(card, A, m) {
    const l = A(`node:${ankerSlug(card.left?.label, "links")}`);
    const r = A(`node:${ankerSlug(card.right?.label, "rechts")}`);
    const p = A("pivot");
    A("beam");
    A(`label:${ankerSlug(card.left?.label, "links")}`);
    A(`label:${ankerSlug(card.right?.label, "rechts")}`);
    A(`label:${ankerSlug(card.pivot?.label, "drehpunkt")}`);
    m.paare.push([l, p], [r, p]);   // Gewicht läuft über den Balken zum Drehpunkt
  },
  fanout(card, A, m) {
    const q = A(`node:${ankerSlug(card.source?.label, "quelle")}`);
    A("fan");
    const n = Number.isInteger(card.count) ? card.count : 0;
    for (let i = 1; i <= n; i++) m.paare.push([q, A(`target:${i}`)]);
    A(`label:${ankerSlug(card.source?.label, "quelle")}`);
    A(`label:${ankerSlug(card.result?.label, "wirkung")}`);
  },
  venn(card, A, m) {
    const a = A(`region:${ankerSlug(card.a?.label, "a")}`);
    const b = A(`region:${ankerSlug(card.b?.label, "b")}`);
    const o = A("overlap");
    A(`label:${ankerSlug(card.a?.label, "a")}`);
    A(`label:${ankerSlug(card.b?.label, "b")}`);
    (card.overlap?.label || []).forEach((l, i) => A(`label:${ankerSlug(l, `schnitt${i}`)}`));
    m.paare.push([a, o], [b, o]);
  },
  compare(card, A) {
    // Reine HTML-Karte: keine Pfad-Geometrie, also keine verbundenen Anker (kein pulse).
    for (const seite of ["left", "right"]) {
      A(`panel:${seite}`);
      A(`label:${ankerSlug(card[seite]?.title, seite)}`);
      (card[seite]?.items || []).forEach((it, i) => A(`item:${ankerSlug(it.label, `${seite}${i}`)}`));
    }
  },
  cycle(card, A, m) {
    const steps = (card.steps || []).map((s, i) => A(`step:${ankerSlug(s.label, String(i))}`));
    (card.steps || []).forEach((s, i) => A(`label:${ankerSlug(s.label, String(i))}`));
    // arrow:i verbindet Schritt i mit Schritt i+1 (der letzte schließt den Kreis).
    steps.forEach((_, i) => { A(`arrow:${i + 1}`); m.paare.push([steps[i], steps[(i + 1) % steps.length]]); });
  },
  flow(card, A, m) {
    const steps = (card.steps || []).map((s, i) => A(`step:${ankerSlug(s.label, String(i))}`));
    (card.steps || []).forEach((s, i) => A(`label:${ankerSlug(s.label, String(i))}`));
    for (let i = 1; i < steps.length; i++) { A(`arrow:${i}`); m.paare.push([steps[i - 1], steps[i]]); }
    A("sink");
  },
  // Asset-Karte: die Anker kommen aus dem MANIFEST (Objekt-Anker in Manifest-Reihenfolge,
  // dann die gefüllten Label-Plätze). Deterministisch aus Karten-JSON + Registry, ohne
  // Rendern — dieselbe Reihenfolge, die assetEinbau() im Renderer vergibt.
  asset(card, A, m) {
    const eintrag = ASSETS[card.asset?.ref];
    if (!eintrag) return;
    A(`asset:${String(card.asset.ref).split(".").pop()}`);
    (eintrag.anker || []).forEach((n) => A(n));
    (eintrag.labelSlots || []).forEach((slot) => {
      const txt = card.asset.labels?.[slot.id];
      if (txt === undefined || txt === null || txt === "") return;
      A(`label:${slot.id}`);
      // Die Sub-Zeile hängt an ihrem Label und wird deshalb direkt danach vergeben —
      // dieselbe Folge, in der assetEinbau() sie im Renderer erzeugt.
      const sub = card.asset.subs?.[slot.id];
      if (sub !== undefined && sub !== null && sub !== "") A(`sub:${slot.id}`);
    });
    // Freie Anker-Notes zuletzt: sie sind das einzige Element der Karte, dessen Name aus
    // dem Text kommt statt aus dem Objekt.
    (card.notes || []).forEach((n, i) => A(`note:${ankerSlug(n?.text, String(i))}`));
    // Verbunden ist, was das Objekt als Weg ZEICHNET (data-link im SVG, im Manifest als
    // paare geführt und von asset-check.mjs gegen die Datei geprüft).
    (eintrag.paare || []).forEach(([a, b]) => m.paare.push([a, b]));
  },
  layers(card, A) {
    (card.body?.regions || []).forEach((r, i) => A(`region:${ankerSlug(r.label, String(i))}`));
    (card.zones || []).forEach((z, i) => A(`zone:${ankerSlug(z.label, String(i))}`));
    A("waterline");
    (card.body?.regions || []).forEach((r, i) => A(`label:${ankerSlug(r.label, String(i))}`));
  }
};

/// Vollständiges Sequenz-Modell einer Karte: Anker, verbundene Paare, trace-Äste.
export function ankerModell(card) {
  const m = { typ: card?.type, anker: [], paare: [], aeste: {}, traceBar: [] };
  const seen = new Set();
  const A = (name) => {
    let n = name;
    for (let k = 2; seen.has(n); k++) n = `${name}-${k}`;
    seen.add(n); m.anker.push(n); return n;
  };
  if (ANKER_MODELL[card?.type]) ANKER_MODELL[card.type](card, A, m);
  return m;
}

/// Die Menge gültiger Anker-Namen einer Karte — ohne Rendern, ohne DOM.
export function ankerFuerKarte(card) { return ankerModell(card).anker; }

export const SEQ_VERBEN = ["reveal", "trace", "pulse", "highlight", "dim"];
export const SEQ_MAX = 6;
// Nur "auto": der Tap gehört exklusiv dem Karten-Advance (Leon-Lock 14.08.) — ein
// Trigger-Wert ohne erreichbares Verhalten wäre eine Falle, kein Ausdrucksraum.
// Kommt mit echter Schritt-Interaktion (v4) additiv zurück.
export const SEQ_TRIGGER = ["auto"];

const SHAPES = ["linear-rise", "compound-rise", "saturating-rise", "decay-halflife", "suppressed", "flat"];
const LEVEL_ORD = { floor: 0, low: 1, mid: 2, high: 3 };
const AFTER_STOP = ["collapse", "reset", "rebound"];
// Apex-Höhe des Rebound-Asts. `floor` fehlt bewusst: ein Rebound schnellt nach oben,
// ein Apex auf dem Boden wäre keine Höhe, sondern ein Widerspruch zur Form.
const REBOUND_LEVELS = ["low", "mid", "high"];
const COLORS = new Set(["es", "ich", "ueberich"]);

/// Sequenz-Layer v3, ADDITIV: eine Karte ohne `sequence` bleibt exakt so gültig wie
/// vorher. Geprüft wird gegen die Anker-Registry der KARTE — ein Target, das es dort
/// nicht gibt, ist ein Fehler, bevor irgendetwas gerendert wurde.
function checkSequence(card, p, err) {
  if (card.trigger !== undefined && !SEQ_TRIGGER.includes(card.trigger))
    err(p + ".trigger", `ungültig "${card.trigger}" (erlaubt: ${SEQ_TRIGGER.join(", ")}) — ohne Angabe gilt "auto"`);
  if (card.sequence === undefined) return;
  const { anker, paare, aeste, traceBar } = ankerModell(card);
  if (!anker.length) {
    err(p + ".sequence", `Karten-Typ "${card.type}" trägt keine Anker — eine Sequenz hätte nichts zu adressieren; `
      + `entferne ${p}.sequence (Sequenzen gehören auf Diagramm-Karten)`);
    return;
  }
  if (!Array.isArray(card.sequence) || card.sequence.length < 1 || card.sequence.length > SEQ_MAX) {
    const n = Array.isArray(card.sequence) ? card.sequence.length : -1;
    err(p + ".sequence", n < 0 ? `ist kein Array — erwartet 1–${SEQ_MAX} Schritte {verb, target}`
      : `braucht 1–${SEQ_MAX} Schritte, hat ${n} — ${n ? `entferne ${n - SEQ_MAX} Schritte (die kleinste Aussage zuerst)` : "entferne das Feld"}`);
    return;
  }
  const alle = new Set(anker);
  const verbunden = new Set(paare.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const paarText = paare.length ? paare.map(([a, b]) => `${a} → ${b}`).join(" · ")
    : `diese Karte hat keine verbundenen Anker — pulse ist auf ihr nicht möglich`;
  const gesehen = new Map();
  card.sequence.forEach((st, i) => {
    const sp = `${p}.sequence[${i}]`;
    if (!SEQ_VERBEN.includes(st?.verb)) {
      err(sp + ".verb", `unbekanntes Verb "${st?.verb}" (erlaubt: ${SEQ_VERBEN.join(", ")})`);
      return;
    }
    const gilt = (name, feld) => {
      if (alle.has(name)) return true;
      err(sp + "." + feld, `Anker "${name}" gibt es auf dieser Karte nicht — gültige Anker: ${anker.join(", ")}`);
      return false;
    };
    if (st.verb === "pulse") {
      if (st.target !== undefined)
        err(sp + ".target", `pulse läuft ZWISCHEN zwei Ankern — setze ${sp}.from und ${sp}.to und entferne ${sp}.target`);
      if (st.from === undefined || st.to === undefined) {
        err(sp, `pulse braucht from UND to (gültige Verbindungen: ${paarText})`);
        return;
      }
      // „kein Target doppelt im selben Schritt": ein Puls von A nach A wäre kein Weg.
      if (st.from === st.to) { err(sp, `pulse von "${st.from}" auf sich selbst — from und to müssen verschieden sein`); return; }
      if (!gilt(st.from, "from") || !gilt(st.to, "to")) return;
      if (!verbunden.has(`${st.from}|${st.to}`))
        err(sp, `"${st.from}" und "${st.to}" sind auf einer ${card.type}-Karte nicht verbunden — `
          + `ein Puls braucht einen Weg, den das Bild zeigt. Gültige Verbindungen: ${paarText}`);
    } else {
      if (st.from !== undefined || st.to !== undefined)
        err(sp, `from/to gibt es nur bei pulse — ${st.verb} nennt sein Ziel als ${sp}.target`);
      if (st.target === undefined) { err(sp + ".target", `fehlt — ${st.verb} braucht einen Anker (gültig: ${anker.join(", ")})`); return; }
      if (!gilt(st.target, "target")) return;
      if (st.verb === "trace" && !traceBar.includes(st.target))
        err(sp + ".target", `trace zeichnet einen Kurvenstrich und geht nur auf series:* (ist "${st.target}") — `
          + (traceBar.length ? `gültig: ${traceBar.join(", ")}` : `diese Karte hat keine Serie, nimm reveal`));
    }
    // Ein Schritt ist ein neuer ZUSTAND. Zweimal dasselbe Verb auf denselben Anker
    // ändert nichts — außer bei trace: dessen Wiederholung zeichnet den NÄCHSTEN Ast.
    const key = st.verb === "pulse" ? `pulse|${st.from}|${st.to}` : `${st.verb}|${st.target}`;
    const n = (gesehen.get(key) || 0) + 1;
    gesehen.set(key, n);
    if (n > 1 && st.verb !== "trace")
      err(sp, `wiederholt "${st.verb} ${st.target ?? `${st.from}→${st.to}`}" aus Schritt ${card.sequence.findIndex((o) => o !== st && (o.verb === st.verb) && (o.target === st.target) && (o.from === st.from) && (o.to === st.to)) + 1} `
        + `— derselbe Zustand zweimal; entferne den Schritt oder wähle einen anderen Anker`);
    if (n > 1 && st.verb === "trace" && n > (aeste[st.target] ?? 1))
      err(sp, `${n}. trace auf "${st.target}", die Serie hat aber nur ${aeste[st.target] ?? 1} Ast — `
        + `ein zweiter trace zeichnet den Nach-Stop-Ast und braucht dafür afterStop + stop auf der Karte; `
        + `entferne diesen Schritt ODER setze ${p}.stop = {"t": <0.15–0.9>, "label": "<max 20 Zeichen>"} UND afterStop auf der Serie`);
  });
}

// Setzt fehlende Typen aus der Relation. Mutiert nicht; liefert Kopie.
export function normalizeLesson(lesson) {
  return {
    ...lesson,
    cards: (lesson.cards || []).map((c) =>
      !c.type && RELATION_TO_TYPE[c.relation] ? { ...c, type: RELATION_TO_TYPE[c.relation] } : c)
  };
}

/// `opts.depth` schlägt `lesson.depth` — die Pipeline kennt die bestellte Tiefe,
/// die Datei trägt sie nur mit. Beides fehlt = Bestands-Contract (7–8 Karten).
export function validateLesson(lesson, opts = {}) {
  const depth = opts.depth ?? lesson?.depth ?? null;
  const [minCards, maxCards] = cardRange(depth);
  const fuerTiefe = depth ? ` (Tiefe „${depth}")` : "";
  const errs = [];
  const err = (path, msg) => errs.push(`${path}: ${msg}`);
  const str = (v, path, max) => {
    if (typeof v !== "string" || !v.trim()) return err(path, "fehlt oder leer");
    const plain = v.replace(/<[^>]+>/g, "");
    if (plain.length > max) err(path, `zu lang (${plain.length} > ${max}): "${plain.slice(0, 40)}…"`);
  };
  const color = (v, path) => { if (!COLORS.has(v)) err(path, `ungültige Farbe "${v}" (erlaubt: es, ich, ueberich)`); };
  /// Breite eines Platz-Textes gegen das gemessene Maß des Platzes. Sie ERGÄNZT den
  /// Zeichen-Deckel: der Deckel begrenzt die Menge, die Breite den Platz. `weg` ist der
  /// zweite Ausweg neben dem Kürzen — die Meldung trägt beide, damit die Patch-Runde ohne
  /// Rückfrage korrigieren kann.
  const breite = (v, path, slot, ref, rolle, ebene, weg) => {
    const grenze = slot.breiteMax?.[rolle]?.[ebene];
    const plain = String(v).replace(/<[^>]+>/g, "");
    const w = textBreite(plain, ebene);
    // Fehlt das Maß, wird NICHT still durchgewinkt: ein Gate, das seine eigene Grundlage
    // nicht hat, deckt nichts ab. Die Meldung sagt, dass hier das Werkzeug fehlt und nicht
    // der Text — sonst kürzt die Patch-Runde an einem Text, der in Ordnung ist.
    if (grenze === undefined || w === null)
      return err(path, `Breiten-Maß fehlt (`
        + (w === null ? `Schriftmaße nicht lesbar${TEXTMASSE_LADEFEHLER ? `: ${TEXTMASSE_LADEFEHLER}` : ""}`
          : `kein gemessenes breiteMax für Platz „${slot.id}" von „${ref}" als „${rolle}"`)
        + `) — das ist ein Werkzeug-Fehler, kein Text-Fehler: `
        + `node probes/asset-slot-max.mjs --schreiben && node build-assets.mjs`);
    if (w <= grenze) return;
    // „Kürze auf ca. N Zeichen" statt „kürze": N ist aus DIESEM Text gerechnet (seine
    // mittlere Zeichenbreite), nicht aus dem Deckel — ein Text aus breiten Versalien
    // bekommt eine kleinere Zahl als einer aus schmalen.
    const passt = Math.max(1, Math.floor(plain.length * grenze / w));
    err(path, `zu breit für den Platz „${slot.id}" von „${ref}" als „${rolle}" `
      + `(gemessen ${w.toFixed(1)} von ${grenze} Einheiten): "${plain.slice(0, 40)}${plain.length > 40 ? "…" : ""}". `
      + `Der Platz steht fest und ist schmal; es zählt die BREITE, nicht die Zeichenzahl — `
      + `breite Versalien (W, M, G, O, N) brauchen fast doppelt so viel Platz wie I oder L. `
      + `Kürze auf ca. ${passt} Zeichen dieser Breite ODER ${weg}.`);
  };
  const arr = (v, path, min, max) => {
    if (!Array.isArray(v)) { err(path, `braucht ${min}–${max} Einträge (fehlt oder ist kein Array)`); return false; }
    if (v.length < min || v.length > max) {
      const fix = v.length > max ? `entferne ${v.length - max}` : `ergänze ${min - v.length}`;
      err(path, `braucht ${min}–${max} Einträge, hat ${v.length} — ${fix}`);
      return false;
    }
    return true;
  };

  const CARD_CHECKS = {
    title(c, p) { str(c.eyebrow, p + ".eyebrow", 32); str(c.title, p + ".title", 30); str(c.sub, p + ".sub", 70); str(c.stats, p + ".stats", 30); },
    curve(c, p) {
      str(c.text, p + ".text", 220); str(c.xlabel, p + ".xlabel", 12); str(c.ylabel, p + ".ylabel", 12); str(c.caption, p + ".caption", 90);
      if (arr(c.series, p + ".series", 1, 2)) c.series.forEach((s, i) => {
        const sp = `${p}.series[${i}]`;
        if (s.points || s.labelAt !== undefined) err(sp, "Contract v2: keine Koordinaten — beschreibe die Form über shape/from/to, Anker über notes[].t");
        if (s.label !== undefined) str(s.label, sp + ".label", 18);
        color(s.color, sp + ".color");
        if (!SHAPES.includes(s.shape)) err(sp + ".shape", `unbekannte Form "${s.shape}" (erlaubt: ${SHAPES.join(", ")})`);
        for (const k of ["from", "to"]) if (s[k] !== undefined && !(s[k] in LEVEL_ORD))
          err(`${sp}.${k}`, `ungültiges Niveau "${s[k]}" (erlaubt: floor, low, mid, high)`);
        const from = s.from ?? (s.shape === "decay-halflife" ? "high" : "low");
        const to = s.to ?? (s.shape === "decay-halflife" ? "floor" : "high");
        if (from in LEVEL_ORD && to in LEVEL_ORD) {
          if (s.shape === "decay-halflife" && LEVEL_ORD[from] <= LEVEL_ORD[to])
            err(sp, `decay-halflife fällt: from muss über to liegen (ist ${from} → ${to})`);
          if (["linear-rise", "compound-rise", "saturating-rise"].includes(s.shape) && LEVEL_ORD[to] <= LEVEL_ORD[from])
            err(sp, `${s.shape} steigt: to muss über from liegen (ist ${from} → ${to})`);
        }
        if (s.afterStop !== undefined) {
          if (!AFTER_STOP.includes(s.afterStop)) err(sp + ".afterStop", `ungültig "${s.afterStop}" (erlaubt: ${AFTER_STOP.join(", ")})`);
          // Gekoppelte Felder: die Meldung nennt BEIDE konsistenten Ziel-Kombinationen
          // mit vollen Pfaden — ein Feld-Patch, der nur das gemeldete Feld ändert,
          // lief sonst über Runden im Kreis (Queue-Lauf „Impfungen", 14.08.).
          if (!c.stop) err(sp + ".afterStop", `braucht ein stop-Ereignis auf der Karte — patche eine konsistente Kombination: `
            + `setze ${p}.stop = {"t": <0.15–0.9>, "label": "<max 20 Zeichen>"} ODER setze ${sp}.afterStop = null (null löscht das Feld)`);
        }
        // reboundTo beschreibt die Apex-Höhe des Nach-Stop-Asts. Ohne rebound gibt es
        // keinen Apex — die Angabe wäre nicht bloß überflüssig, sondern bezöge sich
        // auf nichts.
        if (s.reboundTo !== undefined) {
          if (!REBOUND_LEVELS.includes(s.reboundTo))
            err(sp + ".reboundTo", `ungültiges Niveau "${s.reboundTo}" (erlaubt: ${REBOUND_LEVELS.join(", ")})`);
          if (s.afterStop !== "rebound")
            err(sp + ".reboundTo", `nennt die Apex-Höhe des Rebound-Asts und braucht dafür afterStop:"rebound" `
              + `(ist ${s.afterStop === undefined ? "nicht gesetzt" : `"${s.afterStop}"`}) — setze afterStop:"rebound" oder entferne reboundTo`);
        }
      });
      if (c.stop) {
        // 20 statt 14: das Ereignis-Label ist blanker Text über der Linie, kein Chip —
        // die Breite ist nicht mehr durch einen Kasten begrenzt, und Erlebnis-Sprache
        // („KOFFEIN-CRASH", „WIRKUNG LÄSST NACH") braucht den Platz.
        str(c.stop.label, p + ".stop.label", 20);
        if (!(c.stop.t >= 0.15 && c.stop.t <= 0.9)) err(p + ".stop.t", `muss zwischen 0.15 und 0.9 liegen (ist ${c.stop.t})`);
      }
      if (c.notes !== undefined && arr(c.notes, p + ".notes", 1, 2)) {
        const apexJeSerie = new Map();
        c.notes.forEach((n, i) => {
          const np = `${p}.notes[${i}]`;
          str(n.label, np + ".label", 22);
          if (n.x !== undefined || n.y !== undefined) err(np, "Contract v2: keine Koordinaten — verankere mit series + t (0–1)");
          const byIdx = typeof n.series === "number" && n.series >= 0 && n.series < (c.series || []).length;
          const byLabel = typeof n.series === "string" && (c.series || []).some((s) => s.label === n.series);
          if (!byIdx && !byLabel) err(np + ".series", "muss Index oder Label einer vorhandenen Serie sein");
          const si = byIdx ? n.series : (c.series || []).findIndex((s) => s.label === n.series);
          // at:"apex" ist eine ZUSÄTZLICHE Ankerform neben t, kein Ersatz: die Note
          // sitzt am Ende des Nach-Stop-Asts, statt bei einem freien t.
          if (n.at !== undefined) {
            if (n.at !== "apex") err(np + ".at", `ungültig "${n.at}" (erlaubt: apex)`);
            else {
              const s = (c.series || [])[si];
              if (s && s.afterStop === undefined)
                err(np + ".at", `at:"apex" ankert am Ende des Nach-Stop-Asts, die Serie hat aber kein afterStop — `
                  + `wähle EINE Lösung und patche ALLE zugehörigen Pfade ZUSAMMEN: `
                  + `(A) Ereignis behalten: setze ${p}.series[${si}].afterStop auf "${AFTER_STOP.join('"/"')}"`
                  + `${c.stop ? "" : ` UND ${p}.stop = {"t": <0.15–0.9>, "label": "<max 20 Zeichen>"}`} `
                  + `ODER (B) frei ankern: setze ${np}.at = null (null löscht das Feld) UND ${np}.t = <0–1>`);
              if (si >= 0) apexJeSerie.set(si, (apexJeSerie.get(si) || 0) + 1);
            }
          }
          // Ohne apex-Anker ist t die Verankerung und Pflicht; mit apex-Anker nur dann
          // zu prüfen, wenn es überhaupt dasteht.
          if (n.at !== "apex" || n.t !== undefined) {
            if (!(n.t >= 0 && n.t <= 1)) err(np + ".t", `muss zwischen 0 und 1 liegen (ist ${n.t})`);
          }
          if (n.side !== undefined && !["above", "below"].includes(n.side)) err(np + ".side", `ungültig "${n.side}" (erlaubt: above, below)`);
        });
        // Zwei apex-Notes derselben Serie zeigten auf denselben Punkt.
        for (const [si, n] of apexJeSerie) if (n > 1)
          err(`${p}.notes`, `${n} Notes mit at:"apex" auf series[${si}] — sie ankern auf demselben Punkt; `
            + `behalte eine und verankere die andere mit t`);
      }
    },
    fanout(c, p) {
      str(c.text, p + ".text", 220); str(c.caption, p + ".caption", 90);
      str(c.source?.label, p + ".source.label", 12); str(c.source?.sub, p + ".source.sub", 22); color(c.source?.color, p + ".source.color");
      if (!(c.count >= 3 && c.count <= 6)) err(p + ".count", "muss 3–6 sein");
      str(c.result?.label, p + ".result.label", 12);
    },
    compare(c, p) {
      str(c.text, p + ".text", 220); str(c.caption, p + ".caption", 90);
      for (const side of ["left", "right"]) {
        const s = c[side], sp = `${p}.${side}`;
        str(s?.title, sp + ".title", 18); color(s?.color, sp + ".color");
        if (arr(s?.items, sp + ".items", 2, 2)) s.items.forEach((it, i) => { str(it.label, `${sp}.items[${i}].label`, 20); str(it.sub, `${sp}.items[${i}].sub`, 32); });
      }
    },
    venn(c, p) {
      str(c.text, p + ".text", 220); str(c.caption, p + ".caption", 90);
      str(c.a?.label, p + ".a.label", 18); color(c.a?.color, p + ".a.color");
      str(c.b?.label, p + ".b.label", 18); color(c.b?.color, p + ".b.color");
      if (arr(c.overlap?.label, p + ".overlap.label", 1, 2)) c.overlap.label.forEach((l, i) => str(l, `${p}.overlap.label[${i}]`, 9));
      color(c.overlap?.color, p + ".overlap.color");
    },
    cycle(c, p) {
      str(c.text, p + ".text", 220); str(c.caption, p + ".caption", 90);
      if (arr(c.steps, p + ".steps", 3, 5)) c.steps.forEach((s, i) => { str(s.label, `${p}.steps[${i}].label`, 12); str(s.sub, `${p}.steps[${i}].sub`, 20); color(s.color, `${p}.steps[${i}].color`); });
    },
    balance(c, p) {
      str(c.text, p + ".text", 220);
      for (const k of ["left", "right"]) { str(c[k]?.label, `${p}.${k}.label`, 9); str(c[k]?.sub, `${p}.${k}.sub`, 16); color(c[k]?.color, `${p}.${k}.color`); }
      str(c.pivot?.label, p + ".pivot.label", 10); str(c.pivot?.sub, p + ".pivot.sub", 16); color(c.pivot?.color, p + ".pivot.color");
    },
    flow(c, p) {
      str(c.text, p + ".text", 220);
      if (arr(c.steps, p + ".steps", 3, 3)) {
        c.steps.forEach((s, i) => { str(s.label, `${p}.steps[${i}].label`, 16); str(s.sub, `${p}.steps[${i}].sub`, 26); color(s.color, `${p}.steps[${i}].color`); });
        if (!c.steps[2].submerged) err(p + ".steps[2]", "letzter Schritt braucht submerged:true");
      }
      str(c.sink?.label, p + ".sink.label", 20);
    },
    layers(c, p) {
      str(c.text, p + ".text", 220);
      if (arr(c.zones, p + ".zones", 3, 3)) c.zones.forEach((z, i) => str(z.label, `${p}.zones[${i}].label`, 11));
      const r = c.body?.regions;
      if (arr(r, p + ".body.regions", 3, 3)) r.forEach((rg, i) => { str(rg.label, `${p}.body.regions[${i}].label`, 8); color(rg.color, `${p}.body.regions[${i}].color`); });
    },
    // Asset-Karte v3: das LLM wählt ein Objekt aus der Library und beschriftet dessen
    // Plätze — mehr nicht. Kein Erfinden von refs, keine Positionen, keine Größen.
    asset(c, p) {
      str(c.text, p + ".text", 220); str(c.caption, p + ".caption", 90);
      const a = c.asset;
      if (!a || typeof a !== "object") {
        err(p + ".asset", `fehlt — eine asset-Karte nennt ihr Objekt: {"ref": "<einer von: ${ASSET_REFS.join(", ")}>", "role": "hero"}`);
        return;
      }
      if (a.role !== undefined && !ASSET_ROLLEN.includes(a.role))
        err(p + ".asset.role", `ungültig "${a.role}" (erlaubt: ${ASSET_ROLLEN.join(", ")}) — ohne Angabe gilt "hero"`);
      const eintrag = ASSETS[a.ref];
      // Unbekannter ref: Fehlertext trägt die Korrektur (verfügbare refs UND den Ausweg),
      // der Miss geht ins Wachstums-Backlog — er ist die Bestellung für die nächste
      // Asset-Runde, nicht nur ein Fehler.
      if (!eintrag || eintrag.verbraucher) {
        logMiss("asset-ref", a.ref, { lektion: lesson?.id, karte: p, typ: c.type, thema: lesson?.title });
        err(p + ".asset.ref", (ASSET_LADEFEHLER ? `Asset-Registry nicht lesbar (${ASSET_LADEFEHLER}) — ` : "")
          + `"${a.ref}" gibt es in der Library nicht`
          + (eintrag?.verbraucher ? ` (das Objekt gehört fest zum Karten-Typ "${eintrag.verbraucher}" und ist nicht frei wählbar)` : "")
          + `. Verfügbar: ${ASSET_REFS.length ? ASSET_REFS.join(", ") : "(keine)"}. `
          + `Erfinde kein Asset: formuliere die Karte ohne Asset (anderer Karten-Typ, z. B. relation "trend"/"weighing") `
          + `oder wähle einen der verfügbaren refs.`);
        return;
      }
      // Welche Rollen ein Objekt trägt, ist GEMESSEN (probes/asset-slot-max.mjs), nicht
      // angenommen: `inline` staucht die Komposition auf 60 % bei gleicher Schriftgröße —
      // ein Objekt mit dicht gesetzten Label-Plätzen wird dabei unlesbar. Was nicht
      // gemessen durchkam, ist hier nicht wählbar.
      const rollen = eintrag.rollen || ["hero"];
      if (a.role !== undefined && ASSET_ROLLEN.includes(a.role) && !rollen.includes(a.role))
        err(p + ".asset.role", `"${a.ref}" trägt die Rolle "${a.role}" nicht (gemessen: ${rollen.join(", ")}) — `
          + `setze ${p}.asset.role = "${rollen[0]}" oder wähle ein Objekt, das ${a.role} trägt`);
      const slots = eintrag.labelSlots || [];
      const namen = slots.map((s) => s.id);
      // Die Breite eines Platzes hängt an der ROLLE (inline staucht die Komposition auf
      // 60 %, die Schrift bleibt gleich groß). Trägt das Objekt die verlangte Rolle nicht,
      // steht der Fehler schon oben — dann wird nicht zusätzlich gemessen, sonst nennte die
      // Meldung eine Grenze, die es für diese Rolle gar nicht gibt.
      const rolle = a.role ?? "hero";
      const rolleOk = rollen.includes(rolle);
      if (a.labels !== undefined) {
        if (typeof a.labels !== "object" || Array.isArray(a.labels)) {
          err(p + ".asset.labels", `muss ein Objekt {platz: "TEXT"} sein — Plätze dieses Objekts: ${namen.join(", ") || "(keine)"}`);
        } else for (const [k, v] of Object.entries(a.labels)) {
          const slot = slots.find((s) => s.id === k);
          if (!slot) { err(`${p}.asset.labels.${k}`, `"${k}" ist kein Label-Platz von "${a.ref}" (vorhanden: ${namen.join(", ") || "keine"})`); continue; }
          const pfad = `${p}.asset.labels.${k}`;
          // Nur messen, wenn der Deckel nicht schon angeschlagen hat: zwei Meldungen zu
          // einem Feld schickten die Patch-Runde in zwei Richtungen.
          const vorher = errs.length;
          str(v, pfad, slot.max);
          if (errs.length === vorher && rolleOk)
            breite(v, pfad, slot, a.ref, rolle, "label", `lass ${pfad} weg (ein leerer Platz ist erlaubt)`);
        }
      }
      // Sub-Zeile: die Elaboration eines Label-Platzes. Sie hängt konstruktiv an ihrem
      // Label — ohne Label gäbe es nichts, worunter sie stehen könnte. Ihr Deckel ist
      // GEMESSEN (probes/asset-slot-max.mjs) und steht je Platz im Manifest.
      if (a.subs !== undefined) {
        if (typeof a.subs !== "object" || Array.isArray(a.subs)) {
          err(p + ".asset.subs", `muss ein Objekt {platz: "TEXT"} sein — Plätze dieses Objekts: ${namen.join(", ") || "(keine)"}`);
        } else for (const [k, v] of Object.entries(a.subs)) {
          const slot = slots.find((s) => s.id === k);
          if (!slot) { err(`${p}.asset.subs.${k}`, `"${k}" ist kein Label-Platz von "${a.ref}" (vorhanden: ${namen.join(", ") || "keine"})`); continue; }
          const oben = a.labels?.[k];
          if (oben === undefined || oben === null || oben === "") {
            err(`${p}.asset.subs.${k}`, `Sub-Zeile ohne Label — sie steht unter ${p}.asset.labels.${k}, das leer ist. `
              + `Setze ${p}.asset.labels.${k} (max ${slot.max} Zeichen) ODER entferne ${p}.asset.subs.${k} (null löscht das Feld).`);
            continue;
          }
          // Der Deckel hängt an der ROLLE: inline staucht die Komposition auf 60 %, die
          // Schrift bleibt gleich groß — derselbe Platz trägt dort weniger. Ein Minimum
          // über beide Rollen wäre kein Deckel, sondern eine Verengung.
          const deckel = slot.subMax?.[rolle];
          if (!(deckel > 0)) {
            const woAnders = Object.entries(slot.subMax || {}).filter(([, n]) => n > 0).map(([r, n]) => `${r}: ${n}`);
            err(`${p}.asset.subs.${k}`, `Platz "${k}" von "${a.ref}" trägt als "${rolle}" keine Sub-Zeile (gemessener Deckel 0)`
              + (woAnders.length ? ` — als ${woAnders.join(", ")} Zeichen. Setze ${p}.asset.role entsprechend` : "")
              + ` ODER entferne ${p}.asset.subs.${k} (null löscht das Feld).`);
            continue;
          }
          const pfad = `${p}.asset.subs.${k}`;
          const vorher = errs.length;
          str(v, pfad, deckel);
          if (errs.length === vorher && rolleOk)
            breite(v, pfad, slot, a.ref, rolle, "sub", `entferne ${pfad} (null löscht das Feld)`);
        }
      }
      // Freie Anker-Notes: die Karte sagt WORAN die Anmerkung hängt, nie WO sie steht.
      // Gültig ist jeder Gegenstand des Objekts und jedes gesetzte Label — nicht aber
      // eine andere Note oder Sub-Zeile: die Anmerkung erklärt das BILD, nicht sich selbst.
      if (c.notes !== undefined && arr(c.notes, p + ".notes", 1, 2)) {
        const gegenstaende = ankerFuerKarte(c).filter((n) => !n.startsWith("note:") && !n.startsWith("sub:"));
        c.notes.forEach((n, i) => {
          const np = `${p}.notes[${i}]`;
          // Auch der Note-Deckel ist gemessen, nicht geschätzt: er sagt, wie viel Text
          // neben DIESEM Objekt noch kollisionsfrei unterkommt.
          if (!(eintrag.noteMax > 0)) {
            err(np, `"${a.ref}" trägt keine Notes (kein gemessener Deckel im Manifest) — entferne ${p}.notes (null löscht das Feld)`);
            return;
          }
          str(n.text, np + ".text", eintrag.noteMax);
          if (n.label !== undefined) err(np + ".label", `heißt auf einer asset-Karte "text" — benenne ${np}.label in ${np}.text um`);
          if (n.x !== undefined || n.y !== undefined || n.side !== undefined)
            err(np, `Contract v2: keine Positionen — die Note nennt nur ihren Anker (${np}.anker), das System setzt sie`);
          if (!gegenstaende.includes(n.anker))
            err(np + ".anker", `Anker "${n.anker}" gibt es auf dieser Karte nicht — verankere die Anmerkung an einem `
              + `Gegenstand des Objekts: ${gegenstaende.join(", ")}`);
          if (n.ton !== undefined) color(n.ton, np + ".ton");
        });
      }
    },

    quiz(c, p) {
      str(c.question, p + ".question", 160);
      if (arr(c.options, p + ".options", 3, 3)) {
        c.options.forEach((o, i) => str(o.label, `${p}.options[${i}].label`, 42));
        if (c.options.filter((o) => o.correct).length !== 1) err(p + ".options", "genau 1 Option braucht correct:true");
      }
      str(c.explain, p + ".explain", 180); str(c.wrong, p + ".wrong", 160);
    },
    insight(c, p) { str(c.quote, p + ".quote", 90); str(c.cite, p + ".cite", 40); str(c.explain, p + ".explain", 120); }
  };

  str(lesson.id, "id", 40); str(lesson.title, "title", 40); str(lesson.source, "source", 80);
  // Kartenzahl trägt die Korrektur im Fehlertext: zu wenige Karten heilt die
  // Pipeline additiv (Ergänzungs-Runde), nicht durch Voll-Regeneration.
  const n = Array.isArray(lesson.cards) ? lesson.cards.length : -1;
  if (n < 0) err("cards", `braucht ${minCards}–${maxCards} Karten${fuerTiefe} (fehlt oder ist kein Array)`);
  else if (n < minCards)
    err("cards", `zu wenig Karten: ${n} < ${minCards}${fuerTiefe} — ergänze ${minCards - n} Karten zu weiteren `
      + `Aspekten des Dossiers, die noch nicht vorkommen; bestehende Karten bleiben unverändert`);
  else if (n > maxCards)
    err("cards", `zu viele Karten: ${n} > ${maxCards}${fuerTiefe} — entferne ${n - maxCards} `
      + `(die redundanteste Diagramm-Karte zuerst; title/quiz/insight bleiben)`);
  if (n >= minCards && n <= maxCards) {
    lesson.cards.forEach((c, i) => {
      const p = `cards[${i}]`;
      if (!CARD_CHECKS[c.type]) {
        err(p, c.relation
          ? `unbekannte relation/type-Kombination (relation "${c.relation}" — erlaubt: ${Object.keys(RELATION_TO_TYPE).join(", ")})`
          : `unbekannter Typ "${c.type}"`);
        return;
      }
      if (!STRUCT_TYPES.has(c.type)) {
        if (!c.relation) err(p + ".relation", `fehlt — jede Diagramm-Karte nennt ihre Relation (${Object.keys(RELATION_TO_TYPE).join(", ")})`);
        else if (RELATION_TO_TYPE[c.relation] !== c.type)
          err(p, `relation "${c.relation}" gehört zu Typ "${RELATION_TO_TYPE[c.relation]}", Karte ist "${c.type}"`);
      }
      // Ein Objekt aus der Library steht auf der Asset-Karte, nicht als Beilage auf
      // einem anderen Typ: Assets sind Gegenstände mit Ankern, keine Deko-Sticker.
      if (c.asset !== undefined && c.type !== "asset")
        err(p + ".asset", `Karten-Typ "${c.type}" trägt kein Asset — ein Objekt aus der Library bekommt eine eigene Karte `
          + `(relation "object", type "asset"). Entferne ${p}.asset ODER mache daraus eine eigene asset-Karte.`);
      CARD_CHECKS[c.type](c, p);
      checkSequence(c, p, err);
    });
    if (lesson.cards[0]?.type !== "title") err("cards[0]", "muss title sein");
    if (lesson.cards.at(-1)?.type !== "insight") err("cards[letzte]", "muss insight sein");
    if (lesson.cards.at(-2)?.type !== "quiz") err("cards[vorletzte]", "muss quiz sein");
  }
  return errs;
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const dIdx = process.argv.indexOf("--depth");
  const depth = dIdx > -1 ? process.argv[dIdx + 1] : undefined;
  const lesson = normalizeLesson(JSON.parse(readFileSync(process.argv[2], "utf8")));
  const errs = validateLesson(lesson, { depth });
  if (errs.length) { console.log("FEHLER:\n" + errs.map((e) => "- " + e).join("\n")); process.exit(1); }
  const [lo, hi] = cardRange(depth ?? lesson.depth ?? null);
  console.log(`OK — ${lesson.cards.length} Karten (Soll ${lo}–${hi}), Typen: ${lesson.cards.map((c) => c.type).join(", ")}`);
}
