// Billige Sonde für die Frage „nutzt ein Modell ein OPTIONALES Feld überhaupt?".
//
// Ein voller Generator-Lauf dauert 6 Minuten und kostet ~$0,006; um eine PROMPT-Formulierung
// zu prüfen, ist das die falsche Auflösung — zwei Läufe lieferten nacheinander null
// Annotationen, ohne zu zeigen, woran es liegt. Diese Sonde schickt denselben Systemprompt,
// verlangt aber nur EINE Diagramm-Karte. Sekunden statt Minuten, Bruchteile eines Cents.
//
// Gemessen werden `annotations` UND `sequence` — beide sind optional, beide haben denselben
// Weg genommen: ein eigener Prompt-Abschnitt, und trotzdem kam nichts an (annotations 0 in
// zwei Läufen, sequence 4 von 582 generierten Karten). Ein Feld je Sonde hätte den zweiten
// Fall erst gefunden, als jemand danach suchte.
//
// `--pflicht` legt die Pflicht-Zeilen des echten Contracts in den Auftrag (contract-
// pflichten.md, dieselbe Datei, die glm-generate.mjs einliest — nicht ihre Kopie). So misst
// die Sonde die zwei Lagen getrennt: OHNE die Zeilen, was das Modell von sich aus tut, MIT
// ihnen, was der Auftrag durchsetzt. Genau dieses Delta war der Grund für die Zeilen.
//
// ACHTUNG max_tokens: Denk-Modelle (ring, glm) schreiben zuerst ihr Reasoning. Mit 4000
// Tokens kam LEERER content zurück und die Sonde meldete „0 von 3 mit annotations" — ein
// Sondenfehler, der wie ein Modellbefund aussah. Die Pipeline fährt 32000, hier auch.
//
// Nutzung: node probes/feld-sonde.mjs [modell] [anzahl] [--pflicht]
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadKey } from "../nim.mjs";
import { pflichtText } from "../validate-lesson.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2).filter((a) => a !== "--pflicht");
const mitPflicht = process.argv.includes("--pflicht");
const modell = argv[0] || "inclusionai/ring-2.6-1t";
const runden = Number(argv[1] || 3);
const key = loadKey("OPENROUTER_API_KEY");

// Denselben Systemprompt wie die Pipeline, inklusive Asset-Registry-Ersetzung.
const ASSET_ANKER = readFileSync(`${repo}/glm-generate.mjs`, "utf8").match(/ASSET_ANKER\s*=\s*"([^"]+)"/)?.[1];
let system = readFileSync(`${repo}/generator-prompt.md`, "utf8");
const manifest = JSON.parse(readFileSync(`${repo}/assets/manifest.json`, "utf8")).assets;
if (ASSET_ANKER && system.includes(ASSET_ANKER)) {
  const block = Object.entries(manifest).filter(([, a]) => !a.verbraucher)
    .map(([ref, a]) => `- \`${ref}\` — Anker: ${(a.anker || []).join(", ")}`).join("\n");
  system = system.replace(ASSET_ANKER, block);
}

const auftrag = `Thema: „Why We Sleep" von Matthew Walker — Schlafdruck und Koffein.

## Umfang (Contract — wird geprüft)

Gib GENAU EINE Diagramm-Karte aus, keine title/quiz/insight-Karte. Wähle die Relation selbst.
${mitPflicht ? `
Für die volle Lektion gelten diese Pflichten; hier gelten sie für DIESE eine Karte:

${pflichtText()}` : ""}

## Fakten-Dossier (bindend)

Adenosin sammelt sich, solange du wach bist, und erzeugt Schlafdruck. Koffein besetzt die
Rezeptoren und maskiert den Druck — das Adenosin steigt dahinter weiter. Lässt die Wirkung
nach, trifft dich der aufgestaute Druck auf einmal.

Deine finale Antwort ist NUR das JSON-Objekt der Karte (beginnend mit { und endend mit }),
ohne Markdown-Zäune, ohne jeden weiteren Text.`;

const zaehler = { annotations: 0, sequence: 0 };
let gesamt = 0;
for (let i = 0; i < runden; i++) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: modell, max_tokens: 32000,
      messages: [{ role: "system", content: system }, { role: "user", content: auftrag }] })
  });
  const data = await res.json();
  const txt = data?.choices?.[0]?.message?.content || "";
  const roh = txt.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  let karte = null;
  try { karte = JSON.parse(roh.slice(roh.indexOf("{"), roh.lastIndexOf("}") + 1)); } catch { /* unparsbar */ }
  if (i === 0) console.log("--- Rohantwort (erste 400 Zeichen) ---\n" + txt.slice(0, 400) + "\n---");
  gesamt++;
  // Ein leerer Array ist KEIN Gebrauch des Feldes: `"annotations": []` liest sich in der
  // Auswertung wie „das Modell kennt es", zeichnet aber nichts. Gezählt wird, was auf der
  // Karte ankommt.
  const zeig = (v) => (Array.isArray(v) ? (v.length ? JSON.stringify(v) : "[] (leer)")
    : v === undefined ? "—" : String(v));
  for (const feld of Object.keys(zaehler)) if (Array.isArray(karte?.[feld]) && karte[feld].length) zaehler[feld]++;
  console.log(`${i + 1}: relation=${karte?.relation ?? "?"}`
    + `\n   annotations=${zeig(karte?.annotations)}`
    + `\n   sequence=${zeig(karte?.sequence)}`);
}
console.log(`\n${modell} — von ${gesamt} Karten mit Feld:`
  + Object.entries(zaehler).map(([f, n]) => `  ${f} ${n}/${gesamt}`).join("")
  + `  (Pflicht-Zeilen im Auftrag: ${mitPflicht ? "JA" : "nein"})`);
