# Feld-Stresstest — trägt die Pipeline außerhalb ihrer Heimatfelder?

Stand 19.08.2026 · Anlass: Leons Frage nach dem Gesamtsystem — „wir wollen das ja auch
systematisch auf andere Felder und Themenbereiche flexibel halten".

Alle bisherigen Themen (Schlaf, Neuron, Wärmeinsel, Graffiti, Einkreisung) sind Biologie,
Psyche oder Stadtklima: Stoff mit Mechanismen, Verläufen und Messwerten. Ob andere Felder
durch dieselbe Pipeline kommen, war Vermutung. Dieser Lauf misst es.

Gefahren wurde der **Produktionspfad**: dieselbe Modell-Kette, dieselbe Dossier-Stufe,
dieselbe Tiefe (`standard`) wie ein Job aus der App — nur ohne Queue und ohne Insert.
Werkzeug: `probes/feld-stresstest.mjs`.

| Feld | Thema | Erster Lauf | Nach den Fixes |
|---|---|---|---|
| Recht | Notwehr im deutschen Strafrecht | **pass**, 13 Karten | — |
| Geschichte | Warum die Weimarer Republik scheiterte | abgelehnt (Contract) | **pass**, 13 Karten |
| Wirtschaft | Wie Inflation entsteht | **exit 3** (Systemfehler) | siehe unten |
| Musik | Warum Moll traurig klingt | abgelehnt (Contract) | **pass**, 11 Karten |

**Eins von vier Feldern kam sauber durch — nach den Fixes alle.** Keiner der drei Ausfälle
hatte mit dem Thema zu tun; jeder war ein Fehler im eigenen System.

Gesamtbild über alle vier Lektionen: **50 Karten, 11 verschiedene Formen**. `trend` liegt
bei 16 % (auf den Heimatfeldern 46–57 %), `multiplication` kommt 5× vor — im gesamten
Modell-Bench über 82 Diagramm-Karten war es **0×**.

## Was auf Anhieb trug

**Das Dossier-Format greift feldunabhängig.** Alle vier Themen erfüllten das Format-Gate
im ersten Anlauf (7.600–10.200 Zeichen, alle fünf Sektionen). Bei Geschichte fing das
Zahlen-Gate eine erfundene Angabe („33 % Arbeitslose" gegen die belegten 30 %) und
patchte sie, bei Wirtschaft eine fehlende Zeitbasis („2 % Inflation" ohne „jährlich").

**Die Struktur-Sektion liefert genau die Formen, die auf den Heimatfeldern tot waren.**
Im Recht-Dossier steht wörtlich „Ein Auslöser mit mehreren rechtlichen Wirkungen"
(= `multiplication`, im gesamten Modell-Bench **0×** gezeichnet) und „Ein sichtbarer
körperlicher Vorgang mit verborgener rechtlicher Prüfung" (= `depth-layers`, ebenfalls 0×).
Geschichte bringt beide ebenfalls, dazu einen Verstärkerkreislauf und zwei
gegeneinanderstehende Wege.

**Und der Generator zeichnet sie dann auch.** Die Recht-Lektion nutzt **11 verschiedene
Formen auf 13 Karten**, darunter `multiplication`, `object`, `intersection` und `descent`.
Über beide gebauten Lektionen liegt `trend` bei **15 %** — auf den Heimatfeldern waren es
46–57 %.

Das dreht die bisherige Diagnose um: Die Einförmigkeit war **kein** Katalog- oder
Modellproblem, sondern eine Eigenschaft der bisherigen Themen. Biologie ist voller
Verläufe; Recht und Geschichte sind es nicht, und der Generator folgt dem Stoff.

Gesichtet wurden die Karten einzeln (`probes/shot-canvas.mjs`, WebKit = App-Engine).
Die `object`-Karte setzt `psyche.person` auf einem juristischen Thema ein — das Asset
trägt über sein Herkunftsfeld hinaus.

## Befund 1 — der Killer: doppelt serialisiertes JSON (BEHOBEN)

Geschichte und Musik starben an derselben Sache. Beide Modelle — `luna-pro` **und**
`deepseek-v4-pro` — schrieben die Waage-Schalen als Text statt als Objekt:

    "left": "{\"label\":\"MIT GESTE\",\"sub\":\"Langsam, leise\",\"color\":\"ich\"}"

Der Validator las darauf `left.label === undefined` und meldete **„fehlt oder leer"** —
obwohl das Label dastand, nur eine Ebene tiefer. Die Patch-Runde bekam damit den falschen
Auftrag: ergänze, was längst da ist. Sie drehte sich im Kreis, bis die Versuche aufgebraucht
waren. Drei Vorkommen, alle drei in genau den zwei gescheiterten Läufen.

Warum es diese Felder traf: `weighing` ist die Form für Abwägungen, und Recht, Geschichte
und Musik argumentieren mehr, als sie messen. Der Fehler ist nicht feldspezifisch — seine
**Häufigkeit** ist es.

**Fix** in `normalizeLesson` (`validate-lesson.mjs`): Ein String, der syntaktisch ein
JSON-Objekt oder -Array ist, wird zurückgeholt. Bewusst über die Form entschieden statt über
eine Liste bekannter Felder — Fließtext kann die Bedingung nicht versehentlich erfüllen.
Belegt: die drei Fehlerfälle gehen von 6 auf 0 `left`/`right`-Fehler (zwei der drei Lektionen
sind danach vollständig fehlerfrei), vier Bestandslektionen bleiben byte-identisch.

**Und dieser Fix war zuerst wirkungslos — die Gegenprobe hat es gezeigt.** Er saß in
`normalizeLesson`, das nur `parseAndValidate` aufruft: den ERSTEN Wurf. Die Patch-Runden
prüfen direkt nach `setPath` mit `contract(lesson)`, ohne Normalisierung — und das Modell
lieferte den JSON-Text **auch im Patch**. Der Lauf drehte sich weiter im Kreis, während der
A/B-Test grün war.

Der A/B-Test war grün, weil er `validateLesson(normalizeLesson(roh))` maß: die FUNKTION,
nicht ihren Einsatz. Das ist die Klasse [[feedback_wire_proof_is_not_usage_proof]] — ein
Beweis am Baustein sagt nichts über den Weg, auf dem der Fehler wirklich ankommt.

Endgültiger Fix am Chokepoint: `contract()` in `glm-generate.mjs` heilt vor jeder Prüfung.
Alle neun Prüfstellen laufen durch diese eine Funktion; sie einzeln zu normalisieren wäre
die Variante, die man beim nächsten Umbau vergisst.

## Befund 2 — eine Zone, die zwei von drei Dingen umschließt (BEHOBEN)

Auf der `multiplication`-Karte der Recht-Lektion stand:

    "umfasst": ["target:1", "target:1", "target:2"]

Ein Anker doppelt, einer vergessen. Gezeichnet wurde eine graue Zone um **zwei** der drei
Ziele, während ihr Text „RECHTLICHE FOLGEN" alle drei meinte. Die Lektion lief mit
`AUDIT PASS` durch.

Die Ursache saß in der Zählung: geprüft wurde `umfasst.length < 2` — die Länge der Liste,
nicht die Zahl der **verschiedenen** Anker. Drei Einträge mit einem Duplikat bestehen diese
Prüfung mühelos. **Nur das Bild zeigte den Fehler**, keine Messung.

**Fix:** gezählt wird jetzt die Menge der verschiedenen Anker, und ein Duplikat meldet sich
mit der Korrektur im Text — inklusive der noch freien Anker. Am echten Fall feuert das Gate
und nennt genau den vergessenen `target:3`; vier Kontrolllektionen bleiben still.

## Befund 3 — das Fallback-Modell ist auf diesen Themen tot

Bei beiden gescheiterten Feldern rückte `deepseek-v4-pro` nach und lieferte **zweimal eine
leere Antwort**: 24 003 Ausgabe-Token, davon 24 003 Denk-Token. Das Budget ging vollständig
ins Denken, für die Antwort blieb nichts. Das erklärt die Laufzeiten von 19 und 22 Minuten —
der Fallback kostet Zeit und Geld, ohne je etwas zu liefern.

Das war seit dem 14.08. als Fix-Kandidat notiert („DS-Pro braucht Reasoning-Drossel",
damals 16001/16001) und nie behoben.

**BEHOBEN, in zwei Schritten gemessen.** Zuerst `probes/reasoning-drossel.mjs` für die
Frage, ob der Hebel überhaupt existiert: alle drei Formen werden akzeptiert,
`reasoning.enabled:false` drückt die Denk-Token auf 0. Diese Sonde allein hätte nicht
gereicht — bei ihrem Trivial-Auftrag denkt das Modell 32 Token, sie kann den Fehlerfall gar
nicht auslösen (Klasse [[feedback_calibrated_limit_is_only_as_good_as_its_probe]]).

Deshalb der zweite Schritt: ein voller Lauf über `glm-generate.mjs` gegen dasselbe
Musik-Dossier, mit `reasoning: {max_tokens: 8000}` bei 24 000 Gesamtbudget. Ergebnis
**0 leere und 0 abgeschnittene Antworten**, Lektion vollständig gebaut. Eingetragen in
`worker/models.mjs`.

## Befund 4 — der Solver-PATH-Fehler ist zurück

Die Wirtschafts-Lektion war fertig gebaut (13 Karten), starb aber im Audit an einem
Systemfehler: `PATH "WIRKT MIT VERZÖGERUNG" × polyline[Serie 0] bei (286,207)` — ein Label
kreuzt seine Kurve. Exit 3 tötet den ganzen Lauf, und zwar zu Recht: es ist unser Bug,
nicht der des Modells.

Nebenbefund zur Diagnose: Die Schluss-Zusammenfassung des Audits nennt System-Befunde nur
als **Zahl** („1 System-Fehler"), während LEER-Befunde unten im Klartext samt Korrektur
wiederholt werden. Der Text steht weiter oben in der Kartenliste — wer die Zusammenfassung
liest, sieht die Ursache des teuersten Fehlerausgangs nicht.

**BEHOBEN — und die Ursache war nicht der Solver, sondern sein Kandidatenraum.** Die Note
sitzt bei t=0.82 auf dem steil abfallenden Nach-Stop-Ast: links die Kurve, unten die Achse,
rechts der Kartenrand. Einzeilig ist „WIRKT MIT VERZÖGERUNG" breiter als der verbleibende
Platz — von 264 Lagen war keine frei, der Notnagel legte den Text auf die Kurve.

`notePlace` baute nur einzeilige Kandidaten. Die Ausweichform gab es längst (`umbruch()`,
18.08. aus der Asset-Note herausgelöst), aber nur die Callout-Schicht war daran angebunden.
Jetzt beide, nach demselben Muster: eine STAFFEL über die Formen statt eines gemeinsamen
Score-Topfs — im Topf gewinnt der kompaktere Kasten auch dann, wenn die einzeilige Lage
frei wäre.

Belegt beidseitig: der Fehlerfall meldet `c10 curve: OK` und `system=0` (der Lauf wäre in
eine Patch-Runde gegangen statt zu sterben), und `probes/solver-fixture.mjs` liefert über
den ganzen Bestand **byte-identische** Geometrie — der Umbruch greift ausschliesslich dort,
wo vorher der Notnagel griff. Im Bild steht das Label jetzt zweizeilig frei neben der Kurve.

⚠️ **Dieselbe Klasse steht noch an einer dritten Stelle offen:** Der deepseek-Lauf meldete
`PATH "Filme nutzen das gezielt" × line` auf einer `fanout`-Karte. Das ist die Callout-
Schicht, die den Umbruch bereits hat — dort ist also die Hindernis-Menge verdächtig, nicht
der Kandidatenraum: die Verbindungslinien eines `fanout` scheinen nicht als Hindernis zu
zählen. Nicht angefasst, kein Reproduktionsfall isoliert.

## Befund 5 — dieselbe Annotation sieht auf zwei Karten völlig verschieden aus

⚠️ **Design-Frage, bewusst nicht angefasst.**

Die `zone` rendert auf der `multiplication`-Karte als zartes graues Feld hinter der
Geometrie — und auf der `descent`-Karte als **deckender dunkelblauer Block**, der ein
Viertel der Karte einnimmt, bis an beide Ränder läuft und die weiße Callout-Box hart auf
dunklem Grund stehen lässt. Alle übrigen Karten der Lektion sind hell und luftig; diese
eine kippt aus dem Papier-Look heraus.

Was davon Absicht ist, entscheidet die Bildabnahme, nicht der Code.

## Befund 6 — das Sicht-Werkzeug meldete einen Defekt, den es selbst erzeugte

Bei der Sichtung der Musik-Lektion wirkte die `object`-Karte bis auf ein Kringel-Fragment
unbebildert. Sie ist in Ordnung: `probes/shot-canvas.mjs` setzte kein `reducedMotion` und
schoss 120 ms nach dem Rendern — bei `trigger:"auto"` ist das der Ausgangszustand, bevor
die Enthüllung läuft. Unter `reduce` springt die Engine per Definition sofort in den
Endzustand, und die Karte zeigt `psyche.person` mit beiden Beschriftungen.

Das Werkzeug ist nachgerüstet. Es ist die stillste Sorte Fehler: Ein Stillbild-Werkzeug,
das den Startframe einer Animation liefert, meldet Defekte, die es nicht gibt — und würde
sie bei jeder künftigen Sichtung wieder melden. Die Lehre stand für die Mockups schon fest
(„Stills brauchen reduced-motion"), war aber in diesem Werkzeug nie angekommen.

## Was das für die Flexibilitäts-Frage heißt

Die Frage war, ob das System auf fremde Felder trägt. Die Messung sagt: **Der inhaltliche
Teil trägt besser als erwartet** — Dossier-Format, Struktur-Erkennung und Typ-Vielfalt
funktionieren auf Recht und Geschichte nachweislich besser als auf Schlaf. Was nicht trug,
war in allen drei Fällen die eigene Mechanik: eine Fehlermeldung, die in die Irre führt,
eine Zählung, die das Falsche zählt, ein Fallback, der nichts liefert.

Der nächste Engpass ist damit nicht der Katalog, sondern die **Zeichen-Bibliothek**:
`object` wurde einmal gewählt und konnte bedient werden, weil `psyche.person` zufällig
passte. Ein Feld ohne passendes Asset bekommt diese Karte nicht.

## Wo die Änderungen liegen

Ein Hinweis, der sonst beim Nachschlagen in die Irre führt: Die beiden Fixes in
`validate-lesson.mjs` (`entpackeJson` und die Zone-Zählung) sind **nicht** in diesem Block
committet, sondern in `f934eae` („Die Pipeline lief nur auf einem Rechner") mitgelaufen —
dort wurde parallel am Repo gearbeitet und die Arbeitskopie mit erfasst. Der Commit-Text
erwähnt sie nicht. Alles Übrige (Chokepoint in `glm-generate.mjs`, Solver in `renderer.js`,
Drossel in `worker/models.mjs`, Werkzeug in `probes/shot-canvas.mjs`) liegt hier.

## Reproduzieren

    node probes/feld-stresstest.mjs                 # Plan, führt nichts aus
    node probes/feld-stresstest.mjs --go
    node probes/feld-stresstest.mjs --report        # nur auswerten
    node probes/feld-stresstest.mjs --go --nur musik --dossier-behalten   # Gegenprobe nach Code-Fix

`--dossier-behalten` lässt ein vorhandenes Dossier stehen: für den Vorher/Nachher-Vergleich
einer Code-Änderung muss die Eingabe dieselbe bleiben, sonst misst der zweite Lauf ein neues
Dossier statt der Änderung.
