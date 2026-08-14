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

    // 1) Sample-Punkte je Serie: Form lebt bis zum Stop (wenn afterStop), sonst bis 1.
    const samples = card.series.map((s) => {
      const from = LEVELS[s.from ?? defFrom(s)];
      const to = LEVELS[s.to ?? defTo(s)];
      const tEnd = s.afterStop && tStop != null ? tStop : 1;
      const N = 56, pts = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        let y = from + (to - from) * NORM[s.shape](u);
        if (s.shape === "suppressed") y = from - from * 0.5 * Math.exp(-(((u - 0.3) / 0.32) ** 2));
        pts.push([u * tEnd, Math.max(0, y)]);
      }
      if (s.afterStop === "collapse") pts.push([Math.min(1, tEnd + 0.03), LEVELS.floor], [1, LEVELS.floor]);
      if (s.afterStop === "reset") pts.push([Math.min(1, tEnd + 0.17), from]);
      if (s.afterStop === "rebound") pts.push([Math.min(1, tEnd + 0.2), LEVELS.high + 4]);
      return { s, pts, stopIdx: s.afterStop ? 56 : null };
    });
    // Endniveau-Spreizung: enden zwei Serien gleich hoch, endet die steilere höher.
    if (samples.length === 2) {
      const ends = samples.map((sm) => sm.pts[sm.pts.length - 1][1]);
      if (Math.abs(ends[0] - ends[1]) < 6) {
        const slope = samples.map((sm) => {
          const [ta, ya] = sm.pts[sm.pts.length - 2], [tb, yb] = sm.pts[sm.pts.length - 1];
          return tb > ta ? (yb - ya) / (tb - ta) : 0;
        });
        const hi = slope[0] >= slope[1] ? 0 : 1;
        samples[hi].pts[samples[hi].pts.length - 1][1] += 3.5;
        samples[1 - hi].pts[samples[1 - hi].pts.length - 1][1] -= 3.5;
      }
    }

    // 2) Label-Solver: Kandidaten testen, erster kollisionsfreier gewinnt.
    const measure = (txt, size) => {
      MEASURE_CTX.font = `700 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      return MEASURE_CTX.measureText(txt).width + txt.length * size * 0.08;
    };
    const placed = [];   // {x,y,w,h} — Mittelpunkt-Boxen
    const box = (cx, cy, w, h) => ({ x: cx - w / 2, y: cy - h / 2, w, h });
    const inView = (b) => b.x >= 4 && b.x + b.w <= 396 && b.y >= 12 && b.y + b.h <= 252;
    const hitBox = (a, b) => !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
    const pad = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });
    // Pfade pixeldicht abtasten — auch lange Einzelsegmente (Collapse-Schwanz) werden Hindernis.
    const allPix = samples.flatMap((sm) => {
      const out = [];
      for (let i = 1; i < sm.pts.length; i++) {
        const [ta, va] = sm.pts[i - 1], [tb, vb] = sm.pts[i];
        const ax = sx(ta), ay = sy(va), bx = sx(tb), by = sy(vb);
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
        for (let k = 0; k <= n; k++) out.push([ax + (bx - ax) * (k / n), ay + (by - ay) * (k / n)]);
      }
      return out;
    });
    const hitPath = (b) => { const q = pad(b, 3); return allPix.some(([px, py]) => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h); };
    const free = (b) => inView(b) && !hitPath(b) && !placed.some((o) => hitBox(pad(b, 4), o));
    const put = (b) => { placed.push(b); return b; };

    // Reservierungen: Achsen-Beschriftungen.
    put(box(PLOT.x0 + measure(card.ylabel, 11) / 2, 20, measure(card.ylabel, 11), 14));
    put(box(PLOT.x1 - measure(card.xlabel, 11) / 2, 262, measure(card.xlabel, 11), 14));

    // Stop-Label: oben an der Grenz-Vertikalen, horizontal in die viewBox geklemmt.
    // Die Vertikale selbst ist Hindernis — kein Label darf sie schneiden.
    let stopSvg = "";
    if (card.stop) {
      for (let y = PLOT.y1; y <= PLOT.y0; y += 4) allPix.push([sx(tStop), y]);
      const w = measure(card.stop.label, 10.5);
      const lx = sx(tStop);
      // Kandidaten: zentriert über der Linie, rechts daneben, links daneben — je 2 Höhen.
      let best = null;
      outer: for (const cy of [24, 40]) {
        for (const cx of [lx, lx + 8 + w / 2, lx - 8 - w / 2]) {
          const cc = Math.min(396 - w / 2, Math.max(4 + w / 2, cx));
          const b = box(cc, cy, w, 13);
          if (inView(b) && !placed.some((o) => hitBox(pad(b, 3), o))) { best = b; break outer; }
        }
      }
      best = best || box(Math.min(396 - w / 2, Math.max(4 + w / 2, lx)), 24, w, 13);
      put(best);
      stopSvg = `<line x1="${lx}" y1="34" x2="${lx}" y2="244"
          stroke="${C("ink")}" stroke-width="1.5" stroke-dasharray="5 5"/>
        <text x="${best.x + best.w / 2}" y="${best.y + 10}" font-size="10.5" font-weight="700" letter-spacing="0.08em"
          fill="${C("ink")}" text-anchor="middle">${card.stop.label}</text>`;
    }
    // Endpunkt-Dots reservieren.
    samples.forEach((sm) => { const [t, v] = sm.pts[sm.pts.length - 1]; put(box(sx(t), sy(v), 12, 12)); });

    const yOnCurve = (sm, t) => {
      const pts = sm.pts;
      for (let i = 1; i < pts.length; i++) if (pts[i][0] >= t) {
        const [ta, ya] = pts[i - 1], [tb, yb] = pts[i];
        return tb > ta ? ya + (yb - ya) * ((t - ta) / (tb - ta)) : ya;
      }
      return pts[pts.length - 1][1];
    };
    window.__curveDebug = { samples, yOnCurve };   // Mess-Hook: notecheck.mjs misst am Renderer-Original, keine Zweit-Geometrie

    // Platziert ein Label nahe seines Ankers; Rückgabe {x,y,box,leader}.
    // Leader-Linien dürfen keine Kurve schneiden (Anker-Nähe ausgenommen — dort endet sie).
    const leaderFree = (from, to) => {
      const n = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 4));
      for (let k = 0; k <= n; k++) {
        const x = from[0] + (to[0] - from[0]) * (k / n), y = from[1] + (to[1] - from[1]) * (k / n);
        if (Math.hypot(x - to[0], y - to[1]) < 9) continue;
        if (allPix.some(([px, py]) => Math.hypot(px - x, py - y) < 3)) return false;
      }
      return true;
    };
    const solve = (anchor, txt, size, sideWish) => {
      const wishSign = sideWish === "below" ? 1 : -1;
      for (const sz of size > 9 ? [size, Math.max(8.5, size - 1.5)] : [size]) {
        const w = measure(txt, sz), h = sz + 3;
        const cands = [];
        for (const side of [-1, 1]) for (const dist of [16, 26, 38, 52, 66]) {
          for (const dx of [0, -24, 24, -48, 48, -76, 76, -104, 104]) {
            cands.push({
              b: box(anchor[0] + dx, anchor[1] + side * dist, w, h),
              score: Math.hypot(dx, dist) + (sideWish && side !== wishSign ? 34 : 0),
              far: Math.hypot(dx, dist) > 58
            });
          }
        }
        cands.sort((a, b) => a.score - b.score);
        for (const c of cands) {
          if (!free(c.b)) continue;
          const center = [c.b.x + c.b.w / 2, c.b.y + c.b.h / 2];
          if (c.far && !leaderFree(center, anchor)) continue;
          return { box: put(c.b), size: sz, leader: c.far ? anchor : null };
        }
      }
      // Notnagel 1: Rastersuche im Plot — nächstgelegene freie Zelle mit freiem Leader-Weg.
      const sz = Math.max(8.5, size - 1.5), w = measure(txt, sz), h = sz + 3;
      const cells = [];
      for (let gy = 24; gy <= 240; gy += 16) for (let gx = PLOT.x0 + w / 2 + 4; gx <= PLOT.x1 - w / 2; gx += 20)
        cells.push([gx, gy, Math.hypot(gx - anchor[0], gy - anchor[1])]);
      cells.sort((a, b) => a[2] - b[2]);
      for (const pass of [true, false]) {
        for (const [gx, gy] of cells) {
          const b = box(gx, gy, w, h);
          if (free(b) && (!pass || leaderFree([gx, gy], anchor))) return { box: put(b), size: sz, leader: anchor };
        }
      }
      // Notnagel 2: nirgends frei — Position mit geringstem Schaden (Pfad-Treffer, Overlaps).
      let leastBad = null;
      for (const [gx, gy, d] of cells) {
        const b = box(gx, gy, w, h), q = pad(b, 3);
        const hits = allPix.reduce((n, [px, py]) => n + (px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h ? 1 : 0), 0);
        const overlaps = placed.reduce((n, o) => n + (hitBox(pad(b, 4), o) ? 1 : 0), 0);
        const bad = hits + 40 * overlaps + d * 0.05;
        if (!leastBad || bad < leastBad.bad) leastBad = { b, bad };
      }
      return { box: put(leastBad.b), size: sz, leader: anchor };
    };
    const labelSvg = (r, txt, fill) => {
      const size = r.size;
      const cx = r.box.x + r.box.w / 2, cy = r.box.y + r.box.h / 2;
      const lead = r.leader ? (() => {
        const ex = cx + Math.sign(r.leader[0] - cx) * Math.min(r.box.w / 2, Math.abs(r.leader[0] - cx));
        const ey = cy + Math.sign(r.leader[1] - cy) * (r.box.h / 2 + 1);
        return `<line class="leader" x1="${ex}" y1="${ey}" x2="${r.leader[0]}" y2="${r.leader[1]}" stroke="${C("muted")}" stroke-width="1.2"/>`;
      })() : "";
      return `${lead}<text class="svglabel" x="${cx}" y="${cy + size * 0.36}" font-size="${size}"
        fill="${fill}" text-anchor="middle" letter-spacing="0.08em">${txt}</text>`;
    };

    // 3) Zeichnen: Pfade (Stop-Folge-Segment gestrichelt bei collapse), dann Labels.
    const series = samples.map((sm) => {
      const { s, pts } = sm;
      const px = (arr) => arr.map(([t, v]) => `${sx(t).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
      const main = sm.stopIdx != null ? pts.slice(0, sm.stopIdx + 1) : pts;
      const tail = sm.stopIdx != null ? pts.slice(sm.stopIdx) : [];
      const [et, ev] = pts[pts.length - 1];
      const areaPts = s.afterStop === "collapse" ? main : pts;
      return `${s.area ? `<polygon points="${sx(areaPts[0][0])},244 ${px(areaPts)} ${sx(areaPts[areaPts.length - 1][0])},244" fill="${C(s.color)}" opacity="0.1"/>` : ""}
        <polyline points="${px(main)}" fill="none" stroke="${C(s.color)}" stroke-width="3"
              stroke-linejoin="round" stroke-linecap="round"
              ${s.dash ? 'stroke-dasharray="6 6"' : ""} ${s.faded ? 'opacity="0.4"' : ""}/>
        ${tail.length ? `<polyline points="${px(tail)}" fill="none" stroke="${C(s.color)}" stroke-width="3"
              stroke-linejoin="round" stroke-linecap="round"
              ${s.afterStop === "collapse" ? 'stroke-dasharray="6 6"' : (s.dash ? 'stroke-dasharray="6 6"' : "")}
              ${s.faded ? 'opacity="0.4"' : ""}/>` : ""}
        <circle cx="${sx(et)}" cy="${sy(ev)}" r="4.5" fill="${C(s.color)}" ${s.faded ? 'opacity="0.4"' : ""}/>`;
    }).join("");
    const seriesLabels = samples.map((sm) => {
      if (!sm.s.label) return "";
      let best = null;
      for (const t of [0.72, 0.55, 0.86, 0.4, 0.28]) {
        const a = [sx(t), sy(yOnCurve(sm, t))];
        const r = solve(a, sm.s.label, 13);
        if (!r.leader) { best = r; break; }
        if (!best) best = r;
        placed.pop();   // Kandidat mit Leader wieder freigeben, nächsten Anker testen
      }
      if (placed[placed.length - 1] !== best.box) placed.push(best.box);
      return labelSvg(best, sm.s.label, C("ink"));
    }).join("");
    const notes = (card.notes || []).map((n) => {
      const sm = samples[typeof n.series === "number" ? n.series
        : Math.max(0, card.series.findIndex((s) => s.label === n.series))];
      const a = [sx(n.t), sy(yOnCurve(sm, n.t))];
      return labelSvg(solve(a, n.label, 10, n.side), n.label, C("muted"));
    }).join("");

    return `<div class="card">
      <p class="lehrsatz">${card.text}</p>
      <div class="diagram"><svg viewBox="0 0 400 278" role="img" aria-label="Kurvendiagramm: ${card.ylabel} über ${card.xlabel}">
        <path d="M52,34 L52,244 L382,244" fill="none" stroke="${C("muted")}" stroke-width="1.5"/>
        <text x="52" y="22" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${C("muted")}">${card.ylabel}</text>
        <text x="382" y="266" font-size="11" font-weight="700" letter-spacing="0.1em" fill="${C("muted")}" text-anchor="end">${card.xlabel}</text>
        ${stopSvg}
        ${series}
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
