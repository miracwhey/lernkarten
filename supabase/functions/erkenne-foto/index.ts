// Foto-Erkennung: die App lädt 1-5 Fotos einzeln in den Eingangs-Bucket und ruft
// uns danach nur noch mit den Pfaden — der Aufruf ist damit ein paar hundert Byte
// statt mehrerer Megabyte. Grund ist gemessen: 4 Fotos als base64 im Body waren
// 2,66 MB und rissen über Mobilfunk mitten im Upload ab, ohne dass der Request je
// hier ankam. Die Bilder holen wir rechenzentrums-intern und löschen sie sofort
// wieder — der Eingang ist ein Durchlauf, kein Archiv.
//
// Fehlerklassen bleiben getrennt: Infra (Storage, Netz, Timeout, OpenRouter-HTTP)
// wird als 502 gemeldet und NIE als erkennbar:false; nur ein Modell, das nicht
// liefert, degradiert ehrlich.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const MODELL = "qwen/qwen3-vl-32b-instruct";
const TIMEOUT_MS = 60000;
const STORAGE_TIMEOUT_MS = 15000;
const AUTH_TIMEOUT_MS = 10000;
const MAX_BILDER = 5;
const BUCKET = "foto-eingang";

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

// Die Bilder liegen im Eingang. Wir laden mit der service_role, also an RLS
// vorbei — deshalb ist die Ordner-Prüfung oben Pflicht und nicht Zierde.
// Promise.all hält die Reihenfolge: bei einer Serie steht das Cover vorn, und
// genau darauf stützt das Modell die gemeinsame Quelle.
async function ladeBilder(
  admin: ReturnType<typeof createClient>,
  pfade: string[],
): Promise<string[]> {
  return await Promise.all(pfade.map(async (pfad) => {
    const t = Date.now();
    const { data, error } = await mitFrist(
      admin.storage.from(BUCKET).download(pfad),
      STORAGE_TIMEOUT_MS,
      `Storage-Download ${pfad}`,
    );
    if (error || !data) {
      throw new InfraFehler(`Foto nicht ladbar (${pfad}): ${error?.message ?? "leere Antwort"}`);
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    console.log(`geladen ${pfad} ${bytes.length}B in ${Date.now() - t}ms`);
    return encodeBase64(bytes);
  }));
}

// Ein Aufruf ohne eigene Frist kann die ganze Function bis zum Wall-Clock-Limit
// blockieren — dann stirbt sie stumm und der Aufrufer wartet ins Leere. Jede
// Wartestelle bekommt deshalb ihre eigene Frist mit benennbarem Fehler.
function mitFrist<T>(arbeit: Promise<T>, ms: number, was: string): Promise<T> {
  return Promise.race([
    arbeit,
    new Promise<T>((_, ab) =>
      setTimeout(() => ab(new InfraFehler(`${was}: keine Antwort nach ${ms}ms`)), ms)
    ),
  ]);
}

// Der Eingang wird immer geleert — auch wenn die Erkennung scheitert. Ein
// misslungenes Aufräumen darf die Antwort nie kippen, es wird nur protokolliert.
// Gelöscht wird über die Storage-API, nicht per SQL: ein DELETE auf
// storage.objects entfernt die Zeile, lässt den Blob aber liegen.
async function aufraeumen(
  admin: ReturnType<typeof createClient>,
  pfade: string[],
): Promise<void> {
  try {
    const { error } = await admin.storage.from(BUCKET).remove(pfade);
    if (error) console.error("Aufräumen fehlgeschlagen:", error.message);
  } catch (e) {
    console.error("Aufräumen fehlgeschlagen:", e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) return json({ error: "OPENROUTER_API_KEY nicht gesetzt" }, 500);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Supabase-Umgebung unvollständig" }, 500);

  let body: { paths?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body ist kein JSON" }, 400);
  }

  const pfade = body?.paths;
  if (!Array.isArray(pfade)) return json({ error: "paths fehlt oder ist kein Array" }, 400);
  if (pfade.length === 0) return json({ error: "paths ist leer" }, 400);
  if (pfade.length > MAX_BILDER) {
    return json({ error: `hoechstens ${MAX_BILDER} Bilder pro Anfrage` }, 400);
  }
  if (!pfade.every((p) => typeof p === "string" && p.length > 0)) {
    return json({ error: "paths enthaelt leere oder nicht-String-Eintraege" }, 400);
  }

  // Wer ruft? Die service_role unten sieht jeden Ordner, also muss hier gebunden
  // werden, wessen Fotos gelesen werden dürfen — sonst wäre ein fremder Pfad im
  // Body genug, um fremde Aufnahmen zu lesen.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Kein Token" }, 401);

  const tStart = Date.now();
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let uid: string | undefined;
  try {
    const { data: nutzer, error: authFehler } = await mitFrist(
      admin.auth.getUser(jwt),
      AUTH_TIMEOUT_MS,
      "Token-Prüfung",
    );
    if (authFehler) return json({ error: "Token ungueltig" }, 401);
    uid = nutzer?.user?.id;
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Token-Pruefung fehlgeschlagen" }, 502);
  }
  if (!uid) return json({ error: "Token ungueltig" }, 401);
  console.log(`auth ok nach ${Date.now() - tStart}ms, ${pfade.length} Pfade`);

  const praefix = `${uid}/`;
  if (!(pfade as string[]).every((p) => p.startsWith(praefix) && !p.includes(".."))) {
    return json({ error: "paths liegen nicht im eigenen Eingang" }, 403);
  }

  const t0 = Date.now();
  try {
    const bilder = await ladeBilder(admin, pfade as string[]);
    const tModell = Date.now();
    console.log(`modell start: ${bilder.length} Bilder, ${bilder.reduce((s, b) => s + b.length, 0)} b64-Zeichen`);
    let ergebnis = parseAntwort(await frageModell(bilder, key));
    // Genau ein Retry — Vision-Modelle brechen gelegentlich mitten im JSON ab.
    if (!ergebnis) ergebnis = parseAntwort(await frageModell(bilder, key));
    console.log(`modell fertig nach ${Date.now() - tModell}ms`);
    return json({ ...(ergebnis ?? UNKLAR), ms: Date.now() - t0 }, 200);
  } catch (e) {
    if (e instanceof InfraFehler) return json({ error: e.message }, 502);
    throw e;
  } finally {
    await aufraeumen(admin, pfade as string[]);
  }
});
