#!/bin/zsh
# Sonde für das Breiten-Gate an Asset-Label-Plätzen.
#
# Der gefangene Fall (Echt-Lauf 15.08., Job 0ede736a): Karte 5 trug
# subs.aussen = "NICHT WAHRGENOMMEN" — 18 Zeichen bei einem Deckel von 20, also
# contract-konform, und lief trotzdem rechts aus der Karte. Das Audit meldete CLIP,
# die Pipeline brach mit Exit 3 als SYSTEM-Bug ab (nicht patchbar, ganze Kette tot).
#
# Diese Sonde beweist vier Dinge, jedes mit einer eigenen Kontrolle:
#   1 FIXTURE     — validate-lesson meldet den Fall jetzt SELBST, mit korrigierender Meldung
#   2 GEGENPROBE  — derselbe Fall mit kurzem Sub läuft sauber durch (kein Falsch-Positiv)
#   3 MUTATION    — mit künstlich abgeschaltetem Gate meldet der Validator NICHTS mehr
#                   (die Sonde trifft also wirklich das Gate und nicht etwas daneben)
#   4 AUDIT-NETZ  — und genau dann fängt das Audit den Fall weiterhin als CLIP:
#                   die zweite Verteidigungslinie fällt durch den Fix nicht weg
#
# Kein Modell-Call, kein Netz: validate-lesson rechnet ohne Browser, audit-lesson
# rendert lokal über file://.
# Nutzung: zsh probes/asset-breiten-gate/run.sh
set -u

REPO="${0:A:h:h:h}"
cd "$REPO" || exit 1
OUT="${TMPDIR:-/tmp}/asset-breiten-gate.$$"
mkdir -p "$OUT"
FIX="probes/asset-breiten-gate/zu-breite-sub.json"
KURZ="probes/asset-breiten-gate/kurze-sub.json"
# Die mutierte Fassung liegt im REPO-Wurzelverzeichnis: validate-lesson.mjs löst
# assets/manifest.json relativ zu sich selbst auf — eine Kopie woanders läse eine andere
# (oder gar keine) Registry und die Mutation prüfte dann das falsche Objekt.
MUT="$REPO/.validate-ohne-breiten-gate.tmp.mjs"
trap 'rm -f "$MUT"; rm -rf "$OUT"' EXIT

fehler=0
melde() { print -- "$1"; }

# ——— 1 FIXTURE ———
melde "== 1 FIXTURE: $FIX (erwartet Exit 1 + Breiten-Befund) =="
node validate-lesson.mjs "$FIX" --depth kompakt > "$OUT/fixture.txt" 2>&1
CODE_FIX=$?
cat "$OUT/fixture.txt"
melde "EXIT(fixture)=$CODE_FIX"
if [[ "$CODE_FIX" != "1" ]] || ! grep -q "zu breit für den Platz" "$OUT/fixture.txt"; then
  melde "  ✗ erwartet: Exit 1 mit \"zu breit für den Platz\""; fehler=1
else
  melde "  ✓ Befund mit Korrektur gemeldet"
fi

# ——— 2 GEGENPROBE ———
melde "\n== 2 GEGENPROBE: $KURZ (erwartet Exit 0) =="
node validate-lesson.mjs "$KURZ" --depth kompakt > "$OUT/kurz.txt" 2>&1
CODE_KURZ=$?
cat "$OUT/kurz.txt"
melde "EXIT(gegenprobe)=$CODE_KURZ"
if [[ "$CODE_KURZ" != "0" ]]; then
  melde "  ✗ der kurze Sub muss sauber durchlaufen"; fehler=1
else
  melde "  ✓ kein Falsch-Positiv"
fi

# ——— 3 MUTATION: das Gate abschalten ———
# Beide Aufrufstellen hängen an `errs.length === vorher && rolleOk`; auf `false` gesetzt
# ist das Gate tot, der Rest des Validators unverändert. Dass die Mutation GRIFF, wird
# gemessen (Trefferzahl vorher/nachher) — eine Mutation, die ihr Ziel verfehlt, bewiese
# sonst still gar nichts.
melde "\n== 3 MUTATION: Breiten-Gate künstlich abgeschaltet =="
sed 's/errs\.length === vorher \&\& rolleOk/false/g' validate-lesson.mjs > "$MUT"
VOR=$(grep -c "errs.length === vorher && rolleOk" validate-lesson.mjs)
NACH=$(grep -c "errs.length === vorher && rolleOk" "$MUT")
melde "Aufrufstellen im Original: $VOR, in der mutierten Fassung: $NACH"
if [[ "$VOR" -lt 2 || "$NACH" != "0" ]]; then
  melde "  ✗ Mutation hat ihr Ziel nicht getroffen — die Sonde prüft nichts"; fehler=1
fi
node "$MUT" "$FIX" --depth kompakt > "$OUT/mutiert.txt" 2>&1
CODE_MUT=$?
cat "$OUT/mutiert.txt"
melde "EXIT(mutiert)=$CODE_MUT"
if [[ "$CODE_MUT" != "0" ]]; then
  melde "  ✗ ohne Gate darf der Validator diesen Fall NICHT mehr sehen (sonst misst die Sonde etwas anderes)"; fehler=1
else
  melde "  ✓ Gate ist nachweislich abgeschaltet"
fi

# ——— 4 AUDIT-NETZ ———
melde "\n== 4 AUDIT-NETZ: fängt das Audit den Fall weiterhin? (erwartet CLIP, system=1) =="
node audit-lesson.mjs "$FIX" "$OUT/shots" > "$OUT/audit.txt" 2>&1
CODE_AUD=$?
grep -E "^c5|CLIP|ZÄHLUNG|AUDIT" "$OUT/audit.txt"
melde "EXIT(audit)=$CODE_AUD"
if [[ "$CODE_AUD" != "1" ]] || ! grep -q 'CLIP  "NICHT WAHRGENOMMEN"' "$OUT/audit.txt" \
   || ! grep -q "ZÄHLUNG befunde=1 leer=0 system=1" "$OUT/audit.txt"; then
  melde "  ✗ die zweite Verteidigungslinie fehlt"; fehler=1
else
  melde "  ✓ Audit meldet den Fall unverändert als System-Befund"
fi

melde "\n== 4b AUDIT-Gegenprobe: kurzer Sub (erwartet 0 Befunde) =="
node audit-lesson.mjs "$KURZ" "$OUT/shots-kurz" > "$OUT/audit-kurz.txt" 2>&1
CODE_AUDK=$?
grep -E "^c5|ZÄHLUNG|AUDIT" "$OUT/audit-kurz.txt"
melde "EXIT(audit-gegenprobe)=$CODE_AUDK"
if [[ "$CODE_AUDK" != "0" ]]; then melde "  ✗ die Gegenprobe muss sauber rendern"; fehler=1; else melde "  ✓ sauber"; fi

if [[ "$fehler" == "0" ]]; then
  melde "\nSONDE OK — Gate meldet und korrigiert, Gegenprobe sauber, Audit-Netz intakt"
  exit 0
fi
melde "\nSONDE FEHLGESCHLAGEN"
exit 1
