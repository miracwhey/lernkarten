// Misst den Token-Verbrauch der Dossier-Stufe je Tiefe am ECHTEN Produktionspfad
// (worker/make-dossier.mjs mit der Produktions-Kette), damit die Kostenrechnung
// je Lektion nicht auf einer geschätzten Zahl für die teuerste Stufe steht.
import { makeDossier } from "../worker/make-dossier.mjs";
import { CHAIN } from "../worker/models.mjs";
const THEMA = "Wie Nervenzellen feuern — Aktionspotential, Schwelle, Alles-oder-nichts";
for (const depth of process.argv.slice(2)) {
  const usage = { in: 0, out: 0, calls: 0, providers: [] };
  const t0 = Date.now();
  try {
    const md = await makeDossier({ kind: "topic", input: THEMA, topic: THEMA, depth,
      model: CHAIN[0], log: () => {}, usage });
    console.log(JSON.stringify({ depth, ok: true, in: usage.in, out: usage.out, calls: usage.calls,
      zeichen: md.length, sekunden: Math.round((Date.now() - t0) / 1000) }));
  } catch (e) {
    console.log(JSON.stringify({ depth, ok: false, fehler: e.message.slice(0, 120),
      in: usage.in, out: usage.out, calls: usage.calls }));
  }
}
