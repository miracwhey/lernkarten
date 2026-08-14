// NVIDIA-NIM-Helper: Key laden, Modell im Katalog auflösen, Chat mit Pacing+Backoff.
import { readFileSync } from "fs";

const BASE = "https://integrate.api.nvidia.com/v1";

export function loadKey(envName) {
  const line = readFileSync("/Users/leonvalentin/Workspace/jarvis/.env", "utf8")
    .split("\n").find((l) => l.startsWith(envName + "="));
  if (!line) throw new Error(`${envName} nicht in jarvis/.env`);
  return line.split("=").slice(1).join("=").trim();
}

export async function resolveModel(key, filter) {
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Modellkatalog: HTTP ${res.status}`);
  const ids = (await res.json()).data.map((m) => m.id)
    .filter((id) => id.toLowerCase().includes(filter.toLowerCase())).sort();
  if (!ids.length) throw new Error(`Kein Modell für Filter "${filter}" im Katalog`);
  return ids[ids.length - 1];
}

let lastCall = 0;
export async function nimChat(key, model, messages, opts = {}) {
  // Free-Tier-Pacing: Abstand halten statt ins Rate-Limit zu laufen.
  const gap = (opts.paceMs ?? 25000) - (Date.now() - lastCall);
  if (lastCall && gap > 0) await new Promise((ok) => setTimeout(ok, gap));
  for (let i = 0; i < (opts.retries ?? 8); i++) {
    lastCall = Date.now();
    let res;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.2, max_tokens: opts.maxTokens ?? 8000 })
      });
    } catch (e) {
      // Netz kurz weg (fetch wirft ohne HTTP-Status) — transient, wie 5xx behandeln.
      const wait = 15000 * (i + 1);
      console.log(`NETZ-FEHLER (${model}): ${e.message} — warte ${wait / 1000}s…`);
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    if (res.ok) return (await res.json()).choices[0].message.content;
    const body = (await res.text()).slice(0, 300);
    if (res.status === 429 || res.status >= 500) {
      const wait = 30000 * (i + 1);
      console.log(`API ${res.status} (${model}) — warte ${wait / 1000}s…`);
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    throw new Error(`API ${res.status}: ${body}`);
  }
  throw new Error("Rate-Limit hält an.");
}

export function extractJson(raw) {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Antwort enthält kein JSON-Objekt");
  return JSON.parse(raw.slice(start, end + 1));
}
