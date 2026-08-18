# Imprint-Referenz — was die Karten wirklich bauen

Stand 18.08.2026 · Grundlage: 12 Screenshots aus Imprint, von Leon ausgewählt („find das
von denen wirklich extremst geil"). Bilder liegen in `shots/` und sind **gitignored**
(fremdes Copyright, dieses Repo ist public). Diese Analyse ist eigener Text und darf mit.

Die Auswahl ist eine Stichprobe von Karten, die Leon überzeugen — kein Querschnitt durch
Imprint. Alles unten gilt für diese 12.

## Die 12 Karten

| # | Karte | Bild-Schicht | Diagramm-Schicht |
|---|---|---|---|
| 01 | Shadow Projection | 2 Kreise + Schatten-Polygon | Pfeile, freie Labels |
| 02 | Now/Future, Pleasure/Pain | Tasse, Würfel, Gehirn (Strich) | Zonen-Rechteck, Doppelpfeil-Achse, Pol-Labels |
| 03 | Macroexpressions | 2 Charakter-Illustrationen | Marker-Ringe, Leader-Lines, Labels |
| 04 | Eisberg Wissen | Eisberg + Wasserlinie | Maßklammer, Pill-Labels |
| 05 | Gut Instinct | Szene mit Innenansicht (Organe) | Lichtkegel, gerichtete Pfeile, Labels |
| 06 | EQ-Blüte | 5 transparente Kreise | Mengen-Labels, Zentrum-Label |
| 07 | Microexpressions-Katalog | 6 Icon-Kreise (Mund/Auge) | Text-Highlights, Farbcodierung |
| 08 | Hang By Your Teeth | Ganzkörper-Figur | Maßklammer, Leader-Lines, Callout-Kästen |
| 09 | Limit The Fidget | Sofa-Szene, 2 Personen | Callout-Kästen, Leader-Lines |
| 10 | Contempt | Schuhe zertreten Häuser | Labels **auf** den Objekten, gebogen |
| 11 | Beziehungs-Pflanze | Topf, Pflanze, 2 Personen | Labels auf Blättern, Container-Label |
| 12 | Zone of Comfort/Learning | Fuß im Wasser, Wellen | Zonen mit Verlauf, Zitat-Blasen |

## Befund 1 — Es sind immer zwei Schichten

Jede Karte hat ein **Bild** und darüber eine **Erklär-Schicht**. Die Erklär-Schicht ist in
allen 12 Karten aus denselben sechs Primitiven gebaut:

1. **Callout-Label** — gefüllter Kasten (gelb/grün) oder schwarze Pill mit weißer Schrift
2. **Leader-Line** — dünne schwarze Linie vom Label zur bezeichneten Stelle
3. **Maßklammer** — eckige Klammer, die eine Spanne markiert (04 „What I Know", 08 „Weightless")
4. **Pfeil** — gerichtet, Gewicht variiert (dicker weißer Pfeil im Schatten vs. dünner Callout-Pfeil)
5. **Marker-Ring** — Kreis um eine Stelle im Bild (03)
6. **Zone** — benannte Fläche, in der etwas liegt (02 „Now", 12 „Zone of Comfort")

**Das ist der eigentliche Hebel.** Diese Schicht ist bildunabhängig: dieselben sechs
Primitive sitzen auf einer Charakter-Illustration (03), auf einem Eisberg (04) und auf zwei
Kreisen (01). Sie machen aus einem Bild eine Erklärung.

Unser Renderer hat davon heute: Labels und `notes`. Es fehlen Leader-Lines als generisches
Mittel, Maßklammern, Marker-Ringe und benannte Zonen als Overlay.

## Befund 2 — Drei Aufwandsklassen, und die billigste trägt mit

**Klasse A — aus Primitiven konstruierbar** (01, 02, 06, 07): Kreise, Polygone, Pfeile,
kleine Icons. Kein Illustrator nötig. Karte 01 ist eine der stärksten der Auswahl und
besteht aus zwei Kreisen, einem Polygon und drei Labels.

**Klasse B — ein gezeichnetes Objekt mit beschriftbaren Teilen** (04, 11, teilweise 12):
einmal zeichnen, breit wiederverwendbar. Das ist unsere heutige Asset-Library.

**Klasse C — echte Szene mit Personen** (03, 05, 08, 09, 10): Illustrator-Arbeit. Da können
wir nicht mit, und das war nie die Wette.

5 von 12 Karten liegen in A oder B. **Die Klasse-A-Karten wirken nicht schwächer als die
Szenen** — sie sind nur billiger.

## Befund 3 — Sechs Relationen, die unser Katalog nicht hat

| Relation | Aussage | Beleg | Klasse |
|---|---|---|---|
| **Komposition** | „X besteht aus diesen N Teilen" | 06 EQ, 11 Pflanze | A |
| **Typologie** | „es gibt N Sorten, jede erkennst du an Y" | 07 | A |
| **Zonen an einer Achse** | „zwischen A und B liegen benannte Bereiche" | 02, 12 | A |
| **Projektion** | „A wirft etwas auf B" | 01 | A |
| **Kräfte auf ein Ziel** | „diese N Kräfte beschädigen X" | 10 | C |
| **Annotiertes Ding** | „an diesem Ding sind folgende Stellen wichtig" | 03, 08, 09 | B/C |

Die ersten vier sind in Klasse A — konstruierbar, ohne einen Strich zu zeichnen.

## Befund 4 — In dieser Auswahl gibt es kein einziges Zahlendiagramm

Kein Balken, kein Kuchen, keine Skala. Die einzigen Zahlen stehen im Fließtext („up to four
seconds", „15% further"). Imprint erklärt hier **Beziehungen zwischen Begriffen**, nicht
Größenverhältnisse.

Das entwertet Zahl-Relationen nicht — es heißt nur, dass „wie Imprint" und „mehr Balken"
zwei verschiedene Richtungen sind und getrennt zu entscheiden sind.

## Befund 5 — Stil

- Grund: helles Warmgrau, nie reinweiß; Karten-Panels weiß mit runden Ecken, Key-Insight-Karten mit dunkelgrauem Rahmen
- Palette je Karte: 2–4 gesättigte Flächenfarben (Orange, Blau, Gelb, Grün) + Schwarz; keine Verläufe außer als Aussage (12)
- Typo: geometrische Grotesk für den Lehrsatz; Serif nur für Bild-Headlines (08, 09)
- **Text oben, Bild unten** — ausnahmslos
- Labels ohne Rahmen (gefüllte Fläche) oder als schwarze Pill; Linien dünn und gerade
- Farbe verbindet Text und Bild: das markierte Wort im Text trägt die Farbe des zugehörigen Icons (07)

## Was daraus folgt

Der Unterschied zu unseren Karten liegt **nicht** in der Zeichenqualität der Objekte,
sondern darin, dass Imprint eine vollständige Erklär-Schicht besitzt und wir nur ihre
Anfänge. Mehr Objekte zu zeichnen holt Klasse B auf. Die Erklär-Schicht zu bauen holt
Klasse A **und** hebt jedes bestehende Asset mit.
