# Generierungs-Worker

Lokaler Node-Daemon. Er zieht Aufträge aus `public.generation_jobs`, baut pro Auftrag
ein Fakten-Dossier, lässt darauf die **unveränderte** Pipeline (`glm-generate.mjs`)
laufen und legt die fertige Lektion in `public.lessons` ab.

Er braucht einen echten Browser (Playwright für Notecheck und Render-Audit) — deshalb
läuft er nicht auf einem Funktions-Hoster, sondern entweder lokal als Daemon oder auf
GitHub Actions.

## Zwei Betriebsarten

| | Daemon (Vorgabe) | Einmalig (`WORKER_ONCE=1`) |
|---|---|---|
| Verhalten | pollt endlos alle 5 s | arbeitet die Queue ab, endet bei leerer Queue |
| Wofür | der Rechner unterm Tisch | ein CI-Lauf, der pro Aufruf startet |
| Deckel | keiner | `WORKER_MAX_MS` (Rest bleibt in der Queue) |

```sh
node worker/index.mjs                                  # Daemon
WORKER_ONCE=1 WORKER_MAX_MS=3000000 node worker/index.mjs   # einmalig, 50 Min
```

Beenden mit Ctrl-C (der laufende Job wird zu Ende gefahren). Bleibt ein Job durch
einen Absturz auf `running` stehen, holt ihn der nächste Start nach 30 Minuten
zurück in die Queue — oberhalb von 2 Versuchen endgültig als `failed`. **Deshalb
kostet ein abgebrochener CI-Lauf keinen Auftrag: er wartet nur.**

## Auf GitHub Actions

`.github/workflows/worker.yml`. Öffentliche Repos laufen auf Standard-Runnern ohne
Minutenkontingent; ein Job darf 6 Stunden dauern, der Worker hört nach 50 Minuten
von selbst auf.

Ausgelöst wird er dreifach: `repository_dispatch` (Typ `generation-job`) als
normaler Weg, ein Knopf in der Actions-Oberfläche, und ein 15-Minuten-Plan als
Sicherheitsnetz. Der Plan ist eine Bitte, kein Termin — GitHub verschiebt Läufe
unter Last; genau deshalb ist er das Netz und nicht der Weg.

**Drei Repository-Secrets sind nötig** (Settings → Secrets and variables → Actions):
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`. Ein Schlüssel
reicht für Generator und Judge, beide laufen über OpenRouter.

Für den sofortigen Anstoß aus der Datenbank braucht es zusätzlich ein GitHub-Token
mit `repo`-Recht als Supabase-Secret, das den `repository_dispatch` auslöst. Ohne
das greift der 15-Minuten-Plan — Aufträge werden gebaut, nur eben später.

## Env

`worker/.env` (gitignoriert, liegt nicht im Repo):

```
SUPABASE_URL=https://putffdkzcefpfpamjqlt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<geheim>
```

Der Service-Role-Key umgeht RLS — er gehört ausschließlich hierher, nie in die App.
Beschaffung ohne den Wert ins Terminal zu drucken:

```sh
supabase projects api-keys --project-ref putffdkzcefpfpamjqlt --output json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      const k=JSON.parse(s).find(x=>x.name==='service_role'&&x.type==='legacy');
      process.stdout.write('SUPABASE_URL=https://putffdkzcefpfpamjqlt.supabase.co\n'
        +'SUPABASE_SERVICE_ROLE_KEY='+k.api_key+'\n');})" > worker/.env
```

Die **Modell-Keys** kommen nicht aus dieser Datei, sondern wie in der ganzen Pipeline
aus `~/Workspace/jarvis/.env` (`NVIDIA_QWEN_KEY`, `NVIDIA_KIMI_KEY`, `GROQ_API_KEY`,
`NVIDIA_DS_PRO_KEY`). `glm-generate.mjs` löst Keys ausschließlich über diese Datei auf.

## Modell-Kette

`worker/models.mjs`, in dieser Reihenfolge — schlägt einer fehl, übernimmt der nächste:

| Modell | Key | Besonderheit |
|---|---|---|
| `minimaxai/minimax-m3` | `NVIDIA_QWEN_KEY` | — |
| `openai/gpt-oss-120b` | `NVIDIA_KIMI_KEY` | `reasoning_effort: low`, sonst frisst das Denken das Output-Budget |
| `llama-3.3-70b-versatile` | `GROQ_API_KEY` | Groq-Basis, `max_tokens: 3000` |

Der Judge ist immer `deepseek-ai/deepseek-v4-flash-0731` über `NVIDIA_DS_PRO_KEY` —
er darf nie das Generator-Modell sein.

**OpenRouter ist der Produktionsweg.** `worker/models.mjs` fährt Kette und Judge über
`OPENROUTER_API_KEY`; der Worker reicht Key-Name und Basis als Argumente an
`glm-generate.mjs` weiter (`--key`, `--base`, `--judgekey`, `--judgebase`). Die Tabelle
oben beschreibt die NIM-/Groq-Kandidaten aus der Bench-Zeit, nicht den Betrieb.

**Schlüssel: Umgebung zuerst, Datei als Rückfall.** `loadKey` (`nim.mjs`) nimmt
`process.env[NAME]`, und nur wenn dort nichts steht, die Schlüsseldatei. Deren Pfad ist
über `LERNKARTEN_KEY_FILE` änderbar und darf fehlen. Vorher stand dort ein absoluter
Pfad nach `jarvis/.env` und sonst nichts — das band die Pipeline an genau einen Rechner
und war der eigentliche Grund, warum sie nirgends sonst lief.

## Stufen pro Job

1. **Quellen sammeln** (`make-dossier.mjs`) — Thema bzw. eigener Text → Dossier im
   Format von `facts/why-we-sleep.md`, mit deterministischem Format-Gate
   (vier Pflicht-Sektionen, Mindest-Punktzahlen je Tiefe). Bei `kind = 'text'` speist
   sich das Dossier ausschließlich aus dem Nutzertext.
2. **Karten schreiben** — `glm-generate.mjs` mit `--topic`, `--dossier`, `--outdir`.
3. **Fakten & Bilder prüfen** — dieselbe Pipeline-Instanz: Spellcheck, Factcheck,
   Judge, Notecheck, Render-Audit. Der Worker schaltet die Stufe um, sobald die
   Pipeline `Contract PASS` meldet.
4. **Speichern** — Lektion nochmals durch `validate-lesson.mjs`, dann als Row in
   `lessons` (eindeutiger `slug` = Identität der Karten im SRS).

Diese drei Stufen sind exakt die Zeilen aus Mockup S4; die Bibliothekszeile zeigt sie
als „Wird gebaut – …".

## Artefakte

Pro Job unter `worker/jobs/<job-id>/` (gitignoriert):

- `dossier.md` — das Dossier, das Generator und Judge gelesen haben
- `run.log` — vollständige Pipeline-Ausgabe
- `<modell>-lesson-v2.json` — die Lektion
- `<modell>-raw-v2-*.txt` — Roh-Antworten je Runde
- `<modell>-v2-shots/` — Render-Audit-Screenshots jeder Karte

Bei Fehlern bleiben die Artefakte liegen — sie sind die Diagnose.

## Tiefe

`kompakt` · `standard` · `tief` steuern die **Dichte des Dossiers** UND die
**Kartenzahl** der Lektion. Die Bereiche stehen an einer Stelle
(`validate-lesson.mjs → DEPTH_CARDS`) und speisen Generator-Auftrag, Contract und
Ergänzungs-Runde:

| Tiefe | Karten | Kachel im Erstellen-Sheet |
|---|---|---|
| kompakt | 6–8 | ca. 7 Karten · 4 Min |
| standard | 11–13 | ca. 12 Karten · 7 Min |
| tief | 18–22 | ca. 20 Karten · 12 Min |

Ohne `--depth` (CLI-Blindtests, Alt-Lektionen) gilt der Bestands-Contract 7–8.
Zu wenige Karten heilt die Pipeline **additiv**: eine Ergänzungs-Runde liefert nur
die fehlenden Karten, die bestehenden bleiben unangetastet (eine Voll-Regeneration
würde bereits geprüfte Karten neu würfeln). Die Titel-Karte bekommt ihre
`stats`-Zeile deterministisch aus der echten Kartenzahl.

## Zahlen-Gate der Dossier-Stufe

Das Dossier ist die einzige Grundwahrheit — alle späteren Prüfungen messen GEGEN
es, eine falsche Zahl darin findet danach niemand mehr. `dossier-check.mjs` zieht
darum deterministisch jede Sachzahl (ohne Jahreszahlen, Auflagen, Formel- und
Namensziffern) und lässt den unabhängigen Judge (DeepSeek, nie das Dossier-Modell)
eine Zwangs-Checkliste abarbeiten: eine Prüfzeile pro Zahl, mit Einheit,
Zeitbasis, Größenordnungs-Vergleich und interner Konsistenz. Befunde werden
zeilenweise deterministisch gepatcht, danach läuft der Detektor **erneut** — was
als „hart" überlebt, fliegt als Zeile raus, und das Format-Gate zählt neu.
Einzeln fahren: `node worker/dossier-check.mjs <dossier.md> [--patch out.md]`.

## Dauerbetrieb als Dienst (macOS)

Der Worker rendert die Karten mit einem echten Browser und kann deshalb nicht in
eine Edge Function — er braucht einen Rechner, der ihn am Leben hält. Von Hand
gestartet stirbt er mit der Sitzung, und dann bleiben Aufträge liegen, ohne dass
es jemand merkt: Die App zeigt weiter „in der Warteschlange".

`de.leonvalentin.lernkarten.worker.plist` ist die launchd-Vorlage dafür —
startet beim Anmelden, zieht sich nach jedem Ende selbst wieder hoch, Log unter
`~/Library/Logs/lernkarten-worker.log`.

```sh
cp worker/de.leonvalentin.lernkarten.worker.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/de.leonvalentin.lernkarten.worker.plist
launchctl print gui/$(id -u)/de.leonvalentin.lernkarten.worker | grep -E 'state|pid'
```

Anhalten: `launchctl bootout gui/$(id -u)/de.leonvalentin.lernkarten.worker`.
Nach Änderungen am Worker: bootout, dann bootstrap — launchd startet den alten
Prozess sonst unverändert weiter.

**Reihenfolge bei Änderungen, die die Datenbank betreffen:** erst `supabase db
push`, dann den Dienst neu laden. Umgekehrt läuft ein Worker gegen Funktionen,
die es noch nicht gibt — er meldet den Fehlschlag nur ins Log und baut still
ohne Stufenmeldung weiter, was in der App wie ein hängender Auftrag aussieht.

Die Pfade in der Vorlage sind absolut (launchd kennt keine Shell-Expansion) und
gelten für `~/Workspace/lernkarten` mit Homebrew-node. Auf einer anderen Maschine
beide anpassen.

**Grenze, die bleibt:** Schläft der Mac, ruht auch der Worker; er arbeitet die
Warteschlange beim Aufwachen ab. Wer Aufträge unabhängig vom Rechner verarbeitet
haben will, muss den Worker auf einen eigenen Server umziehen — der Code ändert
sich dafür nicht, nur sein Zuhause.
