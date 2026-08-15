// Waisen im Foto-Eingang wegräumen: Fotos, die hochgeladen wurden, aber nie durch
// die Erkennung liefen (App abgestürzt, App vor „Fertig" beendet, Testlauf mit
// gefälschter Erkennung). Der Normalfall räumt sich selbst — die Function löscht,
// was sie gelesen hat, die App löscht beim Abbruch.
//
// Gelöscht wird über die Storage-API, NICHT per SQL: ein DELETE auf
// storage.objects entfernt die Zeile und lässt den Blob liegen.
//
// Aufruf:  node probes/eingang-aufraeumen.mjs [--aelter-als-minuten 60] [--wirklich]
// Ohne --wirklich wird nur gezeigt, was gelöscht würde.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../worker/.env", import.meta.url), "utf8")
    .split("\n")
    .filter((z) => z.includes("=") && !z.trimStart().startsWith("#"))
    .map((z) => {
      const i = z.indexOf("=");
      return [z.slice(0, i).trim(), z.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const arg = (name, vorgabe) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : vorgabe;
};
const minuten = Number(arg("aelter-als-minuten", 60));
const wirklich = process.argv.includes("--wirklich");

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Aufgelistet wird über die Storage-API, nicht über den Katalog: das Schema
// `storage` ist über PostgREST nicht erreichbar. Die API listet ordnerweise, also
// steigen wir die zwei Ebenen (Nutzer/Durchgang) selbst ab.
const BUCKET = "foto-eingang";

async function alleObjekte(prefix = "", tiefe = 0) {
  const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`Auflisten (${prefix || "/"}): ${error.message}`);
  const gefunden = [];
  for (const eintrag of data) {
    const pfad = prefix ? `${prefix}/${eintrag.name}` : eintrag.name;
    // Ordner tragen keine id — nur echte Objekte haben eine.
    if (eintrag.id === null) {
      if (tiefe < 3) gefunden.push(...(await alleObjekte(pfad, tiefe + 1)));
    } else {
      gefunden.push({ name: pfad, created_at: eintrag.created_at, size: eintrag.metadata?.size ?? 0 });
    }
  }
  return gefunden;
}

const grenze = Date.now() - minuten * 60_000;
const alle = await alleObjekte();
const zeilen = alle
  .filter((z) => new Date(z.created_at).getTime() < grenze)
  .sort((a, b) => a.created_at.localeCompare(b.created_at));

if (!zeilen.length) {
  console.log(`Keine Waisen älter als ${minuten} min (${alle.length} Objekte im Eingang).`);
  process.exit(0);
}

const bytes = zeilen.reduce((s, z) => s + Number(z.size), 0);
console.log(`${zeilen.length} Waisen, ${(bytes / 1024 / 1024).toFixed(1)} MB, älteste ${zeilen[0].created_at}`);
for (const z of zeilen.slice(0, 5)) console.log(`  ${z.name}`);
if (zeilen.length > 5) console.log(`  … und ${zeilen.length - 5} weitere`);

if (!wirklich) {
  console.log("\nProbelauf — mit --wirklich tatsächlich löschen.");
  process.exit(0);
}

const { data: weg, error: loeschFehler } = await db.storage
  .from(BUCKET)
  .remove(zeilen.map((z) => z.name));

if (loeschFehler) {
  console.error("Löschen fehlgeschlagen:", loeschFehler.message);
  process.exit(1);
}

// Nachzählen statt glauben: das Entfernen meldet Erfolg auch für Pfade, die es
// gar nicht mehr gab.
const rest = await alleObjekte();
console.log(`${weg.length} gelöscht. Im Eingang verbleiben: ${rest.length}`);
