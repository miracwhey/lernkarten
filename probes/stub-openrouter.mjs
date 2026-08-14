// OpenAI-kompatibler Stub-Endpunkt für Sonden-Läufe der Pipeline OHNE echte API-Calls.
// Er antwortet wie OpenRouter (inkl. usage und provider), liefert als Generator-Antwort
// eine bekannte gültige Lektion und als Judge-Antwort genau so viele check-Zeilen, wie
// Prüfaufträge im Auftrag standen. Zweck: bench.mjs --go, Statistik, Report und den
// 402-Sofortstopp am ECHTEN Code beweisen, nicht an einer Nachbildung.
// Modell-ID mit "budget402" im Namen → HTTP 402 (Konto-Limit-Fall).
// Nutzung: node probes/stub-openrouter.mjs [port] [mitschnitt.jsonl]
import { createServer } from "http";
import { appendFileSync, readFileSync } from "fs";

const port = Number(process.argv[2] ?? 8787);
const mitschnitt = process.argv[3] ?? null;
const LEKTION = readFileSync(new URL("../sleep-v2.json", import.meta.url), "utf8");

const antwort = (model, text, extra = {}) => ({
  id: "stub-1", object: "chat.completion", model, provider: "StubProvider",
  choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1234, completion_tokens: 567 }, ...extra,
});

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.url.endsWith("/models")) {
      // Preise wie im echten Katalog als Strings je Token.
      const ids = ["stub/gut", "stub/budget402", "openai/gpt-oss-120b"];
      return json(200, { data: ids.map((id) => ({ id, pricing: { prompt: "0.000001", completion: "0.000002" }, context_length: 131072 })) });
    }
    if (!req.url.endsWith("/chat/completions")) return json(404, { error: "unbekannt" });

    const anfrage = JSON.parse(body);
    // Mitschnitt OHNE Authorization: der Body belegt, welche Parameter wirklich rausgingen.
    if (mitschnitt) appendFileSync(mitschnitt, JSON.stringify({
      model: anfrage.model, temperature: anfrage.temperature, max_tokens: anfrage.max_tokens,
      felder: Object.keys(anfrage), rollen: anfrage.messages.map((m) => m.role),
    }) + "\n");

    if (String(anfrage.model).includes("budget402"))
      return json(402, { error: { message: "Insufficient credits (Stub)", code: 402 } });

    const system = anfrage.messages.find((m) => m.role === "system")?.content ?? "";
    const letzterUser = [...anfrage.messages].reverse().find((m) => m.role === "user")?.content ?? "";

    // Judge: so viele checks wie Prüfaufträge — sonst zieht das Vollständigkeits-Gate
    // eine zweite Runde, die hier nichts beweisen würde.
    if (system.includes("Fakten-Prüfer")) {
      const auftraege = (letzterUser.match(/^- \[/gm) || []).length;
      const checks = Array.from({ length: auftraege }, (_, i) => ({
        auftrag: `Auftrag ${i + 1}`, rechnung: "Stub: geprüft", ergebnis: "ok",
      }));
      return json(200, antwort(anfrage.model, JSON.stringify({ checks, findings: [] })));
    }
    if (letzterUser.includes("Rechtschreib-Prüfung")) return json(200, antwort(anfrage.model, "OK"));
    return json(200, antwort(anfrage.model, LEKTION));
  });
}).listen(port, "127.0.0.1", () => console.log(`STUB bereit auf http://127.0.0.1:${port}/v1`));
