import UIKit
import Vision

/// Texterkennung auf dem Gerät. Läuft direkt nach jeder Aufnahme im Hintergrund,
/// damit beim Tap auf „Fertig" nichts mehr zu warten ist. Der erkannte Text ist
/// die Inhalts-Quelle des späteren Jobs — die Fotos selbst verlassen das Gerät
/// nur für die Erkennung, nie für den Bau.
enum FotoOCR {
    /// Erkannter Text eines Fotos, Zeile für Zeile. Ohne Treffer bleibt es leer —
    /// ein Cover ohne Fließtext ist kein Fehler.
    static func lesen(_ jpeg: Data) -> String {
        guard let bild = UIImage(data: jpeg), let cg = bild.cgImage else { return "" }

        let anfrage = VNRecognizeTextRequest()
        anfrage.recognitionLevel = .accurate
        // Deutsch zuerst: bei zweisprachigen Seiten gewinnt die erwartete Sprache.
        anfrage.recognitionLanguages = ["de-DE", "en-US"]
        anfrage.usesLanguageCorrection = true

        // Das Bild wurde beim Verkleinern aufrecht neu gezeichnet — .up ist korrekt.
        let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
        do {
            try handler.perform([anfrage])
        } catch {
            print("OCR: \(error)")
            return ""
        }

        let zeilen = (anfrage.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        return zeilen.joined(separator: "\n")
    }
}
