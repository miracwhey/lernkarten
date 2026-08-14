# Generierungs-Worker

Lokaler Node-Daemon. Er zieht Aufträge aus `public.generation_jobs`, baut pro Auftrag
ein Fakten-Dossier, lässt darauf die **unveränderte** Pipeline (`glm-generate.mjs`)
laufen und legt die fertige Lektion in `public.lessons` ab.

Kein Docker, kein Hosting — der Worker läuft auf dem Rechner, der auch die Pipeline
fährt (Playwright-Browser für Notecheck und Render-Audit hängen daran).

## Start

```sh
node worker/index.mjs
```

Beenden mit Ctrl-C (der laufende Job wird zu Ende gefahren). Bleibt ein Job durch
einen Absturz auf `running` stehen, holt ihn der nächste Start nach 30 Minuten
zurück in die Queue — oberhalb von 2 Versuchen endgültig als `failed`.

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

**OpenRouter wird nicht unterstützt.** `glm-generate.mjs` lädt Keys ausschließlich aus
`jarvis/.env` und kennt keinen Env-Fallback; ein OpenRouter-Zweig wäre toter Code, der
sich nicht einmal per 1-Token-Probe verifizieren ließe. Der Worker meldet beim Start,
wenn `OPENROUTER_API_KEY` gesetzt ist, und ignoriert ihn.

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

`kompakt` · `standard` · `tief` steuern die **Dichte des Dossiers**, nicht die
Kartenzahl: `validate-lesson.mjs` schreibt 7–8 Karten fest (Contract v2). Die
Kartenzahl-Schätzungen der Tiefe-Kacheln im Erstellen-Sheet decken sich daher nicht
mit dem Ergebnis, solange der Contract gilt.
