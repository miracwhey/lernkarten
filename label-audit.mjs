// EIN Prüf-Chokepoint für Kurven-Karten: audit-lesson.mjs und adversarial.mjs messen
// mit DERSELBEN Funktion im DOM. Zwei Kopien wären zwei Gates, die auseinanderlaufen —
// und ein Befund, den nur eines von beiden sieht.
//
// Die Funktion läuft IM Browser (page.evaluate) und ist deshalb selbstgenügsam: keine
// Imports, alle Helfer im Rumpf. Gemessen wird ausschließlich am GEZEICHNETEN Objekt
// (getBBox + CTM, Polyline-Punkte über getPointAtLength) — die Label-Geometrie wird
// nie ein zweites Mal berechnet, sonst prüfte das Gate seine eigene Rechnung.
//
// Befund-Arten:
//   CLIP/TEXT²/PATH/GEOM — Text ragt raus, Texte überlappen, Text auf Geometrie
//   ZUORD                — Label liegt näher an einer fremden Serie als an der eigenen
//   LEAD                 — Leader zu steil/flach oder länger als der Deckel
//   STICKY               — die Bindung Serien-Label ↔ eigener Strich ist verletzt
//   INFO                 — beschreibend, kein Fehler (Bandlage, Degradation)
// Nur im Schritt-Modus (seqStep):
//   SEQ                  — der verlangte Schritt wurde gar nicht eingenommen
//   LEER                 — sichtbares Label ohne sichtbaren Bezug (Leader ins Leere)
//   PULS                 — der Puls-Punkt ist im eingefrorenen Zustand sichtbar
//   DASH                 — der Zug hat die Gestaltungs-Strichelung aufgefressen
//
// `seqStep` (0 = Ausgangszustand, N = nach dem letzten Schritt) misst den ENDZUSTAND
// eines Sequenz-Schritts. OHNE seqStep bleibt der Bestandspfad unberührt: dieselbe
// Render-Zeile, dieselben Element-Mengen, dieselben Zahlen — jede Erweiterung unten
// hängt an `SEQ` und ist im Bestandsfall die Identität.
export const auditCurveCard = ({ card, limits, seqStep }) => {
  // nah/winkel = harte Grenzen (auch die degradierte Lage muss sie halten),
  // nahIdeal/winkelIdeal = die Regellage; dazwischen meldet das Gate INFO statt Fehler.
  const L = Object.assign({ nah: 17, nahIdeal: 11, winkel: 19, winkelIdeal: 14, leader: 40 }, limits || {});
  const RAD = Math.PI / 180;
  const SEQ = seqStep != null;
  // Der Schritt-Modus rendert über den ECHTEN Karten-Pfad: `renderCardInto` verdrahtet
  // die Sequenz, ein blankes innerHTML tut das nicht — gemessen würde sonst immer der
  // Zustand „alles sichtbar", also genau das, was das Schritt-Gate finden soll.
  let cur = null, steps = 0;
  if (SEQ) {
    renderCardInto(area, card, { onAdvance: () => {} });
    steps = window.__seqSteps;
    cur = window.__seqGoto(seqStep);
  } else area.innerHTML = RENDERERS[card.type](card);
  const svg = document.querySelector(".diagram svg");
  if (!svg) return { out: null, ast: null, cur, steps };   // reine HTML-Karte — kein Geometrie-Audit
  const vb = svg.viewBox.baseVal;
  const out = [];
  // Ein Schritt-Lauf, der den Schritt nicht einnimmt, misst still den falschen Zustand
  // und meldete „OK" für ein Bild, das nie geprüft wurde.
  if (SEQ) {
    const soll = Array.isArray(card.sequence) ? card.sequence.length : 0;
    if (steps !== soll) out.push(`SEQ   __seqSteps=${steps}, der Contract nennt ${soll} Schritte`);
    if (cur !== seqStep) out.push(`SEQ   Schritt ${seqStep} nicht eingenommen (__seqGoto meldet ${cur})`);
  }

  // ——— Sichtbarkeit: gemessen wird, was der Nutzer in DIESEM Zustand sieht ———
  // Ein noch nicht erreichter Schritt steht auf opacity:0, der Puls-Punkt ist im
  // eingefrorenen Bild unsichtbar, ein Halo glüht nur mit `.lit`. Gelesen wird die
  // BERECHNETE Deckkraft die Elternkette hoch — nicht die Klassenliste: eine Klasse ist
  // eine Absicht, die Deckkraft das Ergebnis. `.seq-dim` bleibt sichtbar (es färbt über
  // `filter`, nicht über opacity) — zurückgenommen ist nicht weg und kollidiert weiter.
  const deckkraft = (el) => {
    let o = 1;
    for (let e = el; e && e !== svg.parentNode; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      o *= parseFloat(cs.opacity);
      if (!(o > 0.05)) return 0;
    }
    return o;
  };
  // Ein seq-Halo ist die Aura SEINES Elements — ein Klon derselben Geometrie. Als
  // eigenes Objekt gezählt wäre es ein Fremd-Overlap, den niemand sieht; das Element
  // darunter wird ohnehin gemessen.
  const sichtbar = (el) => !SEQ || (!el.classList.contains("seq-halo") && deckkraft(el) > 0);
  const sichtbare = (sel) => [...svg.querySelectorAll(sel)].filter(sichtbar);

  // ——— Messwerkzeug ———
  // Textkörper als ORIENTIERTES Rechteck: getBBox liefert die Box im lokalen System des
  // Elements. Ein sticky Label ist gedreht — seine achsparallele Hülle wäre an einer
  // 25°-Kurve ein Vielfaches zu groß und meldete Treffer, die der Text nie hat.
  const obbOf = (el) => {
    const b = el.getBBox();
    // Ein aufgeglühtes Label (`.seq-hl.lit`) trägt eine sichtbare Kontur in seinem Ton:
    // die Tinte steht um die halbe Strichstärke über der getBBox-Kante. Der Papier-Halo
    // (.halo) bleibt außen vor — er verdeckt, ohne Farbe hinzuzufügen.
    const p = SEQ && el.classList.contains("seq-hl") && el.classList.contains("lit")
      ? (parseFloat(getComputedStyle(el).strokeWidth) || 0) / 2 : 0;
    const m = svg.getScreenCTM().inverse().multiply(el.getScreenCTM());
    const pt = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    const [cx, cy] = pt(b.x + b.width / 2, b.y + b.height / 2);
    return {
      el, label: el.textContent.trim(), cx, cy, w: b.width + 2 * p, h: b.height + 2 * p,
      deg: Math.atan2(m.b, m.a) / RAD,
      corners: [[b.x - p, b.y - p], [b.x + b.width + p, b.y - p],
        [b.x + b.width + p, b.y + b.height + p], [b.x - p, b.y + b.height + p]]
        .map(([x, y]) => pt(x, y))
    };
  };
  const toLocal = (o, x, y) => {
    const a = o.deg * RAD, c = Math.cos(a), s = Math.sin(a), dx = x - o.cx, dy = y - o.cy;
    return [dx * c + dy * s, dy * c - dx * s];
  };
  const inside = (o, x, y, pad) => {
    const [u, v] = toLocal(o, x, y);
    return Math.abs(u) <= o.w / 2 + pad && Math.abs(v) <= o.h / 2 + pad;
  };
  const dist = (o, x, y) => {
    const [u, v] = toLocal(o, x, y);
    return Math.hypot(Math.max(Math.abs(u) - o.w / 2, 0), Math.max(Math.abs(v) - o.h / 2, 0));
  };
  // Überlappung zweier orientierter Rechtecke (Trennachsen-Test). `schrumpf` erlaubt
  // Anschnitte, die das Auge nicht als Kollision liest.
  const overlap = (A, B, schrumpf) => {
    for (const R of [A, B]) {
      const a = R.deg * RAD;
      for (const ax of [[Math.cos(a), Math.sin(a)], [-Math.sin(a), Math.cos(a)]]) {
        const proj = (o) => {
          const b = o.deg * RAD;
          const hw = Math.max(0, o.w / 2 - schrumpf), hh = Math.max(0, o.h / 2 - schrumpf);
          const e = Math.abs(hw * (Math.cos(b) * ax[0] + Math.sin(b) * ax[1]))
                  + Math.abs(hh * (-Math.sin(b) * ax[0] + Math.cos(b) * ax[1]));
          const c = o.cx * ax[0] + o.cy * ax[1];
          return [c - e, c + e];
        };
        const [a0, a1] = proj(A), [b0, b1] = proj(B);
        if (a1 < b0 || b1 < a0) return false;
      }
    }
    return true;
  };
  // Ein per `trace` gezogener Strich ist nur so weit da, wie die dash-Geometrie ihn
  // zeichnet — der ungezeichnete Rest ist kein Hindernis. Welche Abschnitte gezeichnet
  // sind, sagt das Paar dasharray/dashoffset; abgetastet wird nur in ihnen.
  // NUR für seq-Traces: die Strichelung einer `dash: true`-Serie ist die Gestaltung
  // einer Linie, die ganz da ist — sie wird wie im Bestand über die volle Länge gemessen.
  const spans = (el, len) => {
    if (!SEQ || !el.classList.contains("seq-trace")) return [[0, len]];
    const cs = getComputedStyle(el);
    const roh = (cs.strokeDasharray || "").split(/[\s,]+/).map(parseFloat).filter((n) => Number.isFinite(n) && n >= 0);
    if (!roh.some((n) => n > 0)) return [[0, len]];
    const p = roh.length % 2 ? roh.concat(roh) : roh;     // ungerade Muster wiederholen sich versetzt
    const per = p.reduce((a, b) => a + b, 0);
    const off = ((parseFloat(cs.strokeDashoffset) || 0) % per + per) % per;
    const raus = [];
    for (let at = -off, i = 0; at < len; i++) {
      const bis = at + p[i % p.length];
      if (i % 2 === 0 && Math.min(len, bis) > Math.max(0, at)) raus.push([Math.max(0, at), Math.min(len, bis)]);
      at = bis;
    }
    return raus;
  };
  const sample = (el, step) => {
    const pts = [];
    const len = el.getTotalLength ? el.getTotalLength() : 0;
    if (!len) return pts;
    // Ein platziertes Asset rechnet in EIGENEN Einheiten (eine Asset-Einheit = zwei
    // Karten-Einheiten). Seine Punkte müssen in Karten-Koordinaten stehen, bevor sie
    // mit Text-Boxen oder der viewBox verglichen werden — sonst prüfte das Gate zwei
    // verschiedene Maßsysteme gegeneinander und meldete Nähe, wo Abstand ist.
    // Für alles andere bleibt die Rechnung unverändert: keine Matrix, dieselben Zahlen.
    const imAsset = el.closest && el.closest("[data-asset]");
    const m = imAsset ? svg.getScreenCTM().inverse().multiply(el.getScreenCTM()) : null;
    const skal = m ? (Math.hypot(m.a, m.b) || 1) : 1;
    for (const [a, b] of spans(el, len))
      for (let d = a; d <= b; d += step / skal) {
        const p = el.getPointAtLength(d);
        pts.push(m ? [m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f] : [p.x, p.y]);
      }
    return pts;
  };

  const texts = sichtbare("text").map(obbOf);
  // Die Achse gehört dazu: ein Label auf der x-Achse liest sich als deren Beschriftung.
  // Sie ist ein `path` und fiel deshalb aus der alten Auswahl heraus — das Gate sah
  // die Kollision nicht, weil es an der falschen Stelle suchte.
  //
  // Asset-Karten bringen ihre Geometrie als Teile eines platzierten Objekts mit. Sie
  // gehört genauso zum Bild wie eine Kurve: ein Label, das auf dem Dendriten liegt,
  // ist derselbe Befund wie ein Label auf der Serie. `.a-route` bleibt außen vor — der
  // Puls-Weg wird nie gemalt, er wäre ein Hindernis, das niemand sieht.
  const strokes = sichtbare("polyline, line:not(.leader), path.c-axis, "
    + "[data-asset] path:not(.a-route), [data-asset] line, [data-asset] polygon, [data-asset] circle")
    .map((el) => ({ el, pts: sample(el, 3) }));
  const kurven = sichtbare("polyline[data-series]");
  // Zwei Ebenen: je Serie ALLE Punkte (Abstände) und je Serie die EINZELNEN Striche
  // (Haupt- und Nach-Stop-Ast). Eine Tangente wird entlang EINES Strichs gemessen —
  // über den Knick zwischen beiden hinweg gemittelt ergäbe sie eine dritte Richtung,
  // die keine der beiden ist.
  const bySeries = {}, byStroke = {};
  for (const el of kurven) {
    const k = el.dataset.series, pts = sample(el, 2);
    if (!bySeries[k]) { bySeries[k] = []; byStroke[k] = []; }
    for (const p of pts) bySeries[k].push(p);
    byStroke[k].push(pts);
  }

  // ——— Text: Clipping, Kollision, Geometrie-Treffer ———
  for (const a of texts) {
    if (a.corners.some(([x, y]) => x < vb.x || y < vb.y || x > vb.x + vb.width || y > vb.y + vb.height))
      out.push(`CLIP  "${a.label}"`);
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    if (overlap(texts[i], texts[j], 1)) out.push(`TEXT² "${texts[i].label}" × "${texts[j].label}"`);
  }
  for (const a of texts) for (const s of strokes) {
    // Der Treffpunkt gehört in die Meldung: „Text × polyline" sagt nicht, WO nachzusehen
    // ist, und schickt die Suche in den ganzen Plot.
    const treffer = s.pts.find(([x, y]) => inside(a, x, y, 1.5));
    if (!treffer) continue;
    // Die gestrichelte Ereignis-Linie ist Chrome, kein Inhalt: ein Text MIT Papier-Halo
    // unterbricht sie, statt unter ihr zu verschwinden — das ist eine Lage, kein Fehler.
    // Für Kurven und Achse gilt das NICHT: sie sind die Aussage des Bildes.
    const chrome = s.el.classList.contains("c-stopline") && a.el.classList.contains("halo");
    const wer = s.el.tagName + (s.el.classList.contains("c-axis") ? ".c-axis"
      : s.el.classList.contains("c-stopline") ? ".c-stopline" : s.el.dataset.series !== undefined ? `[Serie ${s.el.dataset.series}]` : "");
    out.push(`${chrome ? "INFO  quert die Ereignis-Linie (Halo): " : "PATH  "}"${a.label}" × ${wer}`
      + ` bei (${treffer[0].toFixed(0)},${treffer[1].toFixed(0)})`);
    break;
  }

  // ——— Geometrie-Clipping: Kurven und Endpunkt-Kugeln müssen in der viewBox liegen ———
  if (kurven.length) {
    for (const el of kurven) {
      const raus = sample(el, 4).find(([x, y]) => x < vb.x || y < vb.y || x > vb.x + vb.width || y > vb.y + vb.height);
      if (raus) out.push(`GEOM  Serie ${el.dataset.series} ragt aus der viewBox (${raus[0].toFixed(0)},${raus[1].toFixed(0)})`);
    }
  }
  // Punkt-Marker stehen in KARTEN-Koordinaten: auf Kurven-Karten die Endpunkt-Kugeln,
  // auf Asset-Karten der Note-Punkt. Ohne Kurven lief diese Prüfung bisher gar nicht —
  // ein Note-Punkt am Kartenrand wäre unbemerkt abgeschnitten. Asset-TEILE bleiben außen
  // vor: sie tragen den Maßstab ihrer Gruppe und werden unten mit CTM gemessen.
  for (const el of sichtbare(kurven.length ? "circle" : "circle.c-notedot")) {
    if (el.closest("[data-asset]")) continue;
    const cx = +el.getAttribute("cx"), cy = +el.getAttribute("cy"), r = +el.getAttribute("r");
    if (cx - r < vb.x || cy - r < vb.y || cx + r > vb.x + vb.width || cy + r > vb.y + vb.height)
      out.push(`GEOM  Punkt (${cx.toFixed(0)},${cy.toFixed(0)}) ragt aus der viewBox`);
  }

  // ——— Asset-Geometrie: das Objekt muss in der viewBox liegen ———
  // Dieselbe Regel wie für Kurven, nur für das platzierte Objekt: was über den Rand
  // ragt, ist abgeschnitten — unabhängig davon, ob ein Label betroffen ist.
  for (const el of sichtbare("[data-asset] path:not(.a-route), [data-asset] line, [data-asset] polygon, [data-asset] circle")) {
    const raus = sample(el, 4).find(([x, y]) => x < vb.x || y < vb.y || x > vb.x + vb.width || y > vb.y + vb.height);
    if (raus) out.push(`GEOM  Asset-Teil <${el.tagName}> ragt aus der viewBox (${raus[0].toFixed(0)},${raus[1].toFixed(0)})`);
  }

  // ——— Leader: Winkel UND Länge ———
  // Der Deckel ist die eigentliche Regel: ein 150-px-Strich quer durchs Bild verbindet
  // formal, wird aber als eigene Geometrie gelesen statt als Zeigefinger.
  for (const l of sichtbare("line.leader")) {
    const dx = Math.abs(+l.getAttribute("x2") - +l.getAttribute("x1"));
    const dy = Math.abs(+l.getAttribute("y2") - +l.getAttribute("y1"));
    const deg = Math.atan2(dy, dx) / RAD, len = Math.hypot(dx, dy);
    if (deg > 75 || deg < 15) out.push(`LEAD  Leader verläuft ${deg.toFixed(0)}° (erlaubt 15–75°)`);
    if (len > L.leader + 1) out.push(`LEAD  Leader ist ${len.toFixed(0)} px lang (Deckel ${L.leader} px)`);
  }

  // ——— Zuordenbarkeit: Abstand Label→eigene Serie vs. Label→fremde Serie ———
  const wolke = (pts, x0, x1) => pts.filter(([x]) => x >= x0 && x <= x1);
  const naechster = (pts, a) => {
    let d = Infinity, bi = -1;
    pts.forEach(([x, y], i) => { const q = dist(a, x, y); if (q < d) { d = q; bi = i; } });
    return { d, i: bi };
  };
  for (const a of texts) {
    const own = a.el.dataset.seriesLabel ?? a.el.dataset.noteSeries;
    if (own === undefined || Object.keys(bySeries).length < 2) continue;
    // Ist die eigene Serie in diesem Schritt gar nicht gezeichnet, gibt es keinen
    // Abstand zu ihr — das ist kein Zuordnungs-, sondern ein LEER-Befund (unten).
    if (SEQ && !(bySeries[own] || []).length) continue;
    const dOwn = naechster(bySeries[own] || [], a).d;
    let dOther = Infinity, whoOther = null;
    for (const k of Object.keys(bySeries)) if (k !== own) {
      const d = naechster(bySeries[k], a).d;
      if (d < dOther) { dOther = d; whoOther = k; }
    }
    if (dOther >= dOwn - 1) continue;
    const A = wolke(bySeries[own] || [], a.cx - a.w / 2 - 24, a.cx + a.w / 2 + 24);
    const B = wolke(bySeries[whoOther], a.cx - a.w / 2 - 24, a.cx + a.w / 2 + 24);
    let sep = Infinity;
    for (const p of A) for (const q of B) sep = Math.min(sep, Math.hypot(p[0] - q[0], p[1] - q[1]));
    const txt = `"${a.label}" (Serie ${own}) liegt näher an Serie ${whoOther} (${dOther.toFixed(1)} < ${dOwn.toFixed(1)} px), Serienabstand dort ${sep.toFixed(1)} px`;
    // Drei Lagen sind KEIN Fehler und deshalb INFO: (1) Serienabstand < 10 px — die
    // Kurven sind dort optisch ein Band (Strichstärke 3), keine Lage wäre eindeutig.
    // (2) Das Label trägt einen Leader — der gezeichnete Strich macht die Zuordnung
    // explizit; „schwebt zwischen zwei Kurven" trifft nur unverbundene Labels.
    // (3) Die Note ist unter dem Ereignis-Label auf die Stop-Linie gestapelt: ihre
    // Bindung ist die Linie, an der beide Texte hängen, nicht die Nähe zur Kurve.
    const perLeader = a.el.dataset.leader === "1";
    const gestapelt = a.el.dataset.stacked === "1";
    out.push((sep < 10 ? "INFO  " : perLeader ? "INFO  Leader-verbunden, "
      : gestapelt ? "INFO  auf die Ereignis-Linie gestapelt, " : "ZUORD ") + txt);
  }

  // ——— Sticky-Gate: die drei Regeln der Serien-Label-Bindung ———
  // NAH (Box am eigenen Strich) · PARALLEL (Box auf dessen Tangente) · NICHTS DAZWISCHEN
  // (keine fremde Kurve in der Lücke). Alle drei am gerenderten DOM gemessen.
  const TAN_WIN = 9;   // ±9 Stützstellen à 2 px ≈ das ±3-Punkte-Fenster des Renderers
  const tangente = (pts, i) => {
    const a = pts[Math.max(0, i - TAN_WIN)], b = pts[Math.min(pts.length - 1, i + TAN_WIN)];
    return Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD;
  };
  const deltaDeg = (x, y) => Math.abs((((x - y) % 360) + 540) % 360 - 180);
  for (const a of texts) {
    const si = a.el.dataset.seriesLabel;
    if (si === undefined) continue;
    const own = bySeries[si] || [];
    if (own.length < 2) continue;
    const nah = naechster(own, a);
    // Nächster Punkt innerhalb SEINES Strichs — dort wird die Tangente gemessen.
    let strich = null, si2 = -1, sd = Infinity;
    for (const pts of byStroke[si] || []) {
      const n = naechster(pts, a);
      if (n.i >= 0 && n.d < sd) { sd = n.d; strich = pts; si2 = n.i; }
    }
    const winkel = strich && strich.length > 1 ? deltaDeg(a.deg, tangente(strich, si2)) : 0;
    const fremdKeys = Object.keys(bySeries).filter((k) => k !== si);
    let dOther = Infinity, wer = null;
    for (const k of fremdKeys) { const d = naechster(bySeries[k], a).d; if (d < dOther) { dOther = d; wer = k; } }
    // Lücke zwischen der zum Strich zeigenden Textkante und dem eigenen Strich, im
    // gedrehten Rahmen des Labels gemessen.
    const [, vOwn] = toLocal(a, own[nah.i][0], own[nah.i][1]);
    const kante = vOwn > 0 ? a.h / 2 : -a.h / 2;
    let dazwischen = null;
    for (const k of fremdKeys) for (const [x, y] of bySeries[k]) {
      const [u, v] = toLocal(a, x, y);
      if (Math.abs(u) > a.w / 2) continue;
      // Läuft der eigene Strich mehrfach durch diese Spalte (Reset-Ast kehrt zurück),
      // zählt der Ast, an dem das Label KLEBT — der andere spannte ein Intervall quer
      // durchs Bild auf und erklärte jede fremde Kurve zum Zwischenläufer. Endet der
      // eigene Strich vor der Spalte, gibt es dort gar keine Lücke.
      let vo = null, bd = Infinity;
      for (const [ox, oy] of own) {
        const p = toLocal(a, ox, oy);
        if (Math.abs(p[0] - u) > 4) continue;
        const d = Math.abs(p[1] - kante);
        if (d < bd) { bd = d; vo = p[1]; }
      }
      // Toleranz: kreuzen sich zwei Kurven unter dem Label, ragt die fremde für
      // Bruchteile eines Pixels hinein — sichtbar getrennt ist der Text davon nicht.
      if (vo !== null && v > Math.min(kante, vo) + 1.5 && v < Math.max(kante, vo) - 1.5) { dazwischen = k; break; }
      if (dazwischen) break;
    }
    const mess = `"${a.label}" (Serie ${si}): ${nah.d.toFixed(1)} px vom eigenen Strich, ${winkel.toFixed(1)}° zur Tangente`
      + (dOther < Infinity ? `, fremd ${dOther.toFixed(1)} px` : "");
    if (nah.d > L.nah)
      out.push(`STICKY ${mess} — über dem Deckel ${L.nah} px: das Label klebt nicht am eigenen Strich`);
    else if (winkel > L.winkel)
      out.push(`STICKY ${mess} — über dem Deckel ${L.winkel}°: das Label liegt nicht auf der Tangente`);
    else if (dazwischen !== null)
      out.push(`STICKY ${mess} — Serie ${dazwischen} verläuft ZWISCHEN Text und eigenem Strich`);
    else if (dOther < nah.d - 1.5)
      out.push(`STICKY ${mess} — näher an Serie ${wer} als an der eigenen`);
    else if (nah.d > L.nahIdeal || winkel > L.winkelIdeal)
      out.push(`INFO  Sticky degradiert (Regellage ${L.nahIdeal} px / ${L.winkelIdeal}°): ${mess}`);
  }

  // ——— Sequenz-Zustand: was sichtbar ist, muss seinen Bezug zeigen ———
  if (SEQ) {
    // Ein Label ohne seinen Gegenstand ist eine Aussage ins Leere: die Note hängt an
    // einer Serie, die dieser Schritt noch nicht gezeichnet hat — Punkt und Leader
    // zeigen auf nichts. Die unsichtbare Kurve KOLLIDIERT nicht (sie ist nicht da);
    // der fehlende Bezug ist trotzdem ein Befund, und zwar ein eigener.
    for (const a of texts) {
      const own = a.el.dataset.seriesLabel ?? a.el.dataset.noteSeries;
      if (own === undefined) continue;
      const pts = bySeries[own] || [];
      const leader = a.el.dataset.leader === "1" ? " — der Leader zeigt ins Leere" : "";
      if (!pts.length) {
        out.push(`LEER  "${a.label}" hängt an Serie ${own}, die in diesem Zustand nicht gezeichnet ist${leader}`);
        continue;
      }
      // Eine Note nennt IHREN Punkt (data-ax/ay). Es reicht nicht, dass die Serie
      // irgendwo liegt: gezogen wird Ast für Ast, und ein Punkt auf dem noch
      // ungezogenen Nach-Stop-Ast ist genauso leer wie eine ganz fehlende Kurve.
      const ax = +a.el.dataset.ax, ay = +a.el.dataset.ay;
      if (!Number.isFinite(ax) || !Number.isFinite(ay)) continue;
      let d = Infinity;
      for (const [x, y] of pts) d = Math.min(d, Math.hypot(x - ax, y - ay));
      if (d > 6) out.push(`LEER  "${a.label}" zeigt auf (${ax.toFixed(0)},${ay.toFixed(0)}) — dort ist von Serie ${own}`
        + ` nichts gezeichnet (nächste Tinte ${d.toFixed(1)} px)${leader}`);
    }
    // Asset-Labels hängen an einem Gegenstand des Objekts (data-label-anchor). Ist der
    // Gegenstand in diesem Zustand nicht da, steht die Beschriftung im Leeren — dieselbe
    // Regel wie für Note-Labels an einer noch nicht gezogenen Serie, nur dass der Bezug
    // hier ein Anker ist. Gemessen wird die BERECHNETE Deckkraft des Ankers, nicht seine
    // Klassenliste.
    for (const a of texts) {
      const anker = a.el.dataset.labelAnchor;
      if (!anker) continue;
      const ziele = [...svg.querySelectorAll(`[data-anchor~="${anker}"]`)];
      if (!ziele.length) { out.push(`LEER  "${a.label}" nennt Anker ${anker}, den es im Bild nicht gibt`); continue; }
      if (!ziele.some((z) => deckkraft(z) > 0))
        out.push(`LEER  "${a.label}" beschriftet ${anker}, das in diesem Zustand nicht sichtbar ist`);
    }
    // Der Puls-Punkt ist im eingefrorenen Bild unsichtbar — sein Endzustand IST das
    // Verschwinden. Hier gemessen statt geglaubt: stünde er doch im Bild, wäre er ein
    // Objekt ohne Aussage (und ohne cx/cy ein Dauergast im Clipping-Befund).
    for (const d of svg.querySelectorAll(".seq-pulse")) {
      const o = deckkraft(d);
      if (o > 0) out.push(`PULS  Puls-Punkt im Endzustand sichtbar (Deckkraft ${o.toFixed(2)})`);
    }
    // Für den Zug trägt der Strich eine Voll-Länge als dasharray. Bleibt sie liegen,
    // steht eine `dash: true`-Serie am Ende SOLIDE da — die Karte unterscheidet ihre
    // Serien dann nicht mehr, obwohl ihre Daten es sagen. Verglichen wird die
    // GESTALTUNG (Attribut) mit der WIRKUNG (computed), nicht Renderer-Code mit sich.
    const zahlen = (s) => JSON.stringify((String(s).match(/[\d.]+/g) || []).map(Number));
    for (const el of sichtbare(".seq-trace")) {
      const soll = el.getAttribute("stroke-dasharray") || "";
      const cs = getComputedStyle(el);
      if (!soll || (parseFloat(cs.strokeDashoffset) || 0) > 0.5) continue;   // noch im Ziehen
      if (zahlen(cs.strokeDasharray) !== zahlen(soll))
        out.push(`DASH  Serie ${el.dataset.series ?? "?"} steht gezogen solide (${cs.strokeDasharray}) statt gestrichelt (${soll})`);
    }
  }

  // ——— Kennzahlen des Nach-Stop-Asts: Apex-Niveau und steilster Winkel ———
  let ast = null;
  const tail = svg.querySelector("polyline[data-tail]");
  if (tail) {
    const pts = tail.getAttribute("points").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    let maxDeg = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i][0] - pts[i - 1][0]), dy = Math.abs(pts[i][1] - pts[i - 1][1]);
      if (dx + dy > 0.01) maxDeg = Math.max(maxDeg, Math.atan2(dy, dx) / RAD);
    }
    const end = pts[pts.length - 1];
    ast = { art: tail.dataset.tail, apexY: +end[1].toFixed(1), niveau: +((244 - end[1]) / 210 * 100).toFixed(1), maxDeg: +maxDeg.toFixed(1) };
  }
  return { out, ast, cur, steps };
};
