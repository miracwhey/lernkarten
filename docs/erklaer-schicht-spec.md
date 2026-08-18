# Erklär-Schicht

Stand 18.08.2026 · Status: **GEBAUT und abgenommen** (Leon, 18.08. am Bild).
Grundlage: `docs/referenz-imprint/analyse.md` (12 von Leon ausgewählte Imprint-Karten).

| Primitiv | Stand | Contract |
|---|---|---|
| `callout` | ✅ | `{art, text, an}` |
| `klammer` | ✅ | `{art, text, von, bis}` |
| `ring` | ✅ | `{art, an}` — trägt bewusst keinen Text |
| `pfeil` | ✅ | `{art, von, bis, text?}` |
| `zone` | ✅ | `{art, text, umfasst[≥2]}` |

Angebunden: Renderer (`wireAnnotations`), Validator (`checkAnnotations`, 19 Negativfälle),
Generator-Prompt (Abschnitt „annotations"), Werkbank `probes/annot-fixture.mjs` (19 Fälle
mit Shots). Deckel 4 je Karte. Farbe wird vom Anker geerbt, nie im JSON genannt.

**Welche Anker tragen — gemessen, nicht geschlossen:**

| Typ | trägt | trägt nicht |
|---|---|---|
| `curve` | `series:` · `axis` · `stop` | `label:` |
| `asset` | `asset:` · `node:` | `label:` · `sub:` |
| `balance` | `node:` · `pivot` · `beam` | `label:` |
| `cycle` / `flow` | `step:` · `arrow:n` · `sink` | `label:` |
| `fanout` | `node:` · `fan` · `target:n` | `label:` |
| `venn` | `region:` · `overlap` | `label:` |
| `layers` | `node:berg` · `waterline` | `region:` · `zone:` · `label:` |
| `compare` | — (reine HTML-Karte, kein SVG) | alles |

Zwei Fälle, die eine erste, gröbere Erhebung falsch hatte: `step:` trägt (die frühere Probe
hatte `rect` nicht im Selektor), und `region:` auf `layers` trägt NICHT, obwohl Geometrie da
ist — die Regionen sind beschnittene Rechtecke, ihre Kante liegt nicht dort, wo man sie
sieht. Der Validator lehnt sie deshalb typabhängig ab.

## Was das ist

Eine **karten-typ-übergreifende Beschriftungs-Schicht**, kein neuer Karten-Typ. Sie legt
Callouts, Klammern, Ringe, Pfeile und benannte Zonen auf ein bestehendes Diagramm.

Der Präzedenzfall ist `sequence` (Grammatik v3, Abschnitt 1): ein optionales Feld, das
nicht einem Typ gehört, auf **Anker** zeigt und vom Validator gegen die Anker-Registry
geprüft wird, bevor irgendetwas gerendert wird. Die Erklär-Schicht folgt demselben Bau.

**Warum sie vor neuen Objekten kommt:** Sie wirkt auf jeden bestehenden Karten-Typ und auf
jedes bestehende Asset. Ein neues Objekt hebt nur seine eigenen Karten.

## Architektur-Prinzip (nicht verhandelbar)

> Das Modell nennt **Bedeutung und Ziel**. Die **Geometrie rechnet der Solver.**

Das Modell sagt „setz ein Callout mit dem Text ‚Kopf hoch' an `node:kopf`". Es sagt **nie**,
wo der Kasten sitzt, wie die Linie läuft, ob es überhaupt eine Linie gibt, oder auf welcher
Seite die Klammer steht. Alle diese Fragen sind berechenbar und damit im Contract
unausdrückbar — dieselbe Trennung wie bei `notes` und `sequence` heute.

Folge fürs Verhalten: **Ob ein Callout eine Leader-Line bekommt, entscheidet der Solver.**
Passt das Label direkt an den Gegenstand, steht es ohne Linie da (Imprint 01 „Shadow");
muss es ausweichen, wächst eine Linie mit (Imprint 08 „Head High"). Das Modell merkt davon
nichts.

## Contract-Feld (additiv, verengt nichts)

```yaml
annotations:                 # optional, jeder Diagramm-Typ, max 4 je Karte (Vorschlag)
  - art: callout
    text: "Kopf hoch"
    an: node:kopf
  - art: klammer
    text: "Was ich weiß"
    von: region:oben
    bis: region:wasserlinie
  - art: ring
    an: node:gesicht
  - art: pfeil
    von: node:bauch
    nach: node:kopf
    text: "Bauchgefühl"       # optional
  - art: zone
    name: "Jetzt"
    umfasst: [node:tasse, node:wuerfel, node:hirn]
```

Alle `an`/`von`/`bis`/`nach`/`umfasst`-Werte sind **Anker-Namen aus der Registry**. Der
Validator lehnt unbekannte Anker ab, bevor gerendert wird — genau wie bei `sequence`.

## Die fünf Primitive

| Primitiv | Sagt aus | Solver-Aufgabe | Gate |
|---|---|---|---|
| **callout** | „diese Stelle heißt X" | freie Lage um die Kontur suchen, Leader-Line nur wenn nötig, Zuordenbarkeit sichern | Kollision, Clipping, Zuordenbarkeit |
| **klammer** | „diese Spanne ist X" | Seite wählen, Spannweite aus zwei Ankern, Text mittig oder gekippt | Kollision, Clipping |
| **ring** | „hier hinschauen" | Kontur umschließen, Radius aus Bounding-Box | Clipping |
| **pfeil** | „A wirkt auf B" | Verlauf zwischen zwei Ankern ohne Fremdkontur zu schneiden | Kreuzungs-Check |
| **zone** | „diese Dinge gehören zusammen und heißen X" | Hülle um N Anker, Name an freier Kante | Kollision, Überdeckung |

Die Leader-Line ist **kein eigenes Primitiv**, sondern eine Solver-Entscheidung innerhalb
von `callout`. Sechs sichtbare Bausteine bei Imprint, fünf im Contract.

## Was aus dem Bestand trägt — und was nicht

**Es gibt bereits einen Platzierungs-Solver, aber zweimal und beide Male typgebunden:**

1. In `assetEinbau()` (renderer.js ab ~Z. 340): Kandidaten-Lagen aus 8 Richtungen × 6
   Abständen × Zeilenumbruch-Varianten, Rand-Prüfung `inBild()`, und eine
   **Zuordenbarkeits-Prüfung** — die Note muss ihrem eigenen Gegenstand näher sein als
   jedem fremden. Arbeitet auf Asset-Manifest-Ankern.
2. Im `curve`-Pfad (ab ~Z. 607): eigener Noten-Weg auf Serien-Punkten.

**Das ist die eigentliche Bauarbeit:** diese Logik herauslösen, auf die Anker-Registry
statt auf Asset-Manifest bzw. Serien-Punkte setzen, und beide Bestandspfade darauf
umstellen. Neu erfunden wird die Suchstrategie nicht.

## Welche Typen die Schicht tragen — gemessen

`node probes/anker-kontur.mjs` (18.08.) misst je Anker, ob abtastbare SVG-Geometrie
darunter hängt. Ergebnis über den ganzen Bestand:

| Typ | Anker mit Kontur | ohne | trägt? |
|---|---|---|---|
| `curve` | 27 | 15 | ja, an `series:`/`stop` |
| `asset` | 17 | 13 | ja, an `node:`/`region:` |
| `balance` | 16 | 12 | ja |
| `cycle` | 16 | 32 | eingeschränkt — `step:` ohne Kontur |
| `flow` | 12 | 24 | eingeschränkt — `step:` ohne Kontur |
| `fanout` | 7 | 3 | ja |
| `venn` | 3 | 4 | ja |
| `layers` | 1 | 9 | ⚠️ nur `waterline`; `region:`/`zone:` ohne Kontur |
| `compare` | **0** | 64 | **nein** — reine HTML-Karte |
| `title`/`quiz`/`insight` | 0 | 0 | tragen keine Anker (Rahmen) |

Zwei Folgerungen:

1. **`label:` und `sub:` haben nie eine Kontur** — und sollen sie auch nicht haben. Ein
   Callout an einem Label wäre die Beschriftung einer Beschriftung. Die Schicht hängt an
   Objekt-Ankern, nicht an Text-Ankern.
2. **`layers` ist der unerwartete Fall:** ausgerechnet der Eisberg-Typ — das Imprint-Muster
   schlechthin — liefert für `region:` und `zone:` keine Kontur. Vor dem Bau von `klammer`
   zu klären, sonst trifft das Primitiv genau die Karte nicht, für die es gedacht war.

## „Solver-Fall (b)" ist kein Bug — nachgeprüft 18.08.

Der Fall stand als Blocker in der Liste: ein Label landet näher an der fremden Serie als an
der eigenen (`"CRASH"` 4.5 < 13.4 px). Das Bench-Protokoll sagt etwas anderes — die
Originalzeile lautet:

```
INFO  "CRASH" (Serie 1) liegt näher an Serie 0 (4.5 < 13.4 px), Serienabstand dort 0.7 px
```

**`INFO`, nicht `ZUORD`.** `label-audit.mjs` stuft die Lage bewusst herab, wenn der
Serienabstand unter 10 px liegt: bei Strichstärke 3 sind die Kurven dort optisch ein Band,
und keine Lage wäre eindeutig. Die Regel stammt vom 14.08., der Bench lief am 17.08. — sie
war aktiv. Kein Lauf ist daran gescheitert; die frühere Notiz hat eine INFO-Zeile als
Fehler gelesen.

**Damit entfällt der Blocker.** Die Zuordenbarkeits-Prüfung kann unverändert Fundament der
Schicht werden.

### Was dabei offen bleibt

Die **laxe Stufe** der Staffel ist ungemessen. `eindeutig` fragt, ob die fremde Kontur
NÄHER liegt als die eigene — bei Deckungsgleichheit sind beide gleich weit, die Prüfung ist
erfüllt. Sie schlägt nur an, wenn die eigene Kontur weiter weg ist, und solche Lagen
entstehen im Bestand nur am Apex-Ast, der über `apexPlace` läuft statt über den
gemeinsamen Kern. Drei Anläufe (Bandlage, Platznot, Linien-Anker) haben sie nicht
ausgelöst. Der Zweig bleibt Sicherheitsnetz — mit neuen Primitiven, die eigene Kandidaten
mitbringen, kann er relevant werden.

## Offene Design-Entscheidungen (Leon)

1. **Farbkopplung.** Imprint verbindet Text und Bild über Farbe: das markierte Wort im
   Lehrsatz trägt die Farbe seines Icons (Karte 07). Unsere Farb-Semantik ist fest belegt
   (`ich`/`es`/`ueberich`) und über die ganze Lektion konsistent. Entweder wir machen sie
   für Annotationen auf, oder die Schicht bleibt einfarbig. Beides hat einen Preis.
2. **Deckel je Karte.** Vorschlag 4. Imprint liegt bei 1–4; darüber wird die Karte ein
   Wimmelbild.
3. **Zone als Fläche oder nur als Rahmen.** Imprint füllt (gelbes „Now"-Feld, Karte 02).
   Gefüllte Flächen konkurrieren mit unserer Farb-Semantik — hängt an Entscheidung 1.

## Bau-Reihenfolge (Vorschlag)

1. Solver herauslösen und auf Anker-Registry setzen, Bestandspfade umstellen — **kein
   sichtbares Delta**, aber Fundament. Gegenprobe: alle Bestands-Shots byte-identisch.
2. Reproduktionsfall für Solver-Fall (b) bauen, dann fixen.
3. `callout` + `klammer` als erste Primitive, Mockup in Ziel-Rendertechnik an einer
   bestehenden Lektion, Shots zur Abnahme.
4. `ring`, `pfeil`, `zone` nach Abnahme.
5. Erst danach die vier fehlenden Relationen (Komposition, Typologie, Zonen-Achse,
   Projektion) — sie bestehen aus Primitiven **plus** dieser Schicht.
