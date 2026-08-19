# Vier neue Relationen — Entwurf zur Abnahme

Grundlage: `docs/referenz-imprint/analyse.md`, Befund 3. Sechs Relationen fehlen dem
Katalog; vier davon sind **Klasse A** — konstruierbar aus Primitiven, ohne dass ein
Illustrator einen Strich zeichnet. Die zwei anderen (Kräfte auf ein Ziel, annotiertes
Ding) brauchen gezeichnete Szenen und bleiben außen vor.

## ⚠️ Das Klasse-A-Kriterium war der falsche Filter (19.08.)

Leons Urteil zur ersten Mockup-Runde: „da fehlt Liebe, Detail und Sinn, nicht nur
Geometrie." Er hat recht, und die Ursache steht im Absatz darüber. „Konstruierbar ohne
Illustrator" war als AUSWAHL-Kriterium gedacht — welche Relationen sind machbar — und ist
dann still zum ZEICHEN-Kriterium geworden: Ring, Balken, drei Formen in einer Reihe, Kegel.
Der Filter hat die Individualität wegsortiert. Dieselbe Kritik-Klasse wie am 14.08. bei den
Assets („Andeutung statt gestaltetes Objekt").

Was die Referenz stattdessen tut — alle zwölf Karten dafür nochmal einzeln angesehen:

1. **Der Bildkörper ist ein Gegenstand aus dem Thema, kein Schema darüber.** Blumentopf für
   Beziehungen, Fuß im Wasser für Gesprächstiefe, drei Schuhe auf Häusern für Verachtung.
   Nur 2 von 12 Karten sind reine Geometrie — und die eine lässt die Form selbst die
   Metapher tragen (der schwarze Klecks IST ein Schatten).
2. **Die Folge ist mitgezeichnet.** Die Häuser unter den Schuhen haben Risse, die
   Blumentöpfe daneben sind umgestürzt. Bedeutung sitzt in der Form, nicht im Etikett.
3. **Beschriftung liegt AUF dem Objekt** und folgt seiner Neigung.
4. **Es passiert etwas.** Zwei Menschen gießen die Pflanze, ein Fuß tritt ins Wasser.
5. **Kleinkram, der nichts erklärt:** Gänseblümchen, Wellenringe, Schuhnähte, Trümmer,
   Wangenröte, Bewegungsstriche. Das ist die „Liebe" — sie kostet Striche, keine Logik.
6. **Konkrete Sätze im Bild statt Etiketten** („macht das Feuern wahrscheinlicher", ganze
   Zitate in Sprechblasen).
7. **Kontur plus Farbfläche**, teils gegeneinander versetzt (Risograph-Fehldruck).
8. **Das Motiv füllt die Fläche** und wird am Rand angeschnitten.

**Zweiter Anlauf: `probes/relation-szene.mjs`** → `relation-szene-shots/`. Gleiche vier
Relationen, gleiche Inhalte, aber als Szene: die Komposition ist das Zifferblatt eines
Weckers, die Typologie dreimal dieselbe Nervenzelle in drei Zuständen, die Zonen-Achse eine
Nachtstraße mit ausgehenden Laternen, die Projektion ein Handy auf der Bettdecke, dessen
Display sich in einer Pupille spiegelt.

Zwei Lehren aus dem Bauen, beide teuer bezahlt:

- **Bausteine einzeln prüfen, bevor sie klein zwischen Text sitzen** (`probes/formen-werkbank.mjs`).
  Der erste Anlauf hatte eine Mondsichel, die als Strich rendert (ein Bogenradius kleiner als
  die halbe Sehne — der Browser skaliert ihn stillschweigend hoch und legt beide Bögen
  übereinander), eine Hand, die als Klumpen las, und ein Profilgesicht ohne Kinn. In der
  fertigen Karte sehen alle drei gleich aus: „wirkt unfertig".
- **Handgesetzte Beschriftung braucht eine Messung.** Der Renderer hat für sein eigenes
  Zeichnen einen Platzierungs-Solver, ein Mockup hat keinen — und drei Runden Augenmaß
  erzeugten dreimal dieselbe Klasse Fehler: Text aus der Karte gelaufen, Text hinter einem
  Gegenstand, Text auf einer Kontur. Die Prüfung am Ende von `relation-szene.mjs` misst das
  jetzt (Flächen zählen bewusst nicht als Kollision — eine Beschriftung IM Sektor oder AUF
  dem Lichtkegel ist gewollt) und hat dabei selbst zwei Messfehler offengelegt: eine
  Verdeckungsprüfung, die nur die Wortmitte ansah und „ÜBERMÜDET" hinter dem Auto durchließ,
  und eine Text-gegen-Text-Prüfung, die parallele schräge Zeilen als Kollision meldete,
  weil sie achsparallele Kästen verglich.

Offen bleibt die Konsequenz für den Katalog: Szenen sind nicht mehr „aus Primitiven für
jedes Thema konstruierbar". Die Relation kann das Gerüst bleiben (sie ist die prüfbare
Struktur), aber der Körper wird ein gezeichnetes Trägerobjekt — und davon braucht jede
Relation mehrere, sonst sieht jede Komposition wie ein Wecker aus.

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

## Maße und Zahlen an den Achsen (Leon, 18.08.)

Der Gedanke: wenn `composition` schon mit Prozent arbeitet, wären Maße und Zahlen an x-
und y-Achse vielleicht auch für die Genauigkeit gut.

**Der Punkt trifft — aber die Reihenfolge entscheidet alles.** Es gibt zwei Sorten von
Geometrie im Katalog, und sie vertragen Zahlen unterschiedlich gut:

**Wo die Geometrie die Zahl schon TRÄGT, sind Zahlen gratis und exakt.** Bei
`composition` ist der Sektorwinkel der Anteil, bei `zone-axis` ist die Zonenbreite der
Abschnitt und die Pole tragen bereits Werte („0 STUNDEN WACH" → „19 STUNDEN WACH").
Zwischenmarken sind dort direkt ableitbar, ohne dass irgendwer etwas behaupten muss.

**Wo die Geometrie eine FORM-Behauptung ist, würden Zahlen präzise lügen.** Die
Kurvenkarte zeichnet keine Daten, sondern Formen (`decay-halflife`, `compound-rise`, …);
der Prompt sagt ausdrücklich „Keine Koordinaten, keine Punktlisten. Das System zeichnet
die Form", und `t` ist ein Bruchteil der Strecke, keine Einheit.

Gemessen (`node probes/kurve-treue.mjs`) ist das kein theoretisches Bedenken. Beide
Spalten in derselben Normierung: Start = 100 %, Ende der gezeichneten Strecke = 0 %;
Vergleichskurve = echter Zerfall über drei Halbwertszeiten, so wie die Karte selbst ihre
Strecke liest („nach 5 Stunden die Hälfte, nach 10 ein Viertel", Callouts auf t=0,33 und
t=0,67).

| Stelle auf der Strecke | Kurve zeigt | echter Zerfall über 3 Halbwertszeiten |
|---|---|---|
| 25 % | 48,4 % | 59 % |
| 33 % | **36,7 %** | **50 %** |
| 50 % | 21,4 % | 35 % |
| 67 % | **11,4 %** | **25 %** |

Die gezeichnete `decay-halflife` fällt deutlich steiler als der Zerfall, den sie benennt —
und sie erreicht am Ende die Null, was ein Zerfall nie tut. Das ist der zweite Teil
derselben Ursache: die Form ist als Bildidee gebaut, nicht als Funktion.
Das hat eine Folge, die schon heute sichtbar ist, ganz ohne Achsen-Zahlen: im Lauf vom
18.08. setzte das Modell „NOCH 50 % WIRKUNG" auf `t=0,33` und „NUR NOCH 25 %" auf
`t=0,67` — richtig gerechnet für eine echte Halbwertszeit-Kurve, falsch für die
gezeichnete. Die Beschriftung nennt Werte, die das Bild nicht zeigt, und es gibt kein
Gate, das das prüft: der Judge prüft Fakten im TEXT, das Audit prüft Lagen, niemand
vergleicht Label gegen Kurvenhöhe.

**Leons dritte Option (18.08.), und sie ist die stärkste: Zahlen INTERN nutzen, nicht
anzeigen.** Die Kurve entsteht aus echten Werten, im Bild steht keine einzige Zahl. Damit
fällt der Zielkonflikt weg, statt entschieden zu werden:

- Der Look bleibt der von Imprint (Befund 4: kein Zahlendiagramm in den zwölf Karten).
- Die Aussagen werden trotzdem wahr: „NOCH 50 % WIRKUNG" landet dort, wo die Kurve
  wirklich auf der Hälfte steht, weil beide aus derselben Rechnung kommen.
- Erst dadurch wird das Gate überhaupt möglich, das Beschriftung gegen Kurvenhöhe misst —
  es braucht einen Sollwert, und ohne interne Zahlen gibt es keinen.
- Das Anzeigen wird davon unabhängig: eine spätere Karte kann Zahlen zeigen, ohne dass
  irgendetwas an der Geometrie neu gebaut werden muss.

Offen dabei: woher die Werte kommen (aus dem Dossier, aus einer Formel je `shape`, oder
das Modell nennt sie und der Validator prüft sie gegen den Text), und ob `t` weiterhin ein
Bruchteil bleibt oder eine Einheit bekommt.

### Gebaut am 19.08. — die Zahl kommt aus der Formel, `t` bleibt ein Bruchteil

Leons Entscheid, an vier gerenderten Fassungen getroffen (heute · 3 · 4 · 5
Halbwertszeiten über die Breite):

- **Der Zerfall wird gerechnet, nicht nachgezeichnet.** `y = from · 0,5^(n·u)` in
  `renderer.js`; `decay-halflife` steht dafür nicht mehr in `NORM` (dort stand Zeichen für
  Zeichen dieselbe Funktion wie `saturating-rise`).
- **`to` sagt, wie WEIT der Zerfall läuft, nicht wo er endet:** `floor` = 3
  Halbwertszeiten (Hälfte bei ⅓, Viertel bei ⅔, Ende bei ⅛), `low` = 2, `mid` = 1. Damit
  bleibt der Ausdrucksraum — schneller und zäher Abbau stehen auf einer Karte nebeneinander
  —, und jede Stufe hält ihre Zusage, weil die Hälfte bei `t = 1/n` liegt.
- **`t` bleibt ein Bruchteil der Strecke.** Eine Einheit an der Achse braucht es nicht: die
  Strecke IST in Halbwertszeiten geteilt, und der Lehrsatz sagt, wie lange eine dauert.
- **Im Bild steht weiterhin keine Achsen-Zahl.** Nur die Anmerkung nennt einen Wert, und
  der stimmt jetzt mit der Höhe überein, an der sie sitzt.

Gemessen mit `node probes/kurve-treue.mjs` — aus dem Diagnose-Zettel ist damit das Gate
geworden, das der Entscheid braucht. Es misst die GEZEICHNETE Polyline gegen `0,5^k`,
Bezugsgröße ist das Startniveau (dieselbe wie in `notecheck.mjs`; die frühere Fassung
normierte auf die gezeichnete Spanne und bekam deshalb für dieselbe Kurve je nach Endhöhe
verschiedene Prozentwerte).

| Stufe | nach 1 HWZ | nach 2 | nach 3 | alte Fassung bei ⅓ |
|---|---|---|---|---|
| `to:"floor"` (3 HWZ) | 49,4 % | 25,3 % | 12,5 % | 38,1 % |
| `to:"low"` (2 HWZ) | 50,0 % | 25,0 % | — | 28,6 % |
| `to:"mid"` (1 HWZ) | 50,0 % | — | — | 59,1 % |

Gegenprobe mit der alten Renderer-Fassung: 9 FAIL. Die Sonden-Karte
(`probes/annot-dreh-karte.json`, aus dem Lauf vom 18.08.) trägt ihre beiden Zahlen jetzt
als `notes` bei t=0,33 und t=0,67 — `notecheck` misst 50 % und 25 % und meldet PASS, **ohne
t-Versatz**. Vorher war derselbe Satz nur dadurch „wahr", dass das Gate die Zahl zur Kurve
geschoben hat.

### Und die Erklär-Schicht bleibt mengenfrei

Der zweite Teil desselben Befunds: `annotations[].t` war ein totes Feld — der Callout-Zweig
liest es nie, er setzt den Kasten dorthin, wo Platz ist. Gemessen stand „NOCH 50 % WIRKUNG"
bei einem x-Anteil von 0,15 auf 66 % Kurvenhöhe, deklariert war t=0,33. Der Validator nahm
das Feld an, weil er unbekannte Felder nie geprüft hat.

Beides ist jetzt geschlossen, und zwar an der Wurzel statt am Einzelfall:

- **Feld-Whitelist je `art`** (`ANNOT_FELDER`): was nicht in der Liste steht, zeichnet
  niemand — die Meldung für `t` trägt die Korrektur („nimm eine notes-Anmerkung, die hat
  ein t und wird gegen die Kurve gemessen").
- **Mengen-Verbot auf Kurven-Karten**: ein Callout hat dort keinen Ort, also darf er keine
  Menge nennen. Andere Karten-Typen bleiben frei — auf einer `venn`-Karte behauptet
  „4 HALBTÖNE" nichts über Geometrie. Was ein Mengen-Claim IST, steht seit heute an EINER
  Stelle (`claimedFraction` in `validate-lesson.mjs`), aus der sich Validator und
  `notecheck` bedienen; vorher hätte eine zweite Definition zwei Wahrheiten ergeben.
- Gegen den Bestand gemessen: 138 Lektionen, **0** neue Befunde — die Regeln treffen
  Fehler, nicht Gewohnheiten.

**Empfehlung, in dieser Reihenfolge:**

1. ~~**Zuerst die Kurve an ihre eigene Behauptung binden**~~ — **erledigt 19.08.**, siehe
   oben. `decay-halflife` ist gerechnet, `probes/kurve-treue.mjs` hält es fest.
2. **Dann Zahlen dort erlauben, wo die Geometrie sie hält** — `zone-axis` und
   `composition` sofort; für die Kurve ist der Weg jetzt frei, entschieden ist er nicht:
   im Bild steht weiterhin keine Achsen-Zahl.
3. ~~**Ein Gate dazu**~~ — steht, auf **beiden** Schichten: `notecheck.mjs` misst
   Anmerkungen gegen die Kurvenhöhe, der Validator verbietet die Menge dort, wo sie nicht
   messbar wäre, und der RICHTUNGS-Claim der Erklär-Schicht wird jetzt ebenfalls gemessen —
   `an: series:…` gegen den ganzen Verlauf, `an: note:…` gegen die Steigung an dieser
   Stelle. Gegenprobe am echten Fall: „NACHFRAGE BRICHT EIN" (Feld-Stresstest, Geschichte)
   meldet OK, dieselbe Karte mit „NACHFRAGE STEIGT" meldet HART mit Korrektur.

Offen bleibt die Stil-Frage: Imprint benutzt in den zwölf Referenz-Karten **kein
einziges** Zahlendiagramm (Befund 4 der Analyse). Zahlen erhöhen die Genauigkeit, ziehen
die Karte aber Richtung Statistik-Grafik. Mein Vorschlag wäre, Zahlen als OPTION zu
behandeln, die eine Karte nutzt, wenn ihre Aussage quantitativ ist („nach 5 Stunden die
Hälfte") — und wegzulassen, wenn sie es nicht ist („erst frisch, dann träge").

## Was zu entscheiden ist

1. **Alle vier, oder eine Auswahl?** Jede kostet Renderer + Validator + Prompt + Werkbank.
2. **Der Look je Karte** — die vier Bilder in `relation-mockup-shots/`.
3. **`composition` mit oder ohne Anteile** (`share`): mit Anteilen wird die Relation
   quantitativ und grenzt an ein Zahlendiagramm, das Imprint in dieser Auswahl NICHT
   benutzt (Befund 4 der Analyse).
