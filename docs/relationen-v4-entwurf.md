# Vier neue Relationen — Entwurf zur Abnahme

Grundlage: `docs/referenz-imprint/analyse.md`, Befund 3. Sechs Relationen fehlen dem
Katalog; vier davon sind **Klasse A** — konstruierbar aus Primitiven, ohne dass ein
Illustrator einen Strich zeichnet. Die zwei anderen (Kräfte auf ein Ziel, annotiertes
Ding) brauchen gezeichnete Szenen und bleiben außen vor.

**Stand: Mockups gebaut, nicht abgenommen.** `node probes/relation-mockup.mjs` →
`relation-mockup-shots/`. Gezeichnet in der ZIEL-Rendertechnik: dieselbe Karten-Hülle,
dieselbe `renderer.css`, dieselbe Palette und dieselben Textmaße wie im Produkt — nur die
Geometrie ist von Hand gesetzt statt aus einem Contract berechnet. Was auf den Bildern
steht, sieht im gebauten Typ genauso aus.

Erst nach der Abnahme entstehen Renderer, Validator-Regeln, Prompt-Abschnitt und
Werkbank-Fälle. Der Contract unten ist ein Vorschlag, kein Beschluss.

## Warum diese vier den Katalog wirklich verbreitern

Der Katalog hat neun Relationen, und sie erklären fast alle eine **Bewegung**: etwas
entwickelt sich (trend), wirkt vielfach (multiplication), läuft im Kreis (loop), sinkt
(descent), wiegt schwerer (weighing). Was fehlt, ist der **Aufbau**: woraus etwas besteht,
welche Sorten es gibt, wo auf einer Strecke man steht, was von A auf B fällt. Genau diese
Aussagen trägt Imprint auf seinen stärksten Karten — und für sie gab es bei uns bisher nur
Notlösungen (eine Komposition als `multiplication` gezeichnet sagt „wirkt auf", nicht
„besteht aus").

## 1 — `composition`: „X besteht aus diesen N Teilen"

Beleg: Imprint 06 (EQ), 11 (Pflanze). Bild: Scheibe mit Kern, Sektoren sind die Teile.

```
{ "relation":"composition", "text",
  "whole":{"label":"<CAPS ≤ 10>"},
  "parts":[{"label":"<CAPS ≤ 12>","share":<Zahl>?,"color"}×2–5],
  "annotations":[…]? (max 4), "caption"? }
```

- **`share` ist optional und bestimmt den Winkel.** Ohne `share` sind alle Teile gleich
  groß — und dann steht auch keine Zahl im Bild. Der erste Entwurf zeichnete drei gleiche
  Sektoren unter den Zahlen 50/25/25; eine Fläche, die etwas anderes sagt als ihr Label,
  ist schlimmer als gar keine Zahl.
- Abgrenzung zu `loop`: keine Pfeile, keine Richtung. Ein Kreislauf sagt „danach", eine
  Komposition sagt „darin".
- Beschriftung sitzt IM Sektor. Außen hängt ihre Lage an der Textbreite — im ersten
  Entwurf lief „LEICHTSCHLAF" aus der Karte.

## 2 — `typology`: „es gibt N Sorten, jede erkennst du an Y"

Beleg: Imprint 07. Bild: N Felder nebeneinander, je eine Form als Erkennungszeichen.

```
{ "relation":"typology", "text",
  "kinds":[{"label":"<CAPS ≤ 14>","mark":"<≤ 34>","shape":"kreis|quadrat|dreieck","color"}×2–4],
  "annotations":[…]? (max 4), "caption"? }
```

- Abgrenzung zu `contrast`: dort stehen ZWEI Seiten gegeneinander, hier stehen N Sorten
  nebeneinander — keine wiegt schwerer, keine ist die Antwort auf die andere.
- `shape` ist eine **Form**, kein Icon: ein Icon je Sorte hieße zeichnen, eine Form ist
  konstruierbar und trägt trotzdem. Die Farbe erbt der Titel, wie in der Erklär-Schicht.
- `mark` ist das Erkennungszeichen („macht das Feuern wahrscheinlicher"), nicht die
  Definition — es beantwortet „woran merke ich das?".

## 3 — `zone-axis`: „zwischen A und B liegen benannte Bereiche"

Beleg: Imprint 02, 12. Bild: waagerechter Balken aus benannten Zonen, Pole beschriftet.

```
{ "relation":"zone-axis", "text",
  "from":{"label":"<CAPS ≤ 16>"}, "to":{"label":"<CAPS ≤ 16>"},
  "zones":[{"label":"<CAPS ≤ 12>","width":<Zahl>?,"color"}×2–4],
  "marker":{"at":<0–1>,"label":"<CAPS ≤ 22>"}?,
  "annotations":[…]? (max 4), "caption"? }
```

- Die Zone trägt ihren **Namen**, keinen Untertitel: die schmalste Zone bestimmt, was
  hineinpasst, und drei Wörter unter „ÜBERMÜDET" liefen im Entwurf in die Nachbarzone.
  Was die Zone bedeutet, sagt der Lehrsatz. (Im gebauten Typ wird das ein an der
  Zonenbreite gemessener Deckel, keine Schätzung.)
- `marker` macht aus einer Skala eine **Lage** („hier fährst du heim"). Optional.
- Abgrenzung zu `descent`: dort fällt etwas unter eine Grenze, hier gibt es kein Oben und
  Unten, sondern eine Strecke mit Abschnitten.

## 4 — `projection`: „A wirft etwas auf B"

Beleg: Imprint 01. Bild: Quelle, Kegel, Zielfläche — auf dem Kegel steht, WAS ankommt.

```
{ "relation":"projection", "text",
  "source":{"label":"<CAPS ≤ 14>","color"},
  "beam":{"label":"<CAPS ≤ 16>","sub":"<≤ 24>"?},
  "target":{"label":"<CAPS ≤ 14>","color"},
  "annotations":[…]? (max 4), "caption"? }
```

- Abgrenzung zum `pfeil` der Erklär-Schicht: ein Pfeil sagt „wirkt auf". Eine Projektion
  zeigt, **was** ankommt und **wie weit** es reicht — der Kegel hat eine Breite, und die
  ist die Aussage.
- Quelle und Ziel sind Formen, keine Assets: Rechteck und Ellipse tragen die Karte. Wo ein
  Asset existiert (Auge, Person), kann es später an ihre Stelle treten, ohne dass der
  Contract sich ändert.

## Was zu entscheiden ist

1. **Alle vier, oder eine Auswahl?** Jede kostet Renderer + Validator + Prompt + Werkbank.
2. **Der Look je Karte** — die vier Bilder in `relation-mockup-shots/`.
3. **`composition` mit oder ohne Anteile** (`share`): mit Anteilen wird die Relation
   quantitativ und grenzt an ein Zahlendiagramm, das Imprint in dieser Auswahl NICHT
   benutzt (Befund 4 der Analyse).
