// MOCKUP (bindend nach Abnahme): Info-Dichte von Asset-Karten — Leon-Befund 15.08.:
// „Auf der Visualisierung ist kein Kontext oder sonstige Informationen."
// Drei Stufen am ECHTEN Renderer (Ziel-Rendertechnik, keine Nachbau-Grafik), damit
// jedes Delta einzeln sichtbar ist:
//   a-ist        — Stand heute: role inline, 2 Slot-Labels
//   b-hero       — nur Größen-Delta: role hero, sonst identisch
//   c-hero-notes — hero + Slot-Sub-Zeilen (Elaboration, konstruktiv am Label gebunden)
//                  + 1 freie Anker-Note mit Punkt am Anker (Vokabular der curve-Notes)
// Die Notes in Stufe c sind HIER von Hand platziert (Mockup!) — der Bau dazu ist
// Schritt 4 (Contract additiv: labelSlots[].sub + notes[] auf asset-Karten).
// Nutzung: node probes/asset-note-mockup.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { normalizeLesson } from "../validate-lesson.mjs";

const repo = resolve(new URL("..", import.meta.url).pathname);
const OUT = resolve(repo, "probes/asset-note-mockup");
mkdirSync(OUT, { recursive: true });

const lesson = normalizeLesson(JSON.parse(readFileSync(resolve(repo, "probes/asset-demo-lesson.json"), "utf8")));
const basis = lesson.cards.find((c) => c.type === "asset" && c.asset.ref === "psyche.person");
if (!basis) throw new Error("Demo-Lesson hat keine psyche.person-Karte mehr");

const HOST = `<div class="phone">
  <div class="topbar"><button class="xbtn">✕</button><div class="progress">${"<span></span>".repeat(6)}</div></div>
  <div class="cardarea" id="area"></div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 560, height: 1000 }, deviceScaleFactor: 2 });
// Stills: reduced-motion = deterministischer Endzustand sofort (v3-Spec) — sonst
// fängt der Screenshot den Startframe der Entry-Animation (alles geghostet).
await page.emulateMedia({ reducedMotion: "reduce" });
await page.setContent(HOST);
await page.addStyleTag({ path: repo + "/renderer.css" });
await page.addScriptTag({ path: repo + "/assets/assets.js" });
await page.addScriptTag({ path: repo + "/renderer.js" });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

// Ruhezustand ohne Sequenz: die Abnahme gilt der Komposition, nicht dem Puls.
const still = (card, role) => ({ ...card, sequence: undefined, asset: { ...card.asset, role } });

const shoot = async (card, name, notes) => {
  await page.evaluate(({ card, notes }) => {
    const area = document.getElementById("area");
    renderCardInto(area, card, { onAdvance: () => {} });
    if (notes) {
      const svg = area.querySelector(".diagram svg");
      const NS = "http://www.w3.org/2000/svg";
      for (const n of notes) {
        if (n.dot) {
          const c = document.createElementNS(NS, "circle");
          c.setAttribute("class", "c-notedot");
          c.setAttribute("cx", n.dot[0]); c.setAttribute("cy", n.dot[1]);
          c.setAttribute("r", "3"); c.setAttribute("fill", n.color || "var(--muted)");
          svg.appendChild(c);
        }
        if (n.leader) {
          const l = document.createElementNS(NS, "path");
          l.setAttribute("d", n.leader);
          l.setAttribute("fill", "none"); l.setAttribute("stroke", n.color || "var(--muted)");
          l.setAttribute("stroke-width", "1"); l.setAttribute("stroke-dasharray", "2 3");
          svg.appendChild(l);
        }
        n.lines.forEach((zeile, i) => {
          const t = document.createElementNS(NS, "text");
          t.setAttribute("class", "c-note halo");
          t.setAttribute("x", n.x); t.setAttribute("y", n.y + i * 14);
          t.setAttribute("font-size", n.size || 10.5);
          if (n.align) t.setAttribute("text-anchor", n.align);
          // style, nicht Attribut: .c-note trägt fill in CSS, und CSS schlägt
          // Präsentations-Attribute — wie im Renderer selbst (Inline-Farben).
          if (n.color) t.style.fill = n.color;
          t.textContent = zeile;
          svg.appendChild(t);
        });
      }
    }
  }, { card, notes: notes || null });
  await page.locator(".phone").screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name}.png`);
};

await shoot(still(basis, "inline"), "a-ist");
await shoot(still(basis, "hero"), "b-hero");
// Hand-Platzierung in Karten-Einheiten (400×300); hero: Asset-Koordinate ×2.
await shoot(still(basis, "hero"), "c-hero-notes", [
  // Sub-Zeile zum innen-Label (oben links, direkt unter „WAS DARUNTER ARBEITET")
  { lines: ["WÜNSCHE · ÄNGSTE · ALTE MUSTER"], x: 20, y: 35, size: 10.5 },
  // Sub-Zeile zum aussen-Label (rechts, unter „WAS DU ZEIGST")
  { lines: ["WORTE, GESTIK, TATEN"], x: 256, y: 248, size: 10.5 },
  // Freie Anker-Note am Ende des Puls-Wegs (innen→koerper), IM Körper: wie sich die
  // innere Ebene meldet. Ton = es (Farbe des Wegs), Punkt am Weg-Ende, kurzer Leader.
  { lines: ["MELDET SICH ALS GEFÜHL,", "NIE ALS SATZ"], x: 150, y: 226, size: 10.5,
    align: "middle", color: "var(--es)", dot: [96, 204], leader: "M99,207 C108,215 116,219 124,221" },
]);

await browser.close();
console.log(`MOCKUP — 3 Stufen in ${OUT}/`);
