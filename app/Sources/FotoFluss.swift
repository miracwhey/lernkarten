import SwiftUI
import UIKit

/// Der Foto-Fluss als ein Ort: aufnehmen → erkennen → bestätigen → Job. Es gibt
/// keinen Warte-Screen; das Warten passiert im Sucher (Design-Lock aus dem Mockup).
@MainActor
final class FotoFlussModel: ObservableObject {
    /// Eine Quelle pro Durchgang — mehr als fünf Fotos sind kein Durchgang mehr.
    static let maxFotos = 5

    enum Phase: Equatable { case aufnahme, erkennung, fehler, bestaetigung }

    @Published private(set) var fotos: [AufgenommenesFoto] = []
    @Published private(set) var phase: Phase = .aufnahme
    @Published private(set) var ergebnis: ErkennungsErgebnis?

    /// Pro Foto ein OCR-Lauf im Hintergrund — beim „Fertig" wird nur noch eingesammelt.
    private var ocrLaeufe: [Task<Void, Never>] = []

    var stapelVoll: Bool { fotos.count >= Self.maxFotos }
    var kannAusloesen: Bool { phase == .aufnahme && !stapelVoll }
    var kannFertig: Bool { phase == .aufnahme && !fotos.isEmpty }

    func aufnehmen(_ bild: UIImage) {
        guard kannAusloesen, let foto = FotoBild.verkleinern(bild) else { return }
        fotos.append(foto)
        let id = foto.id
        let jpeg = foto.jpeg
        ocrLaeufe.append(Task.detached(priority: .utility) { [weak self] in
            let text = FotoOCR.lesen(jpeg)
            await self?.setzeOCR(id, text)
        })
    }

    private func setzeOCR(_ id: UUID, _ text: String) {
        guard let i = fotos.firstIndex(where: { $0.id == id }) else { return }
        fotos[i].ocr = text
    }

    /// „Fertig": OCR abschließen und die Erkennung rufen — gleichzeitig, nicht
    /// nacheinander. Ein Fehler der Function ist ein Fehler, kein Inhalts-Urteil.
    func erkennen() async {
        guard !fotos.isEmpty else { return }
        phase = .erkennung
        let bilder = fotos.map(\.jpeg)
        let laeufe = ocrLaeufe

        async let ocrFertig: Void = Self.abwarten(laeufe)
        do {
            let antwort = try await FotoErkennung.erkennen(bilder: bilder)
            await ocrFertig
            ergebnis = antwort
            phase = .bestaetigung
        } catch {
            await ocrFertig
            print("Foto-Erkennung: \(error)")
            phase = .fehler
        }
    }

    private nonisolated static func abwarten(_ laeufe: [Task<Void, Never>]) async {
        for lauf in laeufe { await lauf.value }
    }

    /// Zurück zur Kamera — mit bestehendem Stapel („Neu fotografieren" ergänzt,
    /// es verwirft nicht).
    func zurueckZurKamera() {
        phase = .aufnahme
    }

    /// Der OCR-Text in Aufnahme-Reihenfolge; noch laufende Läufe sind beim
    /// Bestätigen längst fertig, ein leerer Eintrag bleibt trotzdem gültig.
    var ocrTexte: [String] { fotos.map { $0.ocr ?? "" } }
}

/// Vollbild-Ausflug aus dem Erstellen-Sheet. Der Fluss endet entweder mit einem
/// Job (dann schließt auch das Sheet) oder mit Abbruch.
struct FotoFlussView: View {
    @ObservedObject var jobs: JobStore
    /// Job liegt an — das Erstellen-Sheet darf zu.
    var onGebaut: () -> Void
    /// Abbruch: nur der Kamera-Screen schließt, das Sheet bleibt stehen.
    var onAbbruch: () -> Void

    @StateObject private var modell = FotoFlussModel()

    var body: some View {
        Group {
            if modell.phase == .bestaetigung, let ergebnis = modell.ergebnis {
                FotoBestaetigungView(
                    ergebnis: ergebnis,
                    fotos: modell.fotos,
                    onZurueck: { modell.zurueckZurKamera() },
                    onClose: onAbbruch,
                    onBauen: bauen
                )
            } else {
                FotoAufnahmeView(modell: modell, onClose: onAbbruch)
            }
        }
        .background(Theme.paper)
    }

    private func bauen(thema: String, quelle: String?, interpretation: String?, depth: Depth) {
        let typ = modell.ergebnis?.typ ?? "unklar"
        let quelltext = FotoQuelltext.bauen(
            quelle: quelle,
            typ: typ,
            interpretation: interpretation,
            ocr: modell.ocrTexte
        )
        Task { await jobs.enqueuePhoto(topic: thema, source: quelle, sourceText: quelltext, depth: depth) }
        onGebaut()
    }
}
