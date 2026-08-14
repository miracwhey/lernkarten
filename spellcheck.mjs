// Rechtschreib-Detektor (deterministisch): sammelt verdächtige Wörter aus allen
// Textfeldern einer Lektion. Funde sind kein Hard-Fail — sie gehen als Prüfauftrag
// in den Retry-/Judge-Prompt (Fachwörter und Eigennamen können legitim unbekannt sein).
// Nutzung: node spellcheck.mjs <lesson.json>  → Exit 0 (keine Funde) / Exit 2 (Funde).
// Als Modul: import { suspiciousWords }.
import { readFileSync } from "fs";
import nspell from "nspell";
import dictionaryDe from "dictionary-de";

const spell = nspell(dictionaryDe);

const known = (w) => spell.correct(w);
const knownAnyCase = (w) => {
  if (known(w)) return true;
  const lower = w.toLowerCase();
  const title = lower[0].toUpperCase() + lower.slice(1);
  return known(lower) || known(title);
};
// Deutsche Komposita: ein Schnitt, beide Teile bekannt (auch mit Fugen-s).
const knownCompound = (w) => {
  const lower = w.toLowerCase();
  for (let i = 3; i <= lower.length - 3; i++) {
    let head = lower.slice(0, i);
    const tail = lower.slice(i);
    if (head.endsWith("s") && head.length > 3) head = head.slice(0, -1);
    const t = tail[0].toUpperCase() + tail.slice(1);
    const h = head[0].toUpperCase() + head.slice(1);
    if ((known(h) || known(head)) && (known(t) || known(tail))) return true;
  }
  return false;
};

// Enum-, Referenz- und Eigennamen-Felder sind keine Prosa — dort prüft der Detektor nicht.
const SKIP_KEYS = new Set(["type", "relation", "color", "shape", "from", "to", "afterStop", "side", "series", "id", "source", "cite", "eyebrow"]);

// Zwei Fund-Klassen: `suspicious` = nirgends herleitbar (Verschreiber-Verdacht);
// `composita` = NUR über den Komposita-Schnitt akzeptiert. Letztere sind lexikalisch
// gültig, können aber semantischer Unsinn sein („Schlafmantel" statt „Schlafmangel") —
// das entscheidet kein Wörterbuch, das ist ein Prüfauftrag für den Judge.
export function wordFindings(lesson) {
  const suspicious = new Map(), composita = new Map();   // wort → erster Fundort
  const walk = (v, path, key) => {
    if (SKIP_KEYS.has(key) && typeof v !== "object") return;
    if (typeof v === "string") {
      const plain = v.replace(/<[^>]+>/g, " ");
      for (const m of plain.matchAll(/[A-Za-zÄÖÜäöüß]{4,}/gu)) {
        const w = m[0];
        if (suspicious.has(w) || composita.has(w)) continue;
        // Bindestrich-Teile prüft die Tokenisierung ohnehin einzeln.
        if (knownAnyCase(w)) continue;
        if (knownCompound(w)) composita.set(w, path);
        else suspicious.set(w, path);
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, key));
    else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], path ? `${path}.${k}` : k, k);
  };
  walk(lesson, "", "");
  const list = (m) => [...m].map(([word, path]) => ({ word, path }));
  return { suspicious: list(suspicious), composita: list(composita) };
}

export function suspiciousWords(lesson) {
  return wordFindings(lesson).suspicious;
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const lesson = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const sus = suspiciousWords(lesson);
  if (!sus.length) { console.log("SPELLCHECK OK — keine verdächtigen Wörter"); process.exit(0); }
  console.log("VERDÄCHTIG (prüfen, nicht zwingend falsch):\n" + sus.map((s) => `- "${s.word}" (${s.path})`).join("\n"));
  process.exit(2);
}
