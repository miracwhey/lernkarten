// Bausteine der Menschen-Szenen — EINE Geometrie-Quelle für Werkbank und Karte.
// Die Werkbank prüft sie einzeln und groß, die Karte setzt sie klein zwischen Text; beide
// müssen dieselben Formen sehen, sonst prüft die Werkbank etwas, das nie ausgeliefert wird.
export const K = { ink: "var(--ink)", muted: "var(--muted)", line: "var(--line)", card: "var(--card)", chrome: "var(--chrome)" };

// ——————————————————————— Röhre: Arm, Bein, Hals ———————————————————————
// Ein Glied ist ein Strich mit Kontur. Zwei Pfade übereinander sind der billigste Weg
// dorthin: der untere breiter und in Tinte, der obere schmaler in Stofffarbe. Runde Enden,
// damit Schulter und Handgelenk keine Ecken bekommen.
export const roehre = (d, breite, farbe) =>
  `<path d="${d}" fill="none" stroke="${K.ink}" stroke-width="${breite + 4.6}" stroke-linecap="round" stroke-linejoin="round"/>`
  + `<path d="${d}" fill="none" stroke="${farbe}" stroke-width="${breite}" stroke-linecap="round" stroke-linejoin="round"/>`;

// ——————————————————————— Kopf ———————————————————————
// Frontal statt Profil, und das ist eine Entscheidung gegen den ersten Versuch: ein Profil
// braucht Stirn, Nasenwurzel, Nasenrücken, Lippen, Kinn und Hals — sechs Kurven, die alle
// stimmen müssen, sonst wird es ein Zipfelgesicht. Ein frontales Oval braucht eine.
//
// `wach` steuert nur die Augenpartie. Müde heißt hier: Lid halb heruntergezogen (Bogen statt
// Kreis), Schatten darunter, Braue flach. Das sind drei Striche Unterschied und trotzdem der
// ganze Ausdruck.
export const kopf = (x, y, s = 1, { wach = true, haut = "var(--es-soft)", haar = K.ink, deg = 0, blick = 0 } = {}) => {
  const g = (v) => +(v * s).toFixed(1);
  const auge = (ax) => wach
    ? `<circle cx="${x + g(ax)}" cy="${y - g(2)}" r="${g(3.4)}" fill="${K.ink}"/>`
      + `<path d="M${x + g(ax - 6)},${y - g(11)} q${g(6)},${g(-3.5)} ${g(12)},${g(0.5)}" fill="none" stroke="${K.ink}" stroke-width="${g(1.9)}" stroke-linecap="round"/>`
    // Müde: das Oberlid ist der Bogen, die Pupille sitzt als flacher Rest darunter.
    : `<path d="M${x + g(ax - 6)},${y - g(3)} q${g(6)},${g(4.5)} ${g(12)},0" fill="none" stroke="${K.ink}" stroke-width="${g(2.4)}" stroke-linecap="round"/>`
      + `<path d="M${x + g(ax - 5)},${y + g(4)} q${g(5)},${g(2.6)} ${g(10)},0" fill="none" stroke="${K.ink}" stroke-width="${g(1.5)}" stroke-linecap="round" opacity="0.5"/>`
      + `<path d="M${x + g(ax - 6)},${y - g(11)} q${g(6)},${g(1.5)} ${g(12)},${g(-1)}" fill="none" stroke="${K.ink}" stroke-width="${g(1.9)}" stroke-linecap="round"/>`;
  return `<g transform="rotate(${deg} ${x} ${y + g(26)})">
    <ellipse cx="${x}" cy="${y}" rx="${g(23)}" ry="${g(26)}" fill="${haut}" stroke="${K.ink}" stroke-width="${g(2.6)}"/>
    <!-- Haar als eigene Fläche über dem Schädel; sie schneidet die Stirn an und gibt dem
         Kopf erst seine Silhouette. Ohne sie liest das Oval als Ei. -->
    <path d="M${x - g(23)},${y - g(6)} q${g(1)},${g(-27)} ${g(23)},${g(-27)} q${g(22)},0 ${g(23)},${g(27)}
             q${g(-6)},${g(-13)} ${g(-19)},${g(-14)} q${g(-16)},${g(-1)} ${g(-27)},${g(14)} z"
      fill="${haar}"/>
    ${auge(-9 + blick)}${auge(9 + blick)}
    ${wach
      ? `<path d="M${x - g(6)},${y + g(13)} q${g(6)},${g(4)} ${g(12)},0" fill="none" stroke="${K.ink}" stroke-width="${g(2.2)}" stroke-linecap="round"/>`
      : `<path d="M${x - g(6)},${y + g(15)} q${g(6)},${g(-2.5)} ${g(12)},${g(0.5)}" fill="none" stroke="${K.ink}" stroke-width="${g(2.2)}" stroke-linecap="round"/>`}
  </g>`;
};

// ——————————————————————— Sitzende Figur ———————————————————————
// (x, y) ist der Sitzpunkt: dort, wo das Gesäß die Sitzfläche berührt. Alles wächst von da
// nach oben, damit eine Figur auf einen Stuhl gesetzt werden kann, ohne dass man rechnet.
//
// Erster Versuch, verworfen: der Rumpf war eine Röhre wie Arm und Bein. Das ergibt einen
// Sack — ein Rumpf hat SCHULTERN, ist oben breit und unten schmal, und ohne diesen Umriss
// liest die Figur als Klumpen, aus dem Gliedmaßen ragen. Zweiter Fehler derselben Runde: der
// Arm lief quer über den Rumpf und wurde als zweites Bein gelesen. Beides sichtbar nur, weil
// die Figur hier groß und allein steht.
//
// `sacken` von 0 bis 1 ist die ganze Aussage: 0 = aufrecht, Kopf über der Hüfte; 1 =
// zusammengesackt, Rücken rund, Kopf vor der Hüfte. Beide Zustände kommen aus DERSELBEN
// Figur — das ist die Antwort auf die Bibliotheks-Frage: eine Figur, viele Haltungen.
export const sitzend = (x, y, s = 1, {
  sacken = 0, stoff = "var(--ich-soft)", haut = "var(--es-soft)", haar = K.ink,
  wach = true, blick = 0, spiegel = false, arm = "haengend", tischY = null,
} = {}) => {
  const g = (v) => +(v * s).toFixed(1);
  const f = spiegel ? -1 : 1;
  const gx = (v) => x + g(v) * f;
  const neig = sacken * 15;                          // der ganze Oberkörper kippt nach vorn
  const rumpfH = 60, ks = s * 0.72;                  // Kopf 0,72: allein stimmte er, auf dem
  const kr = ks * 26;                                // Rumpf war er fast so hoch wie dieser
  // Seitenansicht: Rücken hinten, Brust vorn. Der zweite Versuch war frontal-symmetrisch und
  // hatte deshalb keine Vorderseite — ein Arm, der davor hängt, verschwand in der Silhouette.
  const rumpf = `M${gx(-14)},${y + g(2)}
    Q${gx(-18 + sacken * 4)},${y - g(rumpfH * 0.5)} ${gx(-15)},${y - g(rumpfH - 8)}
    Q${gx(-14)},${y - g(rumpfH)} ${gx(-6)},${y - g(rumpfH + 1)}
    L${gx(9)},${y - g(rumpfH + 1)}
    Q${gx(17)},${y - g(rumpfH - 3)} ${gx(17)},${y - g(rumpfH - 14)}
    Q${gx(17)},${y - g(18)} ${gx(15)},${y + g(2)} Z`;
  const halsY = y - g(rumpfH + 1), kopfY = halsY - g(7) - kr;
  const schulter = [gx(6), y - g(rumpfH - 8)];
  const platte = tischY ?? y - g(24);
  // Arm-Wege. Alle drei führen vom Schulterpunkt nach VORN aus der Silhouette heraus — das
  // war der Fehler der zweiten Runde: ein Arm über dem Rumpf, gleiche Stofffarbe, nur durch
  // eine Kontur getrennt, liest als Falte oder als zweites Bein.
  // „stuetzt" ist die Haltung, um die es geht: Ellbogen auf der Platte, Unterarm senkrecht
  // hoch, der Kopf ruht auf der Hand. Sie erzählt Müdigkeit ohne ein einziges Wort.
  const ell = { haengend: [gx(26), y - g(26)], tisch: [gx(30), platte - g(4)], stuetzt: [gx(30), platte - g(3)] }[arm];
  const handZiel = {
    haengend: [gx(24), y - g(2)],
    tisch: [gx(50), platte - g(3)],
    stuetzt: [gx(13), kopfY + kr * 0.62],            // an der Wange, nicht am Ellbogen
  }[arm];
  // Hand: kein Kreis. Eine Kugel am Armende liest als Gelenk. Zwei Bögen — Handrücken und
  // ein abgesetzter Daumen — reichen, damit sie als Hand gelesen wird.
  const hand = (hx, hy, drehen) => `<g transform="rotate(${drehen} ${hx} ${hy})">
      <path d="M${hx - g(7)},${hy - g(6)} q${g(9)},${g(-3)} ${g(14)},${g(2)} q${g(4)},${g(4)} ${g(1)},${g(9)}
               q${g(-4)},${g(5)} ${g(-12)},${g(3)} q${g(-6)},${g(-2)} ${g(-3)},${g(-14)} z"
        fill="${haut}" stroke="${K.ink}" stroke-width="${g(2.2)}" stroke-linejoin="round"/>
      <path d="M${hx - g(6)},${hy + g(1)} q${g(-6)},${g(1)} ${g(-5)},${g(6)}" fill="none"
        stroke="${K.ink}" stroke-width="${g(2)}" stroke-linecap="round"/>
    </g>`;
  return `<g>
    <!-- Bein: Oberschenkel waagerecht nach vorn, Knie, Unterschenkel senkrecht, Schuh -->
    ${roehre(`M${gx(-4)},${y - g(3)} L${gx(42)},${y - g(1)}`, g(18), stoff)}
    ${roehre(`M${gx(42)},${y - g(1)} L${gx(45)},${y + g(46)}`, g(14), stoff)}
    <path d="M${gx(38)},${y + g(46)} q${g(-2) * f},${g(9)} ${g(7) * f},${g(9)} h${g(13) * f}
             q${g(4) * f},0 ${g(3) * f},${g(-9)} z" fill="${K.ink}"/>
    <g transform="rotate(${neig * f} ${gx(0)} ${y})">
      ${roehre(`M${gx(1)},${halsY + g(6)} L${gx(1)},${halsY - g(7)}`, g(12), haut)}
      <path d="${rumpf}" fill="${stoff}" stroke="${K.ink}" stroke-width="${g(2.6)}" stroke-linejoin="round"/>
      ${kopf(gx(0), kopfY, ks, { wach, haut, haar, deg: sacken * 6 * f, blick: blick * f })}
      ${roehre(`M${schulter[0]},${schulter[1]} L${ell[0]},${ell[1]}`, g(13), stoff)}
      ${roehre(`M${ell[0]},${ell[1]} L${handZiel[0]},${handZiel[1]}`, g(11), stoff)}
      ${hand(handZiel[0], handZiel[1], (arm === "stuetzt" ? -80 : 8) * f)}
    </g>
  </g>`;
};

// ——————————————————————— Kleine Figur ———————————————————————
// Der Befund, der die drei Runden davor entwertet: die Referenz zeichnet Menschen in ZWEI
// Modi, und nur einer ist konstruierbar.
//
// Karte 09 (Sofa) ist der teure: große Figuren, Dreiviertel-Ansicht, Kleidungsfalten,
// einzelne Finger, Brille, Zopf von hinten. Das ist Illustrator-Arbeit und war nie die Wette.
// Karte 11 (Pflanze) ist der billige: die beiden Gießenden sind WINZIG, keine zwei
// Zentimeter neben einem Topf, der die halbe Karte füllt. Sie haben kein Gesicht und keine
// Anatomie — Haar, helles Oberteil, dunkle Hose, und in der Hand eine Gießkanne.
//
// Und genau da liegt die Handlung: nicht im Körper, sondern in der REQUISITE und dem, was
// aus ihr herausläuft. Der Wasserstrahl erzählt „gießen", nicht der Arm. Das macht die Figur
// wiederverwendbar und das Thema billig — ein neues Thema kostet eine neue Requisite, keine
// neue Figur.
// `requisite` ist eine Funktion (handX, handY, einheit, spiegel) → SVG. Sie wird von der
// Figur AN DIE HAND gesetzt, nicht daneben platziert. Der erste Versuch legte beides frei
// nebeneinander, und prompt schwebten Eimer und Kiste neben der Faust — bei dieser Figurgröße
// ist der Griff der einzige Beweis, dass jemand etwas tut.
export const klein = (x, y, h = 56, {
  stoff = K.card, hose = K.ink, haut = "var(--es-soft)", haar = K.ink,
  spiegel = false, armWinkel = 25, zopf = false, requisite = null, armLang = 17,
} = {}) => {
  const u = h / 56, g = (v) => +(v * u).toFixed(1);   // h = Gesamthöhe, (x,y) = Standpunkt
  const f = spiegel ? -1 : 1;
  const gx = (v) => x + g(v) * f;
  const kopfY = y - g(46), kr = g(5.8);
  // Schulter an der VORDEREN Kante, nicht in der Körpermitte: von dort läuft der Arm nach
  // vorn aus der Silhouette heraus. In der Mitte angesetzt lag er quer über der Brust und
  // las als heller Streifen auf dem Oberteil.
  // armWinkel: 0 = hängt senkrecht, positiv = nach VORN gehoben. Negative Werte schwenken
  // ihn hinter den Körper — das war der zweite Grund für den Streifen über der Brust.
  const schulter = [gx(7), y - g(36)];
  const rad = (armWinkel * f - 90) * Math.PI / 180;
  const handP = [schulter[0] + Math.cos(rad) * g(armLang) * f, schulter[1] - Math.sin(rad) * g(armLang)];
  return `<g>
    <path d="M${gx(-3)},${y - g(24)} L${gx(-4)},${y}" stroke="${hose}" stroke-width="${g(5.5)}" stroke-linecap="round"/>
    <path d="M${gx(4)},${y - g(24)} L${gx(6)},${y}" stroke="${hose}" stroke-width="${g(5.5)}" stroke-linecap="round"/>
    <path d="M${gx(-8)},${y} h${g(9) * f}" stroke="${K.ink}" stroke-width="${g(3)}" stroke-linecap="round"/>
    <path d="M${gx(2)},${y} h${g(9) * f}" stroke="${K.ink}" stroke-width="${g(3)}" stroke-linecap="round"/>
    <!-- Oberkörper: eine Fläche mit Schulterlinie, mehr braucht es bei dieser Größe nicht -->
    <path d="M${gx(-7)},${y - g(22)} L${gx(-8)},${y - g(34)} Q${gx(-8)},${y - g(38)} ${gx(-3)},${y - g(38)}
             L${gx(3)},${y - g(38)} Q${gx(8)},${y - g(38)} ${gx(8)},${y - g(34)} L${gx(7)},${y - g(22)} Z"
      fill="${stoff}" stroke="${K.ink}" stroke-width="${g(2)}" stroke-linejoin="round"/>
    <path d="M${gx(0)},${y - g(38)} v${g(-4)}" stroke="${haut}" stroke-width="${g(4)}"/>
    <circle cx="${gx(0)}" cy="${kopfY}" r="${kr}" fill="${haut}" stroke="${K.ink}" stroke-width="${g(2)}"/>
    <!-- Haar als Kappe NUR über dem Schädeldach: tiefer angesetzt wurde daraus ein Helm, der
         das ganze Gesicht verschluckt. Der Zopf ist das einzige Unterscheidungsmerkmal, das
         die Referenz zwei Figuren bei dieser Größe gibt. -->
    <path d="M${gx(-5.8)},${kopfY - g(2)} q${g(0.5) * f},${g(-6.5)} ${g(5.8) * f},${g(-6.5)}
             q${g(5.4) * f},0 ${g(5.8) * f},${g(6.5)} q${g(-2.7) * f},${g(-2.8)} ${g(-5.8) * f},${g(-2.8)}
             q${g(-3.2) * f},0 ${g(-5.8) * f},${g(2.8)} z" fill="${haar}"/>
    ${zopf ? `<path d="M${gx(-5)},${kopfY - g(2.5)} q${g(-5.5) * f},${g(3)} ${g(-3.5) * f},${g(11)}"
      stroke="${haar}" stroke-width="${g(4)}" stroke-linecap="round" fill="none"/>` : ""}
    ${requisite ? requisite(handP[0], handP[1], u, f) : ""}
    <path d="M${schulter[0]},${schulter[1]} L${handP[0]},${handP[1]}" stroke="${K.ink}" stroke-width="${g(4.6)}" stroke-linecap="round"/>
    <path d="M${schulter[0]},${schulter[1]} L${handP[0]},${handP[1]}" stroke="${stoff}" stroke-width="${g(2.6)}" stroke-linecap="round"/>
    <circle cx="${handP[0]}" cy="${handP[1]}" r="${g(2.8)}" fill="${haut}" stroke="${K.ink}" stroke-width="${g(1.4)}"/>
  </g>`;
};

// ——————————————————————— Requisiten ———————————————————————
// Sie tragen die Handlung. Eine Figur mit Eimer wischt, dieselbe Figur mit Kiste räumt ein —
// der Körper ist derselbe, das Thema wechselt.
// Signatur überall (handX, handY, einheit, richtung): (handX, handY) ist der GRIFF, nicht die
// Mitte des Gegenstands. Ein Eimer hängt unter der Hand, ein Besen steht auf dem Boden und
// wird oben gehalten — wer die Mitte übergibt, bekommt schwebende Requisiten.
export const eimer = ({ strahl = 0 } = {}) => (x, y, u = 1, f = 1) => {
  const g = (v) => +(v * u).toFixed(1);
  const by = y + g(9);                                  // Eimerkante unter dem Bügel
  return `<g>
    <path d="M${x - g(8)},${by} q${g(8)},${g(-9)} ${g(16)},0" fill="none" stroke="${K.ink}" stroke-width="${g(1.8)}"/>
    <path d="M${x - g(9)},${by} h${g(18)} l${g(-2.5)},${g(14)} q${g(-6.5)},${g(2.5)} ${g(-13)},0 z"
      fill="var(--ich-soft)" stroke="${K.ink}" stroke-width="${g(2)}" stroke-linejoin="round"/>
    ${strahl ? `<path d="M${x + g(8) * f},${by + g(5)} q${g(13) * f},${g(7)} ${g(15) * f},${g(strahl)}" fill="none"
      stroke="var(--ich)" stroke-width="${g(2.4)}" stroke-linecap="round" opacity="0.8"/>` : ""}
  </g>`;
};
export const kiste = (beschriftung = "") => (x, y, u = 1, f = 1) => {
  const g = (v) => +(v * u).toFixed(1);
  const cy = y + g(11);
  return `<g>
    <rect x="${x - g(11)}" y="${cy - g(8)}" width="${g(22)}" height="${g(16)}" rx="${g(1.5)}"
      fill="var(--ueberich-soft)" stroke="${K.ink}" stroke-width="${g(2)}"/>
    <line x1="${x - g(11)}" y1="${cy - g(2.5)}" x2="${x + g(11)}" y2="${cy - g(2.5)}" stroke="${K.ink}" stroke-width="${g(1.5)}" opacity="0.55"/>
    ${beschriftung ? `<text class="svglabel" x="${x}" y="${cy + g(5)}" font-size="${g(7)}" text-anchor="middle"
      fill="var(--ueberich)" font-weight="700">${beschriftung}</text>` : ""}
  </g>`;
};
export const besen = (bodenY) => (x, y, u = 1, f = 1) => {
  const g = (v) => +(v * u).toFixed(1);
  const fussX = x + g(14) * f;                          // der Stiel steht schräg auf dem Boden
  return `<g>
    <line x1="${x - g(3) * f}" y1="${y - g(6)}" x2="${fussX}" y2="${bodenY - g(4)}"
      stroke="${K.ink}" stroke-width="${g(2.6)}" stroke-linecap="round"/>
    <path d="M${fussX - g(8)},${bodenY - g(5)} h${g(16)} l${g(3)},${g(7)} h${g(-22)} z"
      fill="var(--ueberich-soft)" stroke="${K.ink}" stroke-width="${g(2)}" stroke-linejoin="round"/>
  </g>`;
};

// ——————————————————————— Sprechblase ———————————————————————
// Die Referenz setzt ganze Sätze ins Bild statt Etiketten („macht das Feuern
// wahrscheinlicher"). Eine Blase mit Zipfel ist dafür der ehrlichste Träger: sie sagt, WER
// spricht, und das ist auf dieser Karte die halbe Aussage.
export const blase = (x, y, w, h, zeilen, { zipfel = "unten-links", fuellung = K.card, rand = K.ink } = {}) => {
  const zip = { "unten-links": `M${x + w * 0.22},${y + h} l${-9},${17} l${26},${-17} z`,
                "unten-rechts": `M${x + w * 0.78},${y + h} l${9},${17} l${-26},${-17} z` }[zipfel];
  return `<g>
    <path d="${zip}" fill="${fuellung}" stroke="${rand}" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(h / 2, 16)}" fill="${fuellung}" stroke="${rand}" stroke-width="2.4"/>
    <!-- Zipfelansatz wieder zumachen: der Rechteckrand läuft sonst quer durch die Blase -->
    <line x1="${x + w * (zipfel === "unten-links" ? 0.22 : 0.62)}" y1="${y + h}"
          x2="${x + w * (zipfel === "unten-links" ? 0.38 : 0.78)}" y2="${y + h}" stroke="${fuellung}" stroke-width="2.6"/>
    ${zeilen.map((z, i) =>
      `<text class="svglabel" x="${x + w / 2}" y="${y + h / 2 + (i - (zeilen.length - 1) / 2) * 17 + 5}"
         font-size="${z.size || 13}" text-anchor="middle" fill="${z.fill || K.ink}" font-weight="${z.weight || 600}">${z.txt}</text>`).join("")}
  </g>`;
};

// ——————————————————————— Kleinkram ———————————————————————
// Befund 5 der Referenz: Gänseblümchen, Wellenringe, Trümmer — Details, die nichts erklären.
// Sie kosten Striche, keine Logik, und ohne sie wirkt jede Szene wie ein Schaubild.
export const tasse = (x, y, s = 1, { leer = false } = {}) => {
  const g = (v) => +(v * s).toFixed(1);
  return `<g>
    <path d="M${x - g(13)},${y - g(16)} h${g(26)} l${g(-3)},${g(19)} q${g(-10)},${g(4)} ${g(-20)},0 z"
      fill="${leer ? K.card : "var(--ueberich-soft)"}" stroke="${K.ink}" stroke-width="${g(2.2)}" stroke-linejoin="round"/>
    <path d="M${x + g(13)},${y - g(12)} q${g(11)},${g(1)} ${g(9)},${g(9)} q${g(-2)},${g(6)} ${g(-11)},${g(5)}"
      fill="none" stroke="${K.ink}" stroke-width="${g(2.2)}"/>
    ${leer ? "" : `<line x1="${x - g(11)}" y1="${y - g(11)}" x2="${x + g(11)}" y2="${y - g(11)}" stroke="var(--ueberich)" stroke-width="${g(2)}"/>`}
  </g>`;
};

