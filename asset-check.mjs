// Deterministisches Gate der Asset-Library: prüft JEDE Datei gegen das Manifest und
// gegen den Stil-Contract (docs/asset-stil-contract.md). Kein Browser, kein Modell —
// alles hier ist nachrechenbar.
//
// Prinzip: Das Manifest darf nichts behaupten, was die Datei nicht zeigt, und die
// Datei nichts mitbringen, was das Manifest nicht kennt. Beide Richtungen werden
// geprüft — eine Registry, die nur ihre eigenen Einträge nachschlägt, übersieht genau
// das, was niemand angemeldet hat.
//
// Die erlaubten Farb-Tokens und Strichstärken-Klassen werden NICHT hier gepflegt,
// sondern aus renderer.css gelesen: die Autorität ist das Design-System, nicht eine
// zweite Liste, die davon abdriften kann.
// Nutzung: node asset-check.mjs
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { baueNutzlast, inlineBlock, ersetzeBlock } from "./build-assets.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const VIEWBOX_NORM = "0 0 200 200";
const befunde = [];
const fehler = (datei, text) => befunde.push(`${datei}: ${text}`);

// ——— Autorität: was renderer.css definiert ———
const css = readFileSync(resolve(HIER, "renderer.css"), "utf8");
const TOKENS = new Set([...css.matchAll(/^\s*--([a-z0-9-]+)\s*:/gmi)].map((m) => m[1]));
const KLASSEN = new Set([...css.matchAll(/^\s*\.(a-[a-z0-9-]+)\s*\{/gmi)].map((m) => m[1]));
if (!TOKENS.size || !KLASSEN.size) fehler("renderer.css", "keine Tokens/Asset-Klassen gefunden — Prüfung wäre wertlos");

// ——— Manifest ———
const manifestPfad = resolve(HIER, "assets/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPfad, "utf8"));
const assets = manifest.assets || {};

/// Sehr kleiner XML-Prüfer: Wohlgeformtheit (Tag-Stapel) plus Attribut-Ausbeute je
/// Element. Reicht für Dateien in diesem Format und hält den Check ohne Browser.
function elemente(text) {
  const roh = text.replace(/<!--[\s\S]*?-->/g, "");
  const stapel = [], liste = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  let m, offen = null;
  while ((m = re.exec(roh))) {
    const [, schluss, tag, attrRoh, leer] = m;
    if (schluss) { offen = stapel.pop(); if (offen !== tag) return { fehler: `Tag-Verschachtelung: </${tag}> schliesst <${offen}>` }; continue; }
    const attr = {};
    // Entitäten auflösen: `data-link="a&gt;b"` ist im XML korrekt, der Browser liest
    // daraus `a>b`. Ein Prüfer, der den Rohtext vergleicht, prüft etwas anderes als
    // das, was der Renderer sieht.
    const roh2 = (s) => s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    for (const a of attrRoh.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attr[a[1]] = roh2(a[2]);
    liste.push({ tag, attr });
    if (!leer) stapel.push(tag);
  }
  if (stapel.length) return { fehler: `nicht geschlossen: <${stapel.join(">, <")}>` };
  return { liste };
}

const FUELLBAR = new Set(["path", "circle", "rect", "polygon", "ellipse"]);
const TON = new Set(["es", "ich", "ueberich"]);

for (const [ref, a] of Object.entries(assets)) {
  const datei = `assets/${a.datei}`;
  const pfad = resolve(HIER, datei);
  if (!existsSync(pfad)) { fehler(datei, `im Manifest als "${ref}" geführt, Datei fehlt`); continue; }
  const text = readFileSync(pfad, "utf8");
  const { liste, fehler: xmlFehler } = elemente(text);
  if (xmlFehler) { fehler(datei, xmlFehler); continue; }

  // 1) viewBox-Norm — im Manifest UND in der Datei
  const wurzel = liste[0];
  if (wurzel.attr.viewBox !== VIEWBOX_NORM) fehler(datei, `viewBox "${wurzel.attr.viewBox}" statt Norm "${VIEWBOX_NORM}"`);
  if (a.viewBox !== VIEWBOX_NORM) fehler(datei, `Manifest nennt viewBox "${a.viewBox}" statt "${VIEWBOX_NORM}"`);
  if (wurzel.attr["data-ref"] !== ref) fehler(datei, `data-ref "${wurzel.attr["data-ref"]}" ≠ Manifest-Schlüssel "${ref}"`);
  if (!a.abnahme) fehler(datei, `Manifest-Feld "abnahme" fehlt — jedes Objekt sagt, woher seine Abnahme kommt`);
  // Rollen sind gemessen (probes/asset-slot-max.mjs), nicht behauptet. Ein Objekt ohne
  // hero wäre nirgends darstellbar; ein frei wählbares Objekt ohne Rollen-Angabe hätte
  // im Validator keine Grenze.
  if (!a.verbraucher) {
    const r = a.rollen;
    if (!Array.isArray(r) || !r.length) fehler(datei, `Manifest-Feld "rollen" fehlt — welche Rollen das Objekt trägt, wird gemessen (node probes/asset-slot-max.mjs --schreiben)`);
    else {
      for (const x of r) if (!["hero", "inline"].includes(x)) fehler(datei, `rollen enthält "${x}" (erlaubt: hero, inline)`);
      if (!r.includes("hero")) fehler(datei, `rollen ohne "hero" — ein Objekt, das nicht einmal als Hero trägt, gehört nicht in die Library`);
    }
  }

  // 2) Keine Hex-Farben, keine eigenen Strichstärken
  for (const hex of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) fehler(datei, `Hex-Farbe "${hex[0]}" — Assets tragen nur Palette-Tokens`);
  for (const sw of text.matchAll(/\bstroke-width\s*=/g)) void sw, fehler(datei, `stroke-width in der Datei — die Strichstärke kommt aus der Skala-Klasse (${[...KLASSEN].join(", ")})`);

  // 3) Farben nur als var(--token), Token muss in renderer.css existieren
  const benutzteTokens = new Set();
  for (const v of text.matchAll(/var\(--([a-z0-9-]+)\)/gi)) {
    benutzteTokens.add(v[1]);
    if (!TOKENS.has(v[1])) fehler(datei, `Token --${v[1]} gibt es in renderer.css nicht`);
  }
  const slotsManifest = [...(a.paletteSlots || [])].sort().join(",");
  const slotsDatei = [...benutzteTokens].sort().join(",");
  if (slotsManifest !== slotsDatei)
    fehler(datei, `paletteSlots im Manifest [${slotsManifest}] ≠ tatsächlich benutzte Tokens [${slotsDatei}]`);

  // 4) Klassen nur aus der Skala; jede füllbare Form nennt ihre Füllung ausdrücklich
  const ankerDatei = [], teileDatei = [], slotDatei = [], linkDatei = [];
  for (const el of liste) {
    for (const k of (el.attr.class || "").split(/\s+/).filter(Boolean))
      if (!KLASSEN.has(k)) fehler(datei, `Klasse "${k}" gehört nicht zur Asset-Skala (${[...KLASSEN].join(", ")})`);
    if (FUELLBAR.has(el.tag) && el.attr.fill === undefined && !(el.attr.class || "").includes("a-route"))
      fehler(datei, `<${el.tag}> ohne fill-Angabe — eine Fläche sagt ausdrücklich, ob und womit sie gefüllt ist`);
    if (el.attr["data-anchor"]) ankerDatei.push(el.attr["data-anchor"]);
    if (el.attr["data-part"]) teileDatei.push(el.attr["data-part"]);
    if (el.attr["data-slot"]) slotDatei.push({ id: el.attr["data-slot"], attr: el.attr });
    if (el.attr["data-link"]) linkDatei.push({ wert: el.attr["data-link"], attr: el.attr, tag: el.tag });
    if (el.attr["data-glow-fill"] && !TON.has(el.attr["data-glow-fill"]))
      fehler(datei, `data-glow-fill="${el.attr["data-glow-fill"]}" ist kein Ton (${[...TON].join(", ")})`);
    if (el.attr["data-ton"] && !TON.has(el.attr["data-ton"]))
      fehler(datei, `data-ton="${el.attr["data-ton"]}" ist kein Ton (${[...TON].join(", ")})`);
  }

  // 5) Anker: beide Richtungen
  for (const n of (a.anker || [])) if (!ankerDatei.includes(n)) fehler(datei, `Manifest nennt Anker "${n}", die Datei hat kein data-anchor="${n}"`);
  for (const n of ankerDatei) if (!(a.anker || []).includes(n)) fehler(datei, `data-anchor="${n}" steht in der Datei, aber nicht im Manifest-Feld anker[]`);
  for (const n of (a.anker || [])) if (!/^(node|region|ray|zone|series|label|step):[a-z0-9-]+$/.test(n))
    fehler(datei, `Anker "${n}" folgt nicht dem Schema typ:id`);

  // 6) Teile: beide Richtungen
  for (const t of (a.teile || [])) if (!teileDatei.includes(t)) fehler(datei, `Manifest nennt Teil "${t}", die Datei hat kein data-part="${t}"`);
  for (const t of teileDatei) if (!(a.teile || []).includes(t)) fehler(datei, `data-part="${t}" steht in der Datei, aber nicht im Manifest-Feld teile[]`);

  // 7) Label-Plätze: beide Richtungen, und jeder Platz hängt an einem echten Anker
  const slotIds = (a.labelSlots || []).map((s) => s.id);
  for (const s of (a.labelSlots || [])) {
    const inDatei = slotDatei.find((d) => d.id === s.id);
    if (!inDatei) { fehler(datei, `Manifest nennt Label-Platz "${s.id}", die Datei hat kein data-slot="${s.id}"`); continue; }
    if (!(a.anker || []).includes(s.anker)) fehler(datei, `Label-Platz "${s.id}" hängt an "${s.anker}" — das ist kein Anker dieses Objekts`);
    if (inDatei.attr["data-anchor-ref"] !== s.anker)
      fehler(datei, `Label-Platz "${s.id}": Datei sagt data-anchor-ref="${inDatei.attr["data-anchor-ref"]}", Manifest sagt "${s.anker}"`);
    if (!(s.max > 0)) fehler(datei, `Label-Platz "${s.id}" ohne max — ohne Deckel kann kein Validator die Länge prüfen`);
    for (const k of ["x", "y"]) if (inDatei.attr[k] === undefined) fehler(datei, `Label-Platz "${s.id}" ohne ${k}`);
  }
  for (const d of slotDatei) if (!slotIds.includes(d.id)) fehler(datei, `data-slot="${d.id}" steht in der Datei, aber nicht in labelSlots[]`);

  // 8) Puls-Wege: jedes deklarierte Paar ist im Bild GEZEICHNET, und kein Weg führt
  //    irgendwohin, wo kein Anker ist. Ein Puls braucht einen Weg, den das Bild zeigt.
  const linkWerte = linkDatei.map((l) => l.wert);
  for (const [x, y] of (a.paare || [])) {
    if (!linkWerte.includes(`${x}>${y}`) && !linkWerte.includes(`${y}>${x}`))
      fehler(datei, `Manifest erklärt "${x}" und "${y}" für verbunden, die Datei zeichnet keinen data-link dafür`);
  }
  for (const l of linkDatei) {
    const [x, y] = l.wert.split(">");
    if (!(a.paare || []).some(([p, q]) => (p === x && q === y) || (p === y && q === x)))
      fehler(datei, `data-link="${l.wert}" ist im Manifest nicht als Paar geführt`);
    for (const n of [x, y]) if (!(a.anker || []).includes(n)) fehler(datei, `data-link="${l.wert}" nennt "${n}" — kein Anker dieses Objekts`);
    if (!(l.attr.class || "").split(/\s+/).includes("a-route"))
      fehler(datei, `data-link="${l.wert}" ohne Klasse a-route — ein Puls-Weg wird nie gemalt`);
    if (l.tag !== "path" || !l.attr.d) fehler(datei, `data-link="${l.wert}" braucht einen <path> mit d`);
  }

  // 9) Interne Verbraucher sind nicht frei wählbar — und müssen einen Typ nennen, den
  //    es gibt (sonst zeigte das Feld auf nichts).
  if (a.verbraucher && !readFileSync(resolve(HIER, "renderer.js"), "utf8").includes(`  ${a.verbraucher}(card)`))
    fehler(datei, `verbraucher "${a.verbraucher}" ist kein Karten-Typ in renderer.js`);
}

// ——— Transport: assets.js und der Inline-Block in card-canvas.html ———
// Die Dateien sind die Quelle; beide Transporte müssen frisch daraus gebaut sein.
// Fehlt eine Quelldatei, ist das bereits oben gemeldet — der Transport-Vergleich darf
// daran nicht ABSTÜRZEN: ein Gate, das mit einem Stacktrace endet, meldet keinen Befund,
// es verschwindet. (Gefunden von der Negativ-Kontrolle „Datei fehlt".)
try {
  const nutzlast = baueNutzlast();
  if (readFileSync(resolve(HIER, "assets/assets.js"), "utf8") !== nutzlast)
    fehler("assets/assets.js", "Transport veraltet — node build-assets.mjs");
  const canvas = readFileSync(resolve(HIER, "card-canvas.html"), "utf8");
  if (ersetzeBlock(canvas, inlineBlock(nutzlast), "card-canvas.html") !== canvas)
    fehler("card-canvas.html", "Inline-Block veraltet — node build-assets.mjs");
} catch (e) {
  fehler("Transport", `nicht prüfbar (${e.message.split("\n")[0]}) — erst die Quelldateien in Ordnung bringen, dann node build-assets.mjs`);
}

const n = Object.keys(assets).length;
const anker = Object.values(assets).reduce((s, a) => s + (a.anker || []).length, 0);
const slots = Object.values(assets).reduce((s, a) => s + (a.labelSlots || []).length, 0);
console.log(`ASSET-CHECK — ${n} Assets, ${anker} Anker, ${slots} Label-Plätze, ${Object.values(assets).reduce((s, a) => s + (a.paare || []).length, 0)} Puls-Paare`);
if (befunde.length) { console.log("BEFUNDE:\n" + befunde.map((b) => "- " + b).join("\n")); console.log(`ASSET-CHECK FAIL — ${befunde.length} Befunde`); process.exit(1); }
console.log("ASSET-CHECK PASS");
