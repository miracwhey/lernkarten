// OpenAI-kompatibler Stub-Endpunkt für Sonden-Läufe der Pipeline OHNE echte API-Calls.
// Er antwortet wie OpenRouter (inkl. usage und provider), liefert als Generator-Antwort
// eine bekannte gültige Lektion und als Judge-Antwort genau so viele check-Zeilen, wie
// Prüfaufträge im Auftrag standen. Zweck: bench.mjs --go, Statistik, Report und den
// 402-Sofortstopp am ECHTEN Code beweisen, nicht an einer Nachbildung.
// Modell-ID mit "budget402" im Namen → HTTP 402 (Konto-Limit-Fall).
//
// Modell-IDs für den LEER-Weg (Beschriftung ohne ihren Gegenstand, audit-lesson):
//   stub/leerfix   — liefert eine Lektion mit falscher Schritt-REIHENFOLGE und
//                    korrigiert sie in der Patch-Runde (Weg i: Befund → Patch → grün)
//   stub/leerstur  — liefert dieselbe Lektion und patcht NICHT (Weg ii: reject)
// Beide nutzen dieselbe Bestands-Lektion, damit ausschließlich der Sequenz-Befund den
// Unterschied macht; die Karte ist sonst überall grün (Contract, Judge, notecheck).
//
// Modell-ID für den SYSTEM-Weg (Überlappung, audit-lesson meldet system>0 → Exit 3):
//   stub/systembug — ersetzt cards[1] durch probes/exit3-system/kollisions-karte.json:
//                    zwei deckungsgleiche flache Serien am Boden, beide mit Label. Beide
//                    Labels müssen auf dieselbe freie Seite und überlappen dort (TEXT²).
// Nutzung: node probes/stub-openrouter.mjs [port] [mitschnitt.jsonl]
import { createServer } from "http";
import { appendFileSync, readFileSync } from "fs";

const port = Number(process.argv[2] ?? 8787);
const mitschnitt = process.argv[3] ?? null;
const LEKTION = readFileSync(new URL("../sleep-v2.json", import.meta.url), "utf8");

// Die Note wird VOR ihrer Serie gezeigt: im Zustand nach Schritt 1 hängt sie an einer
// Kurve, die noch niemand gezeichnet hat — genau der LEER-Befund.
// (`reveal` auf die Serie, nicht `trace`: trace zieht nur EINEN Ast, der Nach-Stop-Ast
// bliebe sichtbar — die Note hätte dann Tinte in ihrer Nähe und der Befund bliebe aus.
// Am Gate gemessen, nicht angenommen.)
const SEQ_LEER = [{ verb: "reveal", target: "note:schlaf-räumt-auf" }, { verb: "reveal", target: "series:0" }];
const SEQ_HEIL = [{ verb: "reveal", target: "series:0" }, { verb: "reveal", target: "note:schlaf-räumt-auf" }];
const mitSequenz = (seq) => {
  const l = JSON.parse(LEKTION);
  l.cards[1].sequence = seq;
  l.cards[1].trigger = "auto";
  return JSON.stringify(l);
};

// Kollisions-Karte: dieselbe Bestands-Lektion, nur cards[1] ausgetauscht — der einzige
// Unterschied zum grünen Lauf ist damit genau die Karte, die den System-Befund erzwingt.
const KOLLISION = readFileSync(new URL("./exit3-system/kollisions-karte.json", import.meta.url), "utf8");
const mitKollision = () => {
  const l = JSON.parse(LEKTION);
  l.cards[1] = JSON.parse(KOLLISION);
  return JSON.stringify(l);
};

const antwort = (model, text, extra = {}) => ({
  id: "stub-1", object: "chat.completion", model, provider: "StubProvider",
  choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1234, completion_tokens: 567 }, ...extra,
});

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = (code, obj, kopf = {}) => {
      res.writeHead(code, { "Content-Type": "application/json", ...kopf });
      res.end(JSON.stringify(obj));
    };
    // Tages-Kontingent wie OpenRouter bei `:free`: 429 mit einem Reset, der Stunden
    // in der Zukunft liegt. Warten hilft hier nicht — die Pipeline muss das erkennen,
    // statt die Backoff-Kette abzusitzen und das Ergebnis dem Modell anzulasten.
    const tageslimit = () => json(429, { error: { message: "Rate limit exceeded: free-models-per-day (Stub)", code: 429 } },
      { "X-RateLimit-Reset": String(Date.now() + 6 * 3600 * 1000) });
    if (req.url.endsWith("/models")) {
      // Preise wie im echten Katalog als Strings je Token.
      // `:free`-Varianten mit Preis 0 — an ihnen prüft der Bench seine Regel „nie zwei
      // kostenlose Läufe gleichzeitig" (gemeinsames Minuten-Kontingent des Kontos).
      const ids = ["stub/gut", "stub/budget402", "stub/leerfix", "stub/leerstur", "stub/leerlimit",
                   "stub/systembug", "stub/ratelimit429", "openai/gpt-oss-120b"];
      const frei = ["stub/gut-a:free", "stub/gut-b:free"];
      return json(200, { data: [
        ...ids.map((id) => ({ id, pricing: { prompt: "0.000001", completion: "0.000002" },
          context_length: 131072, top_provider: { max_completion_tokens: 65536 },
          supported_parameters: ["max_tokens", "temperature"] })),
        ...frei.map((id) => ({ id, pricing: { prompt: "0", completion: "0" },
          context_length: 131072, top_provider: { max_completion_tokens: 65536 },
          supported_parameters: ["max_tokens", "temperature"] })),
      ] });
    }
    if (!req.url.endsWith("/chat/completions")) return json(404, { error: "unbekannt" });

    const anfrage = JSON.parse(body);
    // Strenger Anbieter (Cohere-Verhalten, gemessen 17.08.): ein Gesprächsbeitrag ohne
    // Inhalt macht die GANZE Anfrage ungültig, nicht nur den einen Beitrag. Der Stub
    // prüft das bei JEDEM Modell — so fällt ein leerer Push überall auf, nicht nur dort,
    // wo zufällig ein strenger Anbieter bedient.
    const leererBeitrag = (anfrage.messages ?? []).findIndex((m) => !String(m.content ?? "").trim());
    if (leererBeitrag > -1)
      return json(400, { error: { message: "Provider returned error", code: 400, metadata: {
        raw: `{"message":"invalid request: invalid message provided at index ${leererBeitrag}: must have non-empty content or tool calls."}`,
        provider_name: "StubStreng" } } });

    // stub/leerwurf — die erste Antwort ist LEER (Denk-Budget aufgebraucht). Ohne den
    // pushAssistant-Filter landet sie als leerer Beitrag in der Historie und der
    // NÄCHSTE Aufruf stirbt oben mit 400 — der Lauf endet als „system-bug".
    if (String(anfrage.model).includes("leerwurf")) {
      const schonGeantwortet = (anfrage.messages ?? []).some((m) => m.role === "assistant");
      if (!schonGeantwortet) return json(200, antwort(anfrage.model, ""));
      return json(200, antwort(anfrage.model, LEKTION));
    }

    // Mitschnitt OHNE Authorization: der Body belegt, welche Parameter wirklich rausgingen.
    if (mitschnitt) appendFileSync(mitschnitt, JSON.stringify({
      model: anfrage.model, temperature: anfrage.temperature, max_tokens: anfrage.max_tokens,
      // Zeichenzahl je Rolle: nur so ist sichtbar, WOHER der Input-Verbrauch kommt —
      // fester Systemprompt, Dossier-Auftrag oder die mitwachsende Gesprächshistorie.
      groesse: { gesamt: JSON.stringify(anfrage.messages).length,
        system: (anfrage.messages.filter(m=>m.role==="system").map(m=>String(m.content).length)[0] ?? 0),
        user: anfrage.messages.filter(m=>m.role==="user").reduce((a,m)=>a+String(m.content).length,0),
        assistant: anfrage.messages.filter(m=>m.role==="assistant").reduce((a,m)=>a+String(m.content).length,0) },
      felder: Object.keys(anfrage), rollen: anfrage.messages.map((m) => m.role),
      // Der Systemprompt wird beim Start zusammengesetzt (Asset-Registry aus dem
      // Manifest). Nur so ist prüfbar, was WIRKLICH rausging — nicht, was die Datei sagt.
      system: anfrage.messages.find((m) => m.role === "system")?.content ?? null,
      // Die Prüfauftrag-Liste des Judges steht im letzten user-Block: nur an ihr ist
      // messbar, ob ein erzwungener Auftrag wirklich gestellt wurde.
      auftraege: ([...anfrage.messages].reverse().find((m) => m.role === "user")?.content ?? "")
        .split("\n").filter((l) => l.startsWith("- [")).map((l) => l.slice(0, 220)),
    }) + "\n");

    if (String(anfrage.model).includes("budget402"))
      return json(402, { error: { message: "Insufficient credits (Stub)", code: 402 } });
    // stub/ratelimit429 — schon der Erstwurf läuft ins Tages-Kontingent.
    if (String(anfrage.model).includes("ratelimit429")) return tageslimit();

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

    // LEER-Wege: erkannt wird die Patch-Runde an der KORREKTUR in der Fehlerzeile — den
    // Marker „HART-LEER" strippt die Pipeline, er ist Maschinen-Signal und keine
    // Information fürs Modell. „leerfix" schickt genau den Patch, den die Zeile verlangt;
    // „leerstur" antwortet mit leerem Patch — der Befund überlebt und muss abgelehnt werden.
    // „leerlimit" nimmt denselben Weg wie „leerstur", verliert das Kontingent aber
    // GENAU in der Reparatur-Runde: der Lauf darf dann nicht als „reject-audit" enden
    // (das wäre ein Modell-Urteil für ein Konto-Problem), sondern als „infra-ratelimit".
    const leerModus = /leerfix|leerstur|leerlimit/.test(String(anfrage.model));
    if (leerModus && letzterUser.includes("Zeichne den Gegenstand FRÜHER")) {
      if (String(anfrage.model).includes("leerlimit")) return tageslimit();
      return json(200, antwort(anfrage.model, JSON.stringify(
        String(anfrage.model).includes("leerfix") ? { "cards[1].sequence": SEQ_HEIL } : {})));
    }
    if (leerModus) return json(200, antwort(anfrage.model, mitSequenz(SEQ_LEER)));

    // Kürzungs-Weg: die Lektion hat EINE Karte zu viel (9 statt 8). Vor der Kürzungs-
    // Runde fiel dieser Fall in den vollen Retry und die Lektion wurde neu gewürfelt.
    //   stub/zuvielfix  — nennt in der Kürzungs-Runde die doppelte Karte (Weg i)
    //   stub/zuvielstur — nennt keine gültige Karte, der Fall fällt zurück (Weg ii)
    if (/zuvielfix|zuvielstur/.test(String(anfrage.model))) {
      if (letzterUser.includes('{"streichen"'))
        return json(200, antwort(anfrage.model, JSON.stringify(
          String(anfrage.model).includes("zuvielfix") ? { streichen: [3] } : { streichen: [] })));
      // Karte 2 verdoppeln: der EINZIGE Unterschied zur grünen Lektion ist die Anzahl,
      // damit ausschließlich der Kürzungs-Weg über den Ausgang entscheidet.
      const l = JSON.parse(LEKTION);
      l.cards.splice(2, 0, JSON.parse(JSON.stringify(l.cards[2])));
      return json(200, antwort(anfrage.model, JSON.stringify(l)));
    }

    // System-Weg: die Überlappung steckt in der GEOMETRIE der Karte, nicht in einer
    // Aussage — es gibt darum auch keine Patch-Runde, die sie beheben könnte. Der Stub
    // liefert die Karte in jeder Runde unverändert.
    if (String(anfrage.model).includes("systembug")) return json(200, antwort(anfrage.model, mitKollision()));

    return json(200, antwort(anfrage.model, LEKTION));
  });
}).listen(port, "127.0.0.1", () => console.log(`STUB bereit auf http://127.0.0.1:${port}/v1`));
