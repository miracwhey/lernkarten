# Grammatik v3 — Spec-Entwurf (Diskussionsgrundlage)

Stand 14.08.2026 · Status: **ENTWURF, nicht bindend** — Design-Gate mit Mockup folgt vor jedem Bau.

## Prinzip (unverändert aus v2)

Das LLM sagt **was** verstanden werden soll, nie **wie** oder **wo** etwas aussieht. v3 erweitert nur das Vokabular um drei Dimensionen: **Zeit** (Sequenz), **Verhalten** (Interaktion), **Gegenstände** (Assets). Jede neue Ausdrucksmöglichkeit ist ein Enum gegen eine kuratierte Implementierung — nie freie Komposition.

**Richtung (Leon, 14.08.):** „Herzstück" heißt nicht ein einziges Diagramm — die Lektionen brauchen **visuelle Vielfalt** und zum Thema passende Visuals. Die Freiheit entsteht im **Angebot** (Katalog-Breite, Asset-Library, thematische Passung der Typ-Wahl), nicht in der Komposition durchs LLM.

**Nicht-Ziele:** freie Primitives-Komposition durchs LLM · Layout/Koordinaten vom LLM · generative Asset-Pipeline (spätere Ausbaustufe) · 3D · Lottie (zweite Geometrie-Quelle neben SVG/CSS — abgelehnt).

---

## 1. Sequenz-Layer (Motion) — die größte Lücke vs. Imprint

### Anker-Registry
Jeder Karten-Typ exportiert **stabile Anker-Namen** für seine Elemente, deterministisch aus dem Karten-JSON ableitbar (ohne Rendern): `series:<id>`, `label:<id>`, `node:<id>`, `region:<id>`, `axis`, `pivot`. Der Validator kann damit Sequenz-Targets prüfen, bevor irgendetwas gerendert wird.

### Contract-Feld
```yaml
sequence:                # optional, max 6 Schritte
  - verb: reveal         # Enum v1: reveal | pulse | highlight | dim | trace
    target: series:adenosin
  - verb: pulse
    from: node:dendrit
    to: node:soma
  - verb: highlight
    target: label:synapse
trigger: auto | tap      # ein Trigger-Modus pro Karte, nicht pro Schritt
```

Validator-Regeln: Verben nur aus Enum · Targets müssen in Anker-Registry existieren · max 6 Schritte · kein Target doppelt im selben Schritt · `pulse` nur zwischen verbundenen Ankern (Typ-Tabelle analog `RELATION_TO_TYPE`).

### Renderer-Seite
- **Motion-Tokens zentral** in renderer.css/js: eine Duration-Skala, ein Easing-Set, eine Puls-Optik. Karten-Typen konsumieren Tokens, definieren nie eigene Animationen (Regel: animation planned or omit — ein Motion-System, keine Sonderwege).
- **Einfrierbarkeit ist Pflicht:** jeder Sequenz-Schritt hat einen deterministischen Endzustand; Test-Hook springt direkt dorthin (`prefers-reduced-motion` respektieren fällt gratis mit ab).

### Gates
- **Sequenz-Audit:** `audit-lesson` läuft pro Schritt-Endzustand (Screenshot + Kollisions-/Clipping-Messung je Zustand, nicht nur final). Ein Schritt, der Labels überdeckt, ist ein SYSTEM-Bug wie bisher.
- Notecheck/Factcheck unverändert (arbeiten auf Daten, nicht Zuständen).

---

## 2. Interaktions-Verben v1

- **`step`** — existiert (Tap-Advance). Sequenz mit `trigger: tap` nutzt ihn.
- **`scrub`** — ein einziger Parameter (Zeit/Fortschritt), bindet an die Sequenz-Timeline oder an `stop.t` einer Kurve. Kein freies Parameter-Binden: Was scrubbar ist, definiert der Karten-Typ.
- **`drag` / `simulate`** — Flaggschiff-Kandidat (Orbit, Compounding), eigenes Design-Gate, **v4**. Simulation braucht eine eigene Korrektheits-Gate-Klasse (Physik/Mathe deterministisch prüfbar) — nicht unterschätzen, nicht in v3 quetschen.

---

## 3. Asset-Slot + kuratierte Library

### Contract-Feld
```yaml
asset:
  ref: biology.neuron    # muss in Registry existieren — Validator lehnt Unbekanntes ab
  role: hero | inline
```

### Registry
`assets/manifest.json`: `ref → { datei, viewBox, anker[], palette-slots }`. Das LLM kann **keine Assets erfinden** — ein fehlender ref ist ein Validator-Fehler, der Generator muss ohne Asset formulieren. Jeder Miss wird geloggt → **Wachstums-Backlog** (Grundlage der späteren generativen Registry: generieren → normalisieren → QA → einlagern).

**Richtung Asset-Produktion (Leon, 14.08.):** Assets generiert ein starkes Modell (Fable) — die Generator-LLMs referenzieren nur (Baukasten). **On-demand statt Vorrats-Katalog:** fehlt fürs Thema ein passendes Asset, wird es für DIESES Thema generiert, durchs Stil-Gate normalisiert, dann eingelagert — die Library ist Cache, nicht Grenze. **Leons explizite Sorge (= Abnahme-Kriterium fürs Design-Gate):** keine Über-Standardisierung — dasselbe Motiv darf nicht themenübergreifend recycelt werden, und Assets dürfen keine Deko-Sticker sein (Anker-Integration ins Diagramm ist Pflicht, Eisberg-Prinzip: Konzept und Bild verschmolzen). Nagelprobe am Mockup: zwei verschiedene Themen mit je eigenem frisch generiertem Asset — sieht es nach Baukasten aus, ist der Ansatz durchgefallen.

### Stil-Contract für SVGs (damit alles wie EINE Hand aussieht)
- viewBox-Norm `0 0 200 200`, Konturstil wie Renderer-Bestand (Strichstärke-Skala, keine Verläufe, keine Schatten)
- Farben ausschließlich als Palette-Tokens (`accent1–3`, `ink`, `paper`) — nie Hex im Asset
- benannte Anker-Punkte im SVG (`data-anchor="soma"`) → Label-Solver und Sequenz-Verben können andocken
- Startbestand durch Extraktion aus dem Renderer: Personen-Silhouette, Waage, Eisberg (sind faktisch schon Assets)

---

## 4. Vision-Critic (optionales letztes Gate)

Vision-Modell prüft finale Karten-Shots — **Zusatz, nie Ersatz** der deterministischen Gates. Zwangs-Checkliste mit Check-Zeile pro Punkt (gemessene Lektion: ohne erzwungenes Output-Schema übersehen LLM-Prüfer Fehler): Hierarchie klar · Dichte ok · nichts beschnitten · Bild-Text-Verhältnis · „sieht das nach einer Hand aus?". Blockierend nur bei harten Befunden; weiche Befunde = Report.

---

## 5. Prozess

1. **Design-Gate vor Bau (bindend):** karten-grammatik.html um 3 Beispielkarten erweitert — (a) Neuron-Puls mit Asset + Sequenz, (b) Reveal auf bestehender Adenosin-Kurve, (c) Scrub-Karte. Abnahme durch Leon am Mockup, erst dann Renderer-Bau.
2. Bau-Reihenfolge nach Abnahme: Anker-Registry → Motion-Tokens → Sequenz-Verben → Sequenz-Audit → Asset-Slot/Manifest → scrub → Vision-Critic.
3. Katalog-Wachstum bleibt der Weg gegen Repetitivität: neue Typen werden EINMAL aus internen Primitives komponiert, designt, gegatet, eingefroren — Kosten pro Typ sinken, LLM-Freiheit bleibt null.

## Bestands-Befunde v2-Renderer (mit auf die Design-Gate-Agenda)

**Ereignis-Kurven sind überladen und ungeformt** (Befund Leon 14.08. an Luna-Bench-Karte „Koffein-Maskierung"; Klasse betrifft jede curve mit `stop` + `afterStop` + notes):
- Der `rebound`-Pfad knickt nahezu senkrecht — liest sich wie ein Zeichenfehler, nicht wie ein Ereignis. Nach-Stop-Verläufe brauchen eine gestaltete Form (Kurvencharakter statt Sprung).
- Bis zu 7 gleichrangige Textelemente (Achsen, Serien, Stop-Label, Notes) ohne visuelle Hierarchie; `side:below`-Notes landen auf der Zeile der x-Achsen-Beschriftung — verschiedene Bedeutungsebenen, gleiche Optik.
- Note-Labels wirken vom Bezugspunkt losgelöst (z. B. Crash-Label neben der Spitze statt erkennbar an ihr).

## Offene Diskussionspunkte

1. **Schrittzahl-Limit 6** — reicht das für „Signalweg Neuron"? (Imprint-Karten haben selten >5 Beats.)
2. **`trigger: auto` Default-Timing** — Karte animiert beim Erscheinen vs. erst nach erstem Tap?
3. **scrub in v3 oder erst v4?** Empfehlung: v3 nur wenn das Mockup zeigt, dass es ohne Simulation schon trägt — sonst raus.
4. **Anker-Namensschema** — `typ:id` wie oben, oder flach? Entscheidet, wie lesbar Judge-Prüfaufträge über Sequenzen werden.
