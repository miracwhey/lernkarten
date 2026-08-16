#!/bin/zsh
# Screenshots der echten App-Screens aus den UI-Tests ziehen.
#
#   probes/app-shots.sh <ziel-ordner> [-only-testing:… …]
#
# Ohne Argumente laufen alle Shot-Tests. Die Testfotos wandern vorher in den
# Documents-Ordner des App-Containers: die iOS-Sandbox gilt auch im Simulator,
# Mac-Pfade außerhalb des Containers sind nicht lesbar — ohne diesen Schritt
# zeigt der Sucher das beschriftete Ersatzbild statt eines echten Fotos.
set -euo pipefail

REPO="${0:a:h}/.."
ZIEL="${1:-$REPO/probes/app-shots}"
ZIEL="${ZIEL:A}"
shift 2>/dev/null || true
SIM="iPhone 17"
BUNDLE="de.leonvalentin.Lernkarten"
ERGEBNIS="$(mktemp -d)/ergebnis.xcresult"

cd "$REPO/app"
xcodegen generate >/dev/null
xcodebuild build-for-testing -scheme Lernkarten -destination "platform=iOS Simulator,name=$SIM" \
  2>&1 | tail -1

# Der Container existiert erst nach einer Installation — der erste Testlauf legt
# ihn an, danach stehen die Fotos für alle weiteren Läufe bereit.
xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1 || true
if DOCS="$(xcrun simctl get_app_container "$SIM" "$BUNDLE" data 2>/dev/null)/Documents"; then
  mkdir -p "$DOCS"
  cp "$REPO"/probes/foto-testset/jpg/IMG_284[456].jpg "$DOCS/" 2>/dev/null || true
  echo "Testfotos → $DOCS"
else
  echo "HINWEIS: kein App-Container — der erste Lauf zeigt Ersatzbilder, ein zweiter die echten Fotos."
fi

xcodebuild test-without-building -scheme Lernkarten \
  -destination "platform=iOS Simulator,name=$SIM" \
  -resultBundlePath "$ERGEBNIS" "$@" 2>&1 | grep -E "Test Case .*(failed|passed)|Executed .* tests" || true

ROH="$(mktemp -d)"
xcrun xcresulttool export attachments --path "$ERGEBNIS" --output-path "$ROH" >/dev/null
mkdir -p "$ZIEL"
# Aus dem Export kommt alles mit: Videos, UI-Hierarchien, Debug-Ausgaben. Nur die
# selbst benannten Screenshots landen im Ziel — ein Ordner voller Beifang wäre
# genau die Art Ablage, in der man das eine Bild nicht mehr findet.
python3 - "$ROH" "$ZIEL" <<'PY'
import json, pathlib, re, shutil, sys
roh, ziel = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
manifest = roh / "manifest.json"
if not manifest.exists():
    sys.exit("kein manifest.json — keine Anhänge im Ergebnis")
# XCTest hängt an jeden Namen einen Lauf-Index und eine UUID. Alles, was NICHT
# aus einem `shot("…")` stammt (Videos, UI-Hierarchien, Debug-Ausgaben), trägt
# Leerzeichen oder Großbuchstaben im Namen und fällt hier raus.
muster = re.compile(r"^([a-z0-9][a-z0-9-]*)_\d+_[0-9A-F-]+\.png$")
anzahl = 0
for eintrag in json.loads(manifest.read_text()):
    for anhang in eintrag.get("attachments", []):
        treffer = muster.match(anhang.get("suggestedHumanReadableName") or "")
        quelle = roh / anhang["exportedFileName"]
        if not treffer or not quelle.exists():
            continue
        shutil.copy(quelle, ziel / f"{treffer.group(1)}.png")
        anzahl += 1
if anzahl == 0:
    sys.exit("keine benannten Screenshots gefunden — liefen die Shot-Tests?")
print(f"{anzahl} Screenshots in {ziel}")
PY
ls -la "$ZIEL"/*.png
