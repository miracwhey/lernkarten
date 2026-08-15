// Negativ-Kontrollen der Asset-Schicht. Jede Zeile hier ist ein Defekt, den ein Gate
// SEHEN MUSS: bleibt einer stumm, ist das Gate blind und dieser Lauf fällt durch —
// ein Prüfer, der nie feuert, hat nichts geprüft.
//
// Zwei Sorten:
//   VALIDATOR — mutierte Karten-JSONs gegen validateLesson (kein Rendern, kein Browser)
//   CHECK     — mutierte Kopien der Library gegen asset-check.mjs (eigene Kopie, damit
//               das Repo unberührt bleibt: ein Test, der sein Prüfobjekt beschädigt,
//               ist kein Test)
// Nutzung: node probes/asset-negativ.mjs
import { execFileSync } from "child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { validateLesson, normalizeLesson } from "../validate-lesson.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const demo = JSON.parse(readFileSync(resolve(REPO, "probes/asset-demo-lesson.json"), "utf8"));
const BACKLOG = join(mkdtempSync(join(tmpdir(), "lk-backlog-")), "backlog.jsonl");
process.env.LERNKARTEN_BACKLOG = BACKLOG;

let gelaufen = 0, stumm = 0;
const zeige = (name, gefeuert, beleg) => {
  gelaufen++;
  if (!gefeuert) stumm++;
  console.log(`${gefeuert ? "FEUERT " : "STUMM  "} ${name.padEnd(52)} ${beleg}`);
};

// ————————————————————— Validator —————————————————————
// Die Karte wird jeweils NUR an der geprüften Stelle beschädigt; alles andere bleibt
// gültig, sonst könnte ein Fehler von einer anderen Regel stammen.
const mitKarte = (fn) => {
  const l = JSON.parse(JSON.stringify(demo));
  fn(l.cards);
  return validateLesson(normalizeLesson(l));
};
const trifft = (errs, muster) => errs.filter((e) => muster.test(e));

console.log("——— Validator (ohne Rendern) ———");
let e = mitKarte((c) => { c[1].asset.ref = "biology.mitochondrium"; });
zeige("unbekannter ref → Fehler mit Korrektur", trifft(e, /asset\.ref.*gibt es in der Library nicht/).length === 1
  && /Verfügbar: biology\.neuron/.test(e.join()) && /ohne Asset|formuliere die Karte ohne Asset/.test(e.join()),
  trifft(e, /asset\.ref/)[0]?.slice(0, 96) ?? "(kein Fehler)");

e = mitKarte((c) => { c[1].asset.ref = "psyche.waage"; });
zeige("intern verbrauchtes Objekt (Waage) nicht frei wählbar", trifft(e, /gehört fest zum Karten-Typ "balance"/).length === 1,
  trifft(e, /asset\.ref/)[0]?.slice(0, 96) ?? "(kein Fehler)");

e = mitKarte((c) => { c[1].asset.role = "gross"; });
zeige("unbekannte role → Fehler", trifft(e, /asset\.role.*ungültig/).length === 1, trifft(e, /asset\.role/)[0]?.slice(0, 80) ?? "(kein Fehler)");

e = mitKarte((c) => { c[2].asset.role = "inline"; });
zeige("Rolle, die das Objekt gemessen nicht trägt", trifft(e, /trägt die Rolle "inline" nicht \(gemessen: hero\)/).length === 1,
  trifft(e, /asset\.role/)[0]?.slice(0, 96) ?? "(kein Fehler)");

e = mitKarte((c) => { c[1].asset.labels.nase = "GIBT ES NICHT"; });
zeige("Label-Platz, den das Objekt nicht hat", trifft(e, /ist kein Label-Platz/).length === 1,
  trifft(e, /labels\.nase/)[0]?.slice(0, 90) ?? "(kein Fehler)");

e = mitKarte((c) => { c[1].asset.labels.reize = "VIEL ZU LANGER LABELTEXT FÜR DIESEN PLATZ"; });
zeige("Label-Text über dem Deckel des Platzes", trifft(e, /labels\.reize.*zu lang/).length === 1,
  trifft(e, /labels\.reize/)[0]?.slice(0, 80) ?? "(kein Fehler)");

e = mitKarte((c) => { c[4].asset = { ref: "biology.neuron", role: "hero" }; });
zeige("Asset auf fremdem Karten-Typ (balance)", trifft(e, /Karten-Typ "balance" trägt kein Asset/).length === 1,
  trifft(e, /\.asset:/)[0]?.slice(0, 90) ?? "(kein Fehler)");

e = mitKarte((c) => { c[1].sequence[1].to = "node:mitochondrium"; });
zeige("Sequenz-Target auf nicht existentem Asset-Anker", trifft(e, /Anker "node:mitochondrium" gibt es auf dieser Karte nicht/).length === 1,
  trifft(e, /sequence\[1\]/)[0]?.slice(0, 90) ?? "(kein Fehler)");

e = mitKarte((c) => { c[1].sequence[1] = { verb: "pulse", from: "node:dendrit", to: "node:synapse" }; });
zeige("pulse über ein Paar, das das Objekt nicht zeichnet", trifft(e, /nicht verbunden/).length === 1,
  trifft(e, /sequence\[1\]/)[0]?.slice(0, 90) ?? "(kein Fehler)");

e = mitKarte((c) => { delete c[1].asset.labels.sprung; });
zeige("Sequenz auf Label-Anker ohne Text (Anker existiert nicht)", trifft(e, /Anker "label:sprung" gibt es auf dieser Karte nicht/).length === 1,
  trifft(e, /sequence\[3\]/)[0]?.slice(0, 90) ?? "(kein Fehler)");

// Positivprobe: die unveränderte Demo muss sauber sein — sonst messen die Kontrollen
// oben gegen ein ohnehin kaputtes Objekt.
const sauber = validateLesson(normalizeLesson(demo));
zeige("KONTROLLE: unveränderte Demo-Lektion ist gültig", sauber.length === 0, `${sauber.length} Fehler`);

// Wachstums-Backlog: der Miss von oben muss geschrieben worden sein.
const zeilen = existsSync(BACKLOG) ? readFileSync(BACKLOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
const miss = zeilen.filter((z) => z.art === "asset-ref" && z.wunsch === "biology.mitochondrium");
zeige("Miss landet im Wachstums-Backlog", miss.length >= 1,
  miss[0] ? `${miss.length} Zeile(n), z. B. ${JSON.stringify({ art: miss[0].art, wunsch: miss[0].wunsch, lektion: miss[0].lektion, karte: miss[0].karte })}` : "(keine Zeile)");

// ————————————————————— asset-check —————————————————————
console.log("——— asset-check (mutierte Kopie der Library) ———");
const KOPIE = mkdtempSync(join(tmpdir(), "lk-assets-"));
for (const f of ["asset-check.mjs", "build-assets.mjs", "renderer.css", "renderer.js", "card-canvas.html"])
  cpSync(resolve(REPO, f), join(KOPIE, f));
cpSync(resolve(REPO, "assets"), join(KOPIE, "assets"), { recursive: true });

const lauf = () => {
  try { execFileSync("node", [join(KOPIE, "asset-check.mjs")], { encoding: "utf8" }); return { code: 0, out: "" }; }
  catch (err) { return { code: err.status, out: (err.stdout || "") + (err.stderr || "") }; }
};
const mitKopie = (name, mutation, muster) => {
  const dateien = ["assets/biology.neuron.svg", "assets/manifest.json", "assets/assets.js", "card-canvas.html"];
  const sicherung = Object.fromEntries(dateien.map((f) => [f, readFileSync(join(KOPIE, f), "utf8")]));
  mutation();
  const r = lauf();
  const gefeuert = r.code === 1 && muster.test(r.out);
  const zeile = r.out.split("\n").find((l) => muster.test(l)) || r.out.split("\n").find((l) => l.startsWith("- ")) || "(kein Befund)";
  zeige(name, gefeuert, `exit ${r.code} · ${zeile.trim().slice(0, 96)}`);
  for (const [f, inhalt] of Object.entries(sicherung)) writeFileSync(join(KOPIE, f), inhalt);
};
const svgPfad = join(KOPIE, "assets/biology.neuron.svg");
const patchSvg = (von, nach) => writeFileSync(svgPfad, readFileSync(svgPfad, "utf8").replace(von, nach));

// Kontrolle zuerst: die unveränderte Kopie muss GRÜN sein.
const start = lauf();
zeige("KONTROLLE: unveränderte Kopie ist grün", start.code === 0, `exit ${start.code}`);

mitKopie("Hex-Farbe im Asset", () => patchSvg('fill="var(--es)"', 'fill="#D4553E"'), /Hex-Farbe/);
mitKopie("eigenes stroke-width im Asset", () => patchSvg('class="a-line a-round" d="M52,64', 'stroke-width="3" class="a-line a-round" d="M52,64'), /stroke-width in der Datei/);
mitKopie("viewBox weicht von der Norm ab", () => patchSvg('viewBox="0 0 200 200"', 'viewBox="0 0 400 300"'), /viewBox .* statt Norm/);
mitKopie("Klasse außerhalb der Strichstärken-Skala", () => patchSvg('class="a-hair a-round" d="M34,44 Q29,38 27,31"', 'class="a-fett a-round" d="M34,44 Q29,38 27,31"'), /gehört nicht zur Asset-Skala/);
mitKopie("Fläche ohne ausdrückliche Füllung", () => patchSvg('<circle cx="27" cy="31" r="2.25" fill="var(--es)" stroke="none"/>', '<circle cx="27" cy="31" r="2.25" stroke="none"/>'), /ohne fill-Angabe/);
mitKopie("anker[] ohne data-anchor in der Datei", () => patchSvg('data-anchor="node:soma"', 'data-anchor="node:zellkern"'), /Manifest nennt Anker "node:soma"/);
mitKopie("data-anchor, das im Manifest fehlt", () => patchSvg('<circle class="a-hair" cx="63" cy="75" r="5"', '<circle class="a-hair" data-anchor="node:kern" cx="63" cy="75" r="5"'), /nicht im Manifest-Feld anker\[\]/);
mitKopie("Puls-Paar ohne gezeichneten Weg", () => patchSvg('data-link="node:soma&gt;node:synapse"', 'data-part="totlink"'), /zeichnet keinen data-link/);
mitKopie("Puls-Weg, der gemalt würde (kein a-route)", () => patchSvg('class="a-route" data-link="node:soma&gt;node:synapse"', 'class="a-line" data-link="node:soma&gt;node:synapse"'), /ohne Klasse a-route/);
mitKopie("Label-Platz ohne data-slot in der Datei", () => patchSvg('data-slot="feuert"', 'data-slot="feuerts"'), /Manifest nennt Label-Platz "feuert"/);
mitKopie("Datei fehlt, Manifest führt sie", () => rmSync(svgPfad), /Datei fehlt/);
mitKopie("paletteSlots behaupten ein Token zu viel", () => {
  const p = join(KOPIE, "assets/manifest.json"), d = JSON.parse(readFileSync(p, "utf8"));
  d.assets["biology.neuron"].paletteSlots.push("ueberich");
  writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
}, /paletteSlots im Manifest/);
mitKopie("Transport (assets.js) veraltet", () => {
  const p = join(KOPIE, "assets/assets.js");
  writeFileSync(p, readFileSync(p, "utf8").replace("M52,64", "M52,65"));
}, /Transport veraltet/);
mitKopie("Inline-Block in card-canvas.html veraltet", () => {
  const p = join(KOPIE, "card-canvas.html");
  writeFileSync(p, readFileSync(p, "utf8").replace("M52,64", "M52,65"));
}, /Inline-Block veraltet/);

rmSync(KOPIE, { recursive: true, force: true });
console.log(`\nNEGATIV-KONTROLLEN: ${gelaufen - stumm}/${gelaufen} haben gefeuert`);
if (stumm) { console.log(`ASSET-NEGATIV FAIL — ${stumm} Kontrolle(n) STUMM (das Gate sieht diesen Defekt nicht)`); process.exit(1); }
console.log("ASSET-NEGATIV PASS — jede Kontrolle hat gefeuert");
