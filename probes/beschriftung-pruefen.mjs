// Messung der handgesetzten Beschriftung — gemeinsam für alle Szenen-Mockups.
// Herausgelöst aus relation-szene.mjs, als die zweite Szenen-Datei entstand: zwei Kopien
// dieser Prüfung hätten bedeutet, dass eine Karte sauber gemeldet wird, weil ihre Kopie
// einen Messfehler noch hat, den die andere schon los ist.

// Kollisionen messen statt sie zu übersehen. Drei Runden von Hand gesetzter Beschriftung
// haben dreimal dieselbe Klasse Fehler erzeugt: Text aus der Karte gelaufen, Text hinter
// einem Gegenstand, Text auf Text. Der Renderer hat für sein eigenes Zeichnen einen Solver;
// ein handgesetztes Mockup hat keinen, also braucht es wenigstens eine Prüfung. Flächen
// zählen NICHT als Kollision — eine Beschriftung IM Sektor oder AUF dem Lichtkegel ist
// gewollt. Geprüft wird gegen Konturen (Strich ohne Füllung) und gegen anderen Text.
export const pruefen = (page) => page.evaluate(() => {
  const svg = document.querySelector(".diagram svg");
  const vb = svg.viewBox.baseVal;
  const m = (el) => { const b = el.getBBox(); const t = el.getCTM(); return { el, b, t }; };
  const box = (el) => {
    const b = el.getBBox(), c = el.getScreenCTM(), s = svg.getScreenCTM().inverse().multiply(c);
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]]
      .map(([x, y]) => [s.a * x + s.c * y + s.e, s.b * x + s.d * y + s.f]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const schnitt = (a, b, luft = 0) =>
    a.x0 < b.x1 + luft && b.x0 < a.x1 + luft && a.y0 < b.y1 + luft && b.y0 < a.y1 + luft;
  // Drehung und Höhe mitnehmen: zwei parallele Zeilen schrägen Textes überlappen als
  // achsparallele Kästen ZWANGSLÄUFIG, auch wenn zwischen ihnen Luft ist. Ohne den Winkel
  // meldet die Prüfung den Kegeltext als Kollision mit sich selbst — ein Messfehler, der
  // echte Befunde entwertet.
  const texte = [...svg.querySelectorAll("text")].map((el) => {
    const b = el.getBBox(), s = svg.getScreenCTM().inverse().multiply(el.getScreenCTM());
    return { el, r: box(el), txt: el.textContent,
             deg: Math.atan2(s.b, s.a) * 180 / Math.PI,
             cx: s.a * (b.x + b.width / 2) + s.c * (b.y + b.height / 2) + s.e,
             cy: s.b * (b.x + b.width / 2) + s.d * (b.y + b.height / 2) + s.f,
             h: b.height * Math.hypot(s.c, s.d) };
  });
  // Abstand zweier Zeilen SENKRECHT zu ihrer Laufrichtung — die Größe, die entscheidet, ob
  // sie einander berühren.
  const zeilenAbstand = (a, b) => {
    const rad = a.deg * Math.PI / 180, nx = -Math.sin(rad), ny = Math.cos(rad);
    return Math.abs((b.cx - a.cx) * nx + (b.cy - a.cy) * ny);
  };
  const konturen = [...svg.querySelectorAll("line, polyline, path, circle, ellipse, rect")]
    .filter((el) => {
      const f = el.getAttribute("fill"), sw = +(el.getAttribute("stroke-width") || 0);
      return (f === "none" || f === null) && sw >= 2;   // nur echte Striche, keine Flächen
    }).map((el) => ({ el, r: box(el) }));
  const befunde = [];
  for (const t of texte) {
    if (t.r.x0 < vb.x + 2 || t.r.x1 > vb.x + vb.width - 2 || t.r.y0 < vb.y + 2 || t.r.y1 > vb.y + vb.height - 2)
      befunde.push(`RAUS   "${t.txt}" ragt aus der Karte (x ${t.r.x0.toFixed(0)}…${t.r.x1.toFixed(0)}, viewBox 0…${vb.width})`);
  }
  for (let i = 0; i < texte.length; i++) for (let j = i + 1; j < texte.length; j++) {
    const a = texte[i], b = texte[j];
    if (!schnitt(a.r, b.r, 1)) continue;
    // Parallele Zeilen mit genug Luft zwischen den Grundlinien sind in Ordnung, auch wenn
    // ihre achsparallelen Kästen sich schneiden.
    if (Math.abs(a.deg - b.deg) < 2 && zeilenAbstand(a, b) >= (a.h + b.h) / 2 - 1) continue;
    befunde.push(`TEXT   "${a.txt}" überlappt "${b.txt}"`);
  }
  for (const t of texte) for (const k of konturen)
    if (schnitt(t.r, k.r, -3) && k.r.x1 - k.r.x0 < 260 && k.r.y1 - k.r.y0 < 260)
      befunde.push(`STRICH "${t.txt}" liegt auf einer Kontur (${k.el.tagName})`);
  // Verdeckung: eine gefüllte Fläche, die im DOM NACH dem Text kommt, liegt über ihm. Genau
  // das passierte dem Kegeltext hinter dem Handy — die Kollisionsprüfung sah nichts, weil
  // Flächen absichtlich nicht als Kollision zählen, und das Bild sah trotzdem falsch aus.
  const alle = [...svg.querySelectorAll("*")];
  for (const t of texte) {
    const nachher = alle.slice(alle.indexOf(t.el) + 1).filter((el) => {
      const f = el.getAttribute("fill");
      if (!f || f === "none" || el.tagName === "text") return false;
      const op = +(el.getAttribute("opacity") ?? 1);
      return op > 0.55 && el.getBBox().width > 8;      // fast durchsichtige Schleier zählen nicht
    });
    for (const el of nachher) {
      const r = box(el);
      // Anfang, Mitte und Ende prüfen: nur die Mitte zu messen ließ „ÜBERMÜDET" durch,
      // dessen letzte Buchstaben hinter dem Auto verschwanden — ein halbes Wort ist kein
      // halber Fehler.
      const cy = (t.r.y0 + t.r.y1) / 2;
      const stellen = [t.r.x0 + 2, (t.r.x0 + t.r.x1) / 2, t.r.x1 - 2];
      if (stellen.some((x) => x > r.x0 && x < r.x1 && cy > r.y0 && cy < r.y1)) {
        befunde.push(`DECKT  "${t.txt}" liegt unter einer Fläche (${el.tagName})`);
        break;
      }
    }
  }
  return befunde;
});
