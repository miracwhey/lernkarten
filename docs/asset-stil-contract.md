# Asset-Stil-Contract (Grammatik v3, Abschnitt 3)

Stand 15.08.2026 · Gilt für jede Datei in `assets/`. Geprüft von `node asset-check.mjs`
(deterministisch, ohne Browser) und `node audit-lesson.mjs <lektion>` (Layout am
gerenderten Bild). Was hier steht und nicht geprüft wird, ist als **ungeprüft** markiert.

## Das harte Abnahme-Kriterium

> **Ein Asset ist ein gestaltetes Objekt, keine Andeutung.** (Leon)

Herkunft der Regel: Runde 1 des v3-Design-Gates fiel durch — „Reizeteil + Sonnenteil
stört". Beanstandet war nicht die Qualität der Linien, sondern dass Gegenstände nur
*angedeutet* waren: ein Kreis mit drei Strichen ist kein Neuron, ein Ball ist keine Sonne.

Konkret heißt das:

- **Dendriten sind Bäumchen** — Stamm, Gabelung, Zweig, und an den Spitzen sitzt das,
  was ankommt (Impuls-Punkte). Nicht: drei Striche am Kreis.
- **Die Sonne strahlt** — Kreis *mit* Strahlen-Ticks und einem gebündelten Licht-Keil,
  der zum Streupunkt führt. Nicht: ein gelber Ball.
- **Das Molekül ist ein Doppelring**, nicht ein Punkt.
- **Ein Profil hat Stirn, Nasenrücken, Nasenspitze, Lippen, Kinn und Kieferlinie.**
  Nicht: ein Oval mit Hals.
- **Das Innen gehört ins Objekt** (Eisberg-Prinzip: Konzept und Bild verschmolzen) —
  eine innere Zone folgt der Form, in der sie liegt. Kein Deko-Kreis daneben.

Prüfbar ist dieses Kriterium nicht automatisch. Es wird am Bild abgenommen:
`node probes/asset-preview.mjs` legt jedes Objekt groß und einzeln ab. **Ein Asset ohne
Bildabnahme geht nicht in Produktion** — das Manifest-Feld `abnahme` sagt bei jedem
Objekt, woher seine Abnahme kommt; fehlt das Feld, schlägt `asset-check` fehl.

## Maße und Koordinaten

| Regel | Wert | Geprüft von |
|---|---|---|
| viewBox-Norm | `0 0 200 200` | `asset-check` (Datei **und** Manifest) |
| Asset-Einheit | 1 Asset-Einheit = 2 Karten-Einheiten (`hero.scale = 2`) | Platzierung im Renderer |
| Karten-Fläche | Asset-Karten zeichnen in `0 0 400 300` | `RENDERERS.asset` |
| Inhalt | darf den Kasten nicht füllen; die Komposition ist Teil des Objekts | `probes/asset-preview.mjs` meldet den gemessenen Inhalts-Kasten |

Der Inhalt wird **nicht** automatisch eingepasst. Wo ein Objekt im Bild steht, ist
Gestaltung und steht im Manifest (`hero: {scale, tx, ty}`) — ein Auto-Fit würde die
abgenommene Komposition still verändern.

## Farben

- **Nur Palette-Tokens**, immer als `var(--token)`. **Nie Hex** — `asset-check` weist
  jedes `#rrggbb` ab.
- Erlaubt ist genau, was `renderer.css` definiert (`ink`, `paper`, `card`, `chrome`,
  `line`, `muted`, `es`, `ich`, `ueberich`, `*-soft`, `water*`, …). Der Prüfer liest die
  Liste aus `renderer.css` — es gibt keine zweite Liste, die abdriften könnte.
- Die Spec nennt die Akzente `accent1–3`; im Bestand heißen sie `es`, `ich`, `ueberich`.
  **Es werden die Bestands-Namen benutzt** — ein zweiter Satz Namen für dieselben Farben
  wäre eine Quelle für stille Abweichungen.
- Das Manifest-Feld `paletteSlots` listet die tatsächlich benutzten Tokens. Es wird
  **gemessen** und gegen die Datei geprüft, nicht gepflegt.
- Jede füllbare Form (`path`, `circle`, `rect`, `polygon`, `ellipse`) sagt ausdrücklich
  `fill="…"` oder `fill="none"`. Grund: eine CSS-Klasse überstimmt ein
  Präsentations-Attribut — im v3-Mockup hat genau das die inline gesetzten
  `stroke-width="2.5"` still ausgehebelt (die abgenommenen Shots zeigen 2).

## Strichstärken

Eine Skala, definiert **einmal** in `renderer.css`, in Asset-Einheiten:

| Klasse | Asset-Einheiten | entspricht Karten-Einheiten (Bestand) |
|---|---|---|
| `a-hair` | 0.8 | 1.6 |
| `a-line` | 1 | 2 |
| `a-strong` | 1.25 | 2.5 |
| `a-heavy` | 1.5 | 3 |
| `a-beam` | 2 | 4 |
| `a-round` | — | `stroke-linecap: round` |
| `a-route` | — | Puls-Weg: `fill:none; stroke:none` (wird nie gemalt) |

**Ein `stroke-width` in einer Asset-Datei ist ein Fehler** (`asset-check`). Nur so ist
garantiert, dass alle Objekte dieselbe Hand haben. Keine Verläufe, keine Schatten.

## Anker (Pflicht)

- Schema `typ:id` (`node:`, `region:`, `ray:`, `zone:`, `label:`, `series:`, `step:`) als
  `data-anchor` am Element; im Manifest unter `anker[]`. **Beide Richtungen** werden
  geprüft: kein Anker im Manifest ohne Element, kein Element ohne Manifest-Eintrag.
- Anker sind der Grund, warum ein Asset kein Sticker ist: Sequenz-Verben
  (`reveal/pulse/highlight/dim`) und Label-Plätze docken an ihnen an, der Validator prüft
  Sequenz-Targets gegen sie **ohne zu rendern**.
- Puls-Ziele, die aufglühen sollen, tragen `data-glow-fill="<ton>"` (Füllung wechselt auf
  den Soft-Ton). Der Halo-Ring der Karten-Typen wird im Asset **nicht** benutzt: er ist in
  Karten-Einheiten gedacht und stünde im Asset-Maßstab doppelt so breit da.

## Puls-Wege

Ein `pulse` läuft nur über einen Weg, den das Bild zeigt. Deshalb zeichnet das Objekt
seine Wege selbst:

```xml
<path class="a-route" data-link="node:soma&gt;node:synapse" data-ton="ich" d="…"/>
```

- Jedes Paar in `paare[]` braucht seinen `data-link`, jeder `data-link` sein Paar
  (beide Richtungen geprüft), beide Enden müssen Anker des Objekts sein.
- `data-ton` bestimmt die Farbe des laufenden Punkts (im Objekt entscheidet der Weg, nicht
  die Quelle — das abgenommene Mockup färbt den zweiten Puls nach dem Ziel).

## Label-Plätze

**Wo** eine Erklärung steht, gehört zur Gestaltung des Objekts; **was** dort steht,
liefert die Karte. Deshalb sind Label-Plätze leere `<text>`-Elemente im Asset:

```xml
<text data-slot="feuert" data-anchor-ref="node:soma" data-ton="es" x="48" y="106"></text>
```

- `data-anchor-ref` bindet den Platz an einen Anker: das Label erscheint mit seinem
  Gegenstand — und wenn ein Puls diesen Gegenstand zum **Ziel** hat, erst mit dessen
  Ankunft. Ein sichtbares Label ohne sichtbaren Gegenstand ist ein `LEER`-Befund.
- Optional `data-align` (`start`/`middle`/`end`), `data-rotate`, `data-ton`.
- `max` je Platz ist **gemessen**, nicht geschätzt: `node probes/asset-slot-max.mjs`
  lässt realistischen Label-Text wachsen, bis das Layout-Gate anschlägt, prüft alle
  Plätze zusätzlich gleichzeitig und schreibt das Ergebnis mit `--schreiben` ins Manifest.
  Die Zeichenzahl bleibt eine Näherung (Breite ≠ Zeichenzahl) — **Autorität ist das
  Layout-Gate**, der Deckel fängt nur den Normalfall früh ab.

## Rollen

`asset.role` ist `hero` (das Objekt ist die Karte) oder `inline` (dieselbe Komposition,
60 % um die Bildmitte gestaucht, Schriftgröße unverändert).

Welche Rollen ein Objekt trägt, ist **gemessen** und steht im Manifest (`rollen[]`).
Grund: bei `inline` schrumpft die Geometrie, der Text nicht — bei dicht gesetzten
Label-Plätzen kollidieren die Labels dann miteinander (gemessen an
`physics.sky-scatter`: inline ist für dieses Objekt nicht darstellbar). Der Validator
lässt nur zu, was durchgekommen ist.

## Was NICHT im Asset steht

- **Karten-Inhalt.** Die farbigen Schalen-Scheiben der Waage und ihr Drehpunkt-Feld
  tragen die Farbe der jeweiligen Instanz — sie gehören dem Karten-Typ, nicht dem Objekt.
- **Text.** Nur leere Label-Plätze.
- **Animation.** Zustände und Zeiten kommen aus den Motion-Tokens des Renderers.
- **Layout-Entscheidungen der Karte.** Ein Asset kennt seine eigene Komposition, nicht
  die Karte, auf der es liegt.

## Neues Asset einlagern (Ablauf)

1. Zeichnen nach diesem Contract, `assets/<domäne>.<name>.svg`.
2. Manifest-Eintrag: `datei`, `titel`, `viewBox`, `teile`, `anker`, `paare`,
   `labelSlots` (max vorläufig), `paletteSlots` (wird gemessen), `hero`, `abnahme`.
3. `node build-assets.mjs` — Transport in `assets/assets.js` **und** in den Inline-Block
   von `card-canvas.html` (die App bündelt nur gelistete Dateien).
4. `node asset-check.mjs` — muss PASS sein.
5. `node probes/asset-slot-max.mjs --schreiben` — Deckel und Rollen messen, danach
   erneut `node build-assets.mjs`.
6. `node probes/asset-preview.mjs` — **Bild ansehen**, gegen das Abnahme-Kriterium oben.
7. Demo-Karte in eine Lektion, `node audit-lesson.mjs <lektion>` — muss PASS sein.
8. `node probes/anker-check.mjs` — Registry ≡ DOM.

## Bekannte Grenzen (Stand 15.08.2026)

- **`psyche.person` ist abgenommen** (15.08.2026, nach einer Überarbeitung: Gehirn-Form
  statt Ei, Hals- und Schulter-Übergang; Leon zur Silhouette „genial geil"). Bild in
  `probes/asset-preview/psyche.person.png`. Offen ist etwas anderes: die innere Zone
  trägt noch keine Anker, weshalb `probes/menschen-szene.mjs` den Kopf ein zweites Mal
  zeichnen musste — siehe `docs/menschen-szenen-befund.md`.
- **`physics.sky-scatter` hat keine Reserve in den Label-Plätzen** (Deckel = Länge der
  abgenommenen Texte). Mehr Spielraum bräuchte eine Überarbeitung der Komposition.
- Das Kriterium „gestaltetes Objekt" ist **nicht** maschinell prüfbar — es hängt an der
  Bildabnahme und (später) am Vision-Critic.
