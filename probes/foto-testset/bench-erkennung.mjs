// Erkennungs-Bench: 5 Vision-Kandidaten × (9 Einzel-Fotos + 3 Mehr-Foto-Serien).
// REINE Messung (Lock 14.08.): Roh-Antworten + Latenz + Parse-Status, kein Score,
// kein Ranking — Interpretation nachgelagert zusammen. Latenz inkl. Bild-Upload;
// Modelle laufen parallel, Calls je Modell seriell (Latenz-Reihenfolge sauber).
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(process.env.HOME + "/Workspace/jarvis/.env", "utf8");
const KEY = env.match(/^OPENROUTER_API_KEY=(.+)$/m)[1].trim();

// argv[3] = optionale Modell-Liste (kommagetrennt) für Nachläufe einzelner Kandidaten.
const MODELS = process.argv[3] ? process.argv[3].split(",") : [
  "openai/gpt-5.6-luna-pro",
  "qwen/qwen3-vl-235b-a22b-instruct",
  "qwen/qwen3-vl-32b-instruct",
  "z-ai/glm-4.6v",
  "mistralai/mistral-small-3.2-24b-instruct",
];

const EINZEL = ["2840", "2841", "2842", "2843", "2844", "2845", "2846", "2847", "2848"];
const SERIEN = [
  { name: "serie-a", imgs: ["2841", "2842", "2843"] },
  { name: "serie-b", imgs: ["2844", "2845", "2846"] },
  { name: "serie-c", imgs: ["2847", "2848"] },
];

const img = (n) => ({
  type: "image_url",
  image_url: { url: "data:image/jpeg;base64," + readFileSync(join(HERE, "jpg", `IMG_${n}.jpg`)).toString("base64") },
});

// Contract spiegelt die Design-Locks: erkennbar=false = ehrliches Degradieren,
// offene Typen inkl. "objekt", Thema IMMER deutsch, Diagramm → Klartext-Interpretation.
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

async function call(model, images, label) {
  const t0 = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        messages: [{ role: "user", content: [
          { type: "text", text: images.length > 1 ? CONTRACT + SERIEN_ZUSATZ : CONTRACT },
          ...images.map(img),
        ] }],
      }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await res.json();
    const ms = Date.now() - t0;
    const raw = data.choices?.[0]?.message?.content ?? null;
    let parsed = null, parseErr = null;
    if (raw != null) {
      try { parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim()); }
      catch (e) { parseErr = e.message; }
    }
    return { label, ms, raw, parsed, parseErr,
      httpError: data.error ? JSON.stringify(data.error).slice(0, 200) : null,
      provider: data.provider ?? null,
      usage: data.usage ? { in: data.usage.prompt_tokens, out: data.usage.completion_tokens } : null };
  } catch (e) {
    return { label, ms: Date.now() - t0, raw: null, parsed: null, parseErr: null, httpError: e.message, provider: null, usage: null };
  }
}

const stamp = process.argv[2] ?? "lauf";
const outdir = join(HERE, "bench-results", stamp);
mkdirSync(outdir, { recursive: true });

const results = await Promise.all(MODELS.map(async (model) => {
  const rows = [];
  for (const n of EINZEL) rows.push(await call(model, [n], `IMG_${n}`));
  for (const s of SERIEN) rows.push(await call(model, s.imgs, s.name));
  console.log(`fertig: ${model}`);
  return { model, rows };
}));

writeFileSync(join(outdir, "raw.json"), JSON.stringify(results, null, 1));

// Report: Soll (Ground Truth) und Ist nebeneinander, plus Latenz/Provider — keine Scores.
const SOLL = {
  IMG_2840: "objekt · Tabakbeutel-Warnhinweis · Tabak & Gesundheit",
  IMG_2841: "cover · Crime and Punishment, Dostojewski · Schuld & Sühne (Überblick)",
  IMG_2842: "textseite · Crime and Punishment S.349 · Raskolnikow–Swidrigailow",
  IMG_2843: "textseite · Crime and Punishment S.348 · Luschins Rechtfertigung",
  IMG_2844: "cover · The 33 Strategies of War, Robert Greene · 33 Strategien (Überblick)",
  IMG_2845: "textseite · 33 Strategies S.249 · Einkreisungs-Strategie/Rockefeller",
  IMG_2846: "textseite · 33 Strategies S.248 · Psychologische Einkreisung",
  IMG_2847: "cover · Die Kunst der Psychologie, Annika Durand · Menschen lesen (Überblick)",
  IMG_2848: "textseite · Kunst der Psychologie S.45 · Priming & Sokrates-Methode",
  "serie-a": "EINE Quelle: Crime and Punishment · Thema der Seiten",
  "serie-b": "EINE Quelle: 33 Strategies of War · Einkreisung",
  "serie-c": "EINE Quelle: Die Kunst der Psychologie · Priming/Menschen lesen",
};

let md = `# Erkennungs-Bench — ${new Date().toISOString().slice(0, 16)}\n\nReine Messung, keine Wertung. Latenz inkl. Bild-Upload, Modelle parallel gefahren.\n`;
for (const { model, rows } of results) {
  const u = rows.reduce((a, r) => ({ in: a.in + (r.usage?.in ?? 0), out: a.out + (r.usage?.out ?? 0) }), { in: 0, out: 0 });
  md += `\n## ${model}\nTokens gesamt: ${u.in} in / ${u.out} out · Provider: ${[...new Set(rows.map(r => r.provider).filter(Boolean))].join(", ") || "?"}\n\n`;
  md += `| Fall | Latenz | Ist (typ · quelle · thema · sicherheit) | Soll |\n|---|---|---|---|\n`;
  for (const r of rows) {
    let ist;
    if (r.httpError) ist = `FEHLER: ${r.httpError}`;
    else if (r.parseErr) ist = `PARSE-FEHLER: ${(r.raw ?? "").slice(0, 80)}`;
    else if (!r.parsed) ist = "LEER";
    else {
      const p = r.parsed;
      ist = `${p.erkennbar === false ? "NICHT ERKANNT · " : ""}${p.typ} · ${p.quelle ?? "–"} · ${p.thema ?? "–"} · ${p.sicherheit}${p.interpretation ? " · Interp.: " + p.interpretation : ""}`;
    }
    md += `| ${r.label} | ${(r.ms / 1000).toFixed(1)}s | ${String(ist).replace(/\|/g, "/")} | ${SOLL[r.label]} |\n`;
  }
}
writeFileSync(join(outdir, "report.md"), md);
console.log("→ " + join(outdir, "report.md"));
