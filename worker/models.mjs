// Modell-Kette für Dossier- und Generator-Stufe: der erste Eintrag zuerst, bei
// erschöpftem Kontingent der nächste. Der Judge bleibt in jedem Fall DeepSeek —
// er darf nie das Generator-Modell sein (glm-generate.mjs bekommt --judgekey).
import { attemptSignal, collectUsage, isAbortError, loadKey, nimChat, sleep, stripThink, throwIfAborted, warnAbgeschnitten, REQ_TIMEOUT_MS } from "../nim.mjs";

export const NIM_BASE = "https://integrate.api.nvidia.com/v1";

export const OR_BASE = "https://openrouter.ai/api/v1";

// Produktion = OpenRouter, ein Key (Leon-Lock; NIM-Free/Groq = Dev-only, aus der
// Kette entfernt). Wahl aus dem Modell-Bench 14.08. (18 Läufe, bench-runs/…/report.md):
// Luna 2× pass mit 0 schweren Judge-Befunden (Leon-Lock: Standard-Generator),
// DeepSeek-Pro als Fallback (zweitbeste Fakten-Bilanz, anderer Anbieter).
// Die GPT-5.6-Reihe kennt KEIN temperature (HTTP 400) — explizites null löscht
// das Feld vor dem Request (openaiChat unten, wie glm-generate.requestBody).
export const CHAIN = [
  { id: "openai/gpt-5.6-luna-pro", keyName: "OPENROUTER_API_KEY", base: OR_BASE, body: { max_tokens: 16000, temperature: null } },
  // 24k statt 16k: DS-Pro ist ein Denker — Lauf „Impfungen" 14.08. verbrannte
  // 16001/16001 Tokens als reine Denk-Tokens (leere Antwort). Budget statt Drossel:
  // die Bench-Bilanz gilt nur mit Default-Denken.
  { id: "deepseek/deepseek-v4-pro-0813", keyName: "OPENROUTER_API_KEY", base: OR_BASE, body: { max_tokens: 24000 } },
];

// Judge fix und nie Mitglied der Generator-Kette (Bench-Setup unverändert).
export const JUDGE = { keyName: "OPENROUTER_API_KEY", id: "openai/gpt-oss-120b", base: OR_BASE };

/// Ein Chat-Call gegen ein Kettenmitglied. NIM läuft über den Bestands-Helper
/// (Pacing + Backoff + Null-Guard); fremde OpenAI-kompatible Endpunkte bekommen
/// dieselbe Backoff-Form, weil nim.mjs auf die NIM-Basis festgelegt ist.
/// `opts.signal` reicht bis in den fetch durch — eine Deadline bricht den Request
/// wirklich ab, statt ihn im Hintergrund weiter Kontingent verbrennen zu lassen.
export async function chat(model, messages, opts = {}) {
  const key = loadKey(model.keyName);
  const raw = model.base === NIM_BASE
    ? await nimChat(key, model.id, messages, opts)
    : await openaiChat(key, model, messages, opts);
  // Thinking-Modelle liefern trotz Drosselung inline <think>-Blöcke; content kann
  // null sein, wenn das Denken das Output-Budget gefressen hat.
  return stripThink(raw);
}

async function openaiChat(key, model, messages, opts) {
  for (let i = 0; i < (opts.retries ?? 5); i++) {
    throwIfAborted(opts.signal);
    let res, data, errBody;
    try {
      res = await fetch(`${model.base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify((() => {
          const b = { model: model.id, messages,
            temperature: opts.temperature ?? 0.2,
            max_tokens: opts.maxTokens ?? 8000,
            ...model.body };
          // Explizites null löscht ein Feld (GPT-5.6: temperature → HTTP 400).
          for (const k of Object.keys(b)) if (b[k] === null) delete b[k];
          return b;
        })()),
        signal: attemptSignal(opts.signal, opts.timeoutMs ?? REQ_TIMEOUT_MS),
      });
      // Body-Read unter demselben Abbruch-Signal wie der fetch: Header kommen früh,
      // der Body erst nach der Generierung — ein Timeout hier ist genauso transient.
      if (res.ok) data = await res.json();
      else errBody = (await res.text()).slice(0, 300);
    } catch (e) {
      throwIfAborted(opts.signal);                     // Job-Deadline: nicht weiterprobieren
      const wait = 10000 * (i + 1);
      console.log(`${isAbortError(e) ? "REQUEST-TIMEOUT" : "NETZ-FEHLER"} (${model.id}): ${e.message} — warte ${wait / 1000}s…`);
      await sleep(wait, opts.signal);
      continue;
    }
    if (res.ok) {
      warnAbgeschnitten(data, model.id);
      // Verbrauch mitschreiben, wenn der Aufrufer einen Sammler stellt. Ohne das
      // taucht die Dossier-Stufe in KEINER Kostenrechnung auf — obwohl sie laut
      // Job-Ablauf der teuerste Einzel-Call ist. Eine Stufe, die nicht abgerechnet
      // wird, ist beim Optimieren unsichtbar und wird zuverlässig übersehen.
      collectUsage(opts.usage, data);
      return data.choices?.[0]?.message?.content;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = 20000 * (i + 1);
      console.log(`API ${res.status} (${model.id}) — warte ${wait / 1000}s…`);
      await sleep(wait, opts.signal);
      continue;
    }
    throw new Error(`API ${res.status}: ${errBody}`);
  }
  throw new Error(`${model.id}: Rate-Limit hält an.`);
}
