#!/bin/zsh
# ── Was diese Sonde beweist ──────────────────────────────────────────────────
# Der exit-3-Zweig in glm-generate.mjs (Zeile ~719/721) war ungetestet: er feuert,
# wenn das Render-Audit einen SYSTEM-Befund meldet (`ZÄHLUNG … system=N` mit N>0) —
# Überlappung, Clipping, Bindung. Das ist UNSER Bug, nicht der des Modells; der Worker
# deutet exit 3 darum als „Interner Fehler beim Zeichnen" und bricht die Modell-Kette
# ab (worker/index.mjs:121, `weiter: false`), statt das nächste Modell zu probieren.
#
# Fixture: `stub/systembug` liefert die Bestands-Lektion sleep-v2.json mit EINER
# ausgetauschten Karte (kollisions-karte.json) — zwei deckungsgleiche flache Serien am
# Boden, beide mit Label. Am Boden ist nur EINE Seite frei; zwei Labels für zwei exakt
# übereinanderliegende Kurven müssen sich dort überlappen. Der Solver kann das nicht
# auflösen — kein Karten-JSON-Patch heilt es, also genau die Definition eines
# System-Befunds. Gemessen (nicht angenommen): das Audit meldet
# `ZÄHLUNG befunde=1 leer=0 system=1`.
#
# BEIDE Richtungen laufen hier: derselbe Stub, dieselbe Kette, dieselbe Lektion —
# nur die Karte unterscheidet sich. `stub/gut` muss NICHT 3 liefern.
#
# Es gibt KEINE echten Modell-Calls: Generator UND Judge zeigen per --base/--judgebase
# auf den lokalen Stub. Der Key wird nur gelesen, weil die Pipeline ihn immer lädt.
#
# Fahren:  zsh probes/exit3-system/run.sh
# (aus der Repo-Wurzel; das Audit löst karten-grammatik.html relativ zur cwd auf —
#  darum setzt das Skript die cwd selbst auf REPO, wie worker/index.mjs runPipeline.)
# ─────────────────────────────────────────────────────────────────────────────
set -u

REPO="${0:A:h:h:h}"
cd "$REPO" || exit 1

OUT="${TMPDIR:-/tmp}/exit3-system-probe.$$"
mkdir -p "$OUT/fixture" "$OUT/kontrolle"

# FIXTURE-PROBE: erfüllt die ausgelieferte Lektion überhaupt den heutigen Contract?
# Zwischen 18. und 19.08. kamen die Pflicht-Quoten (annotations, sequence) dazu; die
# Fixture stammte von davor und wurde seither abgelehnt, BEVOR das Audit anlief. Beide
# Zweige endeten mit exit 1, die Sonde meldete „FEHLGESCHLAGEN" — und meinte den
# Contract, nicht den Exit-Zweig, den sie prüfen soll. Ein Gate, das aus dem falschen
# Grund rot ist, prüft nichts mehr; es fiel nur niemandem auf, weil es nicht lief.
FIXTURE_FEHLER=$(node --input-type=module -e '
import { readFileSync } from "fs";
import { normalizeLesson, validateLesson } from "./validate-lesson.mjs";
const roh = JSON.parse(readFileSync("sleep-v2.json", "utf8"));
const koll = JSON.parse(readFileSync("probes/exit3-system/kollisions-karte.json", "utf8"));
const mitKollision = structuredClone(roh);
mitKollision.cards[1] = koll;
for (const [name, l] of [["Basis sleep-v2.json", roh], ["Fixture mit Kollisions-Karte", mitKollision]]) {
  const fehler = validateLesson(normalizeLesson(structuredClone(l)));
  if (fehler.length) console.log(`${name}: ${fehler.join(" | ")}`);
}
' 2>&1)
if [[ -n "$FIXTURE_FEHLER" ]]; then
  echo "SONDE NICHT LAUFFÄHIG — die Fixture erfüllt den Contract nicht mehr:"
  echo "$FIXTURE_FEHLER"
  echo "(Das ist kein Befund über den exit-3-Zweig: die Pipeline lehnt vor dem Audit ab.)"
  exit 1
fi

# Freien Port suchen. Auf den Stub-Ports liegen regelmäßig Leichen aus früheren
# Sitzungen; ein belegter Port hätte den Stub still sterben lassen (EADDRINUSE) und die
# ALTE Fassung hätte geantwortet — gemessen worden wäre dann ein fremder Server.
PORT=""
for p in {8801..8830}; do
  lsof -nP -iTCP:$p -sTCP:LISTEN > /dev/null 2>&1 || { PORT=$p; break; }
done
[[ -z "$PORT" ]] && { echo "Kein freier Port 8801–8830 — Sonde bricht ab."; exit 1; }
BASE="http://127.0.0.1:${PORT}/v1"

node probes/stub-openrouter.mjs "$PORT" > "$OUT/stub.log" 2>&1 &
STUB=$!
trap 'kill $STUB 2>/dev/null' EXIT

# Auf den Stub warten, statt blind zu schlafen.
for i in {1..50}; do
  curl -sf "$BASE/models" > /dev/null 2>&1 && break
  sleep 0.1
done

# IDENTITÄTS-PROBE: antwortet wirklich UNSER frisch gestarteter Stub? Nur seine Fassung
# führt `stub/systembug` im Katalog. Ohne diese Prüfung misst die Sonde im Zweifel einen
# fremden Prozess und meldet exit 0 als „kein System-Bug" — ein stiller Fehlbefund.
if ! curl -sf "$BASE/models" 2>/dev/null | grep -q "stub/systembug"; then
  echo "Der Endpunkt auf $PORT ist NICHT dieser Stub (kein stub/systembug im Katalog)."
  echo "Stub-Log:"; cat "$OUT/stub.log"
  exit 1
fi
kill -0 $STUB 2>/dev/null || { echo "Stub-Prozess lebt nicht:"; cat "$OUT/stub.log"; exit 1; }

lauf() {
  local modell="$1" ziel="$2"
  # Der Exit-Code wird DIREKT nach dem Aufruf gelesen: keine Pipe dazwischen, sonst
  # misst $? den Exit der Pipe (tail) statt den der Pipeline. Ausgabe per Umlenkung.
  node glm-generate.mjs "$modell" \
    --key NVIDIA_GLM_KEY \
    --base "$BASE" \
    --judge "$modell" --judgekey NVIDIA_DS_PRO_KEY --judgebase "$BASE" \
    --topic "Warum wir schlafen" \
    --outdir "$ziel" \
    > "$ziel/lauf.log" 2>&1
  echo $?
}

echo "== Fixture: stub/systembug (erwartet exit 3) =="
CODE_FIX=$(lauf "stub/systembug" "$OUT/fixture")
grep -E "ZÄHLUNG befunde=|SYSTEM-BUG" "$OUT/fixture/lauf.log" | tail -3
echo "EXIT(fixture)=$CODE_FIX"

echo
echo "== Kontrolle: stub/gut (erwartet NICHT 3) =="
CODE_OK=$(lauf "stub/gut" "$OUT/kontrolle")
grep -E "ZÄHLUNG befunde=|AUDIT PASS" "$OUT/kontrolle/lauf.log" | tail -3
echo "EXIT(kontrolle)=$CODE_OK"

echo
echo "Logs: $OUT"
if [[ "$CODE_FIX" == "3" && "$CODE_OK" != "3" ]]; then
  echo "SONDE OK — Fixture 3, Kontrolle $CODE_OK"
  exit 0
fi
echo "SONDE FEHLGESCHLAGEN — Fixture $CODE_FIX (soll 3), Kontrolle $CODE_OK (soll nicht 3)"
exit 1
