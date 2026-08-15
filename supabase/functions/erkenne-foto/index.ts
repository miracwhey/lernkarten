// Foto-Erkennung: die App schickt 1-5 Fotos, wir fragen Qwen über OpenRouter und geben
// das Erkennungs-Contract-JSON zurück. Synchron — der Nutzer wartet live vor dem Schirm.
// Fehlerklassen bleiben getrennt: Infra (Netz, Timeout, OpenRouter-HTTP) wird als 502
// gemeldet und NIE als erkennbar:false; nur ein Modell, das nicht liefert, degradiert.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODELL = "qwen/qwen3-vl-32b-instruct";
const TIMEOUT_MS = 60000;
const MAX_BILDER = 5;

// Prompts wortgleich aus probes/foto-testset/bench-erkennung.mjs — gebencht und
// gelockt (Qwen3-VL-32B, Lauf 15.08.). Wortlaut nicht verändern.
const CONTRACT = `Du bist die Foto-Erkennung einer deutschen Lern-App. Der Nutzer fotografiert etwas, aus dem eine Lektion werden soll. Deine Aufgabe ist NUR die Erkennung — keine Lektion, keine Ratschläge.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown-Zäune, exakt diese Felder:
{
  "erkennbar": true/false,        // false NUR wenn du wirklich nicht erkennst, was das ist oder kein lernbares Thema findbar ist
  "typ": "cover" | "textseite" | "diagramm" | "handschrift" | "objekt" | "unklar",
  "quelle": "Titel, Autor" oder bei Nicht-Büchern kurze Objektbeschreibung, sonst null,
  "thema": "das lernbare Thema, IMMER auf Deutsch, max 12 Wörter" oder null,
  "sicherheit": "hoch" | "mittel" | "niedrig",
  "interpretation": nur bei typ "diagramm": was das Diagramm inhaltlich zeigt, 1-2 deutsche Sätze; sonst null
}
Wichtig: Auch bei englischen Büchern ist "thema" deutsch. Rate nie einen Buchtitel — wenn Titel/Autor nicht lesbar sind, quelle=null und sicherheit entsprechend.`;

const SERIEN_ZUSATZ = `\n\nDu bekommst MEHRERE Fotos aus EINEM Aufnahme-Durchgang: Sie gehören zu EINER Quelle (z.B. Cover + fotografierte Seiten desselben Buchs). Erkenne die gemeinsame Quelle und als "thema" das gemeinsame Thema der fotografierten Inhalte (nicht des ganzen Buchs, wenn Seiten dabei sind). "typ" = der dominante Inhalts-Typ der Serie.`;

const TYPEN = ["cover", "textseite", "diagramm", "handschrift", "objekt", "unklar"];

// Ehrliches Degradieren: das Modell konnte nicht liefern — die App zeigt den
// Unsicher-Zustand. Ein Infra-Fehler darf hier NIE landen.
const UNKLAR = {
  erkennbar: false,
  typ: "unklar",
  quelle: null,
  thema: null,
  sicherheit: "niedrig",
  interpretation: null,
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Infra-Fehler: hochgereicht als 502, damit der Aufrufer Netz/Anbieter-Ausfall
// nie mit "konnte deine Fotos nicht lesen" verwechselt.
class InfraFehler extends Error {}

async function frageModell(bilder: string[], key: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELL,
        max_tokens: 900,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: bilder.length > 1 ? CONTRACT + SERIEN_ZUSATZ : CONTRACT },
            ...bilder.map((b) => ({
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64," + b },
            })),
          ],
        }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Netzabbruch und Timeout kommen beide hier an.
    throw new InfraFehler(e instanceof Error ? e.message : "Netzfehler");
  }

  if (!res.ok) {
    throw new InfraFehler(`OpenRouter HTTP ${res.status}`);
  }

  let data: {
    error?: unknown;
    choices?: { message?: { content?: string | null } }[];
  };
  try {
    data = await res.json();
  } catch {
    throw new InfraFehler("OpenRouter-Antwort ist kein JSON");
  }

  // OpenRouter meldet Anbieter-Ausfälle auch mit HTTP 200 im Body — ebenfalls Infra.
  if (data.error) throw new InfraFehler("OpenRouter-Fehler");
  if (!Array.isArray(data.choices) || data.choices.length === 0) {
    throw new InfraFehler("OpenRouter-Antwort ohne choices");
  }

  return data.choices[0]?.message?.content ?? null;
}

// Parsen wie im Bench: Markdown-Zäune strippen, dann JSON.parse. Zusätzlich die
// Contract-Form prüfen — sonst reicht die Function der App Felder durch, die sie
// nicht dekodieren kann. null = Modell-Ausgabe unbrauchbar (kein Infra-Fehler).
function parseAntwort(raw: string | null) {
  if (raw == null) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(
      raw.replace(/^\s*```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim(),
    );
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return null;
  if (typeof obj.erkennbar !== "boolean") return null;
  if (typeof obj.typ !== "string" || !TYPEN.includes(obj.typ)) return null;
  return {
    erkennbar: obj.erkennbar,
    typ: obj.typ,
    quelle: obj.quelle ?? null,
    thema: obj.thema ?? null,
    sicherheit: obj.sicherheit ?? "niedrig",
    interpretation: obj.interpretation ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) return json({ error: "OPENROUTER_API_KEY nicht gesetzt" }, 500);

  let body: { images?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body ist kein JSON" }, 400);
  }

  const bilder = body?.images;
  if (!Array.isArray(bilder)) return json({ error: "images fehlt oder ist kein Array" }, 400);
  if (bilder.length === 0) return json({ error: "images ist leer" }, 400);
  if (bilder.length > MAX_BILDER) {
    return json({ error: `hoechstens ${MAX_BILDER} Bilder pro Anfrage` }, 400);
  }
  if (!bilder.every((b) => typeof b === "string" && b.length > 0)) {
    return json({ error: "images enthaelt leere oder nicht-String-Eintraege" }, 400);
  }
  if (bilder.some((b) => (b as string).startsWith("data:"))) {
    return json({ error: "images erwartet reines base64 ohne data:-Praefix" }, 400);
  }

  const t0 = Date.now();
  try {
    let ergebnis = parseAntwort(await frageModell(bilder as string[], key));
    // Genau ein Retry — Vision-Modelle brechen gelegentlich mitten im JSON ab.
    if (!ergebnis) ergebnis = parseAntwort(await frageModell(bilder as string[], key));
    return json({ ...(ergebnis ?? UNKLAR), ms: Date.now() - t0 }, 200);
  } catch (e) {
    if (e instanceof InfraFehler) return json({ error: e.message }, 502);
    throw e;
  }
});
