// Waisen im Foto-Eingang wegräumen: Fotos, die hochgeladen wurden, aber nie durch
// die Erkennung liefen — App abgestürzt, App vor „Fertig" beendet, Verbindung weg.
// Der Normalfall räumt sich selbst (erkenne-foto löscht im finally, die App beim
// Abbruch); hier bleibt nur, was von keinem der beiden Wege erreicht wurde.
//
// Gelöscht wird über die Storage-API, NICHT per SQL: ein DELETE auf
// storage.objects entfernt die Katalogzeile und lässt den Blob liegen.
//
// Kein JWT: der Aufrufer ist pg_cron, nicht ein Nutzer. Der Zugang hängt deshalb
// an einem geteilten Geheimnis im Header — ohne das ist der Endpunkt taub.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "foto-eingang";
const VORGABE_MINUTEN = 60;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/// Die Storage-API listet ordnerweise, der Eingang ist zwei Ebenen tief
/// (Nutzer/Durchgang). Ordner tragen keine id — nur echte Objekte haben eine.
async function alleObjekte(
  admin: ReturnType<typeof createClient>,
  prefix = "",
  tiefe = 0,
): Promise<{ name: string; created_at: string }[]> {
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`Auflisten (${prefix || "/"}): ${error.message}`);
  const gefunden: { name: string; created_at: string }[] = [];
  for (const eintrag of data ?? []) {
    const pfad = prefix ? `${prefix}/${eintrag.name}` : eintrag.name;
    if (eintrag.id === null) {
      if (tiefe < 3) gefunden.push(...(await alleObjekte(admin, pfad, tiefe + 1)));
    } else {
      gefunden.push({ name: pfad, created_at: eintrag.created_at });
    }
  }
  return gefunden;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  const geheimnis = Deno.env.get("EINGANG_CRON_SECRET");
  if (!geheimnis) return json({ error: "EINGANG_CRON_SECRET nicht gesetzt" }, 500);
  if (req.headers.get("x-cron-secret") !== geheimnis) {
    return json({ error: "nicht berechtigt" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Supabase-Umgebung unvollständig" }, 500);

  // Die Frist ist einstellbar, damit der Weg mit einem frisch hochgeladenen
  // Objekt prüfbar ist — sonst wäre er erst nach einer Stunde Wartezeit belegbar.
  let minuten = VORGABE_MINUTEN;
  try {
    const body = await req.json();
    if (typeof body?.minuten === "number" && body.minuten >= 0) minuten = body.minuten;
  } catch {
    // Leerer Body ist der Regelfall des Cron-Aufrufs.
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const alle = await alleObjekte(admin);
    const grenze = Date.now() - minuten * 60_000;
    const alt = alle.filter((o) => new Date(o.created_at).getTime() < grenze);

    if (alt.length === 0) {
      console.log(`aufgeräumt: 0 von ${alle.length} (Frist ${minuten} min)`);
      return json({ geprueft: alle.length, geloescht: 0, minuten }, 200);
    }

    const { error } = await admin.storage.from(BUCKET).remove(alt.map((o) => o.name));
    if (error) return json({ error: `Löschen: ${error.message}` }, 502);

    // Nachzählen statt glauben: `remove` meldet Erfolg auch für Pfade, die es
    // gar nicht mehr gab.
    const rest = await alleObjekte(admin);
    console.log(`aufgeräumt: ${alt.length} gelöscht, ${rest.length} verbleiben (Frist ${minuten} min)`);
    return json({ geprueft: alle.length, geloescht: alt.length, verbleiben: rest.length, minuten }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Aufräumen fehlgeschlagen" }, 502);
  }
});
