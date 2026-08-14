const C = (key) => `var(--${key})`;
const SOFT = (key) => `var(--${key}-soft)`;
const MEASURE_CTX = document.createElement("canvas").getContext("2d");

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
    const SPLIT_X = 225;        // Mittellinie Berg
    const ES_TOP_Y = 268;       // Ich/Es-Grenze
    const berg = "M225,46 L248,96 L258,132 L268,158 L306,196 L322,258 L300,330 L260,378 L226,392 L180,386 L140,356 L112,298 L106,238 L126,186 L158,156 L186,110 L206,72 Z";
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 432" role="img" aria-label="Eisberg-Diagramm: Ich größtenteils bewusst, Über-Ich und Es unter der Oberfläche">
        <defs>
          <path id="wavetop" d="${wave1}"/>
          <path id="wavemid" d="${wave2}"/>
          <clipPath id="bergclip"><path d="${berg}"/></clipPath>
        </defs>
        <path d="${wave2} L400,432 L0,432 Z" fill="${C("water3")}"/>
        <path d="M24,300 q10,-7 20,0 q10,7 20,0" stroke="${C("card")}" stroke-width="2" fill="none" opacity="0.3"/>
        <path d="M330,264 q10,-7 20,0" stroke="${C("card")}" stroke-width="2" fill="none" opacity="0.3"/>
        <path d="M44,392 q10,-7 20,0" stroke="${C("card")}" stroke-width="2" fill="none" opacity="0.3"/>
        <g clip-path="url(#bergclip)">
          <rect x="90" y="30" width="245" height="410" fill="${C("berg")}"/>
          <rect x="90" y="182" width="${SPLIT_X - 90}" height="258" fill="${SOFT(rUe.color)}"/>
          <rect x="${SPLIT_X}" y="182" width="120" height="${ES_TOP_Y - 182}" fill="${C("berg-deep")}"/>
          <rect x="${SPLIT_X}" y="${ES_TOP_Y}" width="120" height="140" fill="${SOFT(rEs.color)}"/>
          <path d="M225,46 L248,96 L232,112 Z" fill="${C("water1")}" opacity="0.25"/>
          <line x1="${SPLIT_X}" y1="46" x2="${SPLIT_X}" y2="440" stroke="${C("ink")}" stroke-width="2"/>
          <line x1="${SPLIT_X}" y1="${ES_TOP_Y}" x2="330" y2="${ES_TOP_Y}" stroke="${C("ink")}" stroke-width="2"/>
        </g>
        <path d="${berg}" fill="none" stroke="${C("ink")}" stroke-width="2"/>
        <path d="${wave1} ${wave2rev} Z" fill="${C("water1")}"/>
        <path d="${wave1}" fill="none" stroke="${C("ink")}" stroke-width="2"/>
        <path d="${wave2}" fill="none" stroke="${C("ink")}" stroke-width="2"/>
        <text class="svglabel" font-size="20" fill="${C("ink")}"><textPath href="#wavetop" startOffset="5%"><tspan dy="-13">${zB.label}</tspan></textPath></text>
        <text class="svglabel" font-size="17" fill="#FFFFFF"><textPath href="#wavetop" startOffset="3%"><tspan dy="42">${zV.label}</tspan></textPath></text>
        <text class="svglabel" font-size="17" fill="#FFFFFF"><textPath href="#wavemid" startOffset="2%"><tspan dy="32">${zU.label}</tspan></textPath></text>
        ${rIch.at === "peak"
          ? `<line x1="262" y1="84" x2="240" y2="92" stroke="${C("ink")}" stroke-width="1.6"/>
             <text class="svglabel" x="268" y="90" font-size="17" fill="${C("ink")}" text-anchor="start">${rIch.label}</text>`
          : `<text class="svglabel" x="272" y="250" font-size="21" fill="${C("ink")}" text-anchor="middle">${rIch.label}</text>`}
        <text class="svglabel" x="164" y="308" font-size="${rUe.label.length > 7 ? 15 : 18}" fill="${C("ink")}" text-anchor="middle">${rUe.label}</text>
        <text class="svglabel" x="${rEs.label.length > 4 ? 276 : 270}" y="${rEs.label.length > 4 ? 318 : 336}" font-size="${rEs.label.length > 4 ? 15 : 21}" fill="${C("ink")}" text-anchor="middle">${rEs.label}</text>
      </svg></div>
    </div>`;
  },

  balance(card) {
    // Balken statisch gekippt (linke Seite unten = wiegt schwerer), V-Seile zu echten Schalen.
    // Seile werden am Schalenrand geclippt statt übermalt — Geometrie sauber, nicht nur Optik.
    const ropeSegs = (ax, ay, bx, by, mx, my, r) => {
      const dx = bx - ax, dy = by - ay, fx = ax - mx, fy = ay - my;
      const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
      const disc = b * b - 4 * a * c;
      if (disc <= 0) return [[ax, ay, bx, by]];
      const t1 = Math.max(0, (-b - Math.sqrt(disc)) / (2 * a)), t2 = Math.min(1, (-b + Math.sqrt(disc)) / (2 * a));
      const segs = [];
      if (t1 > 0.02) segs.push([ax, ay, ax + dx * t1, ay + dy * t1]);
      if (t2 < 0.98) segs.push([ax + dx * t2, ay + dy * t2, bx, by]);
      return segs;
    };
    const arm = (side, x, yEnd) => `
      ${[[x - 35, yEnd + 52], [x + 35, yEnd + 52]].flatMap(([bx, by]) =>
        ropeSegs(x, yEnd, bx, by, x, yEnd + 36, 31.5).map(([x1, y1, x2, y2]) =>
          `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C("ink")}" stroke-width="1.6"/>`)).join("")}
      <circle cx="${x}" cy="${yEnd + 36}" r="29" fill="${SOFT(side.color)}" stroke="${C(side.color)}" stroke-width="2.5"/>
      <text class="svglabel" x="${x}" y="${yEnd + 41}" font-size="${side.label.length > 6 ? 9.5 : 11.5}" letter-spacing="0" fill="${C("ink")}" text-anchor="middle">${side.label}</text>
      <path d="M${x - 35},${yEnd + 52} A35,15 0 0 0 ${x + 35},${yEnd + 52}" fill="${C("card")}" stroke="${C("ink")}" stroke-width="2"/>
      <text x="${x}" y="${yEnd + 86}" font-size="10.5" fill="${C("muted")}" text-anchor="middle" font-weight="600">${side.sub}</text>`;
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 50 400 210" role="img" aria-label="Waage: ${card.left.label} wiegt schwerer als ${card.right.label}, ${card.pivot.label} am Drehpunkt">
        <line x1="72" y1="107" x2="328" y2="85" stroke="${C("ink")}" stroke-width="4" stroke-linecap="round"/>
        ${arm(card.left, 72, 107)}
        ${arm(card.right, 328, 85)}
        <path d="M200,96 L176,152 L224,152 Z" fill="${C("ink")}"/>
        <line x1="140" y1="152" x2="260" y2="152" stroke="${C("ink")}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="200" cy="96" r="7" fill="${C("card")}" stroke="${C("ink")}" stroke-width="3"/>
        <rect x="139" y="176" width="122" height="58" rx="14" fill="${SOFT(card.pivot.color)}" stroke="${C(card.pivot.color)}" stroke-width="2.5"/>
        <text class="svglabel" x="200" y="202" font-size="16" fill="${C("ink")}" text-anchor="middle">${card.pivot.label}</text>
        <text x="200" y="221" font-size="11" fill="${C("muted")}" text-anchor="middle" font-weight="600">${card.pivot.sub}</text>
      </svg></div>
    </div>`;
  },

  flow(card) {
    const ys = [46, 138, 262];
    const nodes = card.steps.map((s, i) => `
      ${i > 0 ? `<line x1="200" y1="${ys[i-1] + 32}" x2="200" y2="${ys[i] - 34}" stroke="${C("ink")}" stroke-width="1.8" marker-end="url(#arrow)"/>` : ""}
      <rect x="96" y="${ys[i] - 30}" width="208" height="62" rx="16"
            fill="${SOFT(card.steps[i].color)}" stroke="${C(card.steps[i].color)}" stroke-width="2.5"/>
      <text class="svglabel" x="200" y="${ys[i] - 2}" font-size="16" fill="${C("ink")}" text-anchor="middle">${s.label}</text>
      <text x="200" y="${ys[i] + 18}" font-size="11.5" fill="${C("muted")}" text-anchor="middle" font-weight="600">${s.sub}</text>`).join("");
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 340" role="img" aria-label="Ablauf der Verdrängung: Impuls, Konflikt, Verdrängung ins Unbewusste">
        <defs><marker id="arrow" markerWidth="9" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="${C("ink")}"/>
        </marker></defs>
        <rect x="0" y="216" width="400" height="124" fill="${C("water3")}" opacity="0.92"/>
        <path d="M24,302 q9,-6 18,0 q9,6 18,0" stroke="${C("card")}" stroke-width="2" fill="none" opacity="0.35"/>
        <path d="M334,252 q9,-6 18,0" stroke="${C("card")}" stroke-width="2" fill="none" opacity="0.35"/>
        <line x1="0" y1="216" x2="400" y2="216" stroke="${C("card")}" stroke-width="2" stroke-dasharray="7 6"/>
        <text class="svglabel" x="14" y="326" font-size="14" fill="${C("card")}">${card.sink.label}</text>
        ${nodes}
      </svg></div>
    </div>`;
  },

  curve(card) {
    // Contract v2: das LLM liefert nur Semantik (Form, Niveaus, Ereignis-Zeitpunkt,
    // Anker). Punkte UND Label-Positionen berechnet das System — Kollisionen sind
    // damit konstruktiv ausgeschlossen, nicht nachträglich gelintet.
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
    const placed = [];   // orientierte Boxen aller schon gesetzten Objekte
    const put = (r) => { placed.push(r); return r; };
    // `bottom` ist die Unterkante, die ein Label nicht unterschreiten darf. Notes
    // bekommen eine höhere Grenze als 252: sie dürfen nie in die Zeile der
    // x-Achsen-Beschriftung rutschen und dort wie deren Fortsetzung wirken.
    const inView = (r, bottom = 252) => cornersOf(r).every(([x, y]) => x >= 4 && x <= 396 && y >= 12 && y <= bottom);
    const hitPlaced = (r, px = 4, py = px) => { const q = grow(r, px, py); return placed.some((o) => hitRect(q, o)); };
    // Abstand zwischen zwei BESCHRIFTUNGEN, gerichtet: LÄNGS der Leserichtung braucht es
    // mehr als den Wortabstand der Schrift, sonst lesen sich zwei Texte als ein Satz
    // („Gefühlter Druck DRUCK MASKIERT"). QUER dazu genügt wenig — zwei Zeilen
    // übereinander liest niemand als eine; die gestapelte Apex-Note lebt genau davon.
    // Gewachsen wird im gedrehten Rahmen des Labels, „längs" ist also seine Grundlinie.
    const LUFT_X = 7, LUFT_Y = 2;
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
    const hitPix = (r, pix) => pix.some(([x, y]) => inRect(r, x, y));
    // Schadensmaß für Notlagen. EIN Kurventreffer wiegt schwerer als jede Zahl von
    // Reservierungs-Überschneidungen: Text auf einer Linie ist ein sichtbarer Defekt,
    // ein Anschnitt an der (großzügig bemessenen) Endpunkt-Reservierung ist keiner.
    const schadenVon = (r, pix) => {
      const q = grow(r, 2);
      const treffer = pix.filter(([x, y]) => inRect(q, x, y)).length;
      return (treffer ? 1000 + treffer : 0) + 40 * placed.filter((o) => hitRect(q, o)).length;
    };
    const distPix = (r, pix) => { let best = Infinity; for (const [x, y] of pix) { const d = distRect(r, x, y); if (d < best) best = d; } return best; };
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
    // Der Marker bindet, das Label steht daneben. Ein Leader ist die letzte Degradation
    // und hart gedeckelt: ein 150-px-Strich quer durchs Bild verbindet zwar formal,
    // wird aber als eigene Geometrie gelesen statt als Zeigefinger.
    const NOTE_SIZE = 9.5, NOTE_BOTTOM = 238, LEADER_MAX = 40, LEADER_AB = 12;
    // Austrittspunkt AUF der Verbindung Mitte→Anker (Slab-Schnitt mit der Box). Ein an
    // der Box-Kante entlang gerechneter Startpunkt läge bei breiten Labels genau unter
    // dem Anker — der Strich stünde senkrecht und läse sich wie eine zweite
    // Ereignis-Linie. Kollinear gerechnet erbt er die geprüfte Diagonale.
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
    // Ereignis-Linie neben der gestrichelten Stop-Linie, waagerecht wie ein
    // Achsen-Strich. Kriterium ist der Winkel des GEZEICHNETEN Strichs — Komponenten
    // in Pixeln zu prüfen ließe eine Lage wie 104×16 px durchgehen, die als 9°-Strich
    // praktisch waagerecht liegt.
    const diagonal = (g) => {
      const a = Math.atan2(Math.abs(g.y2 - g.y1), Math.abs(g.x2 - g.x1)) / RAD;
      return a >= 18 && a <= 72;
    };
    const leaderFree = (g, pix) => {
      const n = Math.max(1, Math.ceil(leaderLen(g) / 4));
      for (let k = 0; k <= n; k++) {
        const x = g.x1 + (g.x2 - g.x1) * (k / n), y = g.y1 + (g.y2 - g.y1) * (k / n);
        if (Math.hypot(x - g.x2, y - g.y2) < 9) continue;
        if (pix.some(([px, py]) => Math.hypot(px - x, py - y) < 3)) return false;
      }
      return true;
    };
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
      for (const streng of [true, false]) for (const c of cands)
        if (frei(c) && (!streng || eindeutig(c))) return { r: put(c.r), size: c.size, leader: c.braucht ? c.g : null };
      // Notnagel: nirgends frei — Lage mit geringstem Schaden, Deckel bleibt.
      let schlecht = null;
      for (const c of cands) {
        if (!inView(c.r, NOTE_BOTTOM) || (c.braucht && leaderLen(c.g) > LEADER_MAX)) continue;
        const bad = schadenVon(c.r, pix) + c.score * 0.05;
        if (!schlecht || bad < schlecht.bad) schlecht = { c, bad };
      }
      const c = schlecht ? schlecht.c : cands[0];
      // Auch im Notnagel gilt der Leader-Contract: ein senkrechter oder zu langer
      // Strich wäre schlimmer als gar keiner — der Punkt-Marker bindet weiter.
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

    // `attrs` trägt die Serien-Zugehörigkeit ins DOM — Audits messen die Zuordnung
    // damit am gezeichneten Objekt, ohne die Geometrie ein zweites Mal zu berechnen.
    // Die Farbe steht INLINE: die Klassenregeln (.c-series/.c-note) tragen einen
    // Grundton und schlügen ein fill-Attribut.
    const textSvg = (r, size, txt, cls, fill, attrs = "") => {
      const dreh = r.deg ? ` rotate(${r.deg.toFixed(1)})` : "";
      return `<text class="svglabel ${cls}" transform="translate(${r.cx.toFixed(1)} ${r.cy.toFixed(1)})${dreh}"
        y="${(size * BASE_OFF).toFixed(2)}" font-size="${size}" text-anchor="middle" style="fill:${fill}" ${attrs}>${txt}</text>`;
    };
    const leaderSvg = (g) => g
      ? `<line class="leader" x1="${g.x1.toFixed(1)}" y1="${g.y1.toFixed(1)}" x2="${g.x2.toFixed(1)}" y2="${g.y2.toFixed(1)}"/>`
      : "";

    // 3) Zeichnen: Pfade (Stop-Folge-Segment gestrichelt bei collapse), dann Labels.
    const series = samples.map((sm, si) => {
      const { s, pts } = sm;
      const px = (arr) => arr.map(([t, v]) => `${sx(t).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
      const main = sm.stopIdx != null ? pts.slice(0, sm.stopIdx + 1) : pts;
      const tail = sm.stopIdx != null ? pts.slice(sm.stopIdx) : [];
      const [et, ev] = pts[pts.length - 1];
      const areaPts = s.afterStop === "collapse" ? main : pts;
      return `${s.area ? `<polygon points="${sx(areaPts[0][0])},244 ${px(areaPts)} ${sx(areaPts[areaPts.length - 1][0])},244" fill="${C(s.color)}" opacity="0.1"/>` : ""}
        <polyline data-series="${si}" points="${px(main)}" fill="none" stroke="${C(s.color)}" stroke-width="3"
              stroke-linejoin="round" stroke-linecap="round"
              ${s.dash ? 'stroke-dasharray="6 6"' : ""} ${s.faded ? 'opacity="0.4"' : ""}/>
        ${tail.length ? `<polyline data-series="${si}" data-tail="${s.afterStop}" points="${px(tail)}" fill="none" stroke="${C(s.color)}" stroke-width="3"
              stroke-linejoin="round" stroke-linecap="round"
              ${s.afterStop === "collapse" ? 'stroke-dasharray="6 6"' : (s.dash ? 'stroke-dasharray="6 6"' : "")}
              ${s.faded ? 'opacity="0.4"' : ""}/>` : ""}
        <circle cx="${sx(et)}" cy="${sy(ev)}" r="4.5" fill="${C(s.color)}" ${s.faded ? 'opacity="0.4"' : ""}/>`;
    }).join("");
    // Reihenfolge: erst die Notes, dann die Serien-Labels. Eine Note haftet an EINEM
    // Punkt (t oder Apex) und kann kaum ausweichen; ein Serien-Label darf entlang der
    // ganzen Kurve wandern. Der Unflexible wählt zuerst — sonst belegt das Serien-Label
    // die Tasche am Apex und die Note müsste stapeln.
    const notes = (card.notes || []).map((n) => {
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
        : `<circle class="c-notedot" cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="3" fill="${C(sm.s.color)}"/>`;
      return dot + leaderSvg(r.leader) + textSvg(r.r, r.size, txt, "c-note halo", C(sm.s.color),
        `data-note-series="${si}"${atApex ? ' data-at="apex"' : ""}${r.leader ? ' data-leader="1"' : ""}`
        + (r.gestapelt ? ' data-stacked="1"' : ""));
    }).join("");
    const seriesLabels = samples.map((sm, si) => {
      if (!sm.s.label) return "";
      const r = stickyPlace(si, sm.s.label);
      // Halo auch am Serien-Label: auf freiem Papier unsichtbar (er hat dessen Farbe),
      // aber er trägt die eine Lage, in der das Label die Ereignis-Linie queren muss.
      return r ? textSvg(put(r.r), r.size, sm.s.label, "c-series halo", C(sm.s.color), `data-series-label="${si}"`) : "";
    }).join("");
    // Erst jetzt steht das obere Ende der Vertikalen fest: eine gestapelte Apex-Note
    // hängt unter dem Ereignis-Label und schiebt den Linienanfang nach unten.
    const stopSvg = card.stop
      ? `<line class="c-stopline" x1="${stopX.toFixed(1)}" y1="${stopTop.toFixed(1)}" x2="${stopX.toFixed(1)}" y2="244"/>`
      : "";
    // Das Ereignis-Label wird NACH den Kurven gezeichnet: sein Papier-Halo trägt nur,
    // wenn nichts mehr darüber liegt.
    const stopText = card.stop ? textSvg(stopRect, STOP_SIZE, card.stop.label, "c-stop halo", stopFill) : "";
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 278" role="img" aria-label="Kurvendiagramm: ${card.ylabel} über ${card.xlabel}">
        <path class="c-axis" d="M52,34 L52,244 L382,244" fill="none" stroke="${C("muted")}" stroke-width="1.5"/>
        <text x="52" y="22" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${C("muted")}">${card.ylabel}</text>
        <text x="382" y="266" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${C("muted")}" text-anchor="end">${card.xlabel}</text>
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
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 300" role="img" aria-label="Hebel-Diagramm: eine Handlung wirkt vielfach">
        ${cys.map((cy) => `<line x1="166" y1="154" x2="${316 - 15}" y2="${cy}" stroke="${C("ink")}" stroke-width="1.5"/>`).join("")}
        <rect x="24" y="122" width="136" height="64" rx="16" fill="${SOFT(card.source.color)}" stroke="${C(card.source.color)}" stroke-width="2.5"/>
        <text class="svglabel" x="92" y="150" font-size="${fs}" fill="${C("ink")}" text-anchor="middle">${card.source.label}</text>
        <text x="92" y="168" font-size="10.5" fill="${C("muted")}" text-anchor="middle" font-weight="600">${card.source.sub}</text>
        ${cys.map((cy) => `<g>
          <circle cx="316" cy="${cy}" r="15" fill="${SOFT("ich")}" stroke="${C("ich")}" stroke-width="2"/>
          <circle cx="316" cy="${cy - 3.5}" r="4.2" fill="${C("ich")}"/>
          <path d="M308,${cy + 9.5} a8,6 0 0 1 16,0 Z" fill="${C("ich")}"/>
        </g>`).join("")}
        <text class="svglabel" x="316" y="28" font-size="14" fill="${C("ink")}" text-anchor="middle">${card.result.label}</text>
      </svg></div>
      ${card.caption ? `<p class="caption">${card.caption}</p>` : ""}
    </div>`;
  },

  cycle(card) {
    // Kreislauf: 4 Stationen, Pfeile im Uhrzeigersinn — der Loop ist die Aussage.
    const pos = [[200, 60], [322, 170], [200, 280], [78, 170]];
    const arrows = [
      "M278,74 Q330,100 326,136", "M312,206 Q330,252 274,270",
      "M126,288 Q70,260 74,204", "M88,134 Q70,88 124,72"
    ];
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 340" role="img" aria-label="Kreislauf: ${card.steps.map((s) => s.label).join(", ")}">
        <defs><marker id="cyarrow" markerWidth="9" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="${C("ink")}"/>
        </marker></defs>
        ${arrows.map((d) => `<path d="${d}" fill="none" stroke="${C("ink")}" stroke-width="1.8" marker-end="url(#cyarrow)"/>`).join("")}
        ${card.steps.map((s, i) => {
          const [cx, cy] = pos[i];
          return `<rect x="${cx - 66}" y="${cy - 26}" width="132" height="52" rx="14"
              fill="${SOFT(s.color)}" stroke="${C(s.color)}" stroke-width="2.5"/>
            <text class="svglabel" x="${cx}" y="${cy - 2}" font-size="14.5" fill="${C("ink")}" text-anchor="middle">${s.label}</text>
            <text x="${cx}" y="${cy + 15}" font-size="10.5" fill="${C("muted")}" text-anchor="middle" font-weight="600">${s.sub}</text>`;
        }).join("")}
      </svg></div>
      ${card.caption ? `<p class="caption">${card.caption}</p>` : ""}
    </div>`;
  },

  compare(card) {
    const panel = (p) => `<div class="cpanel" style="border-color:${C(p.color)};background:${SOFT(p.color)}">
      <h3>${p.title}</h3>
      ${p.items.map((it) => `<div class="citem"><b>${it.label}</b><span>${it.sub}</span></div>`).join("")}
    </div>`;
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><div class="compare">${panel(card.left)}${panel(card.right)}</div></div>
      ${card.caption ? `<p class="caption">${card.caption}</p>` : ""}
    </div>`;
  },

  venn(card) {
    // Schnittfläche als eigenes, konturiertes Objekt — die Grenze ist die Aussage.
    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 280" role="img" aria-label="Venn-Diagramm: ${card.a.label} und ${card.b.label} überschneiden sich">
        <circle cx="150" cy="155" r="95" fill="${SOFT(card.a.color)}" stroke="${C(card.a.color)}" stroke-width="2.5"/>
        <circle cx="250" cy="155" r="95" fill="${SOFT(card.b.color)}" stroke="${C(card.b.color)}" stroke-width="2.5"/>
        <path d="M200,74 A95,95 0 0 1 200,236 A95,95 0 0 1 200,74 Z"
              fill="${SOFT(card.overlap.color)}" stroke="${C("ink")}" stroke-width="2"/>
        <text class="svglabel" x="118" y="38" font-size="12.5" fill="${C("ink")}" text-anchor="middle">${card.a.label}</text>
        <text class="svglabel" x="285" y="38" font-size="12.5" fill="${C("ink")}" text-anchor="middle">${card.b.label}</text>
        ${card.overlap.label.map((l, i) => `<text class="svglabel" x="200" y="${146 + i * 18}" font-size="12" fill="${C("ink")}" text-anchor="middle">${l}</text>`).join("")}
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

function renderCardInto(root, card, opts = {}) {
  root.innerHTML = RENDERERS[card.type](card);
  if (card.type === "quiz") wireQuiz(root, card, opts.onAdvance, opts.onQuizResult);
  const save = root.querySelector(".savebtn");
  if (save) save.addEventListener("click", (e) => {
    e.stopPropagation();
    save.classList.toggle("saved");
    if (opts.onSave) opts.onSave(save.classList.contains("saved"));
  });
}
