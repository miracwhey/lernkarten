import Foundation
import Supabase

/// Der Weg der Fotos zur Erkennung: jedes einzeln, sofort nach dem Auslösen,
/// während der Nutzer noch fotografiert. Der Erkennungs-Aufruf trägt danach nur
/// noch die Pfade.
///
/// Gemessener Grund (15.08.): derselbe Stapel aus 4 Fotos war als base64 im
/// Function-Body 2,66 MB und riss über Mobilfunk mitten im Upload ab — die
/// Function sah den Request nie. Ein Upload von 0,5 MB ist kurz genug, um
/// durchzukommen, und wenn doch einer reißt, ist nur dieser eine zu wiederholen.

/// Wo ein Foto auf dem Weg steht. `fehler` trägt Klartext UND die technische
/// Klasse — am Gerät ohne Kabel ist der Fehler-Screen die einzige Stelle, an der
/// eine Fehlerursache überhaupt sichtbar werden kann.
enum FotoUploadZustand: Equatable {
    case laeuft
    case fertig(String)
    case fehler(String)

    var pfad: String? {
        if case .fertig(let p) = self { return p }
        return nil
    }

    var gescheitert: Bool {
        if case .fehler = self { return true }
        return false
    }
}

enum FotoUpload {
    static let bucket = "foto-eingang"
    /// Drei Anläufe: der gemessene Abbruch war einmalig, der Nutzer-Retry lief durch.
    static let versuche = 3

    /// Ordner-Ebene 1 ist die Nutzer-Id — daran hängt die Storage-Policy, und die
    /// Function prüft dasselbe Präfix gegen das Token. Postgres liefert `auth.uid()`
    /// klein geschrieben, Swifts `uuidString` groß: ohne `lowercased()` greift die
    /// Policy nicht und jeder Upload wäre abgelehnt.
    static func pfad(uid: UUID, durchgang: UUID, index: Int) -> String {
        "\(uid.uuidString.lowercased())/\(durchgang.uuidString.lowercased())/\(index).jpg"
    }

    /// Ein Foto in den Eingang, mit Wiederholung bei abgerissener Verbindung.
    /// Dauerhafte Ablehnungen (Rechte, Format, Größe) werden NICHT wiederholt —
    /// ein zweiter Versuch würde dieselbe Antwort holen und nur Zeit kosten.
    static func hochladen(_ jpeg: Data, uid: UUID, durchgang: UUID, index: Int) async -> FotoUploadZustand {
        let ziel = pfad(uid: uid, durchgang: durchgang, index: index)
        if let fake { return await fake.antwort(ziel) }

        for versuch in 1...versuche {
            do {
                try await Supa.client.storage.from(bucket).upload(
                    ziel,
                    data: jpeg,
                    options: FileOptions(contentType: "image/jpeg")
                )
                return .fertig(ziel)
            } catch {
                guard istVoruebergehend(error), versuch < versuche else {
                    return .fehler(beschreibung(error))
                }
                // 1 s, dann 3 s — ein Funkloch beim Fahren ist meist nach Sekunden vorbei.
                try? await Task.sleep(nanoseconds: versuch == 1 ? 1_000_000_000 : 3_000_000_000)
            }
        }
        return .fehler("Upload nach \(versuche) Versuchen abgebrochen")
    }

    /// Den Eingang räumen, wenn der Durchgang abgebrochen wird. Was die Erkennung
    /// schon verarbeitet hat, ist dort bereits gelöscht — ein zweites Entfernen
    /// stört nicht. Fehler hier sind belanglos: das Aufräumen darf nichts kippen.
    static func verwerfen(_ pfade: [String]) async {
        guard !pfade.isEmpty else { return }
        _ = try? await Supa.client.storage.from(bucket).remove(paths: pfade)
    }

    /// `-foto-fake-upload <fehler|ok>` erzwingt den Ausgang ohne Netz. Ohne das
    /// wäre der Fehlerpfad nur bei echtem Funkloch erreichbar — also nie in einem
    /// Test und auf keinem Shot.
    static let fake: FotoFakeUpload? = {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-foto-fake-upload"), i + 1 < args.count else { return nil }
        return FotoFakeUpload(rawValue: args[i + 1])
    }()

    /// Abgerissene Verbindungen, Zeitüberschreitungen, kein Netz: alles Zustände,
    /// die eine Sekunde später anders sein können. Genau die Klasse, die den
    /// Mehr-Foto-Upload zerlegt hat.
    private static func istVoruebergehend(_ error: Error) -> Bool {
        guard let url = alsURLError(error) else { return false }
        switch url.code {
        case .networkConnectionLost, .timedOut, .cannotConnectToHost,
             .notConnectedToInternet, .dnsLookupFailed, .cannotFindHost,
             .secureConnectionFailed, .requestBodyStreamExhausted:
            return true
        default:
            return false
        }
    }

    /// Klartext für den Nutzer, technische Klasse für die Diagnose. Beides in einer
    /// Zeile — der Screen ist am Gerät die einzige Quelle, `print` sieht dort niemand.
    private static func beschreibung(_ error: Error) -> String {
        if let url = alsURLError(error) {
            let grund: String
            switch url.code {
            case .networkConnectionLost: grund = "Verbindung abgerissen"
            case .timedOut: grund = "Zeitüberschreitung"
            case .notConnectedToInternet: grund = "kein Netz"
            case .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed: grund = "Server nicht erreichbar"
            default: grund = "Netzfehler"
            }
            return "\(grund) (\(url.code.rawValue))"
        }
        return String(describing: error).prefix(120).description
    }

    /// Der Netzfehler steckt bei supabase-swift oft eine Ebene tiefer als
    /// `URLError` verpackt — die Klasse geht sonst als „unbekannt" durch.
    private static func alsURLError(_ error: Error) -> URLError? {
        if let url = error as? URLError { return url }
        let nested = (error as NSError).underlyingErrors.compactMap { $0 as? URLError }
        if let erste = nested.first { return erste }
        let ns = error as NSError
        return ns.domain == NSURLErrorDomain ? URLError(URLError.Code(rawValue: ns.code)) : nil
    }
}

/// Fester Upload-Ausgang für Tests und Shots. Der Fehlertext ist genau der, den
/// die echte Strecke bei Leons Mobilfunk-Abbruch liefern würde.
enum FotoFakeUpload: String {
    case ok, fehler

    func antwort(_ ziel: String) async -> FotoUploadZustand {
        // Kurze Kunstpause: das Hochladen ist Teil des Flusses und soll im Test
        // wie im Shot wirklich Zeit brauchen.
        try? await Task.sleep(nanoseconds: 300_000_000)
        switch self {
        case .ok: return .fertig(ziel)
        case .fehler: return .fehler("Verbindung abgerissen (-1005)")
        }
    }
}
