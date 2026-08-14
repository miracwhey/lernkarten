// Türsteher der Pipeline: prüft Generator-JSON gegen den Karten-Contract v2.
// v2: Diagramm-Karten tragen `relation` (das System leitet den Typ ab); `curve`
// ist rein semantisch (Form, Niveaus, Ereignis-Zeitpunkt, Anker) — keine Koordinaten.
// Nutzung: node validate-lesson.mjs <lesson.json> [--depth kompakt|standard|tief]
//          → Exit 0 + "OK" oder Exit 1 + Fehlerliste.
// Als Modul: import { RELATION_TO_TYPE, DEPTH_CARDS, normalizeLesson, validateLesson }.
import { readFileSync } from "fs";

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
  "depth-layers": "layers"    // Sichtbares oben, Verborgenes unten
};
const STRUCT_TYPES = new Set(["title", "quiz", "insight"]);
const SHAPES = ["linear-rise", "compound-rise", "saturating-rise", "decay-halflife", "suppressed", "flat"];
const LEVEL_ORD = { floor: 0, low: 1, mid: 2, high: 3 };
const AFTER_STOP = ["collapse", "reset", "rebound"];
// Apex-Höhe des Rebound-Asts. `floor` fehlt bewusst: ein Rebound schnellt nach oben,
// ein Apex auf dem Boden wäre keine Höhe, sondern ein Widerspruch zur Form.
const REBOUND_LEVELS = ["low", "mid", "high"];
const COLORS = new Set(["es", "ich", "ueberich"]);

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
      if (!(c.count >= 5 && c.count <= 6)) err(p + ".count", "muss 5–6 sein");
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
      if (arr(c.steps, p + ".steps", 4, 4)) c.steps.forEach((s, i) => { str(s.label, `${p}.steps[${i}].label`, 12); str(s.sub, `${p}.steps[${i}].sub`, 20); color(s.color, `${p}.steps[${i}].color`); });
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
      CARD_CHECKS[c.type](c, p);
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
