// Modell-Kette für Dossier- und Generator-Stufe: der erste Eintrag zuerst, bei
// erschöpftem Kontingent der nächste. Der Judge bleibt in jedem Fall DeepSeek —
// er darf nie das Generator-Modell sein (glm-generate.mjs bekommt --judgekey).
import { attemptSignal, isAbortError, loadKey, nimChat, sleep, stripThink, throwIfAborted, warnAbgeschnitten, REQ_TIMEOUT_MS } from "../nim.mjs";

export const NIM_BASE = "https://integrate.api.nvidia.com/v1";

export const CHAIN = [
  { id: "minimaxai/minimax-m3", keyName: "NVIDIA_QWEN_KEY", base: NIM_BASE, body: {} },
  // gpt-oss frisst ohne gedrosseltes Denken das komplette Output-Budget (content: null).
  { id: "openai/gpt-oss-120b", keyName: "NVIDIA_KIMI_KEY", base: NIM_BASE, body: { reasoning_effort: "low" } },
  { id: "llama-3.3-70b-versatile", keyName: "GROQ_API_KEY", base: "https://api.groq.com/openai/v1", body: { max_tokens: 3000 } },
];

export const JUDGE = { keyName: "NVIDIA_DS_PRO_KEY", id: "deepseek-ai/deepseek-v4-flash-0731" };

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
    let res;
    try {
      res = await fetch(`${model.base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.id, messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 8000,
          ...model.body,
        }),
        signal: attemptSignal(opts.signal, opts.timeoutMs ?? REQ_TIMEOUT_MS),
      });
    } catch (e) {
      throwIfAborted(opts.signal);                     // Job-Deadline: nicht weiterprobieren
      const wait = 10000 * (i + 1);
      console.log(`${isAbortError(e) ? "REQUEST-TIMEOUT" : "NETZ-FEHLER"} (${model.id}): ${e.message} — warte ${wait / 1000}s…`);
      await sleep(wait, opts.signal);
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      warnAbgeschnitten(data, model.id);
      return data.choices?.[0]?.message?.content;
    }
    const body = (await res.text()).slice(0, 300);
    if (res.status === 429 || res.status >= 500) {
      const wait = 20000 * (i + 1);
      console.log(`API ${res.status} (${model.id}) — warte ${wait / 1000}s…`);
      await sleep(wait, opts.signal);
      continue;
    }
    throw new Error(`API ${res.status}: ${body}`);
  }
  throw new Error(`${model.id}: Rate-Limit hält an.`);
}
