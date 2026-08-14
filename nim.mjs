// NVIDIA-NIM-Helper: Key laden, Modell im Katalog auflösen, Chat mit Pacing+Backoff.
// Zugleich der JSON-Chokepoint der Pipeline: LLM-Antworten werden hier robust in
// JSON verwandelt (Zäune/Denk-Blöcke raus, kaputte Anführungszeichen deterministisch
// repariert) und bei bleibendem Defekt genau EINMAL mit einer Fehlermeldung, die die
// Korrektur trägt, zurückgegeben. Jeder Aufrufer (Judge, Generator, Dossier-Gate)
// erbt das — die Reparatur steht NICHT in den einzelnen Stufen.
import { readFileSync } from "fs";

export const NIM_BASE = "https://integrate.api.nvidia.com/v1";
// Ein einzelner Request darf nie unbegrenzt hängen: ohne echten Abbruch läuft er
// nach einem Promise.race-Timeout des Aufrufers weiter und verbrennt Kontingent.
// Der Wert ist ein Backstop gegen TOTE Sockets, keine Geduldsgrenze: ein Judge-Call
// über eine 22-Karten-Lektion plus Dossier braucht gemessen über 3 Minuten. Zu knapp
// gewählt killt der Backstop genau die großen Läufe, für die er gebaut wurde. Die
// echten Fristen setzen die Stufen darüber (Worker: Dossier 6 Min, Pipeline 30 Min).
export const REQ_TIMEOUT_MS = 600000;

/// Pacing-Default am Host, nicht am Aufrufer: der NIM-Free-Tier drosselt aggressiv und
/// braucht 25 s Abstand, fremde Endpunkte (OpenRouter) nur Anstands-Abstand. Stünde der
/// Default weiter fest bei 25 s, verlängerte jeder Bench-Lauf sich um Minuten Wartezeit.
export const defaultPace = (base) => (base ?? NIM_BASE).includes("integrate.api.nvidia.com") ? 25000 : 2000;

/// Zuordnung HTTP-Status → Infrastruktur-Ursache. Ohne diese Trennung erscheint ein
/// leeres Konto (402) oder ein falscher Key (401) im Bench als Modell-Versagen.
export const infraFault = (status) => status === 402 ? "budget" : status === 401 || status === 403 ? "auth" : null;

/// Zählt Tokens und gesehene Provider in einen Sammler (OpenRouter routet ein Modell
/// auf wechselnde Unter-Anbieter — ohne Erfassung vergleicht ein Bench unbemerkt
/// verschieden quantisierte Deployments desselben Modells).
export function collectUsage(usage, data) {
  if (!usage) return;
  usage.in += data?.usage?.prompt_tokens ?? 0;
  usage.out += data?.usage?.completion_tokens ?? 0;
  usage.calls = (usage.calls ?? 0) + 1;
  const p = data?.provider;
  if (p && Array.isArray(usage.providers) && !usage.providers.includes(p)) usage.providers.push(p);
}

export function loadKey(envName) {
  const line = readFileSync("/Users/leonvalentin/Workspace/jarvis/.env", "utf8")
    .split("\n").find((l) => l.startsWith(envName + "="));
  if (!line) throw new Error(`${envName} nicht in jarvis/.env`);
  return line.split("=").slice(1).join("=").trim();
}

/// true, wenn der Fehler ein Abbruch ist (AbortController/Timeout-Signal).
export const isAbortError = (e) => e?.name === "AbortError" || e?.name === "TimeoutError";

/// Signal für einen Versuch: Aufrufer-Signal (Job-Deadline) UND Request-Timeout.
/// AbortSignal.any lässt beide wirken — das erste Signal bricht den fetch echt ab.
export function attemptSignal(outer, ms = REQ_TIMEOUT_MS) {
  const own = AbortSignal.timeout(ms);
  return outer ? AbortSignal.any([outer, own]) : own;
}

/// Bricht mit dem Grund des Aufrufer-Signals ab, wenn dieses gefeuert hat.
/// Ein externer Abbruch ist NIE transient — Retry würde die Deadline unterlaufen.
export function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const r = signal.reason;
  throw r instanceof Error ? r : new Error(String(r ?? "abgebrochen"));
}

export async function resolveModel(key, filter, opts = {}) {
  const res = await fetch(`${opts.base ?? NIM_BASE}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: attemptSignal(opts.signal, opts.timeoutMs ?? 30000),
  });
  if (!res.ok) throw new Error(`Modellkatalog: HTTP ${res.status}`);
  const ids = (await res.json()).data.map((m) => m.id)
    .filter((id) => id.toLowerCase().includes(filter.toLowerCase())).sort();
  if (!ids.length) throw new Error(`Kein Modell für Filter "${filter}" im Katalog`);
  return ids[ids.length - 1];
}

let lastCall = 0;
export async function nimChat(key, model, messages, opts = {}) {
  const base = opts.base ?? NIM_BASE;
  // Free-Tier-Pacing: Abstand halten statt ins Rate-Limit zu laufen.
  const gap = (opts.paceMs ?? defaultPace(base)) - (Date.now() - lastCall);
  if (lastCall && gap > 0) await sleep(gap, opts.signal);
  for (let i = 0; i < (opts.retries ?? 8); i++) {
    throwIfAborted(opts.signal);
    lastCall = Date.now();
    let res;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.2, max_tokens: opts.maxTokens ?? 8000 }),
        signal: attemptSignal(opts.signal, opts.timeoutMs ?? REQ_TIMEOUT_MS),
      });
    } catch (e) {
      throwIfAborted(opts.signal);                       // Job-Deadline: nicht weiterprobieren
      // Netz kurz weg oder Request-Timeout (fetch wirft ohne HTTP-Status) — transient.
      const wait = 15000 * (i + 1);
      console.log(`${isAbortError(e) ? "REQUEST-TIMEOUT" : "NETZ-FEHLER"} (${model}): ${e.message} — warte ${wait / 1000}s…`);
      await sleep(wait, opts.signal);
      continue;
    }
    // content kann null sein, wenn das Denken das Output-Budget gefressen hat.
    if (res.ok) {
      const data = await res.json();
      warnAbgeschnitten(data, model);
      collectUsage(opts.usage, data);
      return stripThink(data.choices?.[0]?.message?.content);
    }
    const body = (await res.text()).slice(0, 300);
    if (res.status === 429 || res.status >= 500) {
      const wait = 30000 * (i + 1);
      console.log(`API ${res.status} (${model}) — warte ${wait / 1000}s…`);
      await sleep(wait, opts.signal);
      continue;
    }
    // Infrastruktur-Ursache am Fehler mitführen: der Aufrufer soll leeres Konto und
    // falschen Key nicht als inhaltliches Scheitern des Modells verbuchen.
    const err = new Error(`API ${res.status}: ${body}`);
    err.infra = infraFault(res.status);
    throw err;
  }
  const err = new Error("Rate-Limit hält an.");
  err.infra = "net";
  throw err;
}

/// Wartezeit, die auf ein Abbruch-Signal sofort reagiert (statt es auszusitzen).
export function sleep(ms, signal) {
  if (!signal) return new Promise((ok) => setTimeout(ok, ms));
  throwIfAborted(signal);
  return new Promise((ok, bad) => {
    const t = setTimeout(() => { signal.removeEventListener("abort", onAbort); ok(); }, ms);
    const onAbort = () => { clearTimeout(t); try { throwIfAborted(signal); } catch (e) { bad(e); } };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export const stripThink = (raw) => (raw ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();

/// Am Ausgabe-Budget abgeschnittene Antworten laut benennen. Ohne diesen Hinweis
/// erscheint die Kürzung als Folgefehler (fehlende Sektion, kaputtes JSON) und die
/// nächste Runde korrigiert am falschen Ende. Denk-Tokens zählen mit.
export function warnAbgeschnitten(data, model) {
  if (data?.choices?.[0]?.finish_reason !== "length") return false;
  const u = data.usage ?? {};
  const denk = u.completion_tokens_details?.reasoning_tokens ?? 0;
  console.log(`ANTWORT ABGESCHNITTEN (${model}, finish_reason=length): ${u.completion_tokens ?? "?"} Ausgabe-Tokens`
    + (denk ? ` davon ${denk} Denk-Tokens` : "")
    + ` — Ausgabe-Budget erschöpft: max_tokens der Stufe erhöhen`
    + (denk ? ` oder das Denken drosseln (reasoning/reasoning_effort über --body).` : "."));
  return true;
}

// ── JSON-Chokepoint ──────────────────────────────────────────────────────────

/// Schneidet Markdown-Zäune und Denk-Blöcke weg und liefert den JSON-Ausschnitt
/// (Objekt ODER Array — die Ergänzungs-Runde des Generators liefert ein Array).
export function jsonSlice(raw) {
  const s = stripThink(raw).replace(/^\s*```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/g, "");
  const oS = s.indexOf("{"), aS = s.indexOf("[");
  const start = oS < 0 ? aS : aS < 0 ? oS : Math.min(oS, aS);
  if (start < 0) return null;
  const end = s[start] === "{" ? s.lastIndexOf("}") : s.lastIndexOf("]");
  if (end <= start) return null;
  return s.slice(start, end + 1);
}

/// Deterministische Reparatur der zwei Defekte, die LLMs in JSON-Strings erzeugen:
/// (1) ein nicht-escaptes " mitten im String (deutsche Zitate: „…Verbrennen." (Quelle)),
/// (2) ein roher Zeilenumbruch im String. Erkennung über die Fortsetzung: ein echtes
/// String-Ende wird von , : } ] oder dem Text-Ende gefolgt — alles andere ist ein
/// verirrtes Zeichen und wird escaped. Trailing Commas fliegen ebenfalls raus.
export function repairJson(text) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inStr) {
      if (ch === '"') { inStr = true; out += ch; continue; }
      // Trailing Comma vor } oder ]
      if (ch === ",") {
        const nxt = text.slice(i + 1).match(/^\s*([}\]])/);
        if (nxt) { continue; }
      }
      out += ch;
      continue;
    }
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\") { out += ch; esc = true; continue; }
    if (ch === "\n" || ch === "\r" || ch === "\t") { out += ch === "\t" ? "\\t" : "\\n"; continue; }
    if (ch === '"') {
      const rest = text.slice(i + 1);
      if (/^\s*([,:}\]]|$)/.test(rest)) { inStr = false; out += ch; }
      else out += '\\"';                       // verirrtes Anführungszeichen
      continue;
    }
    out += ch;
  }
  return out;
}

/// Fehlerbericht, der die Korrektur trägt: Position, Ausschnitt, Anweisung.
export function jsonFaultReport(text, err) {
  const pos = Number(String(err.message).match(/position (\d+)/)?.[1] ?? -1);
  const cut = pos >= 0 ? text.slice(Math.max(0, pos - 90), pos + 90) : text.slice(0, 180);
  return `Deine Antwort ist kein gültiges JSON: ${err.message}\n\nDefekte Stelle`
    + (pos >= 0 ? ` (Position ${pos})` : "") + `:\n…${cut}…\n\n`
    + `Sende die Antwort erneut als NUR valides JSON. Häufigste Ursache: ein Anführungszeichen `
    + `innerhalb eines Strings. Innerhalb von JSON-Strings musst du " als \\" escapen — oder `
    + `nutze deutsche Anführungszeichen „…“ statt gerader. Keine rohen Zeilenumbrüche in Strings, `
    + `kein Text vor oder nach dem JSON, keine Markdown-Zäune.`;
}

/// Robuste Extraktion: Ausschnitt → Parse → deterministische Reparatur → Parse.
/// Wirft einen Fehler, dessen Text die Korrektur für das Modell enthält (.report).
export function extractJson(raw) {
  const text = jsonSlice(raw);
  if (text === null) {
    const e = new Error("Antwort enthält kein JSON-Objekt");
    e.report = "Deine Antwort enthält kein JSON. Antworte AUSSCHLIESSLICH mit dem JSON, ohne Vorrede und ohne Markdown-Zäune.";
    throw e;
  }
  try { return JSON.parse(text); } catch (first) {
    const repaired = repairJson(text);
    if (repaired !== text) {
      try {
        const v = JSON.parse(repaired);
        console.log(`  JSON repariert (${first.message})`);
        return v;
      } catch { /* Reparatur reicht nicht — Bericht aus dem Originalfehler */ }
    }
    const e = new Error("JSON nicht parsebar: " + first.message);
    e.report = jsonFaultReport(text, first);
    throw e;
  }
}

/// Chat mit JSON-Antwort: genau EIN Korrektur-Retry, dessen Auftrag den Defekt
/// benennt. `chat(messages)` ist ein beliebiger Chat-Aufruf (NIM, Groq, Anthropic).
/// Danach harter Fehler — ein drittes Mal würde nur Kontingent verbrennen.
export async function chatJson(chat, messages, opts = {}) {
  const log = opts.log ?? console.log;
  let raw = await chat(messages);
  try { return { value: extractJson(raw), raw }; } catch (e) {
    if (!e.report) throw e;
    log(`  ${e.message} — ein Korrektur-Retry mit der defekten Stelle…`);
    const retryMsgs = [...messages, { role: "assistant", content: raw }, { role: "user", content: e.report }];
    raw = await chat(retryMsgs);
    return { value: extractJson(raw), raw };      // scheitert das auch: harter Fehler
  }
}
