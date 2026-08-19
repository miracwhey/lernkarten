// Sonde: lässt sich das Denken von deepseek-v4-pro über OpenRouter begrenzen?
//
// Anlass (Feld-Stresstest 19.08.2026): Das Fallback-Modell lieferte zweimal eine LEERE
// Antwort — 24 003 Ausgabe-Token, davon 24 003 Denk-Token. Das Budget ging vollständig ins
// Denken, für die Antwort blieb nichts. Damit ist der Fallback nicht langsam, sondern tot:
// er kostet 19–22 Minuten und liefert nie etwas.
//
// Bevor am Produktions-Fallback (worker/models.mjs) etwas geändert wird, muss gemessen
// sein, dass der Hebel überhaupt greift — OpenRouter reicht `reasoning` nur an Anbieter
// weiter, die es kennen, und ein ignoriertes Feld sieht im Code aus wie ein Fix.
//
// Gemessen wird je Variante: kommt Text zurück, und wie viele Token gingen ins Denken.
// Das Budget ist bewusst KLEIN (4000): so reproduziert die Kontrolle den Fehlerfall
// (alles ins Denken, nichts übrig), statt ihn wegzukaufen.
//
// Nutzung: node probes/reasoning-drossel.mjs [modell-id]
import { loadKey } from "../nim.mjs";

const MODELL = process.argv[2] || "deepseek/deepseek-v4-pro-0813";
const BUDGET = 4000;
const key = loadKey("OPENROUTER_API_KEY");

// Ein Auftrag, der ohne Denken in zwei Sekunden zu erfüllen ist. Scheitert er trotzdem,
// liegt es nicht am Auftrag.
const MESSAGES = [
  { role: "system", content: "Du antwortest ausschliesslich mit einem JSON-Objekt, ohne Vorrede." },
  { role: "user", content: 'Gib genau dieses Objekt zurück: {"ok": true, "wort": "Nachtdienst"}' },
];

const VARIANTEN = [
  { name: "Kontrolle (wie heute)", extra: {} },
  { name: "reasoning.max_tokens 1000", extra: { reasoning: { max_tokens: 1000 } } },
  { name: "reasoning.effort low", extra: { reasoning: { effort: "low" } } },
  { name: "reasoning.enabled false", extra: { reasoning: { enabled: false } } },
];

console.log(`\nSonde: ${MODELL} · Ausgabe-Budget ${BUDGET}\n`);
console.log("Variante".padEnd(28) + "Antwort".padEnd(12) + "Denk-Tok".padEnd(10) + "Ausg.-Tok".padEnd(11) + "finish");
console.log("─".repeat(72));

for (const v of VARIANTEN) {
  const t0 = Date.now();
  let zeile;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELL, messages: MESSAGES, max_tokens: BUDGET, ...v.extra }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    const ch = j.choices?.[0];
    const inhalt = (ch?.message?.content || "").trim();
    const u = j.usage || {};
    const denk = u.completion_tokens_details?.reasoning_tokens ?? "—";
    zeile = v.name.padEnd(28)
      + (inhalt ? "TEXT" : "LEER").padEnd(12)
      + String(denk).padEnd(10)
      + String(u.completion_tokens ?? "—").padEnd(11)
      + (ch?.finish_reason ?? "—");
    if (inhalt) zeile += `  „${inhalt.replace(/\s+/g, " ").slice(0, 40)}"`;
  } catch (e) {
    // Ein abgelehntes Feld ist selbst ein Ergebnis: es sagt, dass dieser Hebel hier
    // nicht existiert — und das ist genau die Frage der Sonde.
    zeile = v.name.padEnd(28) + "FEHLER".padEnd(12) + e.message.slice(0, 60);
  }
  console.log(zeile + `   ${Math.round((Date.now() - t0) / 1000)}s`);
}
console.log("");
