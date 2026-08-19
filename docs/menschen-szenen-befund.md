# Menschen in Szenen — Befund und offene Entscheidung

Stand 19.08.2026 · Anlass: Leons Frage nach der Szenen-Wende („nächste Stufe wäre Menschen
+ Handlung, Imprint lässt zwei Leute die Pflanze gießen"). Auftrag war ausdrücklich EIN Bild,
um das erreichbare Niveau und seinen Preis zu messen — nicht, die Bibliothek zu planen.

## Der Befund: die Referenz benutzt Menschen in zwei Modi, und nur einer ist unser Weg

Ausgelöst durch drei erfolglose Anläufe an einer großen Figur. Erst der Blick zurück in die
zwölf Referenzbilder erklärte, warum sie erfolglos blieben.

**Modus A — groß und illustriert** (Karte 09 Sofa, 03 Macroexpressions, 08 Ganzkörper):
Dreiviertel-Ansichten, Kleidungsfalten als Strichbündel, einzelne Finger, Brille, Zopf von
hinten. Drei Runden an einer sitzenden Figur (`sitzend()` in `probes/menschen-formen.mjs`)
haben nacheinander drei verschiedene Fehler beseitigt — Rumpf als Röhre ohne Schultern, Arm
quer über der Brust, fehlender Hals — und trotzdem nur eine saubere Vektor-Figur erreicht.
Das ist Illustrator-Arbeit. Analyse-Befund 2 („Klasse C, da können wir nicht mit") gilt.

**Modus B — klein und requisitengeführt** (Karte 11 Pflanze): Die zwei Gießenden sind winzig
neben einem Topf, der die halbe Karte füllt. Kein Gesicht, keine Anatomie — Haar, helles
Oberteil, dunkle Hose. Sie tragen die Karte trotzdem, **weil die Handlung nicht im Körper
steckt, sondern in der Requisite**: der Wasserstrahl erzählt „gießen", nicht der Arm.

Konsequenz für die Bibliotheks-Frage, die nach der Szenen-Wende offen blieb: In Modus B
kostet ein neues Thema eine neue **Requisite**, keine neue Figur. Eimer, Kiste und Handrad
sind je etwa zwanzig Zeilen. Die Figur ist einmal gebaut.

**Leon hat den Look abgenommen** (19.08.): „Mir gefallen die Sachen tatsächlich sehr gut, die
Männchen, Figuren, Schädel."

## Was gebaut ist

| Datei | Rolle |
|---|---|
| `probes/menschen-formen.mjs` | Figuren + Requisiten, EINE Quelle für Werkbank und Karte |
| `probes/menschen-werkbank.mjs` | jeder Baustein einzeln und groß, vor dem Einsatz in der Karte |
| `probes/menschen-szene.mjs` | die Karte „Nachtdienst" |
| `probes/beschriftung-pruefen.mjs` | Kollisionsmessung, herausgelöst aus `relation-szene.mjs` |

Bilder erzeugen (die `*-shots/`-Ordner sind gitignored, das Repo ist public):

    node probes/menschen-werkbank.mjs     # → menschen-werkbank-shots/
    node probes/menschen-szene.mjs        # → menschen-szene-shots/
    node probes/relation-szene.mjs        # → relation-szene-shots/ (Bestand, muss sauber bleiben)

Die Karte meldet 0 Beschriftungs-Befunde. `relation-szene.mjs` läuft nach dem Herauslösen
der Prüfung unverändert sauber durch — Gegenprobe gefahren.

## Drei Fehler, die nur das Bild zeigte

Die Beschriftungsprüfung meldete währenddessen „sauber". Sie misst Text gegen Geometrie und
kann keinen davon sehen:

1. **Der Kopf war mit `--card` gefüllt** — derselben Farbe wie die Karte darunter. Damit war
   er keine Fläche, sondern eine Kontur auf dem Nichts, und der Innenraum las nicht als Raum.
2. **Der Werkstattboden lag im Hals.** Dort ist ein Profilkopf keine 180 Einheiten breit; die
   linke Figur stand neben der Kontur, und unter dem Kinn blieb ein offener Kasten stehen.
3. **Die Sätze schwebten frei im Innenraum**, keiner war einer Figur zuzuordnen.

## ⚠️ Doppel, das vor dem Weiterbauen weg muss

`assets/psyche.person` ist bereits ein Profilkopf mit ausgeformter innerer Zone, von Leon am
15.08. abgenommen („Silhouette genial geil"). Der Kopf in `menschen-szene.mjs` ist eine
**zweite Zeichnung desselben Gegenstands**. Richtung: die innere Zone von `psyche.person`
bekommt Anker, sodass sie als Raum bespielbar wird — eine Zeichnung, zwei Verwendungen.

Nebenbefund: `docs/asset-stil-contract.md` führt `psyche.person` unter „Bekannte Grenzen"
weiter als NICHT abgenommen. Der Absatz ist seit dem 15.08. veraltet.

## Warum die Figuren KEINE Assets im Sinne der Library sind

Formal brechen sie den Contract: 36× hartes `stroke-width` statt Skala-Klassen, eine
Hex-Haarfarbe, zwei Text-Elemente, keine Anker, keine Label-Plätze, keine viewBox-Norm.

Wichtiger ist der strukturelle Grund. Ein Asset ist eine **Zeichnung** — ein Ding, an dessen
Ankern Beschriftung hängt. Die Figuren sind **Funktionen**: Armwinkel, Spiegelung,
Stofffarbe, und die Requisite ist ein Parameter. Als statische SVGs eingefroren würde jede
Kombination aus Figur × Haltung × Requisite eine eigene Datei — die Wiederverwendbarkeit,
wegen der sie überhaupt funktionieren, wäre genau dann weg.

Kurzform: Ein Asset ist ein Substantiv, eine Figur mit Requisite ist ein Verb.

## ➡️ Offene Entscheidung — und Leons Auftrag dazu

**Wer wählt die Besetzung einer Szene?**

- **Weg 1 — das Modell wählt.** Es entscheidet je Karte, wer welches Werkzeug hält. Braucht
  einen eigenen Contract, Validator-Regeln und einen Prompt-Abschnitt: denselben Apparat wie
  die Asset-Library, ein zweites Mal.
- **Weg 2 — die Relation legt fest.** Der Szenen-Typ bestimmt „zwei Figuren, Werkzeuge aus
  dieser Liste". Kostet einen Bruchteil, ist aber starrer.

**Leon-Entscheid 19.08.: beide Wege werden GEGENEINANDER GEMESSEN**, nach dem Muster der
Modell-Benchmarks (`bench.mjs`, `bench-report.mjs`) — nicht vorab per Argument entschieden.
Seine Einschätzung dazu: „das erste wäre grundsätzlich ja besser, ob's funktioniert ist eine
andere Sache." Weg 1 ist also die erwünschte Richtung, und der Bench soll klären, ob sie
trägt.

Zu klären beim Entwurf des Benchs (bewusst NICHT vorentschieden):

- Was wird gemessen? Kandidaten: trifft die gewählte Requisite das Thema · wie oft fällt das
  Modell auf dieselbe Besetzung zurück (die Wecker-Falle in Figurenform) · Contract-Verstöße
  je Lauf · Anteil Läufe ohne Nacharbeit.
- Wogegen wird gemessen? Weg 2 liefert je Thema genau ein Ergebnis — er ist die Referenzzeile,
  kein zweiter Kandidat mit Streuung.
- Die Lehre aus dem Modell-Bench gilt: Report ist reine Messung, keine Wertung, keine
  Rangliste. Interpretation danach, zusammen.
