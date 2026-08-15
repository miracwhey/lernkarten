#!/usr/bin/env bash
# E2E-Probe des Eingangs-Wegs: anonym anmelden → Fotos EINZELN hochladen →
# erkenne-foto nur mit den Pfaden rufen → prüfen, dass der Eingang danach leer ist.
#
# Das ist der Gegenbeweis zum alten Weg: dort ging derselbe Stapel als EIN
# base64-Body von 2,66 MB über die Leitung und riss über Mobilfunk ab.
#
# Aufruf:  probes/foto-eingang-e2e.sh [anzahl-fotos]   (Vorgabe 4 = Leons Fehlerfall)
set -euo pipefail

URL="https://putffdkzcefpfpamjqlt.supabase.co"
KEY="sb_publishable_OUqtclcDwUqxkxzPTxkFNw_DER8qPXb"
FOTOS="$(cd "$(dirname "$0")/foto-testset/jpg" && pwd)"
ANZAHL="${1:-4}"

echo "── 1. Anonyme Sitzung ──"
# Anonyme Anmeldungen sind auf 5 pro Stunde und IP begrenzt — bei wiederholten
# Läufen wird die Sitzung deshalb wiederverwendet, solange ihr Token gilt.
CACHE="${TMPDIR:-/tmp}/lernkarten-probe-session.json"
if [ -s "$CACHE" ] && python3 - "$CACHE" <<'PY'
import json, sys, time, base64
try:
    tok = json.load(open(sys.argv[1]))["access_token"]
    nutz = tok.split(".")[1]
    nutz += "=" * (-len(nutz) % 4)
    sys.exit(0 if json.loads(base64.urlsafe_b64decode(nutz))["exp"] - time.time() > 120 else 1)
except Exception:
    sys.exit(1)
PY
then
  SESSION=$(cat "$CACHE")
  echo "(bestehende Sitzung wiederverwendet)"
else
  SESSION=$(curl -sS -X POST "$URL/auth/v1/signup" \
    -H "apikey: $KEY" -H "Content-Type: application/json" -d '{}')
  printf '%s' "$SESSION" > "$CACHE"
fi
TOKEN=$(printf '%s' "$SESSION" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
UID_=$(printf '%s' "$SESSION" | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["id"])')
echo "Nutzer: $UID_"

DURCHGANG=$(uuidgen | tr 'A-Z' 'a-z')
PFADE=()

echo
echo "── 2. Fotos einzeln hochladen ──"
i=0
for f in "$FOTOS"/*.jpg; do
  [ "$i" -ge "$ANZAHL" ] && break
  i=$((i + 1))
  PFAD="$UID_/$DURCHGANG/$i.jpg"
  KB=$(( $(stat -f%z "$f") / 1024 ))
  T0=$(python3 -c 'import time; print(time.time())')
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$URL/storage/v1/object/foto-eingang/$PFAD" \
    -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: image/jpeg" --data-binary "@$f")
  DAUER=$(python3 -c "import time; print(f'{time.time()-$T0:.1f}')")
  echo "  $(basename "$f")  ${KB} KB  →  HTTP $CODE  (${DAUER}s)  $PFAD"
  [ "$CODE" = "200" ] || { echo "FEHLER: Upload abgelehnt"; exit 1; }
  PFADE+=("$PFAD")
done

BODY=$(python3 -c "
import json,sys
print(json.dumps({'paths': sys.argv[1:]}))
" "${PFADE[@]}")
echo "  Aufruf-Body: $(printf '%s' "$BODY" | wc -c | tr -d ' ') Byte für $ANZAHL Fotos"

echo
echo "── 3. Erkennung (nur Pfade) ──"
T0=$(python3 -c 'import time; print(time.time())')
ANTWORT=$(curl -sS -w '\n%{http_code}' -X POST "$URL/functions/v1/erkenne-foto" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d "$BODY")
DAUER=$(python3 -c "import time; print(f'{time.time()-$T0:.1f}')")
CODE=$(printf '%s' "$ANTWORT" | tail -1)
printf '%s' "$ANTWORT" | sed '$d' | python3 -m json.tool 2>/dev/null || printf '%s\n' "$ANTWORT"
echo "HTTP $CODE nach ${DAUER}s"

echo
echo "── 4. Eingang danach (muss leer sein) ──"
REST=$(curl -sS -X POST "$URL/storage/v1/object/list/foto-eingang" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"prefix\":\"$UID_/$DURCHGANG\",\"limit\":100}")
ANZ=$(printf '%s' "$REST" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')
echo "Verbliebene Objekte: $ANZ"
[ "$ANZ" = "0" ] || { echo "FEHLER: Eingang nicht geleert — $REST"; exit 1; }

echo
echo "── 5. Negativkontrollen ──"
OHNE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$URL/functions/v1/erkenne-foto" \
  -H "apikey: $KEY" -H "Content-Type: application/json" -d "$BODY")
echo "  ohne Token            → HTTP $OHNE  (erwartet 401)"
FREMD=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$URL/functions/v1/erkenne-foto" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paths":["00000000-0000-0000-0000-000000000000/fremd/1.jpg"]}')
echo "  fremder Ordner        → HTTP $FREMD  (erwartet 403)"
LEER=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$URL/functions/v1/erkenne-foto" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"paths":[]}')
echo "  leere Liste           → HTTP $LEER  (erwartet 400)"

[ "$CODE" = "200" ] && [ "$OHNE" = "401" ] && [ "$FREMD" = "403" ] && [ "$LEER" = "400" ] \
  && echo && echo "ALLES GRÜN" || { echo; echo "NICHT GRÜN"; exit 1; }
