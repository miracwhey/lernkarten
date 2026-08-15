import Foundation
import Supabase
import SwiftUI
import UIKit

/// Der Foto-Fluss als ein Ort: aufnehmen → erkennen → bestätigen → Job. Es gibt
/// keinen Warte-Screen; das Warten passiert im Sucher (Design-Lock aus dem Mockup).
///
/// Jedes Foto geht sofort nach dem Auslösen einzeln in den Eingang hoch, parallel
/// zum OCR-Lauf. Beim „Fertig" ist meist beides längst fertig, und die Erkennung
/// bekommt nur noch die Pfade.
@MainActor
final class FotoFlussModel: ObservableObject {
    /// Eine Quelle pro Durchgang — mehr als fünf Fotos sind kein Durchgang mehr.
    static let maxFotos = 5

    enum Phase: Equatable { case aufnahme, erkennung, fehler, bestaetigung }

    @Published private(set) var fotos: [AufgenommenesFoto] = []
    @Published private(set) var phase: Phase = .aufnahme
    @Published private(set) var ergebnis: ErkennungsErgebnis?
    /// Was genau schiefging — Klartext plus technische Klasse. Am Gerät ist der
    /// Screen die einzige Stelle, an der eine Fehlerursache sichtbar werden kann.
    @Published private(set) var fehlertext: String?

    /// Pro Foto ein OCR-Lauf und ein Upload im Hintergrund — beim „Fertig" wird
    /// nur noch eingesammelt.
    private var ocrLaeufe: [Task<Void, Never>] = []
    private var uploadLaeufe: [UUID: Task<Void, Never>] = [:]
    /// Alle Fotos eines Durchgangs teilen sich einen Ordner im Eingang.
    private let durchgang = UUID()

    var stapelVoll: Bool { fotos.count >= Self.maxFotos }
    var kannAusloesen: Bool { phase == .aufnahme && !stapelVoll }
    var kannFertig: Bool { phase == .aufnahme && !fotos.isEmpty }
    var uploadsLaufen: Bool { fotos.contains { $0.upload == .laeuft } }

    func aufnehmen(_ bild: UIImage) {
        guard kannAusloesen, let foto = FotoBild.verkleinern(bild) else { return }
        fotos.append(foto)
        let id = foto.id
        let jpeg = foto.jpeg
        let index = fotos.count
        ocrLaeufe.append(Task.detached(priority: .utility) { [weak self] in
            let text = FotoOCR.lesen(jpeg)
            await self?.setzeOCR(id, text)
        })
        starteUpload(id: id, jpeg: jpeg, index: index)
    }

    private func setzeOCR(_ id: UUID, _ text: String) {
        guard let i = fotos.firstIndex(where: { $0.id == id }) else { return }
        fotos[i].ocr = text
    }

    private func setzeUpload(_ id: UUID, _ zustand: FotoUploadZustand) {
        guard let i = fotos.firstIndex(where: { $0.id == id }) else { return }
        fotos[i].upload = zustand
    }

    /// Der Upload läuft, während der Nutzer das nächste Foto schießt. Genau darin
    /// liegt der Gewinn: die Sekunden am Netz fallen in die Zeit, in der er ohnehin
    /// beschäftigt ist, statt gesammelt nach dem letzten Bild anzufallen.
    private func starteUpload(id: UUID, jpeg: Data, index: Int) {
        uploadLaeufe[id] = Task { [weak self] in
            guard let self else { return }
            let zustand: FotoUploadZustand
            do {
                try await Supa.signInIfNeeded()
                let uid = try await Supa.client.auth.session.user.id
                zustand = await FotoUpload.hochladen(
                    jpeg, uid: uid, durchgang: self.durchgang, index: index
                )
            } catch {
                zustand = .fehler("Keine Sitzung — Anmeldung fehlgeschlagen")
            }
            guard !Task.isCancelled else { return }
            self.setzeUpload(id, zustand)
        }
    }

    /// „Fertig": OCR und Uploads abschließen, dann die Erkennung rufen. Ein Fehler
    /// der Function ist ein Fehler, kein Inhalts-Urteil.
    func erkennen() async {
        guard !fotos.isEmpty else { return }
        phase = .erkennung
        fehlertext = nil

        let laeufe = ocrLaeufe
        async let ocrFertig: Void = Self.abwarten(laeufe)
        await uploadsAbwarten()
        await ocrFertig

        // Was hier noch keinen Pfad hat, ist nach drei Anläufen endgültig
        // gescheitert. Mit weniger Fotos weiterzumachen wäre stilles Raten: die
        // Serie erkennt ihre Quelle gerade WEIL das Cover dabei ist.
        let offen = fotos.filter { $0.pfad == nil }
        guard offen.isEmpty else {
            fehlertext = Self.uploadMeldung(offen, von: fotos.count)
            phase = .fehler
            return
        }

        do {
            ergebnis = try await FotoErkennung.erkennen(pfade: fotos.compactMap(\.pfad))
            phase = .bestaetigung
        } catch {
            fehlertext = Self.erkennungsMeldung(error)
            phase = .fehler
        }
    }

    /// Nochmal: erst die gescheiterten Uploads neu anstoßen, dann erkennen. Die
    /// bereits hochgeladenen Fotos bleiben liegen — nur der Rest geht über den Funk.
    func nochmal() async {
        for (i, foto) in fotos.enumerated() where foto.upload.gescheitert {
            fotos[i].upload = .laeuft
            starteUpload(id: foto.id, jpeg: foto.jpeg, index: i + 1)
        }
        await erkennen()
    }

    private func uploadsAbwarten() async {
        for lauf in uploadLaeufe.values { await lauf.value }
    }

    /// Abbruch: laufende Uploads stoppen und den Eingang räumen. Was die Erkennung
    /// schon gesehen hat, ist dort bereits gelöscht.
    func verwerfen() async {
        for lauf in uploadLaeufe.values { lauf.cancel() }
        await FotoUpload.verwerfen(fotos.compactMap(\.pfad))
    }

    /// Zurück zur Kamera — mit bestehendem Stapel („Neu fotografieren" ergänzt,
    /// es verwirft nicht).
    func zurueckZurKamera() {
        phase = .aufnahme
    }

    /// Der OCR-Text in Aufnahme-Reihenfolge; noch laufende Läufe sind beim
    /// Bestätigen längst fertig, ein leerer Eintrag bleibt trotzdem gültig.
    var ocrTexte: [String] { fotos.map { $0.ocr ?? "" } }

    private nonisolated static func abwarten(_ laeufe: [Task<Void, Never>]) async {
        for lauf in laeufe { await lauf.value }
    }

    // ── Fehlertexte ──

    private static func uploadMeldung(_ offen: [AufgenommenesFoto], von gesamt: Int) -> String {
        let grund: String
        if case .fehler(let text) = offen.first?.upload { grund = text } else { grund = "unbekannt" }
        let welche = offen.count == gesamt ? "Die Fotos" : "\(offen.count) von \(gesamt) Fotos"
        return "\(welche) ließen sich nicht hochladen — \(grund)"
    }

    private static func erkennungsMeldung(_ error: Error) -> String {
        if let f = error as? FunctionsError {
            switch f {
            case .httpError(let code, let data):
                let detail = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
                let text = detail?["error"] as? String
                return "Erkennung fehlgeschlagen (HTTP \(code)\(text.map { " – \($0)" } ?? ""))"
            case .relayError:
                return "Erkennung fehlgeschlagen (Relay-Fehler)"
            }
        }
        if let url = error as? URLError {
            return "Erkennung fehlgeschlagen (Netzfehler \(url.code.rawValue))"
        }
        return "Erkennung fehlgeschlagen (\(String(describing: error).prefix(100)))"
    }
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
                    onClose: abbrechen,
                    onBauen: bauen
                )
            } else {
                FotoAufnahmeView(modell: modell, onClose: abbrechen)
            }
        }
        .background(Theme.paper)
    }

    /// Beim Abbruch bleiben keine Fotos im Eingang liegen.
    private func abbrechen() {
        Task { await modell.verwerfen() }
        onAbbruch()
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
