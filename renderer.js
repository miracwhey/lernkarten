const C = (key) => `var(--${key})`;
const SOFT = (key) => `var(--${key}-soft)`;
const MEASURE_CTX = document.createElement("canvas").getContext("2d");

// ————————————————— Geometrie-Werkbank (EINE Quelle für alle Karten-Typen) —————————————————
// Boxen, Kollisionen, Abstände, Textmaße. Bis v3-Schritt 3 lagen diese Werkzeuge lokal
// in RENDERERS.curve; seit die Asset-Karte ebenfalls Text an Geometrie bindet, stehen
// sie hier. Eine zweite Fassung derselben Mathematik wäre eine zweite Wahrheit — Kurve,
// Asset und label-audit müssen über DIESELBEN Rechtecke streiten, sonst misst das Gate
// etwas anderes, als der Renderer gezeichnet hat.

// Gewicht mitmessen: Notes rendern leichter als Serien-Labels, sonst misst der
// Solver eine andere Breite als der Browser zeichnet.
const measure = (txt, size, weight = 700) => {
  MEASURE_CTX.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  return MEASURE_CTX.measureText(txt).width + txt.length * size * 0.08;
};
const RAD = Math.PI / 180;
// Textkörper in Zahlen, an der ECHTEN Schrift gemessen (probes: getBBox gegen
// font-size): die Box ist 1.21·Größe hoch und ihre Mitte liegt 0.385·Größe über der
// Grundlinie. Ein geschätztes Kasten-Maß ließe Renderer und Audit über verschieden
// große Rechtecke streiten — dieselbe Zahl auf beiden Seiten macht die Prüfung erst
// aussagekräftig. Etwas größer als die reale Box ist sie bewusst (Sicherheitssaum).
const BOX_H = 1.21, BASE_OFF = 0.385;
const boxH = (size) => size * BOX_H + 1;
// Ein Sticky-Label liegt auf der Tangente seines Strichs — seine Box ist GEDREHT.
// Achsparallel gerechnet wäre sie an einer 25°-Kurve ein Vielfaches zu groß und
// schlüge Lagen aus, die der Text nie berührt. Die ganze Schicht rechnet deshalb
// mit orientierten Rechtecken; deg=0 ist der Sonderfall (Note, Achse, Ereignis).
const rect = (cx, cy, w, h, deg = 0) => ({ cx, cy, w, h, deg });
const toLocal = (r, x, y) => {
  const a = r.deg * RAD, c = Math.cos(a), s = Math.sin(a), dx = x - r.cx, dy = y - r.cy;
  return [dx * c + dy * s, dy * c - dx * s];
};
const toWorld = (r, lx, ly) => {
  const a = r.deg * RAD, c = Math.cos(a), s = Math.sin(a);
  return [r.cx + lx * c - ly * s, r.cy + lx * s + ly * c];
};
const cornersOf = (r) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => toWorld(r, u * r.w / 2, v * r.h / 2));
const grow = (r, px, py = px) => rect(r.cx, r.cy, r.w + 2 * px, r.h + 2 * py, r.deg);
const inRect = (r, x, y) => { const [u, v] = toLocal(r, x, y); return Math.abs(u) <= r.w / 2 && Math.abs(v) <= r.h / 2; };
// Abstand einer Label-BOX zu einem Punkt. Bewusst von der Box aus gemessen, nicht
// vom Mittelpunkt: ein breites Label kann mit der Mitte weit von einer Kurve liegen
// und mit dem Rand direkt daran — das Auge (und das Audit) sehen den Rand.
const distRect = (r, x, y) => {
  const [u, v] = toLocal(r, x, y);
  return Math.hypot(Math.max(Math.abs(u) - r.w / 2, 0), Math.max(Math.abs(v) - r.h / 2, 0));
};
// Überlappung zweier orientierter Rechtecke: Trennachsen-Test über beide Achsenpaare.
const hitRect = (A, B) => {
  const ca = cornersOf(A), cb = cornersOf(B);
  for (const R of [A, B]) {
    const a = R.deg * RAD;
    for (const [ax, ay] of [[Math.cos(a), Math.sin(a)], [-Math.sin(a), Math.cos(a)]]) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, y] of ca) { const p = x * ax + y * ay; if (p < a0) a0 = p; if (p > a1) a1 = p; }
      for (const [x, y] of cb) { const p = x * ax + y * ay; if (p < b0) b0 = p; if (p > b1) b1 = p; }
      if (a1 < b0 || b1 < a0) return false;
    }
  }
  return true;
};
// Abstand zwischen zwei BESCHRIFTUNGEN, gerichtet: LÄNGS der Leserichtung braucht es
// mehr als den Wortabstand der Schrift, sonst lesen sich zwei Texte als ein Satz
// („Gefühlter Druck DRUCK MASKIERT"). QUER dazu genügt wenig — zwei Zeilen übereinander
// liest niemand als eine; die gestapelte Apex-Note lebt genau davon. Gewachsen wird im
// gedrehten Rahmen des Labels, „längs" ist also seine Grundlinie.
const LUFT_X = 7, LUFT_Y = 2;
const hitPix = (r, pix) => pix.some(([x, y]) => inRect(r, x, y));
const distPix = (r, pix) => { let best = Infinity; for (const [x, y] of pix) { const d = distRect(r, x, y); if (d < best) best = d; } return best; };
// Belegung einer EINZELNEN Karte: die Boxen, die schon stehen. Je Karte eine eigene
// Liste — eine geteilte ließe die zweite Karte auf die Lagen der ersten ausweichen.
const belegung = () => {
  const placed = [];                                 // orientierte Boxen aller schon gesetzten Objekte
  const put = (r) => { placed.push(r); return r; };
  const hitPlaced = (r, px = 4, py = px) => { const q = grow(r, px, py); return placed.some((o) => hitRect(q, o)); };
  // Schadensmaß für Notlagen. EIN Geometrie-Treffer wiegt schwerer als jede Zahl von
  // Reservierungs-Überschneidungen: Text auf einer Linie ist ein sichtbarer Defekt,
  // ein Anschnitt an einer (großzügig bemessenen) Reservierung ist keiner.
  const schadenVon = (r, pix) => {
    const q = grow(r, 2);
    const treffer = pix.filter(([x, y]) => inRect(q, x, y)).length;
    return (treffer ? 1000 + treffer : 0) + 40 * placed.filter((o) => hitRect(q, o)).length;
  };
  return { placed, put, hitPlaced, schadenVon };
};
// `attrs` trägt die Zugehörigkeit ins DOM — Audits messen die Bindung damit am
// gezeichneten Objekt, ohne die Geometrie ein zweites Mal zu berechnen. Die Farbe steht
// INLINE: die Klassenregeln (.c-series/.c-note) tragen einen Grundton und schlügen ein
// fill-Attribut.
const textSvg = (r, size, txt, cls, fill, attrs = "") => {
  const dreh = r.deg ? ` rotate(${r.deg.toFixed(1)})` : "";
  return `<text class="svglabel ${cls}" transform="translate(${r.cx.toFixed(1)} ${r.cy.toFixed(1)})${dreh}"
        y="${(size * BASE_OFF).toFixed(2)}" font-size="${size}" text-anchor="middle" style="fill:${fill}" ${attrs}>${txt}</text>`;
};
// `cls` trennt die zwei Rollen, die ein Leader hat: bei Notes ist er die DEGRADATION einer
// Bindung und tritt deshalb zurück (blass, gepunktet); in der Erklär-Schicht ist er das
// REGELMITTEL und muss lesbar zeigen, worauf er zeigt. Eine Geometrie, zwei Tonlagen.
const leaderSvg = (g, anker, extra = "", cls = "leader") => g
  ? `<line class="${cls}"${AN(anker)}${extra} x1="${g.x1.toFixed(1)}" y1="${g.y1.toFixed(1)}" x2="${g.x2.toFixed(1)}" y2="${g.y2.toFixed(1)}"/>`
  : "";

// ——— Leader: die letzte Degradation einer Text-Bindung ———
// Ein Leader ist hart gedeckelt: ein langer Strich quer durchs Bild verbindet zwar
// formal, wird aber als eigene Geometrie gelesen statt als Zeigefinger. LEADER_AB ist
// der Abstand, ab dem ein Text ohne Strich nicht mehr erkennbar zum Anker gehört.
const LEADER_MAX = 40, LEADER_AB = 12;
// Austrittspunkt AUF der Verbindung Mitte→Anker (Slab-Schnitt mit der Box). Ein an der
// Box-Kante entlang gerechneter Startpunkt läge bei breiten Labels genau unter dem
// Anker — der Strich stünde senkrecht und läse sich wie eine zweite Ereignis-Linie.
// Kollinear gerechnet erbt er die geprüfte Diagonale.
const leaderGeom = (r, anchor) => {
  const dx = anchor[0] - r.cx, dy = anchor[1] - r.cy;
  const tx = dx ? (r.w / 2 + 1) / Math.abs(dx) : Infinity;
  const ty = dy ? (r.h / 2 + 1) / Math.abs(dy) : Infinity;
  const k = Math.min(tx, ty, 1);
  const ex = r.cx + dx * k, ey = r.cy + dy * k;
  // Kurz halten: der Strich endet vor dem Punkt-Marker, statt ihn zu treffen.
  const d = Math.hypot(anchor[0] - ex, anchor[1] - ey) || 1;
  return { x1: ex, y1: ey, x2: anchor[0] - (anchor[0] - ex) / d * 5, y2: anchor[1] - (anchor[1] - ey) / d * 5 };
};
const leaderLen = (g) => Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
// Ein Leader darf nur DIAGONAL laufen: senkrecht stünde er wie eine zweite
// Ereignis-Linie neben der gestrichelten Stop-Linie, waagerecht wie ein Achsen-Strich.
// Kriterium ist der Winkel des GEZEICHNETEN Strichs — Komponenten in Pixeln zu prüfen
// ließe eine Lage wie 104×16 px durchgehen, die als 9°-Strich praktisch waagerecht liegt.
const diagonal = (g) => {
  const a = Math.atan2(Math.abs(g.y2 - g.y1), Math.abs(g.x2 - g.x1)) / RAD;
  return a >= 18 && a <= 72;
};
// Nichts dazwischen: der Zeigefinger kreuzt keine Geometrie. Am Ankerpunkt selbst wird
// nicht geprüft — dort liegt der Gegenstand, auf den er zeigt.
const leaderFree = (g, pix) => {
  const n = Math.max(1, Math.ceil(leaderLen(g) / 4));
  for (let k = 0; k <= n; k++) {
    const x = g.x1 + (g.x2 - g.x1) * (k / n), y = g.y1 + (g.y2 - g.y1) * (k / n);
    if (Math.hypot(x - g.x2, y - g.y2) < 9) continue;
    if (pix.some(([px, py]) => Math.hypot(px - x, py - y) < 3)) return false;
  }
  return true;
};

// ——— Auswahl einer Lage aus vorsortierten Kandidaten ———
// Die KANDIDATEN erzeugt der Karten-Typ: seine Geometrie bestimmt, wo ein Text überhaupt
// stehen könnte, und seine Sonderfälle (Fläche am Objekt, Apex am Kurvenast) lassen sich
// nicht verallgemeinern. Die AUSWAHL daraus ist überall dieselbe Staffel und stand bisher
// zweimal im Renderer — einmal für Asset-Notes, einmal für Kurven-Notes:
//   bevorzugte Lage → streng (frei UND eindeutig) → lax (nur frei) → Notnagel.
// Herausgelöst als Fundament der Erklär-Schicht (docs/erklaer-schicht-spec.md): deren
// Primitive bringen eigene Kandidaten mit, sollen aber nicht ihre eigene Staffel erfinden.
const platziere = (kandidaten, { frei, eindeutig = () => true, bevorzugt = null, guete = null, schaden = null }) => {
  // Bevorzugte Lagen entscheiden NICHT nach der Rangfolge der Liste, sondern nach eigener
  // Güte: wo die Bindung schon anders bewiesen ist, zählt ein anderes Maß als Nähe.
  if (bevorzugt) {
    let best = null, bg = -Infinity;
    for (const c of kandidaten) {
      if (!frei(c) || !eindeutig(c) || !bevorzugt(c)) continue;
      const g = guete(c);
      if (g > bg) { bg = g; best = c; }
    }
    if (best) return best;
  }
  for (const streng of [true, false])
    for (const c of kandidaten) if (frei(c) && (!streng || eindeutig(c))) return c;
  // Notnagel: nirgends frei — die Lage mit dem geringsten Schaden. `schaden` liefert null
  // für Lagen, die auch als Notnagel ausscheiden; bleibt keine übrig, gilt die beste
  // Rangfolge-Lage, damit nie gar nichts gezeichnet wird.
  if (schaden) {
    let schlecht = null;
    for (const c of kandidaten) {
      const s = schaden(c);
      if (s == null) continue;
      if (!schlecht || s < schlecht.s) schlecht = { c, s };
    }
    if (schlecht) return schlecht.c;
  }
  return kandidaten[0] || null;
};

// ————————————————————— v3: Anker (Sequenz-Layer) —————————————————————
// Anker-Namen entstehen KONSTRUKTIV beim Erzeugen der Elemente, nie durch
// nachträgliches Klassifizieren: die Serien-Geometrie ist eine klassenlose polyline,
// `.c-series` ist ihr Text-LABEL — wer hinterher sortiert, erwischt das Falsche.
// Zweiter Produzent derselben Namen ist validate-lesson.mjs (`ankerModell`); der
// Validator darf dafür nicht rendern müssen. Dass beide dasselbe sagen, ist gemessen,
// nicht behauptet: `node probes/anker-check.mjs` vergleicht Registry gegen DOM.
const ankerSlug = (v, fallback = "") => {
  const s = String(v ?? "").replace(/<[^>]+>/g, " ").trim().toLowerCase()
    .replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]/gu, "").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return s || fallback;
};
// Vergabe je Karte, in derselben Reihenfolge wie die Registry: gleicher Slug → -2, -3.
const ankerVergabe = () => {
  const seen = new Set();
  return (name) => { let n = name; for (let k = 2; seen.has(n); k++) n = `${name}-${k}`; seen.add(n); return n; };
};
// Ein Element kann zu MEHREREN Ankern gehören (das Ereignis-Label ist `stop` und
// `label:<slug>`); die Sequenz-Engine sucht deshalb mit [data-anchor~="…"].
const AN = (...namen) => ` data-anchor="${namen.filter(Boolean).join(" ")}"`;
// `data-glow` = die Fläche, die als Puls-ZIEL aufglüht. `data-ton` = die Farbe, die
// ein Label bei `highlight` annimmt. Getrennt, weil sonst der Text mitglühen würde.
const GLOW = (farbe) => ` data-glow="${farbe}"`;
const TON = (farbe) => ` data-ton="${farbe}"`;

// ————————————————————— v3: Asset-Library —————————————————————
// Die SVG-Dateien in assets/ sind die EINZIGE Geometrie-Quelle. Sie kommen als Text
// über assets/assets.js herein (die Karten-Seiten laufen über file://, dort gibt es
// kein fetch) und werden hier EINMAL geparst. Es gibt keine zweite Fassung im
// Renderer: was ein Karten-Typ vom Objekt braucht, holt er sich als Teil.
//
// Asset-Einheit = halbe Karten-Einheit. Die Platzierung (hero: scale 2) steht im
// Manifest, nicht im Karten-JSON — das LLM sagt WAS, nie wo oder wie groß.
const ASSET_DOKS = new Map();
const ASSET_KEIN_NS = / xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g;
const INLINE_F = 0.6;      // role:inline — dieselbe Komposition, 60 % um die Bildmitte
function assetDoc(ref) {
  if (ASSET_DOKS.has(ref)) return ASSET_DOKS.get(ref);
  const src = (window.ASSETS_SRC || {})[ref];
  // Laut brechen statt still leer rendern: ein fehlendes Asset ist ein Einbau-Fehler
  // der Seite (Script-Tag) oder ein ref, den der Validator hätte ablehnen müssen.
  if (!src) throw new Error(`Asset "${ref}" nicht geladen — assets/assets.js muss VOR renderer.js stehen`);
  const doc = new DOMParser().parseFromString(src, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error(`Asset "${ref}" ist kein wohlgeformtes SVG`);
  ASSET_DOKS.set(ref, doc);
  return doc;
}
// Abgetastet wird an einer ANGEHÄNGTEN Fassung des Objekts: `getTotalLength()` liefert
// bei `circle` nur im Dokument einen Wert (bei `path` auch ohne). Ungemessen fielen genau
// die runden Teile aus Hindernis- UND Anker-Abtastung — der Solver setzte Text auf einen
// Kreis, den er nicht sah. Ein Wirt je Seite, ein Klon je Objekt, beide unsichtbar.
let MESS_WIRT = null;
const ASSET_MESS = new Map();
function assetMess(ref) {
  if (ASSET_MESS.has(ref)) return ASSET_MESS.get(ref);
  if (!MESS_WIRT) {
    MESS_WIRT = document.createElement("div");
    MESS_WIRT.setAttribute("aria-hidden", "true");
    MESS_WIRT.style.cssText = "position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:hidden";
    document.body.appendChild(MESS_WIRT);
  }
  const el = assetDoc(ref).documentElement.cloneNode(true);
  MESS_WIRT.appendChild(el);
  ASSET_MESS.set(ref, el);
  return el;
}
const assetEintrag = (ref) => (((window.ASSET_MANIFEST || {}).assets) || {})[ref] || null;
const assetKurz = (ref) => String(ref).split(".").pop();
const assetEl = (ref, teil) => {
  const el = assetDoc(ref).querySelector(`[data-part="${teil}"]`);
  if (!el) throw new Error(`Asset "${ref}" hat kein Teil "${teil}"`);
  return el;
};
// Ein Teil kommt als Markup zurück: Gruppen ohne ihre Hülle (der Karten-Typ setzt die
// Hülle mit Anker und Platzierung), Einzelformen als sie selbst.
const assetTeil = (ref, teil) => {
  const el = assetEl(ref, teil);
  const s = el.tagName === "g" ? el.innerHTML : el.outerHTML;
  return s.replace(ASSET_KEIN_NS, "");
};
const assetPfad = (ref, teil) => assetEl(ref, teil).getAttribute("d");

// Was am Objekt als GEOMETRIE gilt. Wortgleich mit der Auswahl, die label-audit.mjs als
// Hindernis misst (dort mit `[data-asset] `-Präfix): zwei verschiedene Mengen ließen
// Renderer und Gate über verschiedene Bilder streiten. `.a-route` bleibt außen vor —
// der Puls-Weg wird nie gemalt, er wäre ein Hindernis, das niemand sieht.
const ASSET_GEO_SEL = "path:not(.a-route), line, polygon, circle";
const ASSET_TASTSCHRITT = 1.5;                    // Karten-Einheiten zwischen zwei Tastpunkten
// Textbox aus Grundlinien-Punkt, Ausrichtung und Drehung. `o` ist der Drehursprung:
// eine Sub-Zeile dreht um den Punkt IHRES Labels, sonst liefe sie bei schrägen Plätzen
// unter dem Label weg statt parallel darunter zu bleiben.
const textBox = (x, y, w, size, align, deg, ox = x, oy = y) => {
  const ux = x + (align === "middle" ? 0 : align === "end" ? -w / 2 : w / 2);
  const uy = y - size * BASE_OFF;
  if (!deg) return rect(ux, uy, w, boxH(size), 0);
  const a = deg * RAD, c = Math.cos(a), s = Math.sin(a), dx = ux - ox, dy = uy - oy;
  return rect(ox + dx * c - dy * s, oy + dx * s + dy * c, w, boxH(size), deg);
};

/// Hero/Inline-Einbau eines Assets in eine Karten-SVG (Karten-Einheiten 400×300).
/// Liefert Markup UND die vergebenen Anker — die Namen entstehen konstruktiv, in
/// derselben Reihenfolge wie in der Registry (validate-lesson.mjs, ohne Rendern).
function assetEinbau(ref, { A, labels = {}, subs = {}, notes = [], role = "hero" }) {
  const m = assetEintrag(ref) || {};
  const doc = assetDoc(ref);
  const { scale = 2, tx = 0, ty = 0 } = m.hero || {};
  const f = role === "inline" ? INLINE_F : 1;
  // Inline ist dieselbe Komposition, nur kleiner um die Bildmitte gestaucht: keine
  // zweite Anordnung, die auseinanderlaufen könnte.
  const MX = 200, MY = 150;
  const kx = (x) => MX + f * (tx + scale * x - MX);
  const ky = (y) => MY + f * (ty + scale * y - MY);
  const hin = `translate(${MX * (1 - f) + f * tx},${MY * (1 - f) + f * ty}) scale(${f * scale})`;
  const { put, hitPlaced, schadenVon } = belegung();

  const anAsset = A(`asset:${assetKurz(ref)}`);
  (m.anker || []).forEach((n) => A(n));           // Reihenfolge = Manifest-Reihenfolge
  const geo = [...doc.documentElement.children]
    .filter((el) => el.tagName !== "text")        // Label-Plätze sind keine Geometrie
    .map((el) => new XMLSerializer().serializeToString(el).replace(ASSET_KEIN_NS, "")).join("\n        ");

  // Die gezeichnete Geometrie in KARTEN-Einheiten. Abgetastet wird die DATEI — dieselbe
  // Quelle, die oben ins Markup geht. Eine zweite, im Renderer nachgebaute Kontur wäre
  // eine zweite Wahrheit; hier läuft alles über getPointAtLength auf dem Original.
  const abtasten = (el) => {
    const out = [];
    let len = 0;
    try { len = el.getTotalLength(); } catch { return out; }
    const n = Math.max(1, Math.ceil((len * f * scale) / ASSET_TASTSCHRITT));
    for (let k = 0; k <= n; k++) {
      const p = el.getPointAtLength(len * (k / n));
      out.push([kx(p.x), ky(p.y)]);
    }
    return out;
  };
  const mess = assetMess(ref);
  const geoEls = [...mess.querySelectorAll(ASSET_GEO_SEL)];
  const hindernis = geoEls.flatMap(abtasten);

  // ——— Label-Plätze + ihre Sub-Zeilen ———
  // Die Sub-Zeile ist KONSTRUKTIV an ihr Label gebunden: gleicher x, gleiche Ausrichtung,
  // gleiche Drehung, eine Zeile tiefer. Sie sucht sich keine Lage — sie hängt an einer.
  const SUB_SIZE = 10.5;
  // Grundlinien-Abstand aus dem abgenommenen Mockup (probes/asset-note-mockup/c-hero-notes.png).
  // Die Box-Höhe der Werkbank (13.7) als Abstand zu nehmen wäre die naheliegende
  // Herleitung — gemessen schiebt sie die Sub-Zeile des oberen Platzes aber in die
  // Schädelkontur: die Box trägt einen Sicherheitssaum, den echte Versalien nicht füllen.
  const SUB_DY = 11;
  const labelBoxen = {};
  const texte = [];
  for (const slot of (m.labelSlots || [])) {
    const txt = labels[slot.id];
    if (txt === undefined || txt === null || txt === "") continue;      // leerer Platz bleibt leer
    const el = doc.querySelector(`[data-slot="${slot.id}"]`);
    if (!el) continue;
    const x = kx(+el.getAttribute("x")), y = ky(+el.getAttribute("y"));
    const dreh = el.dataset.rotate;
    const ton = el.dataset.ton;
    const align = el.dataset.align;
    const an = A(`label:${slot.id}`);
    // `seq-hl` setzt die Sequenz-Engine selbst, wenn ein highlight-Schritt das Label
    // trifft — hier steht nur der Ruhezustand: der Ton des Objekts, an dem es hängt.
    texte.push(`<text class="svglabel halo"${AN(an)} data-label-anchor="${slot.anker}"`
      + `${ton ? TON(ton) : ""} x="${x}" y="${y}" font-size="12"`
      + `${align ? ` text-anchor="${align}"` : ""}`
      + `${dreh ? ` transform="rotate(${dreh} ${x} ${y})"` : ""}`
      + ` fill="${ton ? C(ton) : C("ink")}">${txt}</text>`);
    labelBoxen[slot.id] = put(textBox(x, y, measure(txt, 12), 12, align, +(dreh || 0)));
    const sub = subs[slot.id];
    if (sub === undefined || sub === null || sub === "") continue;
    const anSub = A(`sub:${slot.id}`);
    const sy = y + SUB_DY;
    // Muted und leichter als das Label: die Elaboration ist die zweite Ebene, nicht ein
    // zweites Label. Die Farbe kommt aus .c-note (CSS schlägt Präsentations-Attribute).
    texte.push(`<text class="svglabel c-note halo"${AN(anSub)} data-label-anchor="${slot.anker}"`
      + ` x="${x}" y="${sy}" font-size="${SUB_SIZE}"`
      + `${align ? ` text-anchor="${align}"` : ""}`
      + `${dreh ? ` transform="rotate(${dreh} ${x} ${y})"` : ""}`
      + `>${sub}</text>`);
    put(textBox(x, sy, measure(sub, SUB_SIZE, 600), SUB_SIZE, align, +(dreh || 0), x, y));
  }

  // ——— Freie Anker-Notes ———
  // Vokabular der curve-Note: Punkt AM Gegenstand, Text unmittelbar daneben, Leader nur
  // als Degradation. Gesucht wird ausschließlich entlang der Geometrie des EIGENEN
  // Ankers — die Bindung ist damit konstruktiv wahr und kein Gewicht in einem Score.
  // Flächen sind dabei kein Hindernis, nur ihre Kontur: eine Note zu einer Region darf
  // deshalb IN der Fläche stehen, solange sie keine Linie trifft.
  const NOTE_SIZE = 10.5, ZEILE = boxH(NOTE_SIZE);
  // Karten-Einheit zurück in Asset-Einheit — nur für Flächen-Tests (isPointInFill misst
  // im Koordinatensystem der Datei).
  const ix = (x) => (x - MX * (1 - f) - f * tx) / (f * scale);
  const iy = (y) => (y - MY * (1 - f) - f * ty) / (f * scale);
  const flaechenVon = (name) => [...mess.querySelectorAll(`[data-anchor~="${name}"]`)]
    .flatMap((el) => (el.matches(ASSET_GEO_SEL) ? [el] : [...el.querySelectorAll(ASSET_GEO_SEL)]))
    .filter((el) => { const fi = el.getAttribute("fill"); return fi && fi !== "none" && el.isPointInFill; });
  const punkteVon = (name) => {
    if (name === `asset:${assetKurz(ref)}`) return hindernis;
    if (name.startsWith("label:")) {
      const b = labelBoxen[name.slice(6)];
      return b ? cornersOf(b).concat([[b.cx, b.cy]]) : [];
    }
    return [...mess.querySelectorAll(`[data-anchor~="${name}"]`)]
      .flatMap((el) => (el.matches(ASSET_GEO_SEL) ? [el] : [...el.querySelectorAll(ASSET_GEO_SEL)]))
      .flatMap(abtasten);
  };
  // Umbruch ist eine LAYOUT-Entscheidung und gehört deshalb dem Renderer: das Karten-JSON
  // liefert einen Satz, nicht zwei Zeilen. Gebrochen wird an der Wortgrenze, die beide
  // Zeilen am gleichmäßigsten macht — deterministisch, ohne Rest.
  const varianten = (txt) => {
    const w = String(txt).split(" ");
    if (w.length < 2) return [[txt]];
    let best = null;
    for (let i = 1; i < w.length; i++) {
      const a = w.slice(0, i).join(" "), b = w.slice(i).join(" ");
      const d = Math.abs(measure(a, NOTE_SIZE, 600) - measure(b, NOTE_SIZE, 600));
      if (!best || d < best.d) best = { d, zeilen: [a, b] };
    }
    return [[txt], best.zeilen];
  };
  const inBild = (r) => cornersOf(r).every(([x, y]) => x >= 4 && x <= 396 && y >= 8 && y <= 292);
  const RICHTUNG = [[0, 1], [0, -1], [1, 0], [-1, 0], [0.71, 0.71], [0.71, -0.71], [-0.71, 0.71], [-0.71, -0.71]];
  const ABSTAND = [8, 12, 17, 23, 30, 38];
  const notenMarkup = notes.map((n, ni) => {
    const anNote = A(`note:${ankerSlug(n.text, String(ni))}`);
    const eigen = punkteVon(n.anker);
    if (!eigen.length) return "";                 // unbekannter Anker — der Validator lehnt ihn ab
    // Zuordenbarkeit: die Note muss dem eigenen Gegenstand näher sein als jedem anderen.
    const fremdPunkte = (m.anker || []).filter((a) => a !== n.anker).map(punkteVon).filter((p) => p.length);
    const naechster = (r, pts) => { let b = null, bd = Infinity; for (const p of pts) { const d = distRect(r, p[0], p[1]); if (d < bd) { bd = d; b = p; } } return { p: b, d: bd }; };
    // Startpunkte ausdünnen: die Kandidaten-Lagen entstehen um die Kontur herum, der
    // Punkt-Marker sucht sich danach die nächste Stelle der VOLLEN Abtastung.
    const schritt = Math.max(1, Math.ceil(eigen.length / 24));
    const saat = eigen.filter((_, i) => i % schritt === 0);
    const kandidaten = [];
    for (const zeilen of varianten(n.text)) {
      const breiten = zeilen.map((z) => measure(z, NOTE_SIZE, 600));
      const w = Math.max(...breiten), h = zeilen.length * ZEILE;
      for (const p of saat) for (const [dx, dy] of RICHTUNG) for (const ab of ABSTAND) {
        const r = rect(p[0] + dx * (ab + (Math.abs(dx) * w + Math.abs(dy) * h) / 2),
                       p[1] + dy * (ab + (Math.abs(dx) * w + Math.abs(dy) * h) / 2), w, h);
        const nah = naechster(r, eigen);
        const braucht = nah.d > LEADER_AB;
        const g = leaderGeom(r, nah.p);
        kandidaten.push({ r, zeilen, breiten, dot: nah.p,
          score: nah.d + (braucht ? 24 : 0) + (zeilen.length > 1 ? 6 : 0), braucht, g, nah });
      }
    }
    kandidaten.sort((a, b) => a.score - b.score);
    const frei = (c) => inBild(c.r) && !hitPlaced(c.r, LUFT_X, LUFT_Y) && !hitPix(grow(c.r, 2), hindernis)
      && (!c.braucht || (leaderLen(c.g) <= LEADER_MAX && diagonal(c.g) && leaderFree(c.g, hindernis)));
    const eindeutig = (c) => fremdPunkte.every((pts) => naechster(c.r, pts).d >= c.nah.d - 1.5);
    // Ist der Anker eine FLÄCHE, gehört die Anmerkung hinein: dort ist die Zugehörigkeit
    // nicht erschlossen, sondern gezeigt. Deshalb ist die Fläche die erste Wahl und nicht
    // nur die geduldete — draußen daneben stünde derselbe Text wie eine Bildunterschrift.
    // IN der Fläche entscheidet dann nicht mehr die Nähe zur Kontur, sondern die LUFT: an
    // den Rand geklebt läse sich der Text als Beschriftung dieser Kante statt als
    // Anmerkung zur Fläche. Draußen gilt weiter das Gegenteil (nah an der Linie).
    const flaechen = flaechenVon(n.anker);
    const inFlaeche = (c) => flaechen.length > 0
      && cornersOf(c.r).every(([x, y]) => flaechen.some((el) => el.isPointInFill(new DOMPoint(ix(x), iy(y)))));
    const wahl = platziere(kandidaten, {
      frei, eindeutig,
      bevorzugt: inFlaeche,
      guete: (c) => distPix(c.r, hindernis) - (c.zeilen.length > 1 ? 3 : 0),
      // Der Leader-Deckel bleibt auch im Notnagel: ein zu langer Strich wäre schlimmer als
      // gar keiner. Lagen außerhalb des Bildes scheiden ganz aus.
      schaden: (c) => (inBild(c.r) ? schadenVon(c.r, hindernis) + c.score * 0.05 : null)
    });
    const leader = wahl.braucht && leaderLen(wahl.g) <= LEADER_MAX && diagonal(wahl.g) ? wahl.g : null;
    put(wahl.r);
    const ton = n.ton;
    const fill = ton ? C(ton) : C("muted");
    const attrs = AN(anNote) + ` data-label-anchor="${n.anker}"`
      + (ton ? TON(ton) : "") + (leader ? ' data-leader="1"' : "")
      + ` data-ax="${wahl.dot[0].toFixed(1)}" data-ay="${wahl.dot[1].toFixed(1)}"`;
    // Punkt und Leader nennen denselben Gegenstand wie der Text: sonst stünde der Marker
    // schon im Bild, während sein Objekt noch fehlt (gemessen im Ausgangszustand der
    // Demo — ein roter Punkt auf leerer Karte).
    const bindung = ` data-label-anchor="${n.anker}"`;
    const dot = `<circle class="c-notedot"${AN(anNote)}${bindung}${ton ? GLOW(ton) : ""}`
      + ` cx="${wahl.dot[0].toFixed(1)}" cy="${wahl.dot[1].toFixed(1)}" r="3" fill="${fill}"/>`;
    const zeilen = wahl.zeilen.map((z, i) => textSvg(
      rect(wahl.r.cx, wahl.r.cy - wahl.r.h / 2 + ZEILE * (i + 0.5), wahl.breiten[i], ZEILE),
      NOTE_SIZE, z, "c-note halo", fill, attrs)).join("\n      ");
    return dot + leaderSvg(leader, anNote, bindung) + "\n      " + zeilen;
  }).filter(Boolean);

  return `<g${AN(anAsset)} data-asset="${ref}" data-asset-scale="${f * scale}" transform="${hin}">
        ${geo}
      </g>
      ${texte.join("\n      ")}${notenMarkup.length ? "\n      " + notenMarkup.join("\n      ") : ""}`;
}

const RENDERERS = {

  title(card) {
    return `<div class="card card--title">
      <div class="eyebrow">${card.eyebrow}</div>
      <svg class="titlemotif" width="150" height="96" viewBox="0 0 150 96" aria-hidden="true">
        <circle cx="48" cy="48" r="34" fill="${C("es")}" opacity="0.82"/>
        <circle cx="102" cy="48" r="34" fill="${C("ueberich")}" opacity="0.82"/>
        <circle cx="75" cy="40" r="34" fill="${C("ich")}" opacity="0.86"/>
      </svg>
      <h1>${card.title}</h1>
      <p class="sub">${card.sub}</p>
      <div class="startcue">${card.stats} — tippen zum Start</div>
    </div>`;
  },

  layers(card) {
    const [rIch, rUe, rEs] = card.body.regions;
    const [zB, zV, zU] = card.zones;
    // Grenz-Konstruktion (Imprint-Prinzip): die Übergangszone ist ein durchgehender,
    // beidseitig konturierter Streifen VOR dem Berg — die Zonengrenze existiert als
    // Objekt. Alle Regionsgrenzen teilen sich EINE Geometrie-Quelle.
    const wave1 = "M0,150 C60,139 150,161 225,149 C300,137 352,157 400,146";   // Oberkante Band = Wasserlinie
    const wave2 = "M0,218 C60,208 150,228 225,217 C300,206 352,224 400,214";   // Unterkante Band = Grenze zum Unbewussten
    const wave2rev = "L400,214 C352,224 300,206 225,217 C150,228 60,208 0,218";
    const A = ankerVergabe();
    const anRegion = card.body.regions.map((r, i) => A(`region:${ankerSlug(r.label, String(i))}`));
    const anZone = card.zones.map((z, i) => A(`zone:${ankerSlug(z.label, String(i))}`));
    const anWater = A("waterline");
    const anLabel = card.body.regions.map((r, i) => A(`label:${ankerSlug(r.label, String(i))}`));
    // Die Regionen sind geclippte Rechtecke (x 90–335, y 30–440): ihre eigene Kontur ist
    // fast die ganze Karte, sichtbar ist nur die Schnittmenge mit dem Berg. Als Anker für
    // eine Klammer oder ein Callout wäre sie deshalb irreführend — gemessen mit
    // probes/anker-kontur.mjs, das für layers 1 von 10 Ankern mit Kontur fand. Der
    // Berg-UMRISS ist die einzige echte Kontur der Karte und bekommt hier seinen Namen;
    // ohne ihn könnte die Erklär-Schicht ausgerechnet am Eisberg nicht hängen.
    // Zuletzt vergeben, damit die Dedup-Suffixe der bestehenden Namen sich nicht verschieben.
    const anBerg = A("node:berg");
    const SPLIT_X = 225;        // Mittellinie Berg
    const ES_TOP_Y = 268;       // Ich/Es-Grenze
    // Die Berg-Kontur kommt aus der Library (nature.eisberg) — hier stand sie dreifach
    // in Gebrauch (Clip, Kontur, Facette) und damit an drei Stellen im Renderer.
    // Asset-Einheiten sind halbe Karten-Einheiten: `scale(2)` am Element statt einer
    // zweiten, umgerechneten Zahlenreihe.
    const berg = assetPfad("nature.eisberg", "berg");
    const BERG_T = ` transform="scale(2)"`;
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 432" role="img" aria-label="Eisberg-Diagramm: Ich größtenteils bewusst, Über-Ich und Es unter der Oberfläche">
        <defs>
          <path id="wavetop" d="${wave1}"/>
          <path id="wavemid" d="${wave2}"/>
          <clipPath id="bergclip"><path${BERG_T} d="${berg}"/></clipPath>
        </defs>
        <path${AN(anWater)} d="${wave2} L400,432 L0,432 Z" fill="${C("water3")}"/>
        <path${AN(anWater)} d="M24,300 q10,-7 20,0 q10,7 20,0" stroke="${C("card")}" stroke-width="2" fill="none" opacity="0.3"/>
        <path${AN(anWater)} d="M330,264 q10,-7 20,0" stroke="${C("card")}" stroke-width="2" fill="none" opacity="0.3"/>
        <path${AN(anWater)} d="M44,392 q10,-7 20,0" stroke="${C("card")}" stroke-width="2" fill="none" opacity="0.3"/>
        <g clip-path="url(#bergclip)">
          <rect${AN(anRegion[0])}${GLOW(rIch.color)} x="90" y="30" width="245" height="410" fill="${C("berg")}"/>
          <rect${AN(anRegion[1])}${GLOW(rUe.color)} x="90" y="182" width="${SPLIT_X - 90}" height="258" fill="${SOFT(rUe.color)}"/>
          <rect x="${SPLIT_X}" y="182" width="120" height="${ES_TOP_Y - 182}" fill="${C("berg-deep")}"/>
          <rect${AN(anRegion[2])}${GLOW(rEs.color)} x="${SPLIT_X}" y="${ES_TOP_Y}" width="120" height="140" fill="${SOFT(rEs.color)}"/>
          <g transform="scale(2)">${assetTeil("nature.eisberg", "facette")}</g>
          <line x1="${SPLIT_X}" y1="46" x2="${SPLIT_X}" y2="440" stroke="${C("ink")}" stroke-width="2"/>
          <line x1="${SPLIT_X}" y1="${ES_TOP_Y}" x2="330" y2="${ES_TOP_Y}" stroke="${C("ink")}" stroke-width="2"/>
        </g>
        <path class="a-line"${AN(anBerg)}${BERG_T} d="${berg}" fill="none" stroke="${C("ink")}"/>
        <path${AN(anWater)} d="${wave1} ${wave2rev} Z" fill="${C("water1")}"/>
        <path${AN(anWater)} d="${wave1}" fill="none" stroke="${C("ink")}" stroke-width="2"/>
        <path${AN(anWater)} d="${wave2}" fill="none" stroke="${C("ink")}" stroke-width="2"/>
        <text class="svglabel"${AN(anZone[0])} font-size="20" fill="${C("ink")}"><textPath href="#wavetop" startOffset="5%"><tspan dy="-13">${zB.label}</tspan></textPath></text>
        <text class="svglabel"${AN(anZone[1])} font-size="17" fill="#FFFFFF"><textPath href="#wavetop" startOffset="3%"><tspan dy="42">${zV.label}</tspan></textPath></text>
        <text class="svglabel"${AN(anZone[2])} font-size="17" fill="#FFFFFF"><textPath href="#wavemid" startOffset="2%"><tspan dy="32">${zU.label}</tspan></textPath></text>
        ${rIch.at === "peak"
          ? `<line${AN(anRegion[0], anLabel[0])} x1="262" y1="84" x2="240" y2="92" stroke="${C("ink")}" stroke-width="1.6"/>
             <text class="svglabel"${AN(anRegion[0], anLabel[0])}${TON(rIch.color)} x="268" y="90" font-size="17" fill="${C("ink")}" text-anchor="start">${rIch.label}</text>`
          : `<text class="svglabel"${AN(anRegion[0], anLabel[0])}${TON(rIch.color)} x="272" y="250" font-size="21" fill="${C("ink")}" text-anchor="middle">${rIch.label}</text>`}
        <text class="svglabel"${AN(anRegion[1], anLabel[1])}${TON(rUe.color)} x="164" y="308" font-size="${rUe.label.length > 7 ? 15 : 18}" fill="${C("ink")}" text-anchor="middle">${rUe.label}</text>
        <text class="svglabel"${AN(anRegion[2], anLabel[2])}${TON(rEs.color)} x="${rEs.label.length > 4 ? 276 : 270}" y="${rEs.label.length > 4 ? 318 : 336}" font-size="${rEs.label.length > 4 ? 15 : 21}" fill="${C("ink")}" text-anchor="middle">${rEs.label}</text>
      </svg></div>
    </div>`;
  },

  balance(card) {
    // Balken statisch gekippt (linke Seite unten = wiegt schwerer), V-Seile zu echten Schalen.
    // Die WAAGE selbst (Balken, Seile, Schalen, Drehpunkt) kommt aus der Library
    // (psyche.waage): sie ist ein feststehendes Objekt, kein Karten-Inhalt. Die Seile
    // entstanden hier früher zur Laufzeit aus einem Kreis-Schnitt (ropeSegs) — im Asset
    // stehen sie als gezeichnete Geometrie, was sie immer waren.
    // FARBIG bleibt Karten-Sache: die Schalen-Scheiben und das Drehpunkt-Feld tragen die
    // Farbe der jeweiligen Instanz und werden deshalb hier gezeichnet, nicht dort.
    // Ein Arm existiert im Asset EINMAL; beide Seiten setzen ihn mit ihrem Versatz.
    const W = (teil) => assetTeil("psyche.waage", teil);
    const armT = (x, yEnd) => ` transform="translate(${x - 72},${yEnd - 107}) scale(2)"`;
    const A = ankerVergabe();
    const anLinks = A(`node:${ankerSlug(card.left?.label, "links")}`);
    const anRechts = A(`node:${ankerSlug(card.right?.label, "rechts")}`);
    const anPivot = A("pivot"), anBeam = A("beam");
    const anLabel = [A(`label:${ankerSlug(card.left?.label, "links")}`), A(`label:${ankerSlug(card.right?.label, "rechts")}`),
      A(`label:${ankerSlug(card.pivot?.label, "drehpunkt")}`)];
    const arm = (side, x, yEnd, anNode, anLbl) => `<g${AN(anNode)}>
      <g${armT(x, yEnd)}>${W("seile")}</g>
      <circle${GLOW(side.color)} cx="${x}" cy="${yEnd + 36}" r="29" fill="${SOFT(side.color)}" stroke="${C(side.color)}" stroke-width="2.5"/>
      <text class="svglabel"${AN(anLbl)}${TON(side.color)} x="${x}" y="${yEnd + 41}" font-size="${side.label.length > 6 ? 9.5 : 11.5}" letter-spacing="0" fill="${C("ink")}" text-anchor="middle">${side.label}</text>
      <g${armT(x, yEnd)}>${W("schale")}</g>
      <text x="${x}" y="${yEnd + 86}" font-size="10.5" fill="${C("muted")}" text-anchor="middle" font-weight="600">${side.sub}</text></g>`;
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 50 400 210" role="img" aria-label="Waage: ${card.left.label} wiegt schwerer als ${card.right.label}, ${card.pivot.label} am Drehpunkt">
        <g${AN(anBeam)} transform="scale(2)">${W("balken")}</g>
        ${arm(card.left, 72, 107, anLinks, anLabel[0])}
        ${arm(card.right, 328, 85, anRechts, anLabel[1])}
        <g${AN(anPivot)}>
        <g transform="scale(2)">${W("drehpunkt")}</g>
        <rect${GLOW(card.pivot.color)} x="139" y="176" width="122" height="58" rx="14" fill="${SOFT(card.pivot.color)}" stroke="${C(card.pivot.color)}" stroke-width="2.5"/>
        <text class="svglabel"${AN(anLabel[2])}${TON(card.pivot.color)} x="200" y="202" font-size="16" fill="${C("ink")}" text-anchor="middle">${card.pivot.label}</text>
        <text x="200" y="221" font-size="11" fill="${C("muted")}" text-anchor="middle" font-weight="600">${card.pivot.sub}</text>
        </g>
      </svg></div>
    </div>`;
  },

  flow(card) {
    const ys = [46, 138, 262];
    const A = ankerVergabe();
    const anStep = card.steps.map((s, i) => A(`step:${ankerSlug(s.label, String(i))}`));
    const anLabel = card.steps.map((s, i) => A(`label:${ankerSlug(s.label, String(i))}`));
    const anArrow = card.steps.map((_, i) => i ? A(`arrow:${i}`) : null);
    const anSink = A("sink");
    const nodes = card.steps.map((s, i) => `
      ${i > 0 ? `<line${AN(anArrow[i])} data-idx="${i}" x1="200" y1="${ys[i-1] + 32}" x2="200" y2="${ys[i] - 34}" stroke="${C("ink")}" stroke-width="1.8" marker-end="url(#arrow)"/>` : ""}
      <g${AN(anStep[i])} data-idx="${i}">
      <rect${GLOW(card.steps[i].color)} x="96" y="${ys[i] - 30}" width="208" height="62" rx="16"
            fill="${SOFT(card.steps[i].color)}" stroke="${C(card.steps[i].color)}" stroke-width="2.5"/>
      <text class="svglabel"${AN(anLabel[i])}${TON(card.steps[i].color)} x="200" y="${ys[i] - 2}" font-size="16" fill="${C("ink")}" text-anchor="middle">${s.label}</text>
      <text x="200" y="${ys[i] + 18}" font-size="11.5" fill="${C("muted")}" text-anchor="middle" font-weight="600">${s.sub}</text></g>`).join("");
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 340" role="img" aria-label="Ablauf der Verdrängung: Impuls, Konflikt, Verdrängung ins Unbewusste">
        <defs><marker id="arrow" markerWidth="9" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="${C("ink")}"/>
        </marker></defs>
        <g${AN(anSink)}>
        <rect x="0" y="216" width="400" height="124" fill="${C("water3")}" opacity="0.92"/>
        <path d="M24,302 q9,-6 18,0 q9,6 18,0" stroke="${C("card")}" stroke-width="2" fill="none" opacity="0.35"/>
        <path d="M334,252 q9,-6 18,0" stroke="${C("card")}" stroke-width="2" fill="none" opacity="0.35"/>
        <line x1="0" y1="216" x2="400" y2="216" stroke="${C("card")}" stroke-width="2" stroke-dasharray="7 6"/>
        <text class="svglabel" x="14" y="326" font-size="14" fill="${C("card")}">${card.sink.label}</text>
        </g>
        ${nodes}
      </svg></div>
    </div>`;
  },

  curve(card) {
    // Contract v2: das LLM liefert nur Semantik (Form, Niveaus, Ereignis-Zeitpunkt,
    // Anker). Punkte UND Label-Positionen berechnet das System — Kollisionen sind
    // damit konstruktiv ausgeschlossen, nicht nachträglich gelintet.
    // Anker-Namen zuerst und in Registry-Reihenfolge vergeben (Serien, Serien-Labels,
    // Ereignis, Notes, Achse) — die Dedup-Suffixe hängen an dieser Reihenfolge.
    const A = ankerVergabe();
    const anSerie = (card.series || []).map((s, i) => A(`series:${ankerSlug(s.label, String(i))}`));
    const anSerieLabel = (card.series || []).map((s, i) => s.label !== undefined ? A(`label:${ankerSlug(s.label, String(i))}`) : null);
    const anStop = card.stop ? A("stop") : null;
    const anStopLabel = card.stop ? A(`label:${ankerSlug(card.stop.label, "ereignis")}`) : null;
    const anNote = (card.notes || []).map((n, i) => A(`note:${ankerSlug(n.label, String(i))}`));
    const anAxis = A("axis");
    const PLOT = { x0: 52, x1: 382, y0: 244, y1: 34 };
    const sx = (t) => PLOT.x0 + t * (PLOT.x1 - PLOT.x0);
    const sy = (v) => PLOT.y0 - (v / 100) * (PLOT.y0 - PLOT.y1);
    const LEVELS = { floor: 2, low: 8, mid: 52, high: 88 };
    // Smoothstep: waagerechter Ein- UND Ausgang. Ein Ast, der so ansetzt, hat am
    // Ereignis keinen Knick und am Apex keine Spitze — er liest sich als eine
    // Bewegung, nicht als zweite, unbeschriftete Linie.
    const smooth = (v) => v * v * (3 - 2 * v);
    const NORM = {
      "linear-rise": (t) => t,
      "compound-rise": (t) => (Math.exp(3 * t) - 1) / (Math.exp(3) - 1),
      "saturating-rise": (t) => (1 - Math.exp(-2.6 * t)) / (1 - Math.exp(-2.6)),
      "decay-halflife": (t) => (1 - Math.exp(-2.6 * t)) / (1 - Math.exp(-2.6)),
      "flat": () => 0,
      "suppressed": () => 0
    };
    const defFrom = (s) => s.shape === "decay-halflife" ? "high" : "low";
    const defTo = (s) => s.shape === "decay-halflife" ? "floor"
      : (s.shape === "flat" || s.shape === "suppressed") ? (s.from ?? defFrom(s)) : "high";
    const tStop = card.stop ? card.stop.t : null;
    // Unterdrückt heißt: einmal sanft absenken, dann UNTEN BLEIBEN — bis zum Stop
    // bzw. bis Kurvenende. Zielniveau ist ein ausdrücklich tieferes `to`, sonst die
    // halbe Ausgangshöhe. Ein Wiederanstieg davor läse sich als Erholung.
    const heldLevel = (s, base) => {
      const to = s.to !== undefined ? LEVELS[s.to] : null;
      return to != null && to < base ? to : Math.max(LEVELS.floor + 2, base * 0.5);
    };
    // Apex des Rebound-Asts: Höhe ist DEKLARIERT (reboundTo, Default high) und wird
    // eingehalten — die Endhöhe ist die Aussage der Karte, nicht der Spielraum des
    // Renderers. Bleibt nach einem späten Stop wenig Breite, degradiert die FORM
    // (der Ast wird steiler), nicht die Höhe; der Smoothstep hält ihn geschwungen,
    // ein Senkrecht-Sprung entsteht nie. APEX_MIN_RISE hält ihn auch dann sichtbar,
    // wenn das Stop-Niveau schon auf oder über dem Wunsch liegt.
    const APEX_CEIL = 96, APEX_MIN_RISE = 10;
    const apexLevel = (s, yStop) =>
      Math.min(APEX_CEIL, Math.max(yStop + APEX_MIN_RISE, LEVELS[s.reboundTo] ?? LEVELS.high));

    // 1) Sample-Punkte je Serie: Form lebt bis zum Stop (wenn afterStop), sonst bis 1.
    const samples = card.series.map((s) => {
      const from = LEVELS[s.from ?? defFrom(s)];
      const to = LEVELS[s.to ?? defTo(s)];
      const tEnd = s.afterStop && tStop != null ? tStop : 1;
      const held = heldLevel(s, from);
      const N = 56, pts = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        let y = from + (to - from) * NORM[s.shape](u);
        if (s.shape === "suppressed") y = from + (held - from) * smooth(Math.min(1, u / 0.32));
        pts.push([u * tEnd, Math.max(0, y)]);
      }
      if (s.afterStop === "collapse") pts.push([Math.min(1, tEnd + 0.03), LEVELS.floor], [1, LEVELS.floor]);
      if (s.afterStop === "reset") pts.push([Math.min(1, tEnd + 0.17), from]);
      if (s.afterStop === "rebound") {
        // Geschwungener Ast über die volle Restbreite bis zum Apex — kein Senkrecht-Sprung.
        const yStop = pts[pts.length - 1][1], span = Math.max(0, 1 - tEnd);
        const apex = apexLevel(s, yStop);
        for (let k = 1; k <= 14; k++) pts.push([tEnd + span * (k / 14), yStop + (apex - yStop) * smooth(k / 14)]);
      }
      return { s, pts, stopIdx: s.afterStop ? N : null };
    });
    // Endniveau-Spreizung: enden zwei Serien gleich hoch, trennt der Renderer sie um
    // ±3.5. Beim Rebound wird dafür der GANZE Ast skaliert — nur den Endpunkt zu
    // verschieben knickte die Spitze — und der Rebound nimmt den unteren Platz: ein
    // Ast, der nach dem Ereignis aufholt, überholt die unmaskierte Kurve nicht.
    const nudge = (sm, d) => {
      const last = sm.pts.length - 1;
      if (sm.s.afterStop === "rebound" && sm.stopIdx != null) {
        const yStop = sm.pts[sm.stopIdx][1], rise = sm.pts[last][1] - yStop;
        if (rise > 0.1) {
          const f = (rise + d) / rise;
          for (let i = sm.stopIdx + 1; i <= last; i++) sm.pts[i][1] = yStop + (sm.pts[i][1] - yStop) * f;
          return;
        }
      }
      sm.pts[last][1] += d;
    };
    if (samples.length === 2) {
      const ends = samples.map((sm) => sm.pts[sm.pts.length - 1][1]);
      if (Math.abs(ends[0] - ends[1]) < 6) {
        const reb = samples.map((sm) => sm.s.afterStop === "rebound");
        let hi;
        if (reb[0] !== reb[1]) hi = reb[0] ? 1 : 0;
        else {
          const slope = samples.map((sm) => {
            const [ta, ya] = sm.pts[sm.pts.length - 2], [tb, yb] = sm.pts[sm.pts.length - 1];
            return tb > ta ? (yb - ya) / (tb - ta) : 0;
          });
          hi = slope[0] >= slope[1] ? 0 : 1;
        }
        nudge(samples[hi], 3.5);
        nudge(samples[1 - hi], -3.5);
      }
    }

    // 2) Label-Schicht: jedes Label wird AUS seiner Bindung konstruiert.
    // Serien-Label ↔ eigener Strich, Ereignis-Label ↔ Stop-Linie, Note ↔ Ankerpunkt.
    // Gesucht wird nur INNERHALB der erlaubten Familie — nicht im ganzen Plot mit der
    // Bedeutung als Aufschlag im Platz-Score. Ein besserer freier Platz kann die
    // Zuordnung damit nicht mehr überstimmen: sie ist konstruktiv wahr, nicht gewichtet.
    // Boxen, Kollisionen, Textmaße kommen aus der Geometrie-Werkbank (Modul-Ebene) —
    // dieselben Werkzeuge benutzt die Asset-Karte für ihre Notes.
    const { placed, put, hitPlaced, schadenVon } = belegung();
    // `bottom` ist die Unterkante, die ein Label nicht unterschreiten darf. Notes
    // bekommen eine höhere Grenze als 252: sie dürfen nie in die Zeile der
    // x-Achsen-Beschriftung rutschen und dort wie deren Fortsetzung wirken.
    const inView = (r, bottom = 252) => cornersOf(r).every(([x, y]) => x >= 4 && x <= 396 && y >= 12 && y <= bottom);
    // Pfade pixeldicht abtasten — auch lange Einzelsegmente (Collapse-Schwanz) werden
    // Hindernis. Je Serie getrennt: die Zuordnung Label→Kurve misst am eigenen Verlauf.
    // Der Schritt ist FEINER als der des Audits (dort 2–3 px): grober abgetastet könnte
    // eine Kurve die Ecke einer Box streifen, ohne dass der Renderer einen Punkt darin
    // findet — das Gate sähe den Treffer, der Renderer nie.
    const PIX_STEP = 1.5;
    const pixOf = (sm) => {
      const out = [];
      for (let i = 1; i < sm.pts.length; i++) {
        const [ta, va] = sm.pts[i - 1], [tb, vb] = sm.pts[i];
        const ax = sx(ta), ay = sy(va), bx = sx(tb), by = sy(vb);
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / PIX_STEP));
        for (let k = 0; k <= n; k++) out.push([ax + (bx - ax) * (k / n), ay + (by - ay) * (k / n)]);
      }
      return out;
    };
    const seriesPix = samples.map(pixOf);
    // Das Achsenkreuz ist Hindernis wie jede Kurve: ein Label auf der x-Achse liest
    // sich als deren Beschriftung, nicht als die seiner Serie.
    const axisPix = [];
    for (let y = PLOT.y1; y <= PLOT.y0; y += PIX_STEP) axisPix.push([PLOT.x0, y]);
    for (let x = PLOT.x0; x <= PLOT.x1; x += PIX_STEP) axisPix.push([x, PLOT.y0]);
    // Die Stop-Vertikale wird kürzer, wenn ein Label über ihr sitzt — ihre Punkte
    // entstehen deshalb erst, wenn ihr oberes Ende feststeht (setStopTop).
    let stopPix = [];
    const hindernisPix = () => seriesPix.flat().concat(axisPix, stopPix);
    // x-Bänder: ein Kandidat prüft nur Punkte in seiner Spalte statt aller ~1000.
    const BAND = 8;
    const bandsOf = (pix) => {
      const m = new Map();
      for (const p of pix) { const k = Math.floor(p[0] / BAND); if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
      return m;
    };
    const inBand = (bands, r, reichweite) => {
      const xs = cornersOf(r).map((c) => c[0]);
      const out = [];
      for (let k = Math.floor((Math.min(...xs) - reichweite) / BAND); k <= Math.floor((Math.max(...xs) + reichweite) / BAND); k++) {
        const b = bands.get(k);
        if (b) for (const p of b) out.push(p);
      }
      return out;
    };
    // Zuordenbarkeit: ein Label, das näher an einer FREMDEN Kurve klebt als an der
    // eigenen, beschriftet optisch die falsche Linie.
    const fremdDist = (own, r) => {
      let d = Infinity;
      seriesPix.forEach((p, i) => { if (i !== own) d = Math.min(d, distPix(r, p)); });
      return d;
    };

    // Reservierungen: Achsen-Beschriftungen.
    put(rect(PLOT.x0 + measure(card.ylabel, 11) / 2, 20, measure(card.ylabel, 11), 14));
    put(rect(PLOT.x1 - measure(card.xlabel, 11) / 2, 262, measure(card.xlabel, 11), 14));

    // Ereignis-Label: blanke CAPS über der Linie, KEIN Chip. Ein Kasten machte aus dem
    // Ereignis ein zweites Objekt, das mit den Serien-Labels um Aufmerksamkeit
    // wetteifert; lesbar bleibt der Text über den Papier-Halo. Reagiert GENAU EINE
    // Serie auf das Ereignis, trägt das Label deren Farbe — die Bindung steht dann im
    // Bild statt in einer Legende.
    const STOP_SIZE = 10.5;
    let stopRect = null, stopX = null, stopTop = PLOT.y1, stopFill = C("ink");
    // Die Vertikale beginnt unter ihrer Beschriftung — sonst schnitte die Linie ihr
    // eigenes Label. Ihre Hindernis-Punkte hängen deshalb an ihrem oberen Ende.
    const setStopTop = (y) => {
      stopTop = y;
      stopPix = [];
      for (let py = stopTop; py <= PLOT.y0; py += PIX_STEP) stopPix.push([stopX, py]);
    };
    if (card.stop) {
      const reagiert = samples.map((sm, i) => (sm.s.afterStop ? i : -1)).filter((i) => i >= 0);
      if (reagiert.length === 1) stopFill = C(samples[reagiert[0]].s.color);
      const w = measure(card.stop.label, STOP_SIZE), h = boxH(STOP_SIZE);
      stopX = sx(tStop);
      const klemm = (x) => Math.min(396 - w / 2 - 4, Math.max(4 + w / 2 + 4, x));
      // Kandidaten: zentriert über der Linie, rechts daneben, links daneben — je 2 Höhen.
      let best = null;
      outer: for (const cy of [24, 40]) {
        for (const cx of [stopX, stopX + 10 + w / 2, stopX - 10 - w / 2]) {
          const r = rect(klemm(cx), cy, w, h);
          if (inView(grow(r, 3)) && !hitPlaced(r, 3)) { best = r; break outer; }
        }
      }
      stopRect = put(best || rect(klemm(stopX), 24, w, h));
      const ueberLinie = stopX >= stopRect.cx - stopRect.w / 2 - 2 && stopX <= stopRect.cx + stopRect.w / 2 + 2;
      setStopTop(ueberLinie ? Math.max(PLOT.y1, stopRect.cy + h / 2 + 4) : PLOT.y1);
    }
    // Endpunkt-Dots reservieren.
    samples.forEach((sm) => { const [t, v] = sm.pts[sm.pts.length - 1]; put(rect(sx(t), sy(v), 12, 12)); });

    const yOnCurve = (sm, t) => {
      const pts = sm.pts;
      for (let i = 1; i < pts.length; i++) if (pts[i][0] >= t) {
        const [ta, ya] = pts[i - 1], [tb, yb] = pts[i];
        return tb > ta ? ya + (yb - ya) * ((t - ta) / (tb - ta)) : ya;
      }
      return pts[pts.length - 1][1];
    };
    window.__curveDebug = { samples, yOnCurve };   // Mess-Hook: notecheck.mjs misst am Renderer-Original, keine Zweit-Geometrie

    // Kandidaten-Stützstellen: die Kurve gleichmäßig in Pixelschritten abgetastet, NICHT
    // die Roh-Stützstellen der Form. Ein Collapse-Schwanz besteht aus zwei Punkten über
    // 250 px — an ihm gäbe es sonst genau zwei mögliche Label-Lagen, beide an den Enden.
    // Der feste Schritt hält außerdem das Tangenten-Fenster längentreu (±3 · 6 px).
    const XY_STEP = 2;
    const denseXY = (sm) => {
      const out = [];
      for (let i = 1; i < sm.pts.length; i++) {
        const [ta, va] = sm.pts[i - 1], [tb, vb] = sm.pts[i];
        const ax = sx(ta), ay = sy(va), bx = sx(tb), by = sy(vb);
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / XY_STEP));
        // Ast-Kennung mitführen: Haupt- und Nach-Stop-Ast treffen sich in einem KNICK.
        // Ein Tangenten-Fenster über ihn hinweg mittelte zwei Richtungen zu einer
        // dritten, die keine der beiden ist.
        const ast = sm.stopIdx != null && i > sm.stopIdx ? 1 : 0;
        for (let k = i === 1 ? 0 : 1; k <= n; k++) {
          const f = k / n;
          out.push([ax + (bx - ax) * f, ay + (by - ay) * f, ta + (tb - ta) * f, ast]);
        }
      }
      return out.length ? out : [[sx(sm.pts[0][0]), sy(sm.pts[0][1]), sm.pts[0][0], 0]];
    };
    const seriesXY = samples.map(denseXY);
    // Tangente über ein Fenster mitteln, nicht am Einzelsegment ablesen: ein Segment
    // von 3 px zittert, das Fenster liefert die Richtung, die das Auge sieht. Das
    // Fenster ist in PIXELN definiert (±18 px), nicht in Stützstellen — sonst hinge die
    // gemessene Richtung an der Abtastdichte und das Audit misst eine andere als der
    // Renderer.
    const TAN_WIN = Math.round(18 / XY_STEP);
    // Das Fenster endet am Ast-Wechsel: gemessen wird die Richtung EINES Strichs.
    const tangentAt = (xy, i) => {
      const ast = xy[i][3];
      let lo = i, hi = i;
      while (lo > 0 && i - lo < TAN_WIN && xy[lo - 1][3] === ast) lo--;
      while (hi < xy.length - 1 && hi - i < TAN_WIN && xy[hi + 1][3] === ast) hi++;
      if (lo === hi) return 0;
      return Math.atan2(xy[hi][1] - xy[lo][1], xy[hi][0] - xy[lo][0]) / RAD;
    };
    const nearestIdx = (xy, r) => {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < xy.length; i++) { const d = distRect(r, xy[i][0], xy[i][1]); if (d < bd) { bd = d; bi = i; } }
      return bi;
    };

    // ——— Serien-Label: sticky am eigenen Strich ———
    // Drei harte Regeln machen die Bindung wahr statt wahrscheinlich: NAH (die Box steht
    // dicht am eigenen Strich), PARALLEL (sie liegt auf dessen Tangente) und NICHTS
    // DAZWISCHEN (in der Lücke zwischen Text und Strich verläuft keine fremde Kurve).
    // Degradiert wird die Schriftgröße — nie die Bindung: ein Leader machte die
    // Zuordnung wieder zur Behauptung des Renderers statt zur Eigenschaft der Lage.
    const STICKY_ABOVE = -7, STICKY_BELOW = 14;   // Grundlinien-Abstand zum Strich
    const STICKY_SIZES = [13, 11.5, 10, 9];
    // Kreuzen sich zwei Kurven unter dem Label, ragt die fremde für Bruchteile eines
    // Pixels in die Lücke. Das ist kein „verläuft dazwischen" — erst ein Eindringen von
    // mehr als einer halben Strichstärke trennt Text und eigenen Strich sichtbar.
    const GAP_TOL = 1.5;
    // Lücke zwischen Textkante und eigenem Strich, im gedrehten Rahmen des Labels
    // gemessen: liegt dort eine fremde Kurve, zeigt das Label über sie hinweg.
    const gapClear = (r, ownXY, fremd, above) => {
      const kante = above ? r.h / 2 : -r.h / 2;
      const own = [];
      for (const [x, y] of ownXY) { const p = toLocal(r, x, y); if (Math.abs(p[0]) <= r.w / 2 + 8) own.push(p); }
      if (!own.length) return true;
      for (const [x, y] of fremd) {
        const [u, v] = toLocal(r, x, y);
        if (Math.abs(u) > r.w / 2) continue;
        // Läuft der eigene Strich mehrfach durch diese Spalte (Reset-Ast kehrt zurück),
        // zählt der Ast, an dem das Label KLEBT — der andere spannte ein Intervall quer
        // durchs Bild auf und erklärte jede fremde Kurve zum Zwischenläufer.
        let vo = null, bd = Infinity;
        for (const [ou, ov] of own) {
          if (Math.abs(ou - u) > 4) continue;
          const d = Math.abs(ov - kante);
          if (d < bd) { bd = d; vo = ov; }
        }
        // Endet der eigene Strich vor dieser Spalte, gibt es dort keine Lücke.
        if (vo === null) continue;
        if (v > Math.min(kante, vo) + GAP_TOL && v < Math.max(kante, vo) - GAP_TOL) return false;
      }
      return true;
    };
    const stickyPlace = (si, txt) => {
      const xy = seriesXY[si], own = seriesPix[si];
      // Fremde KURVEN und die Achse sind hart: sie sind die Aussage des Bildes. Die
      // gestrichelte Ereignis-Linie ist Chrome — ein Label mit Papier-Halo darf sie im
      // Notfall queren (es unterbricht dann die Strichelung), aber erst, wenn nichts
      // anderes bleibt.
      const fremdKurven = seriesPix.filter((_, k) => k !== si).flat();
      const fremd = fremdKurven.concat(axisPix);
      const ownB = bandsOf(own), fremdB = bandsOf(fremd), stopB = bandsOf(stopPix);
      // Der Versatz ist auf die Box-MITTE gerechnet: die Grundlinie liegt um 0.36·Größe
      // unter ihr, gemessen wird aber die Box.
      const boxAt = (i, deg, above, extra, size, w, h) => {
        const a = deg * RAD, off = (above ? STICKY_ABOVE - extra : STICKY_BELOW + extra) - size * BASE_OFF;
        return rect(xy[i][0] - Math.sin(a) * off, xy[i][1] + Math.cos(a) * off, w, h, deg);
      };
      // Verlaufen eigene und fremde Kurve im x-Band des Labels als EIN Strich
      // (Strichstärke 3), kann keine Lage eindeutig sein — dann sind „nichts dazwischen"
      // und „näher an der eigenen" nicht erfüllbar und deshalb ausgesetzt. Das ist
      // dieselbe Ausnahme, die das Audit als INFO ausweist, nicht als Befund.
      const bandSep = (r) => {
        const a = inBand(ownB, r, 6), b = inBand(fremdB, r, 6);
        let sep = Infinity;
        for (const [ax, ay] of a) for (const [bx, by] of b) sep = Math.min(sep, Math.hypot(ax - bx, ay - by));
        return sep;
      };
      const suche = (degMax, nahMax, winkelMax, offs, bandAus) => {
        for (const size of STICKY_SIZES) {
          const w = measure(txt, size), h = boxH(size);
          let best = null;
          for (let i = 0; i < xy.length; i++) {
            const deg = tangentAt(xy, i);
            if (Math.abs(deg) > degMax) continue;
            const t = xy[i][2];
            for (const above of [true, false]) for (const extra of offs) {
              // Lage-Güte zuerst: ein Kandidat, der ohnehin schlechter steht als der
              // beste bisher, muss nicht gegen tausend Pixel geprüft werden. Aufschläge
              // kommen nur dazu — die Grundgüte ist damit eine gültige Untergrenze.
              const grund = Math.abs(t - 0.42) + (above ? 0 : 0.3) + Math.abs(deg) / 90 * 0.35 + extra * 0.03;
              if (best && grund >= best.score) continue;
              const r = boxAt(i, deg, above, extra, size, w, h);
              if (!inView(r, 250) || hitPlaced(r, LUFT_X, LUFT_Y)) continue;
              const q = grow(r, 2);
              const ownNah = inBand(ownB, r, 24), fremdNah = inBand(fremdB, r, 24);
              if (hitPix(q, ownNah) || hitPix(q, fremdNah)) continue;
              const dOwn = distPix(r, ownNah);
              if (dOwn > nahMax) continue;
              if (Math.abs(deg - tangentAt(xy, nearestIdx(xy, r))) > winkelMax) continue;
              const dFremd = fremdDist(si, r);
              let aufschlag = hitPix(q, inBand(stopB, r, 4)) ? 30 : 0;
              if (dFremd < dOwn - 1.5 || !gapClear(r, xy, fremdNah, above)) {
                // Nur in der Band-Ausnahme überhaupt zulässig — und dann so teuer, dass
                // JEDE eindeutige Lage gewinnt, egal wie weit sie vom Idealpunkt liegt.
                if (!(bandAus && bandSep(r) < 10)) continue;
                aufschlag += 2;
              }
              // Sanfte Vorliebe für Abschnitte, an denen der eigene Strich allein läuft:
              // Eindeutigkeit ist eine Eigenschaft der STELLE, nicht nur der Box.
              aufschlag += Math.max(0, 24 - dFremd) * 0.03;
              const score = grund + aufschlag;
              if (!best || score < best.score) best = { r, size, score };
            }
          }
          if (best) return best;
        }
        return null;
      };
      // Notnagel: nichts ist frei. Die Bindung bleibt trotzdem — es gewinnt die
      // sticky Lage mit dem geringsten Schaden, nie ein freier Platz mit Leader.
      const notnagel = () => {
        const size = STICKY_SIZES[STICKY_SIZES.length - 1], w = measure(txt, size), h = boxH(size);
        let best = null;
        for (let i = 0; i < xy.length; i++) {
          const deg = tangentAt(xy, i);
          for (const above of [true, false]) {
            const r = boxAt(i, deg, above, 0, size, w, h);
            if (!inView(r, 250)) continue;
            const bad = schadenVon(r, inBand(fremdB, r, 4).concat(inBand(ownB, r, 4))) + Math.abs(deg) * 0.2;
            if (!best || bad < best.bad) best = { r, size, bad };
          }
        }
        return best;
      };
      // Ladder: Regellage → weiter weg/steiler → Band-Ausnahme → Notnagel.
      return suche(30, 10, 12, [0, 4, 8], false)
        || suche(45, 16, 18, [0, 4, 8, 13], false)
        || suche(45, 16, 18, [0, 4, 8, 13], true)
        || notnagel();
    };

    // ——— Note: Punkt-Marker auf der Kurve + Label unmittelbar daneben ———
    // Der Marker bindet, das Label steht daneben; Leader-Mechanik und ihr Deckel kommen
    // aus der Geometrie-Werkbank (dieselbe benutzt die Asset-Note).
    const NOTE_SIZE = 9.5, NOTE_BOTTOM = 238;
    const notePlace = (anchor, txt, sideWish, si) => {
      const pix = hindernisPix();
      const wish = sideWish === "below" ? 1 : sideWish === "above" ? -1 : 0;
      const cands = [];
      for (const size of [NOTE_SIZE, 9]) {
        const w = measure(txt, size, 600), h = boxH(size);
        // Seitliche Versätze skalieren MIT der Textbreite: ein 145 px breites Label
        // steht bei dx=48 immer noch über seinem Anker — es muss um die halbe eigene
        // Breite ausweichen können, sonst bleibt am Rand oder an der Achse keine Lage.
        for (const side of [-1, 1]) for (const dist of [12, 16, 21, 27, 34, 42])
          for (const dx of [0, -16, 16, -32, 32, -48, 48, -(w / 2 + 8), w / 2 + 8, -(w / 2 + 26), w / 2 + 26]) {
          const r = rect(anchor[0] + dx, anchor[1] + side * dist, w, h);
          const g = leaderGeom(r, anchor), braucht = distRect(r, anchor[0], anchor[1]) > LEADER_AB;
          cands.push({ r, size, g, braucht,
            score: distRect(r, anchor[0], anchor[1]) + (wish && side !== wish ? 18 : 0)
              + (braucht ? 24 : 0) + (NOTE_SIZE - size) * 12 });
        }
      }
      // Die Stop-Vertikale ist Chrome, keine Aussage: ein Note-Text mit Papier-Halo darf
      // sie im Notfall queren (er unterbricht dann die Strichelung, statt unlesbar zu
      // werden). Teuer im Score, damit es die letzte Wahl bleibt — anders als bei einer
      // Kurve oder der Achse, die als Hindernis hart bleiben.
      for (const c of cands) if (hitPix(grow(c.r, 2), stopPix)) c.score += 30;
      cands.sort((a, b) => a.score - b.score);
      const kurvenPix = seriesPix.flat().concat(axisPix);
      const frei = (c) => inView(c.r, NOTE_BOTTOM) && !hitPlaced(c.r, LUFT_X, LUFT_Y) && !hitPix(grow(c.r, 2), kurvenPix)
        && (!c.braucht || (leaderLen(c.g) <= LEADER_MAX && diagonal(c.g) && leaderFree(c.g, pix)));
      const eindeutig = (c) => fremdDist(si, c.r) >= distPix(c.r, seriesPix[si]) - 1.5;
      // Dieselbe Staffel wie die Asset-Note; nur die Kandidaten sind kurvenspezifisch.
      // Eine bevorzugte Lage gibt es hier nicht — auf einer Linie ist kein „innen".
      const c = platziere(cands, {
        frei, eindeutig,
        schaden: (k) => ((!inView(k.r, NOTE_BOTTOM) || (k.braucht && leaderLen(k.g) > LEADER_MAX))
          ? null : schadenVon(k.r, pix) + k.score * 0.05)
      });
      // Der Leader-Contract gilt für beide Wege gleich: aus der Staffel kommt eine Lage nur
      // durch `frei`, das Länge und Diagonale schon geprüft hat — für sie ist diese Zeile
      // deshalb wortgleich mit dem früheren `c.braucht ? c.g : null`. Im Notnagel prüft sie
      // wirklich: ein senkrechter oder zu langer Strich wäre schlimmer als gar keiner, der
      // Punkt-Marker bindet weiter.
      const brauchbar = c.braucht && leaderLen(c.g) <= LEADER_MAX && diagonal(c.g);
      return { r: put(c.r), size: c.size, leader: brauchbar ? c.g : null };
    };

    // ——— Apex-Note: blanker CAPS-Text am Nach-Stop-Ast ———
    // Kein Kasten, kein langer Leader. Gesucht wird NUR in der Tasche am eigenen Ast
    // (links davon); ist sie zu eng — später Stop, der Ast steht fast senkrecht in der
    // Ecke —, greift eine deterministische Stapelung unter dem Ereignis-Label: beide
    // Texte hängen dann an derselben Linie und lesen sich als EIN Ereignis.
    const apexPlace = (anchor, txt, si) => {
      const pix = hindernisPix();
      // Die Tasche liegt normalerweise LINKS vom Ast — der Apex sitzt am rechten Rand,
      // links ist die einzige Seite mit Platz. Endet der Ast mitten im Plot (reset,
      // collapse), ist rechts davon frei; die Seite ist dann eine Frage des Platzes,
      // die Bindung bleibt dieselbe. Der Score hält links vorn und den Abstand klein.
      // Die Tasche gilt nur, wenn sie die Bindung trägt: näher am eigenen Ast als an
      // jeder fremden Kurve. Eine „fast passende" Lage neben der fremden Linie wäre
      // schlechter als die Stapelung — sie behauptete eine Zugehörigkeit, die das Bild
      // nicht zeigt. Deshalb gibt es hier keinen weichen zweiten Durchgang.
      for (const size of [NOTE_SIZE, 9]) {
        const w = measure(txt, size, 600), h = boxH(size);
        let best = null;
        // Feines dy-Raster: die Tasche ist oft ein Streifen von wenigen Pixeln zwischen
        // Ereignis-Label und eigener Linie. Ein grobes Raster überspringt ihn und
        // erzwingt die Stapelung, obwohl Platz da ist.
        for (const links of [true, false]) for (const abstand of [8, 13, 19, 26, 34, 42])
          for (const dy of [0, -5, 5, -10, 10, -15, 15, -20, 20, -25, 25, -30, 30, -35, 35, -40, 40, -45, 45]) {
            const score = abstand * 0.5 + Math.abs(dy) + (links ? 0 : 14);
            if (best && score >= best.score) continue;
            const r = rect(anchor[0] + (links ? -1 : 1) * (abstand + w / 2), anchor[1] + dy, w, h);
            if (!inView(r, NOTE_BOTTOM) || hitPlaced(r, LUFT_X, LUFT_Y) || hitPix(grow(r, 2), pix)) continue;
            if (fremdDist(si, r) < distPix(r, seriesPix[si]) - 1.5) continue;
            best = { r, size, score };
          }
        if (best) return { r: put(best.r), size: best.size, leader: null };
      }
      if (!stopRect) return null;
      // Tasche zu eng (später Stop: der Ast steht fast senkrecht in der Ecke) —
      // deterministische Stapelung unter dem Ereignis-Label, zentriert auf der
      // Stop-Linie. Beide Texte hängen dann an derselben Linie.
      const size = NOTE_SIZE, w = measure(txt, size, 600), h = size + 3;
      const cx = Math.min(396 - w / 2 - 4, Math.max(4 + w / 2 + 4, stopRect.cx));
      const oben = stopRect.cy + stopRect.h / 2 + 3 + h / 2;
      // Ist die erste Stufe belegt, rückt die Note nach unten. Bleibt keine Stufe frei
      // (Ecke voll), gewinnt die mit dem geringsten Schaden — nicht stur die erste.
      // Die Stop-Vertikale zählt hier NICHT als Hindernis: die Note hängt absichtlich an
      // ihr, und die Linie beginnt gleich unter ihr (setStopTop). Zählte man sie mit,
      // wäre jede Stufe „katastrophal" und die Wahl fiele auf die zufällig letzte.
      const ohneStopLinie = seriesPix.flat().concat(axisPix);
      let r = null, schaden = Infinity;
      for (let k = 0; k < 6; k++) {
        const kand = rect(cx, oben + k * (h + 2), w, h);
        if (!inView(kand, NOTE_BOTTOM)) break;
        const bad = schadenVon(kand, ohneStopLinie);
        if (bad === 0) { r = kand; break; }
        if (bad < schaden) { schaden = bad; r = kand; }
      }
      r = r || rect(cx, oben, w, h);
      setStopTop(Math.max(stopTop, r.cy + h / 2 + 4));
      return { r: put(r), size, leader: null, gestapelt: true };
    };

    // 3) Zeichnen: Pfade (Stop-Folge-Segment gestrichelt bei collapse), dann Labels.
    const series = samples.map((sm, si) => {
      const { s, pts } = sm;
      const px = (arr) => arr.map(([t, v]) => `${sx(t).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
      const main = sm.stopIdx != null ? pts.slice(0, sm.stopIdx + 1) : pts;
      const tail = sm.stopIdx != null ? pts.slice(sm.stopIdx) : [];
      const [et, ev] = pts[pts.length - 1];
      const areaPts = s.afterStop === "collapse" ? main : pts;
      // Ein `series:`-Anker umfasst Strich, Fläche UND Endpunkt. `data-branch` trennt
      // Haupt- von Nach-Stop-Ast: der zweite `trace` zeichnet Ast 1 — die Zäsur am
      // Ereignis kommt damit aus der Geometrie, nicht aus einer LLM-Entscheidung.
      const astEnde = tail.length ? 1 : 0;
      return `${s.area ? `<polygon${AN(anSerie[si])} data-branch="0" points="${sx(areaPts[0][0])},244 ${px(areaPts)} ${sx(areaPts[areaPts.length - 1][0])},244" fill="${C(s.color)}" opacity="0.1"/>` : ""}
        <polyline data-series="${si}"${AN(anSerie[si])} data-branch="0" points="${px(main)}" fill="none" stroke="${C(s.color)}" stroke-width="3"
              stroke-linejoin="round" stroke-linecap="round"
              ${s.dash ? 'stroke-dasharray="6 6"' : ""} ${s.faded ? 'opacity="0.4"' : ""}/>
        ${tail.length ? `<polyline data-series="${si}" data-tail="${s.afterStop}"${AN(anSerie[si])} data-branch="1" points="${px(tail)}" fill="none" stroke="${C(s.color)}" stroke-width="3"
              stroke-linejoin="round" stroke-linecap="round"
              ${s.afterStop === "collapse" ? 'stroke-dasharray="6 6"' : (s.dash ? 'stroke-dasharray="6 6"' : "")}
              ${s.faded ? 'opacity="0.4"' : ""}/>` : ""}
        <circle${AN(anSerie[si])} data-branch="${astEnde}" cx="${sx(et)}" cy="${sy(ev)}" r="4.5" fill="${C(s.color)}" ${s.faded ? 'opacity="0.4"' : ""}/>`;
    }).join("");
    // Reihenfolge: erst die Notes, dann die Serien-Labels. Eine Note haftet an EINEM
    // Punkt (t oder Apex) und kann kaum ausweichen; ein Serien-Label darf entlang der
    // ganzen Kurve wandern. Der Unflexible wählt zuerst — sonst belegt das Serien-Label
    // die Tasche am Apex und die Note müsste stapeln.
    const notes = (card.notes || []).map((n, ni) => {
      const si = typeof n.series === "number" ? n.series
        : Math.max(0, card.series.findIndex((s) => s.label === n.series));
      const sm = samples[si];
      const atApex = n.at === "apex";
      const [nt, nv] = atApex ? sm.pts[sm.pts.length - 1] : [n.t, yOnCurve(sm, n.t)];
      const a = [sx(nt), sy(nv)];
      // CAPS erzwingen und in derselben Schreibweise messen, in der gezeichnet wird.
      const txt = /</.test(String(n.label)) ? String(n.label) : String(n.label).toUpperCase();
      const r = (atApex ? apexPlace(a, txt, si) : null) || notePlace(a, txt, n.side, si);
      // Am Apex trägt die vorhandene Endpunkt-Kugel den Marker schon — kein zweiter Punkt.
      const dot = atApex ? ""
        : `<circle class="c-notedot"${AN(anNote[ni])}${GLOW(sm.s.color)} cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="3" fill="${C(sm.s.color)}"/>`;
      // Der Ankerpunkt steht am Text: ein Puls zwischen zwei Notes derselben Serie
      // läuft AUF deren Strich zwischen genau diesen beiden Punkten.
      return dot + leaderSvg(r.leader, anNote[ni]) + textSvg(r.r, r.size, txt, "c-note halo", C(sm.s.color),
        `data-note-series="${si}"${atApex ? ' data-at="apex"' : ""}${r.leader ? ' data-leader="1"' : ""}`
        + (r.gestapelt ? ' data-stacked="1"' : "")
        + AN(anNote[ni]) + TON(sm.s.color) + ` data-ax="${a[0].toFixed(1)}" data-ay="${a[1].toFixed(1)}"`);
    }).join("");
    const seriesLabels = samples.map((sm, si) => {
      if (!sm.s.label) return "";
      const r = stickyPlace(si, sm.s.label);
      // Halo auch am Serien-Label: auf freiem Papier unsichtbar (er hat dessen Farbe),
      // aber er trägt die eine Lage, in der das Label die Ereignis-Linie queren muss.
      return r ? textSvg(put(r.r), r.size, sm.s.label, "c-series halo", C(sm.s.color),
        `data-series-label="${si}"` + AN(anSerieLabel[si]) + TON(sm.s.color)) : "";
    }).join("");
    // Erst jetzt steht das obere Ende der Vertikalen fest: eine gestapelte Apex-Note
    // hängt unter dem Ereignis-Label und schiebt den Linienanfang nach unten.
    const stopSvg = card.stop
      ? `<line class="c-stopline"${AN(anStop)} x1="${stopX.toFixed(1)}" y1="${stopTop.toFixed(1)}" x2="${stopX.toFixed(1)}" y2="244"/>`
      : "";
    // Das Ereignis-Label wird NACH den Kurven gezeichnet: sein Papier-Halo trägt nur,
    // wenn nichts mehr darüber liegt.
    const stopText = card.stop ? textSvg(stopRect, STOP_SIZE, card.stop.label, "c-stop halo", stopFill,
      AN(anStop, anStopLabel) + TON(stopFill === C("ink") ? "ink" : samples.find((sm) => sm.s.afterStop).s.color)) : "";
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 278" role="img" aria-label="Kurvendiagramm: ${card.ylabel} über ${card.xlabel}">
        <path class="c-axis"${AN(anAxis)} d="M52,34 L52,244 L382,244" fill="none" stroke="${C("muted")}" stroke-width="1.5"/>
        <text${AN(anAxis)} x="52" y="22" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${C("muted")}">${card.ylabel}</text>
        <text${AN(anAxis)} x="382" y="266" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${C("muted")}" text-anchor="end">${card.xlabel}</text>
        ${stopSvg}
        ${series}
        ${stopText}
        ${seriesLabels}
        ${notes}
      </svg></div>
      ${card.caption ? `<p class="caption">${card.caption}</p>` : ""}
    </div>`;
  },

  fanout(card) {
    const cys = Array.from({ length: card.count }, (_, i) => 52 + i * (204 / (card.count - 1)));
    // Adaptive Label-Größe wie in den Waage-Schalen: ein 12-Zeichen-Label füllt die
    // Box sonst randvoll; Strahlen starten mit Luft zur Box, nie an ihrer Kante.
    const fs = card.source.label.length > 9 ? 12.5 : 15;
    // Benannte Ziele ändern die AUSSAGE der Karte, nicht nur ihre Beschriftung: eine
    // Reihe gleicher Personen sagt „viele Getroffene" (Reichweite), benannte Ziele
    // sagen „verschiedene Bereiche" (Hebel). Für Bereiche ist die Personen-Silhouette
    // falsch — sie bekommen einen neutralen Knoten. Ohne `targets` bleibt alles, wie
    // es war, samt Breite: Bestandskarten dürfen sich nicht verschieben.
    const ziele = Array.isArray(card.targets) ? card.targets : null;
    const BREITE = ziele ? 500 : 400;
    // Der Contract deckelt Zeichen, gezeichnet werden Pixel: „LEBENSERWARTUNG" ist
    // genauso lang wie „MITTELLINIENLAGE" und fast doppelt so breit wie sechzehn I.
    // Statt den Deckel auf die breiteste denkbare Kombination zu senken (das nähme
    // allen anderen Namen den Platz), misst der Renderer den längsten Namen und
    // wählt die Größe, die ihn hält.
    const ZIEL_X = 340, ZIEL_PLATZ = BREITE - ZIEL_X - 8;
    const zielFs = ziele
      ? Math.max(10, Math.min(12.5, ...ziele.map((t) => 12.5 * ZIEL_PLATZ / Math.max(measure(t?.label ?? "", 12.5), 1))))
      : 12.5;
    const A = ankerVergabe();
    const anQuelle = A(`node:${ankerSlug(card.source?.label, "quelle")}`), anFan = A("fan");
    const anTarget = cys.map((_, i) => A(`target:${i + 1}`));
    const anQuelleLabel = A(`label:${ankerSlug(card.source?.label, "quelle")}`);
    const anWirkung = A(`label:${ankerSlug(card.result?.label, "wirkung")}`);
    const anZiel = (ziele || []).map((t, i) => A(`label:${ankerSlug(t?.label, `ziel${i}`)}`));
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 ${BREITE} 300" role="img" aria-label="Hebel-Diagramm: eine Handlung wirkt ${ziele ? `auf ${ziele.map((t) => t.label).join(", ")}` : "vielfach"}">
        ${cys.map((cy) => `<line${AN(anFan)} x1="166" y1="154" x2="${316 - 15}" y2="${cy}" stroke="${C("ink")}" stroke-width="1.5"/>`).join("")}
        <g${AN(anQuelle)}>
        <rect${GLOW(card.source.color)} x="24" y="122" width="136" height="64" rx="16" fill="${SOFT(card.source.color)}" stroke="${C(card.source.color)}" stroke-width="2.5"/>
        <text class="svglabel"${AN(anQuelleLabel)}${TON(card.source.color)} x="92" y="150" font-size="${fs}" fill="${C("ink")}" text-anchor="middle">${card.source.label}</text>
        <text x="92" y="168" font-size="10.5" fill="${C("muted")}" text-anchor="middle" font-weight="600">${card.source.sub}</text>
        </g>
        ${cys.map((cy, i) => `<g${AN(anTarget[i])} data-idx="${i}">
          <circle${GLOW("ich")} cx="316" cy="${cy}" r="15" fill="${SOFT("ich")}" stroke="${C("ich")}" stroke-width="2"/>
          ${ziele
            ? `<circle cx="316" cy="${cy}" r="5" fill="${C("ich")}"/>`
            : `<circle cx="316" cy="${cy - 3.5}" r="4.2" fill="${C("ich")}"/>
          <path d="M308,${cy + 9.5} a8,6 0 0 1 16,0 Z" fill="${C("ich")}"/>`}
        </g>`).join("")}${(ziele || []).map((t, i) => `
        <text class="svglabel"${AN(anTarget[i], anZiel[i])} x="${ZIEL_X}" y="${(cys[i] + zielFs * 0.36).toFixed(1)}" font-size="${zielFs.toFixed(1)}" fill="${C("ink")}" text-anchor="start">${t.label}</text>`).join("")}
        <text class="svglabel"${AN(anWirkung)}${TON("ich")} x="${ziele ? ZIEL_X : 316}" y="28" font-size="14" fill="${C("ink")}" text-anchor="${ziele ? "start" : "middle"}">${card.result.label}</text>
      </svg></div>
      ${card.caption ? `<p class="caption">${card.caption}</p>` : ""}
    </div>`;
  },

  cycle(card) {
    // Kreislauf: 3–5 Stationen, Pfeile im Uhrzeigersinn — der Loop ist die Aussage.
    // Plätze und Bögen kommen aus der Stationszahl, damit ein Gedanke nicht an der
    // Vier scheitert. Bei vier Stationen sind es dieselben Plätze wie in der
    // handgesetzten Fassung davor (RX/RY sind aus ihr abgelesen).
    // Beim Fünfeck stehen zwei Stationen nebeneinander unten — zwei volle Boxen (132 px)
    // passen dort auf 400 px Breite nicht mit Luft dazwischen. Der Kreis bekommt deshalb
    // ab fünf Stationen ein breiteres Feld, statt die fünfte zu verbieten. Bei drei und
    // vier ergibt die Formel exakt die Werte der handgesetzten Fassung (200 / 122).
    const BREITE = card.steps.length >= 5 ? 460 : 400;
    const CX = BREITE / 2, CY = 170, RX = CX - 78, RY = 110, LUFT = 15;
    const schritt = 2 * Math.PI / card.steps.length;
    const winkel = (i) => -Math.PI / 2 + i * schritt;
    const auf = (a, rx, ry) => [CX + rx * Math.cos(a), CY + ry * Math.sin(a)];
    const pos = card.steps.map((_, i) => auf(winkel(i), RX, RY));
    // Der Bogen setzt hinter der einen Box an und endet vor der nächsten. Wo genau,
    // wird GESUCHT statt geschätzt: die Station ist ein Rechteck (132×52), der Bogen
    // läuft auf einer Ellipse, und ein fester Winkel-Abstand liegt mal außerhalb, mal
    // darunter — die Boxen werden nach den Pfeilen gezeichnet und verschlucken dann
    // den Pfeilkopf. Gesucht ist der erste Winkel, an dem der Bogen die Box verlässt.
    const HALB_B = 66 + 5, HALB_H = 26 + 5;
    const drausen = ([px, py], [mx, my]) => Math.abs(px - mx) > HALB_B || Math.abs(py - my) > HALB_H;
    const frei = (i, drehsinn) => {
      for (let g = 0; g <= 0.5 * schritt; g += Math.PI / 180) {
        const p = auf(winkel(i) + drehsinn * g, RX + LUFT, RY + LUFT);
        if (drausen(p, pos[i])) return p;
      }
      return auf(winkel(i) + drehsinn * 0.5 * schritt, RX + LUFT, RY + LUFT);
    };
    const arrows = card.steps.map((_, i) => {
      const [x1, y1] = frei(i, +1), [x2, y2] = frei((i + 1) % card.steps.length, -1);
      return `M${x1.toFixed(1)},${y1.toFixed(1)} A${RX + LUFT},${RY + LUFT} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
    });
    // arrow:i+1 ist der gezeichnete Weg von Schritt i zu Schritt i+1 — ein Puls im
    // Kreislauf läuft auf ihm, nicht quer durch die Mitte.
    const A = ankerVergabe();
    const anStep = card.steps.map((s, i) => A(`step:${ankerSlug(s.label, String(i))}`));
    const anLabel = card.steps.map((s, i) => A(`label:${ankerSlug(s.label, String(i))}`));
    const anArrow = card.steps.map((_, i) => A(`arrow:${i + 1}`));
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 ${BREITE} 340" role="img" aria-label="Kreislauf: ${card.steps.map((s) => s.label).join(", ")}">
        <defs><marker id="cyarrow" markerWidth="9" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="${C("ink")}"/>
        </marker></defs>
        ${arrows.map((d, i) => `<path${AN(anArrow[i])} data-idx="${i}" d="${d}" fill="none" stroke="${C("ink")}" stroke-width="1.8" marker-end="url(#cyarrow)"/>`).join("")}
        ${card.steps.map((s, i) => {
          const cx = +pos[i][0].toFixed(1), cy = +pos[i][1].toFixed(1);
          return `<g${AN(anStep[i])} data-idx="${i}">
            <rect${GLOW(s.color)} x="${cx - 66}" y="${cy - 26}" width="132" height="52" rx="14"
              fill="${SOFT(s.color)}" stroke="${C(s.color)}" stroke-width="2.5"/>
            <text class="svglabel"${AN(anLabel[i])}${TON(s.color)} x="${cx}" y="${cy - 2}" font-size="14.5" fill="${C("ink")}" text-anchor="middle">${s.label}</text>
            <text x="${cx}" y="${cy + 15}" font-size="10.5" fill="${C("muted")}" text-anchor="middle" font-weight="600">${s.sub}</text></g>`;
        }).join("")}
      </svg></div>
      ${card.caption ? `<p class="caption">${card.caption}</p>` : ""}
    </div>`;
  },

  compare(card) {
    // Reine HTML-Karte: Anker gibt es, aber keine Pfad-Geometrie — `pulse` ist hier
    // konstruktiv unmöglich und deshalb in der Registry nicht als Paar deklariert.
    const A = ankerVergabe();
    const an = {};
    for (const seite of ["left", "right"]) {
      an[seite] = { panel: A(`panel:${seite}`), titel: A(`label:${ankerSlug(card[seite]?.title, seite)}`),
        items: (card[seite]?.items || []).map((it, i) => A(`item:${ankerSlug(it.label, `${seite}${i}`)}`)) };
    }
    const panel = (p, seite) => `<div class="cpanel"${AN(an[seite].panel)} style="border-color:${C(p.color)};background:${SOFT(p.color)}">
      <h3${AN(an[seite].titel)}${TON(p.color)}>${p.title}</h3>
      ${p.items.map((it, i) => `<div class="citem"${AN(an[seite].items[i])}><b>${it.label}</b><span>${it.sub}</span></div>`).join("")}
    </div>`;
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><div class="compare">${panel(card.left, "left")}${panel(card.right, "right")}</div></div>
      ${card.caption ? `<p class="caption">${card.caption}</p>` : ""}
    </div>`;
  },

  venn(card) {
    // Schnittfläche als eigenes, konturiertes Objekt — die Grenze ist die Aussage.
    const A = ankerVergabe();
    const anA = A(`region:${ankerSlug(card.a?.label, "a")}`), anB = A(`region:${ankerSlug(card.b?.label, "b")}`);
    const anOverlap = A("overlap");
    const anLabelA = A(`label:${ankerSlug(card.a?.label, "a")}`), anLabelB = A(`label:${ankerSlug(card.b?.label, "b")}`);
    const anLabelO = (card.overlap?.label || []).map((l, i) => A(`label:${ankerSlug(l, `schnitt${i}`)}`));
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 280" role="img" aria-label="Venn-Diagramm: ${card.a.label} und ${card.b.label} überschneiden sich">
        <circle${AN(anA)}${GLOW(card.a.color)} cx="150" cy="155" r="95" fill="${SOFT(card.a.color)}" stroke="${C(card.a.color)}" stroke-width="2.5"/>
        <circle${AN(anB)}${GLOW(card.b.color)} cx="250" cy="155" r="95" fill="${SOFT(card.b.color)}" stroke="${C(card.b.color)}" stroke-width="2.5"/>
        <path${AN(anOverlap)}${GLOW(card.overlap.color)} d="M200,74 A95,95 0 0 1 200,236 A95,95 0 0 1 200,74 Z"
              fill="${SOFT(card.overlap.color)}" stroke="${C("ink")}" stroke-width="2"/>
        <text class="svglabel"${AN(anLabelA)}${TON(card.a.color)} x="118" y="38" font-size="12.5" fill="${C("ink")}" text-anchor="middle">${card.a.label}</text>
        <text class="svglabel"${AN(anLabelB)}${TON(card.b.color)} x="285" y="38" font-size="12.5" fill="${C("ink")}" text-anchor="middle">${card.b.label}</text>
        ${card.overlap.label.map((l, i) => `<text class="svglabel"${AN(anLabelO[i])}${TON(card.overlap.color)} x="200" y="${146 + i * 18}" font-size="12" fill="${C("ink")}" text-anchor="middle">${l}</text>`).join("")}
      </svg></div>
      ${card.caption ? `<p class="caption">${card.caption}</p>` : ""}
    </div>`;
  },

  // Der Gegenstand selbst ist die Aussage (relation "object"). Das Bild kommt aus der
  // Library, die Erklärungen sitzen an den Plätzen, die das Objekt dafür vorsieht —
  // die Karte liefert nur den TEXT, nie eine Position (Contract v2 gilt weiter).
  asset(card) {
    const A = ankerVergabe();
    const m = assetEintrag(card.asset.ref) || {};
    const einbau = assetEinbau(card.asset.ref, { A, labels: card.asset.labels || {},
      subs: card.asset.subs || {}, notes: card.notes || [], role: card.asset.role });
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 300" role="img" aria-label="${m.titel || card.asset.ref}">
      ${einbau}
      </svg></div>
      ${card.caption ? `<p class="caption">${card.caption}</p>` : ""}
    </div>`;
  },

  quiz(card) {
    const opts = card.options.map((o, i) =>
      `<button class="qopt" data-i="${i}" data-c="${o.correct ? 1 : 0}">${o.label}</button>`).join("");
    return `<div class="card">
      <p class="lehrsatz" style="font-size:23px">${card.question}</p>
      <div class="quizopts">${opts}</div>
      <button class="qcheck" disabled>Prüfen</button>
      <p class="qfeedback" aria-live="polite"></p>
    </div>`;
  },

  insight(card) {
    return `<div class="card card--insight">
      <div class="insight-rule"></div>
      <blockquote>„${card.quote}“</blockquote>
      <cite>— ${card.cite}</cite>
      <p class="expl">${card.explain}</p>
      <button class="savebtn" aria-label="Karte speichern">♥</button>
      <div class="savehint">Karte speichern</div>
    </div>`;
  }
};

// ————— Karten-Fläche als API — EINE Quelle für Mockup, App-Canvas und Audits —————
function wireQuiz(root, card, onAdvance, onResult) {
  const opts = [...root.querySelectorAll(".qopt")];
  const check = root.querySelector(".qcheck");
  const fb = root.querySelector(".qfeedback");
  let sel = null, done = false;
  opts.forEach((o) => o.addEventListener("click", (e) => {
    e.stopPropagation();
    if (done) return;
    sel = o;
    opts.forEach((x) => x.classList.toggle("sel", x === o));
    check.disabled = false;
    check.classList.add("ready");
  }));
  check.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!sel || done) return;
    done = true;
    const correct = sel.dataset.c === "1";
    sel.classList.remove("sel");
    sel.classList.add(correct ? "right" : "wrong");
    if (!correct) opts.find((x) => x.dataset.c === "1").classList.add("right");
    fb.innerHTML = correct ? card.explain : card.wrong;
    check.textContent = "Weiter";
    if (onResult) onResult(correct);
    check.addEventListener("click", () => onAdvance && onAdvance(), { once: true });
  });
}

// ————————————————— Sequenz-Layer v3 (Motion) —————————————————
// Ein Schritt IST ein Zustand: `.on`, `.lit`, `.seq-dim` SIND der Zustand, die
// Transitions sind nur der Weg dorthin. Damit ist jeder Schritt per Definition
// einfrierbar — __seqGoto springt ohne Weg hin, prefers-reduced-motion ebenso.
// Alle Zeiten kommen aus den Motion-Tokens in renderer.css (eine Duration-Skala, ein
// Easing, eine Puls-Optik); hier steht keine zweite Zahl.
const SVGNS = "http://www.w3.org/2000/svg";
let SEQ = null;                                     // Zustand der ZULETZT gerenderten Karte
function seqStop() { if (SEQ) { SEQ.timers.forEach(clearTimeout); SEQ.timers = []; } }

// Punkt-Umrechnung in viewBox-Einheiten: getBBox misst im LOKALEN System des Elements
// (Labels tragen ein translate) — ungerechnet läge die Mitte eines Labels bei 0,0.
function anchorBox(svg, el) {
  const ctm = svg.getScreenCTM(), own = el.getScreenCTM();
  if (!ctm || !own) return null;
  const m = ctm.inverse().multiply(own), b = el.getBBox();
  const xs = [], ys = [];
  for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
    xs.push(m.a * x + m.c * y + m.e); ys.push(m.b * x + m.d * y + m.f);
  }
  return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function wireSequence(root, card) {
  seqStop();
  window.__seqSteps = 0;
  window.__seqGoto = () => 0;
  const plan = Array.isArray(card.sequence) ? card.sequence : null;
  if (!plan || !plan.length) return;                // ohne sequence rendert alles wie bisher
  const svg = root.querySelector(".diagram svg");
  const els = (name) => name ? [...root.querySelectorAll(`[data-anchor~="${name}"]`)] : [];
  const N = plan.length;

  const dots = [], lits = [], dims = [], getraced = new Map();
  // Ein Element wird EINMAL sichtbar: der erste Schritt, der es zeigt, gewinnt.
  const setStep = (e, n) => { if (!e.dataset.seqStep) e.dataset.seqStep = n; };

  // Puls-Weg: ein Puls läuft auf einem Weg, den das Bild ZEIGT.
  //  1) Kurve — auf dem Strich der Serie zwischen zwei Note-Punkten
  //  2) Kette/Kreis — auf dem gezeichneten Pfeil zwischen zwei Schritten
  //  3) sonst — gerade Verbindung der beiden Anker-Mitten
  const punkte = (el) => (el.getAttribute("points") || "").trim().split(/\s+/)
    .filter(Boolean).map((p) => p.split(",").map(Number));
  const dOf = (el) => {
    if (!el) return null;
    if (el.tagName === "path") return el.getAttribute("d");
    if (el.tagName === "line")
      return `M${el.getAttribute("x1")},${el.getAttribute("y1")} L${el.getAttribute("x2")},${el.getAttribute("y2")}`;
    if (el.tagName === "polyline") return "M" + punkte(el).map(([x, y]) => `${x},${y}`).join(" L");
    return null;
  };
  const pulsWeg = (from, to) => {
    // 0) Asset — der Weg ist IM Objekt gezeichnet (data-link): das Bild zeigt ihn, das
    //    Karten-JSON erfindet ihn nicht. Er steht in Asset-Einheiten, der Punkt läuft
    //    deshalb in derselben Gruppe (Wirt) und in deren Maßstab.
    const route = svg && (svg.querySelector(`[data-link="${from}>${to}"]`) || svg.querySelector(`[data-link="${to}>${from}"]`));
    if (route) return {
      d: route.getAttribute("d"), rev: route.dataset.link !== `${from}>${to}`,
      wirt: route.parentNode, ton: route.dataset.ton
    };
    const a = els(from).find((e) => e.dataset.ax), b = els(to).find((e) => e.dataset.ax);
    if (a && b && a.dataset.noteSeries === b.dataset.noteSeries) {
      const x1 = +a.dataset.ax, y1 = +a.dataset.ay, x2 = +b.dataset.ax, y2 = +b.dataset.ay;
      const pts = [];
      root.querySelectorAll(`polyline[data-series="${a.dataset.noteSeries}"]`).forEach((pl) => pts.push(...punkte(pl)));
      const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
      const mitte = pts.filter(([x]) => x > lo && x < hi);     // x läuft monoton nach rechts
      const folge = [[x1, y1], ...(x1 <= x2 ? mitte : mitte.reverse()), [x2, y2]];
      return { d: "M" + folge.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L"), rev: false };
    }
    const ga = els(from).find((e) => e.dataset.idx !== undefined), gb = els(to).find((e) => e.dataset.idx !== undefined);
    if (ga && gb && from.startsWith("step:") && to.startsWith("step:")) {
      const ia = +ga.dataset.idx, ib = +gb.dataset.idx, n = (card.steps || []).length;
      const vor = ib === (ia + 1) % n, zurueck = ia === (ib + 1) % n;
      const d = dOf(els(`arrow:${(vor ? ia : ib) + 1}`)[0]);
      if ((vor || zurueck) && d) return { d, rev: zurueck };
    }
    if (!svg) return null;
    const mitteVon = (name) => {
      const boxen = els(name).map((e) => anchorBox(svg, e)).filter(Boolean);
      if (!boxen.length) return null;
      return [boxen.reduce((s, b) => s + b.cx, 0) / boxen.length, boxen.reduce((s, b) => s + b.cy, 0) / boxen.length];
    };
    const p = mitteVon(from), q = mitteVon(to);
    return p && q ? { d: `M${p[0].toFixed(1)},${p[1].toFixed(1)} L${q[0].toFixed(1)},${q[1].toFixed(1)}`, rev: false } : null;
  };

  // Aufglühen des Puls-ZIELS: ein Soft-Ton-Ring hinter der Zielfläche. Bewusst ein
  // eigenes Element statt einer Füll-Änderung — die Karten-Typen füllen ihre Flächen
  // schon selbst (meist im Soft-Ton), eine zweite Füllung wäre unsichtbar oder falsch.
  const litElemente = (name) => {
    const out = [];
    for (const e of els(name)) {
      out.push(e);
      const flaeche = e.matches("[data-glow]") ? e : e.querySelector("[data-glow]");
      if (!flaeche) continue;
      if (!flaeche.__halo) {
        const h = flaeche.cloneNode(false);
        [...h.attributes].forEach((a) => { if (a.name.startsWith("data-")) h.removeAttribute(a.name); });
        h.setAttribute("class", "seq-halo");
        h.style.fill = "none";
        h.style.stroke = `var(--${flaeche.dataset.glow}-soft)`;
        flaeche.parentNode.insertBefore(h, flaeche);
        flaeche.__halo = h;
      }
      out.push(flaeche.__halo);
    }
    return out;
  };

  plan.forEach((st, i) => {
    const n = i + 1;
    if (st.verb === "reveal") els(st.target).forEach((e) => setStep(e, n));
    else if (st.verb === "dim") dims.push({ n, els: els(st.target) });
    else if (st.verb === "highlight") {
      const ziel = els(st.target);
      ziel.forEach((e) => { e.classList.add("seq-hl"); e.dataset.seqFill = e.style.fill || ""; e.dataset.seqStroke = e.style.stroke || ""; });
      lits.push({ n, els: ziel, hl: true });
    } else if (st.verb === "trace") {
      // Wiederholter trace zeichnet den NÄCHSTEN Ast — die Zäsur am Ereignis steckt
      // in der Geometrie (Haupt- und Nach-Stop-Ast sind getrennte polylines).
      const k = getraced.get(st.target) || 0;
      getraced.set(st.target, k + 1);
      els(st.target).filter((e) => Number(e.dataset.branch || 0) === k).forEach((e) => {
        setStep(e, n);
        if (e.tagName === "polyline" || e.tagName === "path") {
          const L = e.getTotalLength();
          e.classList.add("seq-trace");
          // Die eigene Strichelung wird für den Zug geliehen, nicht enteignet — sie
          // steht hier, damit der gezeichnete Zustand sie zurückbekommt.
          e.dataset.seqDash = e.getAttribute("stroke-dasharray") || "";
          e.style.strokeDasharray = L;
          e.dataset.seqLen = L;
        }
      });
      // Das Serien-Label läuft implizit mit dem ersten Strich (bindendes Mockup:
      // „ADENOSIN" erschien MIT der Kurve). Ein expliziter reveal auf das Label
      // gewinnt — highlight/dim zählen nicht, sie ändern Farbe, nicht Erscheinen.
      if (k === 0 && st.target.startsWith("series:")) {
        const labelName = "label:" + st.target.slice(7);
        if (!plan.some((s2) => s2.verb === "reveal" && s2.target === labelName))
          els(labelName).forEach((e) => setStep(e, n));
      }
    } else if (st.verb === "pulse") {
      const weg = svg ? pulsWeg(st.from, st.to) : null;
      // Ohne messbare Geometrie (Karte hängt nicht im Layout) entfällt der WEG, nicht
      // der Zustand: das Ziel glüht trotzdem — der Endzustand bleibt derselbe.
      if (weg) {
        const dot = document.createElementNS(SVGNS, "circle");
        const ton = (els(st.from).find((e) => e.dataset.glow || e.dataset.ton) || {}).dataset;
        const wirt = weg.wirt || svg;
        // Im Asset misst der Punkt in Asset-Einheiten: derselbe Radius auf dem Bild
        // braucht dort die Zahl geteilt durch den Platzierungs-Maßstab.
        const massstab = parseFloat((wirt.closest && wirt.closest("[data-asset-scale]") || {}).dataset?.assetScale) || 1;
        dot.setAttribute("class", "seq-pulse" + (weg.rev ? " rev" : ""));
        dot.setAttribute("r", (parseFloat(getComputedStyle(root).getPropertyValue("--m-pulse-r")) || 5.5) / massstab);
        dot.setAttribute("fill", `var(--${weg.ton || (ton && (ton.glow || ton.ton)) || "ink"})`);
        dot.style.offsetPath = `path('${weg.d}')`;
        wirt.appendChild(dot);
        dots.push({ n, dot });
      }
      lits.push({ n, els: litElemente(st.to) });
    }
  });

  // ——— Asset-Labels erscheinen MIT ihrem Gegenstand ———
  // Ein Label-Platz nennt seinen Anker (data-label-anchor). Sichtbar wird er, sobald
  // der Gegenstand da ist — und wenn ein Puls diesen Gegenstand zum ZIEL hat, erst mit
  // dessen Ankunft: „AB HIER FEUERT ES" steht im Bild, wenn der Reiz das Soma erreicht,
  // nicht schon beim Erscheinen des Neurons (bindendes Mockup, Panel a).
  // Ein ausdrücklicher reveal auf `label:<platz>` gewinnt (setStep vergibt nur einmal).
  const pulsZiel = new Map();
  plan.forEach((st, i) => { if (st.verb === "pulse" && st.to !== undefined && !pulsZiel.has(st.to)) pulsZiel.set(st.to, i + 1); });
  root.querySelectorAll("[data-label-anchor]").forEach((lab) => {
    const name = lab.dataset.labelAnchor;
    let n = pulsZiel.has(name) ? pulsZiel.get(name) : null;
    if (n === null) for (const ziel of els(name)) {
      for (let e = ziel; e && e !== root; e = e.parentElement)
        if (e.dataset.seqStep) { n = Number(e.dataset.seqStep); break; }
      if (n !== null) break;
    }
    if (n !== null) setStep(lab, n);
  });

  // Für den Zug trägt der Strich seine VOLLE Länge als dasharray — nur so lässt sich der
  // ungezeichnete Rest wegschieben. Bliebe sie liegen, stünde eine `dash: true`-Serie am
  // Ende solide da und die Karte unterschiede ihre Serien nicht mehr, obwohl ihre Daten
  // es sagen. Im gezeichneten Zustand gilt deshalb wieder die Gestaltung — beim Sprung
  // sofort, in der Bewegung, sobald der Zug angekommen ist.
  const zugDash = (e, on, animiert) => {
    const L = e.dataset.seqLen, gestaltung = e.dataset.seqDash || "";
    const lief = e.dataset.seqOn === "1";
    e.dataset.seqOn = on ? "1" : "0";
    if (!on) { e.style.strokeDasharray = L; e.style.strokeDashoffset = L; return; }
    e.style.strokeDashoffset = 0;
    if (!animiert) { e.style.strokeDasharray = gestaltung; return; }
    if (lief) return;                                 // zieht bereits oder ist angekommen
    e.style.strokeDasharray = L;
    const fertig = (ev) => {
      // NUR das Ende der Zug-Transition zählt: die Deckkraft desselben Elements läuft
      // kürzer, ihr Ende käme mitten im Strich und machte ihn schlagartig gestrichelt.
      if (ev.propertyName !== "stroke-dashoffset") return;
      e.removeEventListener("transitionend", fertig);
      if (e.dataset.seqOn === "1") e.style.strokeDasharray = gestaltung;
    };
    e.addEventListener("transitionend", fertig);
  };

  const apply = (s, animiert) => {
    SEQ.cur = s;
    root.querySelectorAll("[data-seq-step]").forEach((e) => {
      const on = Number(e.dataset.seqStep) <= s;
      e.classList.toggle("on", on);
      if (e.dataset.seqLen) zugDash(e, on, animiert);
    });
    dims.forEach(({ n, els: ee }) => ee.forEach((e) => e.classList.toggle("seq-dim", n <= s)));
    lits.forEach(({ n, els: ee, hl }) => ee.forEach((e) => {
      const on = n <= s;
      e.classList.toggle("lit", on);
      // Asset-Flächen glühen als FÜLLUNG auf (bindendes Mockup: Soma und Synapse nehmen
      // den Soft-Ton an). Der Halo-Ring der Karten-Typen passt hier nicht: er ist in
      // Karten-Einheiten gedacht und stünde im Asset-Maßstab doppelt so breit da.
      if (e.dataset.glowFill) e.style.fill = on ? `var(--${e.dataset.glowFill}-soft)` : "";
      if (hl && e.dataset.ton) {
        e.style.fill = on ? `var(--${e.dataset.ton})` : e.dataset.seqFill;
        e.style.stroke = on ? `var(--${e.dataset.ton}-soft)` : e.dataset.seqStroke;
      }
    }));
    dots.forEach(({ n, dot }) => {
      dot.classList.remove("run");
      if (n === s && animiert) { void dot.getBoundingClientRect(); dot.classList.add("run"); }
    });
  };

  const ms = (name) => {
    const v = getComputedStyle(root).getPropertyValue(name).trim(), n = parseFloat(v);
    return Number.isFinite(n) ? (/[^m]s$/.test(v) ? n * 1000 : n) : NaN;
  };
  const play = () => {
    seqStop();
    root.classList.remove("seq-frozen");
    apply(0, false);
    const beat = ms("--m-beat"), move = ms("--m-move"), hold = ms("--m-hold");
    // Ohne Token-Skala (renderer.css fehlt) wird keine Zeit erfunden — dann gilt der
    // Endzustand, genau wie bei prefers-reduced-motion.
    if (!(beat && move && hold)) { root.classList.add("seq-frozen"); apply(N, false); return; }
    let at = 320;                                   // die Karte kommt herein, dann wird sie lebendig
    for (let n = 1; n <= N; n++) {
      SEQ.timers.push(setTimeout(() => apply(n, true), at));
      at += (["pulse", "trace"].includes(plan[n - 1].verb) ? move : beat) + hold;
    }
  };

  SEQ = { root, timers: [], cur: 0 };
  window.__seqSteps = N;
  window.__seqGoto = (s) => {                       // Test-Hook: Schritt-ENDZUSTAND ohne Weg
    seqStop();
    root.classList.add("seq-frozen");
    apply(Math.max(0, Math.min(N, Number(s) || 0)), false);
    return SEQ.cur;
  };
  // trigger:auto — die Karte wird beim Erscheinen lebendig (Leon-Lock 14.08.);
  // "tap" existiert im Contract nicht (Tap gehört exklusiv dem Karten-Wechsel).
  // prefers-reduced-motion springt sofort in den Endzustand.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("seq-frozen");
    apply(N, false);
  } else play();
}

// ————————————————————— v4: Erklär-Schicht —————————————————————
// Callout und Klammer legen sich auf ein FERTIGES Diagramm. Sie laufen deshalb nach dem
// Karten-Markup und nicht in den Karten-Typen: Anker-Geometrie ist erst im DOM messbar,
// und dieselbe Schicht soll auf jedem Typ sitzen (docs/erklaer-schicht-spec.md). Derselbe
// Weg, den wireSequence schon geht.
//
// Das Karten-JSON nennt nur Bedeutung und Ziel — `art`, `text`, und den Anker. Wo der
// Kasten sitzt, wie die Linie läuft und OB es eine gibt, rechnet der Solver. Ein Modell
// kann die Lage damit nicht falsch angeben, weil es sie gar nicht angeben kann.
function wireAnnotations(root, card) {
  const plan = Array.isArray(card.annotations) ? card.annotations : null;
  if (!plan || !plan.length) return;
  const svg = root.querySelector(".diagram svg");
  if (!svg) return;                       // Karten ohne Diagramm tragen keine Schicht
  const vb = svg.viewBox.baseVal;

  // Alles rechnet im SVG-User-Space: die Typen haben verschiedene viewBoxen (400×300,
  // 400×432), und ein eingebautes Asset bringt seine eigene Transformation mit. Dieselbe
  // Umrechnung wie in label-audit.mjs — zwei Maßsysteme gegeneinander zu messen meldete
  // Nähe, wo Abstand ist.
  const matrix = (el) => svg.getScreenCTM().inverse().multiply(el.getScreenCTM());
  const abtasten = (el) => {
    const out = [];
    let len = 0;
    try { len = el.getTotalLength(); } catch { return out; }
    if (!len) return out;
    const m = matrix(el), skal = Math.hypot(m.a, m.b) || 1;
    const n = Math.max(1, Math.ceil((len * skal) / ASSET_TASTSCHRITT));
    for (let k = 0; k <= n; k++) {
      const p = el.getPointAtLength(len * (k / n));
      out.push([m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f]);
    }
    return out;
  };
  // `rect` kommt hier dazu, anders als bei ASSET_GEO_SEL: die Karten-Typen zeichnen damit
  // (layers-Regionen), und als HINDERNIS ist ein Rechteck richtig, auch wenn es als ANKER
  // irreführend wäre.
  const GEO_SEL = "path:not(.a-route), line, polyline, polygon, circle, rect";
  const geoEls = [...svg.querySelectorAll(GEO_SEL)];
  const hindernis = geoEls.flatMap(abtasten);

  // Eine gefüllte FLÄCHE ist für die Erklär-Schicht mehr als ihre Kontur. Bei Asset-Notes
  // gilt bewusst das Gegenteil — dort darf die Note IN ihrer Fläche liegen, weil das die
  // Zugehörigkeit zeigt. Hier zählt die fremde Fläche als besetzt: ein Text auf ihr liest
  // sich als IHRE Beschriftung. Am Eisberg landete „WAS ICH ZEIGE" sonst auf dem blauen
  // Wasserband, dunkel auf dunkel — und die Abstandsmetrik konnte das nicht sehen, weil
  // die nächste Kontur dort weiter weg war als an der freien Bergspitze.
  // GECLIPPTE Flächen zählen NICHT mit: `isPointInFill` kennt `clip-path` nicht und
  // meldet die ungeschnittene Form. Bei layers sind die Regionen Rechtecke von (90,30)
  // bis (335,440), sichtbar ist davon nur der Eisberg-Ausschnitt — ungeclippt gemessen
  // sperrten sie fast die ganze Karte, und die Klammer fand nirgends mehr Platz. Dieselbe
  // Falle wie beim Anker: die eigene Kontur eines geclippten Rechtecks sagt nichts über
  // das, was man sieht.
  const flaechen = geoEls.filter((el) => {
    const f = el.getAttribute("fill");
    if (!f || f === "none" || typeof el.isPointInFill !== "function") return false;
    return !el.closest("[clip-path]") && !el.getAttribute("clip-path");
  });
  const aufFremderFlaeche = (r, eigene) => flaechen.some((el) => {
    if (eigene.includes(el)) return false;
    const m = matrix(el).inverse();
    return cornersOf(r).concat([[r.cx, r.cy]]).some(([x, y]) =>
      el.isPointInFill(new DOMPoint(m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f)));
  });
  const elementeVon = (...namen) => namen.filter(Boolean)
    .flatMap((n) => [...svg.querySelectorAll(`[data-anchor~="${CSS.escape(n)}"]`)])
    .flatMap((el) => (el.matches(GEO_SEL) ? [el] : [...el.querySelectorAll(GEO_SEL)]));

  // Bestehende Texte sind belegt: ein Callout, das auf einem Label landet, hat den Platz
  // genommen, den die Karte schon vergeben hatte.
  const { put, hitPlaced, schadenVon } = belegung();
  for (const t of svg.querySelectorAll("text")) {
    const b = t.getBBox(), m = matrix(t);
    put(rect(m.a * (b.x + b.width / 2) + m.c * (b.y + b.height / 2) + m.e,
             m.b * (b.x + b.width / 2) + m.d * (b.y + b.height / 2) + m.f,
             b.width * (Math.hypot(m.a, m.b) || 1), b.height * (Math.hypot(m.c, m.d) || 1)));
  }

  const punkteVon = (name) => [...svg.querySelectorAll(`[data-anchor~="${CSS.escape(name)}"]`)]
    .flatMap((el) => (el.matches(GEO_SEL) ? [el] : [...el.querySelectorAll(GEO_SEL)]))
    .flatMap(abtasten);
  // Farbe wird GEERBT, nicht angegeben (Leon-Entscheid 18.08.): ein Callout an einem roten
  // Gegenstand ist rot. Damit entsteht Imprints Kopplung von Text und Bild, ohne eine
  // zweite Farbachse neben ich/es/ueberich aufzumachen — die Karte könnte sonst dieselbe
  // Farbe zweierlei sagen lassen.
  // Die Zugehörigkeit steht an den Objekten auf MEHREREN Attributen — nicht aus Unordnung,
  // sondern weil verschiedene Mechanismen sie brauchen: `data-ton` färbt Text, `data-glow`
  // und `data-glow-fill` bestimmen, was beim Puls aufglüht. Gemessen an biology.neuron:
  //   node:dendrit → data-ton        node:soma → data-glow-fill    node:synapse → data-glow-fill
  // Nur `data-ton` zu lesen ließ zwei von drei Ankern farblos; der Callout an der Synapse
  // blieb weiß und das sah nach einem Designfehler aus, war aber ein Leseloch.
  // Letzte Quelle ist der Label-Platz, der auf denselben Anker zeigt: trägt das Objekt
  // selbst keinen Ton, hat ihn seine Beschriftung.
  const tonVon = (name) => {
    for (const el of svg.querySelectorAll(`[data-anchor~="${CSS.escape(name)}"]`)) {
      const t = el.dataset.ton || el.dataset.glow || el.dataset.glowFill;
      if (t) return t;
    }
    for (const el of svg.querySelectorAll(`[data-anchor-ref="${CSS.escape(name)}"][data-ton]`))
      return el.dataset.ton;
    return null;
  };

  const SIZE = 10.5, ZEILE = boxH(SIZE), RAND = 4;
  // Ein Callout braucht MEHR Luft als ein freier Text. LUFT_Y = 2 ist für Kurven-Labels
  // richtig (dort ist der Platz knapp und Text neben Text liest sich als zwei Texte); ein
  // Kasten mit Kante zwei Pixel unter einer Beschriftung liest sich dagegen als deren
  // Unterzeile — gemessen am Neuron: Slot-Label endete bei y=48, der Kasten begann bei 50.
  const LUFT_CX = 10, LUFT_CY = 9;
  const inBild = (r) => cornersOf(r).every(([x, y]) =>
    x >= vb.x + RAND && x <= vb.x + vb.width - RAND && y >= vb.y + RAND && y <= vb.y + vb.height - RAND);
  const RICHTUNG = [[0, -1], [0, 1], [1, 0], [-1, 0], [0.71, -0.71], [0.71, 0.71], [-0.71, -0.71], [-0.71, 0.71]];
  // Der Callout sucht den FREIEN RAUM, nicht die engste Lage am Objekt — die umgekehrte
  // Regel zur Note (Leon-Entscheid 18.08. nach Vergleich beider Fassungen am Neuron).
  // Begründung ist die Referenz selbst: bei Imprint steht die Beschriftung außen im
  // Freiraum und zeigt mit einer ruhigen Linie ins Bild („Head High", „Microexpressions",
  // „Limit The Fidget"). Drei Folgen: Kandidaten reichen bis 82 statt 40 Einheiten weit,
  // der Score belohnt Abstand zur Geometrie statt Nähe zum Anker, und der Leader ist das
  // Regelmittel mit eigenem, größerem Deckel.
  const ABSTAND = [10, 14, 19, 25, 32, 40, 52, 66, 82];
  // Kein `diagonal()` für Callouts: die Diagonal-Pflicht schützt Kurvenkarten davor, dass
  // ein waagerechter Strich wie ein Achsen-Strich gelesen wird. Auf einer Objektkarte gibt
  // es keine Achse — und bei Imprint laufen genau diese Leader waagerecht ins Bild.
  const LEAD_C = 95;

  // ——— Klammer: ein Maß über eine Spanne aus ZWEI Ankern ———
  // Warum es dieses Primitiv braucht: ein Callout an einer großen Kontur ist unbestimmt.
  // Am Eisberg landete „WAS ICH ZEIGE" unter Wasser, weil `node:berg` das ganze Objekt
  // ist und keine Stelle bezeichnet — der Solver fand unten genauso viel Nähe wie oben.
  // Eine Spanne dagegen ist wohldefiniert, sobald die Regel es ist:
  //
  //   Achse   = die Richtung, in der A am weitesten ÜBER B hinausragt.
  //   von-Ende= die Außenkante von A auf dieser Achse, in Richtung des Überstands.
  //   bis-Ende= die Kante von B, die diesem Überstand zugewandt ist.
  //
  // Das ist genau, was eine Maßklammer tut: von der Außenkante des ersten Objekts bis zur
  // zugewandten Kante des zweiten. Am Eisberg ergibt das Spitze → Wasserlinie, also die
  // Strecke über Wasser — dieselbe Aussage wie Imprints „What I Know". Keine Heuristik,
  // keine Sonderfälle je Karten-Typ.
  //
  // Die naheliegende Regel über SCHWERPUNKTE scheitert hier, und zwar sichtbar: `waterline`
  // markiert am Eisberg nicht die Linie, sondern die ganze Wasserfläche. Ihr Schwerpunkt
  // liegt fast auf dem des Bergs, die Richtungsbestimmung wird degeneriert, und die
  // Klammer landete waagerecht über der Bergspitze. Der Überstand ist unempfindlich
  // dagegen: über die Wasserfläche ragt der Berg nur nach OBEN hinaus (225 Einheiten),
  // seitlich gar nicht.
  const spanne = (ptsA, ptsB) => {
    const bereich = (p, i) => [Math.min(...p.map((q) => q[i])), Math.max(...p.map((q) => q[i]))];
    let best = null;
    for (const achse of [0, 1]) {
      const [a0, a1] = bereich(ptsA, achse), [b0, b1] = bereich(ptsB, achse);
      const nachVorn = b0 - a0;             // A ragt zu kleineren Werten hinaus (oben/links)
      const nachHinten = a1 - b1;           // A ragt zu größeren Werten hinaus (unten/rechts)
      const vorn = nachVorn >= nachHinten;
      const betrag = vorn ? nachVorn : nachHinten;
      if (!best || betrag > best.betrag) best = { achse, betrag, a: vorn ? a0 : a1, b: vorn ? b0 : b1 };
    }
    return best;
  };

  // Zwei Ebenen: eine Zone ist eine FLÄCHE und muss hinter alles andere, sonst deckt sie
  // die Gegenstände zu, die sie zusammenfasst. Der Rest liegt darüber.
  const unten = [], raus = [];
  const bbox = (pts) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  for (const [ai, an] of plan.entries()) {
    if (an.art === "ring") {
      // Reiner Marker: „hier hinschauen". Er trägt bewusst KEINEN Text — bei Imprint
      // (Karte 03, Macroexpressions) umschließt der Ring die Stelle und ein separates
      // Label benennt sie. Wer beschriften will, setzt zusätzlich ein callout auf denselben
      // Anker; so bleibt jedes Primitiv bei einer Aufgabe.
      const pts = punkteVon(an.an);
      if (!pts.length) continue;
      const b = bbox(pts);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      // Der Ring umschließt, er weicht nicht aus: seine Lage ist durch den Gegenstand
      // bestimmt, es gibt hier nichts zu suchen. Radius mit Luft, damit er die Kontur
      // nicht berührt und nicht als deren Teil gelesen wird.
      const rx = (b.x1 - b.x0) / 2 + 7, ry = (b.y1 - b.y0) / 2 + 7;
      const ton = tonVon(an.an);
      const anker = `annot:ring-${ai}`;
      raus.push(`<ellipse class="c-ring"${AN(anker)} data-label-anchor="${an.an}" cx="${cx.toFixed(1)}"`
        + ` cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="none"`
        + ` stroke="${ton ? C(ton) : C("ink")}"/>`);
      continue;
    }
    if (an.art === "pfeil") {
      // Gerichtete Wirkung: A wirkt auf B. Ansatz und Ziel sind das NÄCHSTE Punktepaar
      // beider Konturen — der kürzeste Weg zwischen den Gegenständen ist der, den das
      // Auge ohnehin zieht. Beide Enden rücken ab, damit der Pfeil neben den Objekten
      // steht statt in ihnen zu stecken.
      const pA = punkteVon(an.von), pB = punkteVon(an.bis);
      if (!pA.length || !pB.length) continue;
      let best = null;
      for (const a of pA) for (const b of pB) {
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (!best || d < best.d) best = { d, a, b };
      }
      if (!best || best.d < 12) continue;            // zu dicht beieinander für einen Weg
      const ux = (best.b[0] - best.a[0]) / best.d, uy = (best.b[1] - best.a[1]) / best.d;
      const x1 = best.a[0] + ux * 5, y1 = best.a[1] + uy * 5;
      const x2 = best.b[0] - ux * 8, y2 = best.b[1] - uy * 8;
      // Zeichnet die Karte den Weg schon, ist der Pfeil redundant — er läge als zweite
      // Linie auf der ersten. Am Neuron verbindet das Axon Soma und Synapse bereits.
      //
      // Die Karte SAGT selbst, welche Anker sie verbindet: die Puls-Routen tragen
      // `data-link="a>b"`. Das ist die verlässliche Auskunft — geometrisch ist sie kaum zu
      // haben, weil die gerade Verbindung zweier Konturen nicht auf dem geschwungenen Weg
      // liegt, den die Karte zeichnet (am Neuron das Axon). Ein Anteilsmaß ließ den
      // Axon-Pfeil deshalb durch.
      const verbunden = [...svg.querySelectorAll("[data-link]")].some((el) => {
        const [p1, p2] = (el.getAttribute("data-link") || "").split(">");
        return (p1 === an.von && p2 === an.bis) || (p1 === an.bis && p2 === an.von);
      });
      if (verbunden) continue;
      // Zusätzlich geometrisch: liegt der Weg über weite Strecken AUF Geometrie, wäre er
      // eine zweite Linie auf der ersten. Gemessen wird der Anteil, nicht die Berührung —
      // `leaderFree` prüft KREUZUNGEN, und eine Kreuzung ist unvermeidbar: zwischen zwei
      // Waagschalen liegt immer der Balken.
      const wegN = Math.max(8, Math.ceil(best.d / 4));
      let drauf = 0;
      for (let k = 0; k <= wegN; k++) {
        const px = x1 + (x2 - x1) * (k / wegN), py = y1 + (y2 - y1) * (k / wegN);
        if (hindernis.some(([hx, hy]) => Math.hypot(hx - px, hy - py) < 3)) drauf++;
      }
      if (drauf / (wegN + 1) > 0.6) continue;
      const ton = tonVon(an.von) || tonVon(an.bis);
      const fill = ton ? C(ton) : C("ink");
      const anker = `annot:pfeil-${ai}`;
      // Spitze als Dreieck am Ziel: ein `marker` bräuchte eine defs-Definition je Farbe.
      const sp = 4.5;
      const spitze = `${x2 + ux * 7},${y2 + uy * 7} ${x2 - uy * sp},${y2 + ux * sp} ${x2 + uy * sp},${y2 - ux * sp}`;
      raus.push(`<line class="c-pfeil"${AN(anker)} x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"`
        + ` x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${fill}"/>`
        + `<polygon class="c-pfeilspitze"${AN(anker)} points="${spitze}" fill="${fill}"/>`);
      if (an.text) {
        // Beschriftung neben der Mitte des Wegs, über denselben Solver wie alles andere.
        const w = measure(an.text, SIZE, 600), h = ZEILE;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const kand = [];
        for (const [dx, dy] of RICHTUNG) for (const ab of [9, 13, 18, 24, 32]) {
          const r = rect(mx + dx * (ab + w / 2), my + dy * (ab + h / 2), w, h);
          kand.push({ r, ab });
        }
        kand.sort((x, y) => (x.ab - distPix(x.r, hindernis)) - (y.ab - distPix(y.r, hindernis)));
        const wahl = platziere(kand, {
          frei: (c) => inBild(c.r) && !hitPlaced(c.r, LUFT_CX, LUFT_CY)
            && !hitPix(grow(c.r, 2), hindernis) && !aufFremderFlaeche(c.r, [])
        });
        if (wahl && inBild(wahl.r) && !aufFremderFlaeche(wahl.r, [])) {
          put(wahl.r);
          raus.push(textSvg(wahl.r, SIZE, an.text, "c-callout-text", fill,
            AN(anker) + ` data-label-anchor="${an.von}"`));
        }
      }
      continue;
    }
    if (an.art === "zone") {
      // Benannte Hülle um mehrere Gegenstände: „diese gehören zusammen und heißen X".
      // Imprints „Now"-Feld (Karte 02) ist genau das — eine farbige Fläche mit Namen, in
      // der Tasse, Würfel und Gehirn liegen.
      const pts = (an.umfasst || []).flatMap(punkteVon);
      if (!pts.length) continue;
      const b = bbox(pts);
      const PAD = 10;
      const x = b.x0 - PAD, y = b.y0 - PAD, w2 = (b.x1 - b.x0) + 2 * PAD, h2 = (b.y1 - b.y0) + 2 * PAD;
      const ton = (an.umfasst || []).map(tonVon).find(Boolean);
      const fill = ton ? C(ton) : C("ink");
      const anker = `annot:zone-${ai}`;
      unten.push(`<rect class="c-zone"${AN(anker)} x="${x.toFixed(1)}" y="${y.toFixed(1)}"`
        + ` width="${w2.toFixed(1)}" height="${h2.toFixed(1)}" rx="6"`
        + ` fill="${ton ? SOFT(ton) : C("line")}"/>`);
      // Der Name gehört an eine KANTE der Zone — dort liest er sich als ihr Name und nicht
      // als Beschriftung von irgendetwas darin. Welche Kante, entscheidet der Solver:
      // fest an die Oberkante gesetzt landete er am Neuron unter „REIZE KOMMEN AN" und
      // prüfte dabei nichts.
      const tw = measure(an.text, SIZE, 600);
      const ecken = [
        [x + tw / 2 + 7, y + ZEILE / 2 + 3], [x + w2 - tw / 2 - 7, y + ZEILE / 2 + 3],
        [x + tw / 2 + 7, y + h2 - ZEILE / 2 - 3], [x + w2 - tw / 2 - 7, y + h2 - ZEILE / 2 - 3],
        [x + tw / 2 + 7, y - ZEILE / 2 - 2], [x + w2 - tw / 2 - 7, y - ZEILE / 2 - 2],
        [x + tw / 2 + 7, y + h2 + ZEILE / 2 + 2], [x + w2 - tw / 2 - 7, y + h2 + ZEILE / 2 + 2]
      ].map(([cx2, cy2]) => ({ r: rect(cx2, cy2, tw, ZEILE) }));
      const wahlZ = platziere(ecken, {
        frei: (c) => inBild(c.r) && !hitPlaced(c.r, LUFT_CX, LUFT_CY) && !hitPix(grow(c.r, 2), hindernis),
        schaden: (c) => (inBild(c.r) ? schadenVon(c.r, hindernis) : null)
      });
      if (wahlZ && inBild(wahlZ.r)) {
        put(wahlZ.r);
        raus.push(textSvg(wahlZ.r, SIZE, an.text, "c-callout-text", fill, AN(anker)));
      }
      continue;
    }
    if (an.art === "klammer") {
      const ptsA = punkteVon(an.von), ptsB = punkteVon(an.bis);
      if (!ptsA.length || !ptsB.length) continue;    // unbekannter Anker — der Validator lehnt ihn ab
      const { achse, a, b } = spanne(ptsA, ptsB);
      const v0 = Math.min(a, b), v1 = Math.max(a, b);
      if (v1 - v0 < 14) continue;                    // zu kurz für ein Maß, das man lesen kann
      const quer = 1 - achse;
      // Die Klammer steht NEBEN der Spanne, nicht darauf — und zwar neben dem GEMESSENEN
      // Objekt (A). Nähme man beide Anker als Bezug, spannte sie am Eisberg über die volle
      // Wasserfläche und stünde am Kartenrand statt am Berg.
      const qMin = Math.min(...ptsA.map((p) => p[quer])), qMax = Math.max(...ptsA.map((p) => p[quer]));
      const ton = tonVon(an.von) || tonVon(an.bis);
      const fill = ton ? C(ton) : C("ink");
      const anker = `annot:${ankerSlug(an.text, String(ai))}`;
      const w = measure(an.text, SIZE, 600), h = ZEILE;
      const kand = [];
      for (const seite of [1, -1]) for (const ab of [10, 16, 24, 34, 46, 60]) {
        const q = seite > 0 ? qMax + ab : qMin - ab;
        // Textlage: an der Klammer, außen — konstruktiv gebunden, sie sucht sich nichts
        // Eigenes. Angeboten werden drei Höhen: Mitte der Spanne und beide Enden. Nur die
        // Mitte anzubieten hieß am Eisberg, dass rechts nichts passte (der Text lief über
        // den Kartenrand) und links der Zonen-Text „BEWUSST" im Weg stand.
        const tq = q + seite * (8 + (achse === 1 ? w / 2 : h / 2));
        for (const tv of [(v0 + v1) / 2, v0 + h / 2, v1 - h / 2]) {
          const r = achse === 1 ? rect(tq, tv, w, h) : rect(tv, tq, w, h);
          kand.push({ r, q, seite, ab });
        }
        // Zweite Form: Text AM ENDE der Klammer, quer zu ihr statt neben ihr. Seitlich
        // braucht er seine volle Breite neben dem Objekt — am Eisberg sind das 75
        // Einheiten, während links 90 und rechts 65 frei sind: auf keiner Seite genug,
        // die Klammer fiel ganz aus. Über dem Ende steht er mittig auf der Klammer und
        // darf nach beiden Seiten überhängen.
        for (const tv of [v0 - h, v1 + h]) {
          const r = achse === 1 ? rect(q, tv, w, h) : rect(tv, q, w, h);
          kand.push({ r, q, seite, ab });
        }
      }
      // Rangfolge: nah am Objekt, aber im freien Raum. Ungeordnet gewann die erste freie
      // Lage der Liste — am Eisberg landete der Text dadurch auf dem blauen Wasserband,
      // dunkel auf dunkel. Eine gefüllte Fläche ist nämlich kein Hindernis, nur ihre
      // Kontur (bei Asset-Notes ist das gewollt: die Note gehört IN ihre Fläche). Hier
      // ersetzt der Freiraum-Abstand dieses Urteil.
      kand.sort((x, y) => (x.ab * 0.5 - distPix(x.r, hindernis)) - (y.ab * 0.5 - distPix(y.r, hindernis)));
      // Für die Klammer sind ALLE gefüllten Flächen tabu, auch die ihrer eigenen Anker:
      // sie misst eine Strecke ZWISCHEN Objekten, ihr Text gehört in keins davon. Beim
      // Callout gilt das Gegenteil (er bezeichnet ein Objekt und darf darin liegen) —
      // am Eisberg trägt das Wasserband selbst den Anker `waterline`, der Text lag also
      // formal auf seiner „eigenen" Fläche und blieb trotzdem unlesbar.
      const frei = (c) => inBild(c.r) && !hitPlaced(c.r, LUFT_CX, LUFT_CY) && !hitPix(grow(c.r, 2), hindernis)
        && !aufFremderFlaeche(c.r, []);
      // Die Klammerlinie selbst wird NICHT gegen die Geometrie geprüft: sie endet per
      // Konstruktion an ihrem `bis`-Anker und muss ihn deshalb berühren. Diese Prüfung
      // schloss am Eisberg jede Lage aus (die Linie endet auf der Wasserlinie), worauf der
      // Notnagel griff — und der kannte nur `inBild`, also landete der Text doch auf der
      // Fläche. Der Notnagel trägt die Flächenregel jetzt mit; bleibt nichts übrig, wird
      // nicht gezeichnet.
      const wahl = platziere(kand, { frei,
        schaden: (c) => ((inBild(c.r) && !aufFremderFlaeche(c.r, [])) ? schadenVon(c.r, hindernis) : null) });
      // Ein Maß, das über den Rand läuft, ist schlimmer als keins: `platziere` gibt als
      // letzten Ausweg den ersten Kandidaten zurück (für einen Callout richtig — irgendwo
      // stehen schlägt fehlen). Hier wird lieber nichts gezeichnet; genau so lief der Text
      // am Eisberg zuerst rechts aus der Karte.
      if (!wahl || !inBild(wahl.r) || aufFremderFlaeche(wahl.r, [])) continue;
      put(wahl.r);
      // Eckige Klammer mit Haken ZUM Objekt hin: die Haken sagen, was gemessen wird.
      const hk = 6 * -wahl.seite;
      const d = achse === 1
        ? `M${(wahl.q + hk).toFixed(1)},${v0.toFixed(1)} L${wahl.q.toFixed(1)},${v0.toFixed(1)} `
          + `L${wahl.q.toFixed(1)},${v1.toFixed(1)} L${(wahl.q + hk).toFixed(1)},${v1.toFixed(1)}`
        : `M${v0.toFixed(1)},${(wahl.q + hk).toFixed(1)} L${v0.toFixed(1)},${wahl.q.toFixed(1)} `
          + `L${v1.toFixed(1)},${wahl.q.toFixed(1)} L${v1.toFixed(1)},${(wahl.q + hk).toFixed(1)}`;
      raus.push(`<path class="c-klammer"${AN(anker)} d="${d}" fill="none" stroke="${fill}"/>`
        + textSvg(wahl.r, SIZE, an.text, "c-callout-text", fill,
          AN(anker) + ` data-label-anchor="${an.von}"`));
      continue;
    }
    if (an.art !== "callout") continue;              // ring/pfeil/zone folgen
    const eigen = punkteVon(an.an);
    if (!eigen.length) continue;                     // unbekannter Anker — der Validator lehnt ihn ab
    const fremd = [...new Set(plan.map((p) => p.an).filter((n) => n && n !== an.an))]
      .map(punkteVon).filter((p) => p.length);
    const naechster = (r, pts) => {
      let b = null, bd = Infinity;
      for (const p of pts) { const d = distRect(r, p[0], p[1]); if (d < bd) { bd = d; b = p; } }
      return { p: b, d: bd };
    };
    const schritt = Math.max(1, Math.ceil(eigen.length / 24));
    const saat = eigen.filter((_, i) => i % schritt === 0);
    const w = measure(an.text, SIZE, 600), h = ZEILE;
    const kandidaten = [];
    for (const p of saat) for (const [dx, dy] of RICHTUNG) for (const ab of ABSTAND) {
      const r = rect(p[0] + dx * (ab + (Math.abs(dx) * w + Math.abs(dy) * h) / 2),
                     p[1] + dy * (ab + (Math.abs(dx) * w + Math.abs(dy) * h) / 2), w, h);
      const nah = naechster(r, eigen);
      const braucht = nah.d > LEADER_AB;
      kandidaten.push({ r, dot: nah.p, nah, braucht, g: leaderGeom(r, nah.p),
        score: nah.d * 0.45 - distPix(r, hindernis) });
    }
    kandidaten.sort((a, b) => a.score - b.score);
    const eigeneEls = elementeVon(an.an);
    const frei = (c) => inBild(c.r) && !hitPlaced(c.r, LUFT_CX, LUFT_CY) && !hitPix(grow(c.r, 2), hindernis)
      && !aufFremderFlaeche(c.r, eigeneEls)
      && (!c.braucht || (leaderLen(c.g) <= LEAD_C && leaderFree(c.g, hindernis)));
    const eindeutig = (c) => fremd.every((pts) => naechster(c.r, pts).d >= c.nah.d - 1.5);
    const wahl = platziere(kandidaten, { frei, eindeutig,
      schaden: (c) => (inBild(c.r) ? schadenVon(c.r, hindernis) + c.score * 0.05 : null) });
    if (!wahl) continue;
    put(wahl.r);
    const ton = tonVon(an.an);
    const fill = ton ? C(ton) : C("ink");
    const anker = `annot:${ankerSlug(an.text, String(ai))}`;
    const leader = wahl.braucht && leaderLen(wahl.g) <= LEAD_C ? wahl.g : null;
    // Punkt AM Gegenstand — dasselbe Bindungs-Vokabular, das Asset- und Kurven-Notes
    // benutzen. Ohne ihn schwebt der Kasten: er lag am Neuron zwei Pixel unter einem
    // fremden Slot-Label und las sich als dessen Unterzeile, weil nichts ihn mit dem
    // Dendriten verband. Der Leader bleibt die Degradation für größere Abstände.
    const dot = `<circle class="c-notedot"${AN(anker)} data-label-anchor="${an.an}"`
      + `${ton ? GLOW(ton) : ""} cx="${wahl.dot[0].toFixed(1)}" cy="${wahl.dot[1].toFixed(1)}" r="3" fill="${fill}"/>`;
    // Gefüllter Kasten statt blankem Text: das ist Imprints Callout — die Beschriftung
    // ist ein eigenes Objekt auf dem Bild, keine zweite Bildschrift.
    raus.push(dot
      + `<rect class="c-callout"${AN(anker)} x="${(wahl.r.cx - wahl.r.w / 2 - 5).toFixed(1)}"`
      + ` y="${(wahl.r.cy - wahl.r.h / 2 - 2).toFixed(1)}" width="${(wahl.r.w + 10).toFixed(1)}"`
      + ` height="${(wahl.r.h + 4).toFixed(1)}" rx="3" fill="${ton ? SOFT(ton) : C("card")}"/>`
      + leaderSvg(leader, anker, "", "leader-c")
      + textSvg(wahl.r, SIZE, an.text, "c-callout-text", fill, AN(anker) + ` data-label-anchor="${an.an}"`));
  }
  // Zonen zuerst und ganz nach hinten: `afterbegin` legt sie unter die Karten-Geometrie,
  // damit die Fläche die Gegenstände nicht zudeckt, die sie zusammenfasst.
  if (unten.length) svg.insertAdjacentHTML("afterbegin", unten.join("\n"));
  if (raus.length) svg.insertAdjacentHTML("beforeend", raus.join("\n"));
}

function renderCardInto(root, card, opts = {}) {
  seqStop();                                        // laufende Sequenz der Vorgänger-Karte abbrechen
  root.innerHTML = RENDERERS[card.type](card);
  wireAnnotations(root, card);                      // vor wireSequence: die Schicht bringt eigene Anker mit
  if (card.type === "quiz") wireQuiz(root, card, opts.onAdvance, opts.onQuizResult);
  const save = root.querySelector(".savebtn");
  if (save) save.addEventListener("click", (e) => {
    e.stopPropagation();
    save.classList.toggle("saved");
    if (opts.onSave) opts.onSave(save.classList.contains("saved"));
  });
  wireSequence(root, card);
}
