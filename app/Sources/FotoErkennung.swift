import Foundation
import Supabase

/// Antwort der Edge Function `erkenne-foto` — Contract 1:1 wie im Erkennungs-Bench
/// (probes/foto-testset/bench-erkennung.mjs), damit gemessenes und gebautes
/// Verhalten dasselbe Feld meinen. `quelle`, `thema` und `interpretation` sind
/// ausdrücklich nullbar: „nicht erkannt" ist eine gültige Antwort, kein Fehler.
struct ErkennungsErgebnis: Decodable, Equatable {
    let erkennbar: Bool
    let typ: String
    let quelle: String?
    let thema: String?
    let sicherheit: String
    let interpretation: String?

    init(erkennbar: Bool, typ: String, quelle: String?, thema: String?,
         sicherheit: String, interpretation: String?) {
        self.erkennbar = erkennbar
        self.typ = typ
        self.quelle = quelle
        self.thema = thema
        self.sicherheit = sicherheit
        self.interpretation = interpretation
    }
}

/// Die drei Bestätigungs-Zustände des Mockups. Ein Netz-/HTTP-Fehler ist keiner
/// davon — er bekommt einen eigenen Hinweis, weil ein Infrastruktur-Fehler nie
/// als inhaltliches Urteil („nicht erkannt") verkauft werden darf.
enum BestaetigungsZustand: String {
    case erkannt, unsicher, diagramm
}

enum FotoErkennung {
    /// Erkennung → Bestätigungs-Zustand. Reihenfolge ist die Entscheidung:
    /// Zweifel schlägt Diagramm, sonst würde eine unsichere Interpretation als
    /// bestätigungsreifer Klartext durchgehen.
    static func zustand(_ e: ErkennungsErgebnis) -> BestaetigungsZustand {
        let themaLeer = (e.thema ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if !e.erkennbar || themaLeer || e.sicherheit == "niedrig" { return .unsicher }
        let deutung = (e.interpretation ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if e.typ == "diagramm", !deutung.isEmpty { return .diagramm }
        return .erkannt
    }

    /// Ein Aufruf für den ganzen Stapel, weil die Serie EINE Quelle ist
    /// (Design-Lock „eine Quelle pro Durchgang") — aber nur mit den Pfaden im
    /// Eingang, nicht mit den Bildern selbst. Die Fotos sind zu diesem Zeitpunkt
    /// längst einzeln hochgeladen; der Aufruf ist ein paar hundert Byte groß und
    /// reißt deshalb nicht mehr ab.
    static func erkennen(pfade: [String]) async throws -> ErkennungsErgebnis {
        if let fake { return try await fake.antwort() }
        try await Supa.signInIfNeeded()
        return try await Supa.client.functions.invoke(
            "erkenne-foto",
            options: FunctionInvokeOptions(body: ["paths": pfade])
        )
    }

    /// `-foto-fake-erkennung <erkannt|unsicher|diagramm|fehler>` überspringt den
    /// Function-Aufruf. Zusammen mit `-jobs-local-only` läuft der ganze Fluss ohne Netz.
    static let fake: FotoFakeErkennung? = {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-foto-fake-erkennung"), i + 1 < args.count else { return nil }
        return FotoFakeErkennung(rawValue: args[i + 1])
    }()
}

/// Feste Antworten für UITests und Shots — Werte aus dem abgenommenen Mockup.
enum FotoFakeErkennung: String {
    case erkannt, unsicher, diagramm, fehler

    func antwort() async throws -> ErkennungsErgebnis {
        // Kurze Kunstpause: der Wartezustand des Suchers ist Teil des Flusses und
        // soll im Test wie im Shot wirklich vorkommen.
        try? await Task.sleep(nanoseconds: 400_000_000)
        switch self {
        case .erkannt:
            return ErkennungsErgebnis(
                erkennbar: true, typ: "cover",
                quelle: "The 33 Strategies of War, Robert Greene",
                thema: "Strategien der Kriegsführung und psychologische Einkreisung",
                sicherheit: "hoch", interpretation: nil
            )
        case .unsicher:
            return ErkennungsErgebnis(
                erkennbar: false, typ: "unklar", quelle: nil, thema: nil,
                sicherheit: "niedrig", interpretation: nil
            )
        case .diagramm:
            return ErkennungsErgebnis(
                erkennbar: true, typ: "diagramm", quelle: nil,
                thema: "Schlafdruck: Warum die Müdigkeit über den Tag wächst",
                sicherheit: "mittel",
                interpretation: "Die Kurve zeigt: Der Schlafdruck steigt über den Tag stetig an und fällt erst im Schlaf wieder ab."
            )
        case .fehler:
            throw FunctionsError.httpError(code: 502, data: Data())
        }
    }
}

// ── Wording der Bestätigungs-Karte ──

/// Der Contract liefert `quelle` als eine Zeile („Titel, Autor"), die Karte zeigt
/// zwei — hier wird getrennt, nicht geraten.
enum FotoText {
    static func titel(quelle: String?, typ: String) -> String {
        if let roh = quelle?.trimmingCharacters(in: .whitespacesAndNewlines), !roh.isEmpty {
            return teile(roh).titel
        }
        // Ohne lesbare Quelle bleibt die Karte offen statt streng: kein geratener
        // Buchtitel, aber auch keine Sackgasse — das Thema trägt die Lektion.
        switch typ {
        case "cover": return "Dein Buch"
        case "textseite": return "Deine Seiten"
        case "diagramm": return "Schaubild aus deinem Foto"
        case "handschrift": return "Deine Notiz"
        case "objekt": return "Dein Objekt"
        default: return "Deine Aufnahme"
        }
    }

    static func autor(quelle: String?) -> String? {
        guard let roh = quelle?.trimmingCharacters(in: .whitespacesAndNewlines), !roh.isEmpty else { return nil }
        return teile(roh).autor
    }

    private static func teile(_ quelle: String) -> (titel: String, autor: String?) {
        guard let komma = quelle.firstIndex(of: ",") else { return (quelle, nil) }
        let titel = String(quelle[quelle.startIndex..<komma]).trimmingCharacters(in: .whitespaces)
        let rest = String(quelle[quelle.index(after: komma)...]).trimmingCharacters(in: .whitespaces)
        return (titel.isEmpty ? quelle : titel, rest.isEmpty ? nil : rest)
    }

    /// Was im Stapel steckt, in Nutzer-Sprache. Der Contract kennt einen Typ für
    /// den ganzen Durchgang — „Cover + 2 Seiten" gilt nur, wenn er Cover sagt.
    static func inhalt(typ: String, anzahl: Int) -> String {
        switch typ {
        case "cover":
            if anzahl <= 1 { return "Buch-Cover" }
            return anzahl == 2 ? "Cover + 1 Seite" : "Cover + \(anzahl - 1) Seiten"
        case "textseite":
            return anzahl <= 1 ? "Eine Textseite" : "\(anzahl) Textseiten"
        case "diagramm":
            return anzahl <= 1 ? "Ein Schaubild" : "\(anzahl) Schaubilder"
        case "handschrift":
            return anzahl <= 1 ? "Handschriftliche Notiz" : "\(anzahl) handschriftliche Seiten"
        case "objekt":
            return anzahl <= 1 ? "Objekt mit Text" : "\(anzahl) Aufnahmen eines Objekts"
        default:
            return anzahl <= 1 ? "Ein Foto" : "\(anzahl) Fotos"
        }
    }
}

// ── Quelltext des Jobs ──

/// Der Block, aus dem der Worker die Lektion baut: bestätigte Kopfdaten plus der
/// OCR-Text jedes Fotos. Gekappt auf die 20000 Zeichen, die die Spalte zulässt.
enum FotoQuelltext {
    static let maxLaenge = 20_000

    static func bauen(quelle: String?, typ: String, interpretation: String?, ocr: [String]) -> String {
        let q = (quelle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var kopf = ["QUELLE: \(q.isEmpty ? "unbekannt" : q)", "TYP: \(typ)"]
        let deutung = (interpretation ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !deutung.isEmpty {
            kopf.append("INTERPRETATION (vom Nutzer bestätigt): \(deutung)")
        }

        var text = kopf.joined(separator: "\n") + "\n"
        for (i, roh) in ocr.enumerated() {
            text += "\n--- FOTO \(i + 1) (OCR) ---\n"
            text += roh.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return String(text.prefix(maxLaenge))
    }
}
