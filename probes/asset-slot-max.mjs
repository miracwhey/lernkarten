// Wie lang darf ein Label-Platz WIRKLICH werden? Das Manifest nennt je Platz ein max;
// diese Zahl darf nicht geschätzt sein. Hier wird sie erzeugt: Text mit dem breitesten
// Großbuchstaben (M) wachsen lassen, bis das Layout-Gate anschlägt — der letzte saubere
// Wert ist der Deckel. Gemessen wird mit demselben Chokepoint wie audit/adversarial.
//
// Danach die Gegenprobe: ALLE Plätze gleichzeitig auf ihrem Deckel. Labels kollidieren
// auch miteinander — ein Deckel, der nur einzeln hält, ist keiner.
// Beide Rollen werden geprüft (hero und inline): inline staucht die Komposition, die
// Schrift bleibt gleich groß, also ist inline der engere Fall.
// Neben der Zeichenzahl misst dieses Skript die BREITE, die ein Platz trägt (in
// Karten-Einheiten), und die Schriftvorschübe, mit denen validate-lesson.mjs die Breite
// eines konkreten Textes ohne Browser bestimmt. Grund: der Zeichen-Deckel ist am schmalen
// Beispieltext geeicht, das Clipping passiert in Pixeln.
// Nutzung: node probes/asset-slot-max.mjs [--schreiben|--check]
//          --check = Veraltet-Check (misst neu, Exit 1 bei Abweichung)
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { auditCurveCard } from "../label-audit.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const manifestPfad = resolve(REPO, "assets/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPfad, "utf8"));
const schreiben = process.argv.includes("--schreiben");
const pruefen = process.argv.includes("--check");
// Der Deckel ist eine ZEICHENZAHL, die Kollision hängt aber an der BREITE. Mit dem
// breitesten Großbuchstaben gemessen wäre der Deckel so klein, dass er die abgenommenen
// Mockup-Texte verböte (gemessen: „SONNENLICHT" passt, „MMMM" nicht). Gemessen wird
// deshalb mit realistischem Label-Text: der abgenommene Text des Platzes, wiederholt auf
// die geprüfte Länge. Die Zeichenzahl bleibt eine Näherung — die AUTORITÄT ist und
// bleibt das Layout-Gate (audit-lesson misst jede echte Lektion).
const MUSTER = Object.fromEntries(Object.values(manifest.assets)
  .flatMap((a) => (a.labelSlots || []).map((s) => [s.id, s.beispiel])));
const text = (id, n) => (MUSTER[id] + " ").repeat(Math.ceil(n / (MUSTER[id].length + 1)) + 1).slice(0, n).trim().padEnd(n, "N");
const OBER = 34;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 } });
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
await page.goto("file://" + resolve(REPO, "karten-grammatik.html"));
await page.waitForTimeout(150);

const karte = (ref, labels, role, zusatz = {}) => ({
  type: "asset", relation: "object", text: "Deckel-Messung.", caption: "Deckel-Messung.",
  asset: { ref, role, labels, ...(zusatz.subs ? { subs: zusatz.subs } : {}) },
  ...(zusatz.notes ? { notes: zusatz.notes } : {})
});
const befunde = async (ref, labels, role, zusatz = {}) => {
  const { out } = await page.evaluate(auditCurveCard, { card: karte(ref, labels, role, zusatz) });
  return (out || []).filter((o) => !o.startsWith("INFO"));
};

// Welche ROLLEN trägt ein Objekt überhaupt? `inline` staucht die Komposition auf 60 %,
// die Schrift bleibt gleich groß — ein Objekt mit vielen Label-Plätzen wird dabei
// unlesbar (gemessen: sky-scatter kollidiert inline bei JEDER Textlänge). Statt das
// hinzunehmen, wird die Rolle zur gemessenen Eigenschaft des Objekts: der Validator
// lässt nur zu, was hier durchgekommen ist.
const rollenJeAsset = {};
for (const [ref, a] of Object.entries(manifest.assets)) {
  const slots = a.labelSlots || [];
  if (!slots.length) continue;
  rollenJeAsset[ref] = [];
  for (const rolle of ["hero", "inline"]) {
    // Geprüft wird mit den TATSÄCHLICHEN Label-Texten des Objekts (die abgenommenen
    // Mockup-Texte): die Frage ist, ob das Objekt in dieser Rolle mit seiner eigenen
    // Beschriftung funktioniert — nicht mit Füllzeichen.
    const echt = Object.fromEntries(slots.map((t) => [t.id, MUSTER[t.id]]));
    const f = await befunde(ref, echt, rolle);
    if (!f.length) rollenJeAsset[ref].push(rolle);
    else if (rolle === "hero") console.log(`  ${ref} scheitert schon als hero: ${f[0]}`);
  }
  console.log(`${ref.padEnd(21)} Rollen: ${rollenJeAsset[ref].join(", ") || "(keine!)"}`);
}

const vorschlag = {};
for (const [ref, a] of Object.entries(manifest.assets)) {
  const slots = a.labelSlots || [];
  if (!slots.length) continue;
  vorschlag[ref] = {};
  for (const rolle of rollenJeAsset[ref]) {
    for (const s of slots) {
      // Die anderen Plätze bleiben auf ihrem bisherigen Deckel — Nachbarn gehören zur Lage.
      // Vom abgenommenen Text aus WACHSEN: die Frage ist, wie viel länger dieser Platz
      // werden darf, ohne dass es kracht. Bei 4 Zeichen anzufangen hieße, einen Deckel
      // von 0 zu melden, sobald irgendein Nachbar-Text stört.
      let gut = MUSTER[s.id].length;
      for (let n = gut; n <= OBER; n++) {
        const labels = Object.fromEntries(slots.map((t) => [t.id, t.id === s.id ? text(t.id, n) : MUSTER[t.id]]));
        if ((await befunde(ref, labels, rolle)).length) { gut = n - 1; break; }
        gut = n;
      }
      const bisher = vorschlag[ref][s.id];
      vorschlag[ref][s.id] = bisher === undefined ? gut : Math.min(bisher, gut);
    }
  }
}

// Gegenprobe: alle Plätze gleichzeitig am Deckel, beide Rollen. Wo es kracht, wird der
// LÄNGSTE Platz um eins gekürzt und erneut geprüft — so bleibt der Deckel gemessen.
for (const [ref, deckel] of Object.entries(vorschlag)) {
  for (let runde = 0; runde < 40; runde++) {
    let schlimm = null;
    for (const rolle of rollenJeAsset[ref]) {
      const labels = Object.fromEntries(Object.entries(deckel).map(([id, n]) => [id, text(id, n)]));
      const f = await befunde(ref, labels, rolle);
      if (f.length) { schlimm = { rolle, f }; break; }
    }
    if (!schlimm) break;
    const laengster = Object.entries(deckel).sort((a, b) => b[1] - a[1])[0][0];
    deckel[laengster]--;
    console.log(`  ${ref} (${schlimm.rolle}): Kombination kracht (${schlimm.f[0].slice(0, 60)}) → "${laengster}" auf ${deckel[laengster]}`);
  }
}

// ——— Sub-Zeilen: derselbe Weg, eine Ebene tiefer ———
// Die Sub-Zeile steht konstruktiv unter ihrem Label, also wird sie MIT gesetzten Labels
// gemessen. Anders als beim Label gibt es keinen abgenommenen Text, von dem aus gewachsen
// werden könnte — deshalb von unten. Es gilt dieselbe Konvention wie oben: der erste
// Befund beendet die Reihe, die Autorität bleibt das Layout-Gate.
//
// Der Deckel steht hier JE ROLLE, anders als beim Label. Gemessen: dieselbe Sub-Zeile
// trägt am psyche.person als hero 30 Zeichen und inline 7 — inline staucht die
// Komposition auf 60 %, die Schrift bleibt gleich groß. Ein Minimum über beide Rollen
// wäre kein Deckel, sondern eine Verengung: es verböte die abgenommene Mockup-Karte
// (hero) wegen einer Enge, die nur in der anderen Rolle existiert.
const subVorschlag = {};
for (const [ref, a] of Object.entries(manifest.assets)) {
  const slots = a.labelSlots || [];
  if (!slots.length) continue;
  const alleLabels = Object.fromEntries(slots.map((t) => [t.id, MUSTER[t.id]]));
  subVorschlag[ref] = {};
  for (const rolle of rollenJeAsset[ref]) {
    const deckel = {};
    for (const s of slots) {
      // Gewachsen wird mit realistischem Text — wie beim Label. Wo ein abgenommener
      // Sub-Text existiert (subBeispiel aus dem Mockup), ist ER das Muster und der
      // Startwert: gemessen mit Füllmuster fiel der Deckel unter den abgenommenen Text
      // (144 px Füllung gegen 142 px echten Text — genau an der Clip-Kante).
      const muster = s.subBeispiel || MUSTER[s.id];
      const subText = (n) => (muster + " ").repeat(Math.ceil(n / (muster.length + 1)) + 1).slice(0, n).trim().padEnd(n, "N");
      const start = s.subBeispiel ? s.subBeispiel.length : 4;
      let gut = start - 1;
      for (let n = start; n <= OBER; n++) {
        if ((await befunde(ref, alleLabels, rolle, { subs: { [s.id]: subText(n) } })).length) { gut = n - 1; break; }
        gut = n;
      }
      deckel[s.id] = Math.max(0, gut);
    }
    // Gegenprobe wie bei den Labels: ALLE Sub-Zeilen dieser Rolle gleichzeitig am Deckel.
    for (let runde = 0; runde < 40; runde++) {
      const offen = Object.entries(deckel).filter(([, n]) => n > 0);
      if (!offen.length) break;
      const subs = Object.fromEntries(offen.map(([id, n]) => {
        const m2 = slots.find((t) => t.id === id).subBeispiel || MUSTER[id];
        return [id, (m2 + " ").repeat(Math.ceil(n / (m2.length + 1)) + 1).slice(0, n).trim().padEnd(n, "N")];
      }));
      const f = await befunde(ref, alleLabels, rolle, { subs });
      if (!f.length) break;
      const laengster = offen.sort((x, y) => y[1] - x[1])[0][0];
      deckel[laengster]--;
      console.log(`  ${ref} (${rolle}): Sub-Kombination kracht (${f[0].slice(0, 60)}) → "${laengster}" auf ${deckel[laengster]}`);
    }
    for (const [id, n] of Object.entries(deckel)) {
      subVorschlag[ref][id] = { ...(subVorschlag[ref][id] || {}), [rolle]: n };
    }
  }
}

// ——— Notes: der Deckel gilt für JEDEN Anker ———
// Eine Note darf an jedem Gegenstand des Objekts hängen; der Deckel muss deshalb am
// ENGSTEN Anker gelten, nicht am bequemsten. Zwei Zeilen sind erlaubt (der Renderer
// bricht selbst um), die Obergrenze liegt darum höher als bei einem Label.
const NOTE_OBER = 48;
const noteVorschlag = {};
for (const [ref, a] of Object.entries(manifest.assets)) {
  const slots = a.labelSlots || [];
  const anker = a.anker || [];
  if (!slots.length || !anker.length) continue;
  const alleLabels = Object.fromEntries(slots.map((t) => [t.id, MUSTER[t.id]]));
  const muster = MUSTER[slots[0].id];
  const noteText = (n) => (muster + " ").repeat(Math.ceil(n / (muster.length + 1)) + 1).slice(0, n).trim().padEnd(n, "N");
  let deckel = NOTE_OBER;
  for (const rolle of rollenJeAsset[ref]) {
    for (const ank of anker) {
      let gut = 0;
      for (let n = 4; n <= NOTE_OBER; n++) {
        if ((await befunde(ref, alleLabels, rolle, { notes: [{ anker: ank, text: noteText(n) }] })).length) { gut = n - 1; break; }
        gut = n;
      }
      if (gut < deckel) { deckel = gut; console.log(`  ${ref} (${rolle}): engster Note-Anker bisher "${ank}" → ${gut}`); }
    }
  }
  noteVorschlag[ref] = deckel;
}

// ——— Breiten-Grenzen: was der Platz in EINHEITEN trägt ———
// Der Zeichen-Deckel oben ist am schmalen Beispieltext geeicht; die Kollision passiert
// aber in BREITE. Gemessen: „NICHT WAHRGENOMMEN" (18 Zeichen, Deckel 20) läuft am
// psyche.person rechts aus der Karte, „WÜNSCHE · ÄNGSTE · ALTE MUSTER" (30 Zeichen)
// nicht — breite Versalien sprengen den Platz bei legaler Zeichenzahl. Ein engerer
// Zeichen-Deckel wäre die falsche Antwort: er verböte auch die schmalen langen Texte.
// Jeder Platz bekommt deshalb ZUSÄTZLICH eine gemessene Breite; der Zeichen-Deckel
// bleibt unverändert als Richtwert für den Prompt.
//
// Autorität ist auch hier das Layout-Gate: die Grenze ist die BREITE DES BREITESTEN
// PROBE-TEXTS, den `auditCurveCard` an diesem Platz noch ohne Befund durchgehen lässt.
// Bisektion über die Breite, nicht über die Zeichenzahl — ein Zeichen ist ~9 Einheiten
// grob, und genau diese Grobheit war der Bug.

// Die Schriftmaße der beiden Ebenen werden NICHT abgeschrieben, sondern am gerenderten
// Element abgelesen: Größe und Klasse stehen in renderer.js (SUB_SIZE, .c-note). Eine
// zweite Zahlenliste hier wäre beim nächsten Renderer-Umbau still veraltet.
const musterRef = Object.entries(manifest.assets).find(([, a]) => (a.labelSlots || []).length)?.[0];
const musterSlots = manifest.assets[musterRef].labelSlots;
const EBENEN = await page.evaluate((c) => {
  area.innerHTML = RENDERERS[c.type](c);
  const svg = document.querySelector(".diagram svg");
  const lies = (el) => ({
    size: parseFloat(el.getAttribute("font-size")),
    klasse: el.getAttribute("class"),
    gewicht: getComputedStyle(el).fontWeight,
    zeichenabstand: getComputedStyle(el).letterSpacing
  });
  return {
    label: lies(svg.querySelector("text.svglabel:not(.c-note)")),
    sub: lies(svg.querySelector("text.svglabel.c-note"))
  };
}, karte(musterRef, Object.fromEntries(musterSlots.map((t) => [t.id, MUSTER[t.id]])), "hero",
  { subs: { [musterSlots[0].id]: "X" } }));
console.log(`\nEbenen (am gerenderten Element abgelesen): `
  + Object.entries(EBENEN).map(([n, e]) => `${n} ${e.size}px/${e.gewicht} „${e.klasse}"`).join("  ·  "));

// Zeichensatz der Tabelle. Was hier fehlt, bekommt im Validator den Rückfallwert eines
// FREMDEN Glyphen (breiter als jedes gemessene Zeichen) — unbekannt macht das Gate also
// strenger, nie lockerer.
const ZEICHENSATZ = [...new Set([
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."abcdefghijklmnopqrstuvwxyz", ..."0123456789",
  ..."ÄÖÜäöüßÀÁÂÃÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕØÙÚÛÝàáâãåæçèéêëìíîïñòóôõøùúûýÿŒœŠšŸŽž",
  ..." .,;:!?'\"()[]{}/\\|+-*=<>%&#@$€§~^_`", ..."–—·…„“”‘’«»×÷°²³≤≥≠→←↑↓•‰±"
])];
// Ein einzeln gemessenes Leerzeichen ist 0 breit (die SVG-Textverarbeitung kollabiert
// führende und folgende Leerräume). Gemessen wird es deshalb als NBSP — derselbe
// Vorschub, aber nicht kollabierbar (gemessen: 4.0642 gegen 4.0472 im Wort, also
// minimal großzügig und damit auf der sicheren Seite).
const NBSP = " ";

/// Vorschub je Zeichen + Kerning je Paar. Beide Tabellen werden nach OBEN gerundet:
/// jeder Summand liegt damit ≥ seinem echten Wert, die Summe also ≥ der gerenderten
/// Breite — das Gate kann nie lockerer urteilen als das Audit, das die echte Box misst.
///
/// Das Kerning MUSS mit: es zieht die abgenommenen Texte um 2–3 Einheiten zusammen, und
/// die liegen (weil ihr Zeichen-Deckel genau so gemessen wurde) hart an der Grenze.
/// Ohne Kern-Tabelle verböte das Gate „WORTE, GESTIK, TATEN" und „ROT — LÄUFT DURCH" —
/// gemessen, nicht vermutet: eine Verengung des Ausdrucksraums, kein Schutz.
const masse = await page.evaluate(({ chars, ebenen, NBSP }) => {
  const svg = document.querySelector(".diagram svg");
  const out = {};
  for (const [name, e] of Object.entries(ebenen)) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
    el.setAttribute("class", e.klasse); el.setAttribute("x", "0"); el.setAttribute("y", "150");
    el.setAttribute("font-size", String(e.size));
    svg.appendChild(el);
    const w = (t) => { el.textContent = t; return el.getBBox().width; };
    const echt = (c) => (c === " " ? NBSP : c);
    const auf = (v) => Math.ceil(v * 10000) / 10000;      // immer nach oben — nie zu klein
    const roh = {}, vorschub = {};
    for (const c of chars) { roh[c] = w(echt(c)); vorschub[c] = auf(roh[c]); }
    const kern = {};
    let maxKernPlus = 0;
    for (const a of chars) for (const b of chars) {
      const k = w(echt(a) + echt(b)) - roh[a] - roh[b];
      if (Math.abs(k) > 0.0005) { kern[a + b] = auf(k); if (k > maxKernPlus) maxKernPlus = k; }
    }
    // Rückfallwert für Zeichen ausserhalb der Tabelle: der breiteste Glyph, den ein
    // Fremdschrift-Fallback liefern kann (CJK, Emoji, Ligatur) — gemessen, nicht geraten.
    const fremd = Math.max(...["漢", "🙂", "🇩🇪", "﷽", "Ｗ", "⛔"].map(w));
    el.remove();
    out[name] = { vorschub, kern, maxKernPlus: auf(maxKernPlus), fremd: auf(fremd) };
  }
  return out;
}, { chars: ZEICHENSATZ, ebenen: EBENEN, NBSP });
for (const [n, m] of Object.entries(masse))
  console.log(`  ${n.padEnd(6)} ${Object.keys(m.vorschub).length} Zeichen, ${Object.keys(m.kern).length} Kern-Paare `
    + `(max spreizend ${m.maxKernPlus}), fremder Glyph ${m.fremd}`);

/// Modellbreite eines Textes — dieselbe Rechnung, die validate-lesson.mjs später ohne
/// Browser anstellt (Vorschübe + Kerning der Nachbarpaare).
const modellBreite = (txt, ebene) => {
  const m = masse[ebene], cs = [...txt];
  let sum = 0;
  for (let i = 0; i < cs.length; i++) {
    const v = m.vorschub[cs[i]];
    sum += v === undefined ? m.fremd : v;
    if (i + 1 < cs.length) {
      const bekannt = m.vorschub[cs[i]] !== undefined && m.vorschub[cs[i + 1]] !== undefined;
      sum += bekannt ? (m.kern[cs[i] + cs[i + 1]] ?? 0) : m.maxKernPlus;
    }
  }
  return sum;
};

/// Probe-Text einer Zielbreite. Zwei Fallen stecken darin, beide gemessen:
///
/// 1. Gebaut wird gegen die MODELLBREITE, nicht gegen die Summe der Vorschübe. Kerning
///    zieht einen langen Text um 2–3 Einheiten zusammen; ein nach Vorschüben gebauter
///    Text bliebe genau um diesen Betrag unter dem Ziel.
/// 2. Die Zeichenzahl steht VORHER fest, und jede Stelle bekommt das breiteste Zeichen,
///    mit dem die restlichen Stellen das Ziel noch halten können. Naiv von breit nach
///    schmal aufzufüllen läuft in eine Sackgasse: der Text besteht dann nur aus dem
///    breitesten Zeichen, und kein Tausch kommt näher ans Ziel — gemessen blieb der
///    Platz „aussen" so bei 141.6 statt am Kartenrand (144) und hätte den abgenommenen
///    Text „WORTE, GESTIK, TATEN" verboten.
/// 3. Die Zeichenzahl wird VARIIERT. Die Vorschübe haben Löcher (zwischen „%" 13.39 und
///    „‰" 18.55 liegt nichts), und bei fester Zeichenzahl fällt das Ziel in so ein Loch:
///    am Platz „rot" blieb die Grenze dadurch bei 144.2, obwohl der abgenommene Text
///    146.6 breit ist und sauber durchs Gate läuft. Mit mehreren Zeichenzahlen findet
///    sich immer eine Mischung, die dicht ans Ziel kommt.
///
/// Die gemeldete Grenze bleibt eine BEWIESENE Breite: die gemessene Box eines Textes,
/// der durchs Gate gelaufen ist — keine gerechnete Zahl.
const bauer = (ebene) => {
  const m = masse[ebene];
  // `<`, `>` und `&` bleiben draussen: der Renderer setzt den Text roh ins SVG-Markup,
  // ein Probe-Text mit Markup-Zeichen wäre kein Text mehr, sondern ein Element.
  const paare = Object.entries(m.vorschub).filter(([c]) => c.trim() && !"<>&".includes(c))
    .sort((a, b) => b[1] - a[1]);
  const breiteste = paare[0][1], schmalste = paare[paare.length - 1][1];
  const k = (a, b) => (a === undefined || b === undefined ? 0 : (m.kern[a + b] ?? 0));
  const fuerLaenge = (ziel, n) => {
    if (!(n >= 1) || n > 240 || n * schmalste > ziel) return null;
    const s = [];
    let breite = 0;
    for (let i = 0; i < n; i++) {
      // Reserve für die Stellen danach, damit die Wahl hier nicht das Ziel sprengt.
      const rest = (n - 1 - i) * schmalste;
      let gewaehlt = null;
      for (const [c, w] of paare) {
        const d = w + k(s[s.length - 1], c);
        if (breite + d + rest <= ziel) { gewaehlt = [c, d]; break; }
      }
      if (!gewaehlt) return null;
      s.push(gewaehlt[0]); breite += gewaehlt[1];
    }
    return { s: s.join(""), breite };
  };
  return (ziel) => {
    const n0 = Math.max(1, Math.ceil(ziel / breiteste));
    let best = null;
    for (let n = n0; n < n0 + 12; n++) {
      const k2 = fuerLaenge(ziel, n);
      if (k2 && (!best || k2.breite > best.breite)) best = k2;
    }
    return best ? best.s : "";
  };
};
/// Gerenderte Breite EINES Textes an seinem echten Platz (nicht nachgerechnet).
const istBreite = async (ref, labels, rolle, zusatz, suchtext) => page.evaluate(({ c, t }) => {
  area.innerHTML = RENDERERS[c.type](c);
  const el = [...document.querySelectorAll(".diagram svg text")].find((e) => e.textContent === t);
  return el ? +el.getBBox().width.toFixed(3) : null;
}, { c: karte(ref, labels, rolle, zusatz), t: suchtext });

/// Wo sitzt der Platz, und wie weit ist es von dort bis zum Kartenrand? Nur zur
/// Einordnung im Bericht: sagt, ob die Grenze der Rand ist oder etwas im Bild.
const platzGeometrie = async (ref, rolle, slots) => page.evaluate(({ c }) => {
  area.innerHTML = RENDERERS[c.type](c);
  const svg = document.querySelector(".diagram svg");
  const vb = svg.viewBox.baseVal;
  const out = {};
  for (const el of svg.querySelectorAll("text.svglabel:not(.c-note)")) {
    const x = +el.getAttribute("x"), an = getComputedStyle(el).textAnchor;
    out[el.textContent] = { x: +x.toFixed(1), anker: an,
      rand: +(an === "end" ? x - vb.x : an === "middle" ? 2 * Math.min(x - vb.x, vb.x + vb.width - x) : vb.x + vb.width - x).toFixed(1) };
  }
  return out;
}, { c: karte(ref, Object.fromEntries(slots.map((t) => [t.id, MUSTER[t.id]])), rolle) });

const breiteVorschlag = {}, geometrie = {};
for (const [ref, a] of Object.entries(manifest.assets)) {
  const slots = a.labelSlots || [];
  if (!slots.length) continue;
  breiteVorschlag[ref] = {};
  for (const rolle of rollenJeAsset[ref]) {
    const nachbarn = Object.fromEntries(slots.map((t) => [t.id, MUSTER[t.id]]));
    const geo = await platzGeometrie(ref, rolle, slots);
    for (const s of slots) geometrie[`${ref}|${rolle}|${s.id}`] = geo[MUSTER[s.id]] || null;
    // Grundzustand: was schon ohne Probe-Text anschlägt, gehört nicht der Breite.
    const grund = await befunde(ref, nachbarn, rolle);
    for (const s of slots) {
      for (const ebene of ["label", "sub"]) {
        const bau = bauer(ebene);
        let lo = 0, hi = 420, best = 0;
        for (let it = 0; it < 16; it++) {
          const ziel = (lo + hi) / 2;
          const probe = bau(ziel);
          if (!probe) { lo = ziel; continue; }
          const labels = ebene === "label" ? { ...nachbarn, [s.id]: probe } : nachbarn;
          const zusatz = ebene === "sub" ? { subs: { [s.id]: probe } } : {};
          const f = (await befunde(ref, labels, rolle, zusatz)).filter((x) => !grund.includes(x));
          if (f.length) { hi = ziel; continue; }
          const w = await istBreite(ref, labels, rolle, zusatz, probe);
          if (w !== null && w > best) best = w;
          lo = ziel;
        }
        breiteVorschlag[ref][`${rolle}.${s.id}.${ebene}`] = +best.toFixed(2);
      }
    }
  }
}

// Gegenprobe: ALLE Plätze und Sub-Zeilen gleichzeitig auf ihrer Breite. Anders als bei
// den Zeichen-Deckeln wird hier NICHT nachgegeben, sondern nur berichtet — und zwar aus
// einem gemessenen Grund: die Breiten-Grenze eines Platzes gilt (wie der Zeichen-Deckel)
// mit den Nachbarn auf ihrem abgenommenen Text. Alle Plätze gleichzeitig am Anschlag ist
// eine Lage, die der Zeichen-Deckel längst verbietet; sie automatisch nachzuziehen nähme
// dem breitesten Platz seine Breite wegen einer Enge, die ein anderer Platz verursacht
// (gemessen: „rot" verlor 30 Einheiten, weil „blau" gleichzeitig am Anschlag stand).
// Das Zusammenspiel zweier Texte ist eine andere Fehlerklasse (TEXT²) als „ein Text ist
// zu breit für seinen Platz" — sie bleibt beim Audit, der zweiten Verteidigungslinie.
const kombiBefund = [];
for (const [ref, a] of Object.entries(manifest.assets)) {
  const slots = a.labelSlots || [];
  if (!slots.length) continue;
  for (const rolle of rollenJeAsset[ref]) {
    const b = breiteVorschlag[ref];
    const labels = {}, subs = {};
    for (const s of slots) {
      const wl = b[`${rolle}.${s.id}.label`], ws = b[`${rolle}.${s.id}.sub`];
      if (wl > 0) labels[s.id] = bauer("label")(wl);
      if (ws > 0 && wl > 0) subs[s.id] = bauer("sub")(ws);
    }
    if (!Object.keys(labels).length) continue;
    const f = await befunde(ref, labels, rolle, Object.keys(subs).length ? { subs } : {});
    kombiBefund.push(`  ${ref.padEnd(21)} ${rolle.padEnd(6)} alle Plätze gleichzeitig am Anschlag: `
      + (f.length ? `${f.length} Befund(e) — ${f[0].slice(0, 52)}` : "sauber"));
  }
}

console.log("\nBreiten-Kombination (nur berichtet, siehe oben — nicht nachgezogen):");
console.log(kombiBefund.join("\n"));

console.log("\nPlatz-Deckel (gemessen mit realistischem Label-Text, beide Rollen, inkl. Kombination):");
let geaendert = 0;
for (const [ref, a] of Object.entries(manifest.assets)) {
  for (const s of (a.labelSlots || [])) {
    const neu = vorschlag[ref]?.[s.id];
    if (neu === undefined) continue;
    const demo = MUSTER[s.id];
    const passt = demo && demo.length <= neu;
    console.log(`  ${ref.padEnd(21)} ${s.id.padEnd(12)} max ${String(s.max).padStart(2)} → ${String(neu).padStart(2)}`
      + `   abgenommener Text ${JSON.stringify(demo)} (${demo?.length}) ${passt ? "passt" : "PASST NICHT"}`);
    if (neu !== s.max) geaendert++;
    if (schreiben) s.max = neu;
    // Die gemessene BREITE je Rolle und Ebene — die Zahl, gegen die der Validator den
    // konkreten Text prüft. Der Zeichen-Deckel darüber bleibt der Richtwert im Prompt.
    const br = {};
    for (const rolle of rollenJeAsset[ref] || []) {
      const l = breiteVorschlag[ref]?.[`${rolle}.${s.id}.label`];
      const u = breiteVorschlag[ref]?.[`${rolle}.${s.id}.sub`];
      if (l === undefined) continue;
      br[rolle] = { label: l, sub: u ?? 0 };
      const g = geometrie[`${ref}|${rolle}|${s.id}`];
      const woher = g ? (Math.abs(g.rand - l) <= 1.5 ? `Kartenrand (${g.rand})` : `Bild/Nachbar (Rand wäre ${g.rand})`) : "-";
      console.log(`  ${"".padEnd(21)} ${s.id.padEnd(12)} breite ${rolle.padEnd(6)} label ${String(l).padStart(6)}  sub ${String(u ?? 0).padStart(6)}`
        + `   x=${g?.x ?? "?"} ${g?.anker ?? ""} → ${woher}`);
    }
    if (JSON.stringify(br) !== JSON.stringify(s.breiteMax)) geaendert++;
    if (schreiben) s.breiteMax = br;
    const sub = subVorschlag[ref]?.[s.id];
    if (sub === undefined) continue;
    const zeig = (v) => v ? Object.entries(v).map(([r, n]) => `${r} ${n}`).join(", ") : "-";
    console.log(`  ${"".padEnd(21)} ${s.id.padEnd(12)} sub ${zeig(s.subMax).padEnd(18)} → ${zeig(sub)}`
      + (Object.values(sub).some((n) => n > 0) ? "" : "   trägt keine Sub-Zeile"));
    if (JSON.stringify(sub) !== JSON.stringify(s.subMax)) geaendert++;
    if (schreiben) s.subMax = sub;
  }
  const note = noteVorschlag[ref];
  if (note !== undefined) {
    console.log(`  ${ref.padEnd(21)} ${"(note)".padEnd(12)} max ${String(a.noteMax ?? "-").padStart(2)} → ${String(note).padStart(2)}`
      + (note > 0 ? "   (gilt am engsten Anker)" : "   trägt keine Notes"));
    if (note !== a.noteMax) geaendert++;
    if (schreiben) a.noteMax = note;
  }
  if (schreiben && rollenJeAsset[ref]) a.rollen = rollenJeAsset[ref];
}

// ——— Schriftmaße als eigene Datei ———
// Nicht ins Manifest: dort steht die Asset-Library, und jedes Feld darin ist gegen die
// SVG-Datei geprüft (asset-check.mjs). Schriftvorschübe gehören keiner SVG-Datei — sie
// gehören der Schrift des Wirts. Der Validator misst damit die Breite eines Textes,
// ohne einen Browser zu starten.
const textmassePfad = resolve(REPO, "assets/textmasse.json");
const textmasse = {
  hinweis: "GENERIERT von probes/asset-slot-max.mjs — nicht von Hand ändern. Vorschub je Zeichen "
    + "in Karten-Einheiten, gemessen an der echten Schrift des Wirts (getBBox, dieselbe Box, die "
    + "label-audit.mjs für CLIP misst). validate-lesson.mjs bestimmt damit die Breite eines Labels "
    + "ohne Rendern: Summe der Vorschübe plus das Kerning der Nachbarpaare. Alle Werte sind nach OBEN "
    + "gerundet, die Summe liegt deshalb nie unter der gerenderten Breite — das Gate urteilt nie "
    + "lockerer als das Audit. Unbekanntes Zeichen → fremd, unbekanntes Paar → maxKernPlus.",
  pruefen: "node probes/asset-slot-max.mjs --check",
  wirt: "karten-grammatik.html in Chromium (Playwright), Viewport 560×1000 — derselbe Wirt wie audit-lesson.mjs",
  leerzeichen: "als NBSP gemessen; einzeln gemessen kollabiert ein Leerzeichen auf 0",
  ebenen: EBENEN,
  masse
};
const textmasseText = JSON.stringify(textmasse, null, 2) + "\n";
const textmasseAlt = existsSync(textmassePfad) ? readFileSync(textmassePfad, "utf8") : "";
const textmasseDrift = textmasseAlt !== textmasseText;
if (textmasseDrift) geaendert++;
console.log(`\nassets/textmasse.json: ${textmasseAlt ? (textmasseDrift ? "WEICHT AB" : "aktuell") : "fehlt"}`
  + ` (${Object.keys(masse.label.vorschub).length} Zeichen je Ebene)`);

if (schreiben) {
  writeFileSync(manifestPfad, JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(textmassePfad, textmasseText);
  console.log(`\nMANIFEST + TEXTMASSE GESCHRIEBEN — ${geaendert} Werte geändert (danach: node build-assets.mjs)`);
} else if (pruefen) {
  // Veraltet-Check: eine gemessene Grenze, die nicht mehr misst, was der Wirt zeichnet,
  // ist schlimmer als keine — sie behauptet Deckung, die es nicht gibt.
  console.log(geaendert ? `\nSLOT-MAX FAIL — ${geaendert} gemessene Werte sind veraltet: node probes/asset-slot-max.mjs --schreiben`
    : "\nSLOT-MAX PASS — alle gemessenen Werte aktuell");
} else console.log(`\n${geaendert} Werte würden sich ändern (--schreiben übernimmt sie)`);
await browser.close();
if (pruefen && geaendert) process.exit(1);
