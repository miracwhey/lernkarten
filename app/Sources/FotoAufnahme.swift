import AVFoundation
import SwiftUI
import UIKit

/// Technik der Aufnahme: ein Foto im Stapel, das Verkleinern vor dem Netz, die
/// AVFoundation-Session und der Simulator-Ersatz. Der Bildschirm dazu steht in
/// FotoAufnahmeView, das Layout kommt 1:1 aus FotoFlowMockup (bindende Spec).

/// Ein geschossenes Foto. `jpeg` ist die verkleinerte Fassung, die in den Eingang
/// hochgeladen wird; `ocr` füllt der Vision-Lauf im Hintergrund nach, `upload` der
/// Netz-Lauf. Beide starten beim Auslösen und laufen, während weiterfotografiert wird.
struct AufgenommenesFoto: Identifiable, Equatable {
    let id = UUID()
    let bild: UIImage
    let jpeg: Data
    var ocr: String?
    var upload: FotoUploadZustand = .laeuft

    var pfad: String? { upload.pfad }
}

/// Verkleinern vor jeder Weiterverarbeitung: ein iPhone-Foto hat 12 MP und wäre
/// als base64 ein Vielfaches davon — längste Kante 1600 px reicht der Erkennung.
enum FotoBild {
    static let maxKante: CGFloat = 1600
    static let qualitaet: CGFloat = 0.7

    /// Zielgröße bei erhaltenem Seitenverhältnis; kleinere Bilder bleiben, wie sie sind.
    static func zielGroesse(_ groesse: CGSize) -> CGSize {
        let laengste = max(groesse.width, groesse.height)
        guard laengste > maxKante, laengste > 0 else { return groesse }
        let faktor = maxKante / laengste
        return CGSize(width: (groesse.width * faktor).rounded(), height: (groesse.height * faktor).rounded())
    }

    /// Verkleinertes Bild + JPEG-Daten. Das Neuzeichnen dreht die Kamera-Orientierung
    /// mit — Vision und die Erkennung sehen dasselbe aufrechte Bild wie der Nutzer.
    static func verkleinern(_ bild: UIImage) -> AufgenommenesFoto? {
        let ziel = zielGroesse(bild.size)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let klein = UIGraphicsImageRenderer(size: ziel, format: format).image { _ in
            bild.draw(in: CGRect(origin: .zero, size: ziel))
        }
        guard let daten = klein.jpegData(compressionQuality: qualitaet) else { return nil }
        return AufgenommenesFoto(bild: klein, jpeg: daten)
    }
}

// ── Simulator-Ersatz ──

/// Der Simulator hat keine Kamera. Mit `-foto-fake-kamera` zeigt der Sucher ein
/// Standbild und der Auslöser schießt der Reihe nach die Testfotos aus dem
/// Documents-Ordner des App-Containers (der Shot-Runner kopiert sie via
/// `simctl get_app_container … data` hinein — die iOS-Sandbox gilt auch im
/// Simulator, Mac-Pfade außerhalb des Containers sind nicht lesbar).
enum FotoFake {
    static let kamera = ProcessInfo.processInfo.arguments.contains("-foto-fake-kamera")
    static let reihe = ["2844", "2845", "2846"]

    /// Das Bild, das der nächste Auslöser-Druck liefert — und deshalb auch das,
    /// was der Sucher schon zeigt.
    static func naechstes(_ index: Int) -> UIImage {
        let name = reihe[index % reihe.count]
        return testFoto(name) ?? platzhalter(name)
    }

    private static func testFoto(_ n: String) -> UIImage? {
        guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        else { return nil }
        return UIImage(contentsOfFile: docs.appendingPathComponent("IMG_\(n).jpg").path)
    }

    /// Fehlt das Testfoto, kommt ein sichtbar beschriftetes Ersatzbild — der Fluss
    /// bleibt testbar, und kein Shot kann still eine Attrappe als echtes Foto zeigen.
    private static func platzhalter(_ n: String) -> UIImage {
        let groesse = CGSize(width: 1200, height: 1600)
        return UIGraphicsImageRenderer(size: groesse).image { ctx in
            UIColor(Theme.chrome).setFill()
            ctx.fill(CGRect(origin: .zero, size: groesse))
            let text = "IMG_\(n).jpg\nfehlt im Container" as NSString
            let stil = NSMutableParagraphStyle()
            stil.alignment = .center
            text.draw(in: CGRect(x: 0, y: 700, width: groesse.width, height: 200), withAttributes: [
                .font: UIFont.systemFont(ofSize: 64, weight: .semibold),
                .foregroundColor: UIColor(Theme.bad),
                .paragraphStyle: stil,
            ])
        }
    }
}

// ── Echte Kamera ──

/// AVFoundation-Foto-Capture. Konfiguration und Start laufen auf einer eigenen
/// Queue (startRunning blockiert), der Zustand wird auf dem Main-Thread gemeldet.
final class FotoKamera: NSObject, ObservableObject, AVCapturePhotoCaptureDelegate {
    @Published private(set) var laeuft = false
    @Published private(set) var abgelehnt = false

    let session = AVCaptureSession()
    private let ausgabe = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "de.leonvalentin.lernkarten.kamera")
    private var abschluss: ((UIImage?) -> Void)?
    /// Die Session wird EINMAL bestückt. Seit der Sucher im Sheet lebt, wird
    /// `starten()` bei jedem Rückweg vom Thema-Tab erneut gerufen — ein zweites
    /// `addInput` lehnt AVFoundation ab, und ohne diese Marke bliebe der Sucher
    /// danach schwarz.
    private var bestueckt = false

    func starten() async {
        guard !FotoFake.kamera else { return }
        guard await AVCaptureDevice.requestAccess(for: .video) else {
            await MainActor.run { abgelehnt = true }
            return
        }
        queue.async { [self] in
            if !bestueckt {
                session.beginConfiguration()
                session.sessionPreset = .photo
                guard let geraet = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                      let eingang = try? AVCaptureDeviceInput(device: geraet),
                      session.canAddInput(eingang), session.canAddOutput(ausgabe)
                else { session.commitConfiguration(); return }
                session.addInput(eingang)
                session.addOutput(ausgabe)
                session.commitConfiguration()
                bestueckt = true
            }
            if !session.isRunning { session.startRunning() }
            DispatchQueue.main.async { self.laeuft = true }
        }
    }

    func stoppen() {
        queue.async { [self] in
            if session.isRunning { session.stopRunning() }
            DispatchQueue.main.async { self.laeuft = false }
        }
    }

    func ausloesen(_ fertig: @escaping (UIImage?) -> Void) {
        guard laeuft else { fertig(nil); return }
        abschluss = fertig
        queue.async { [ausgabe] in
            ausgabe.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        let bild = photo.fileDataRepresentation().flatMap(UIImage.init(data:))
        DispatchQueue.main.async {
            let fertig = self.abschluss
            self.abschluss = nil
            fertig?(bild)
        }
    }
}

/// Der Sucher selbst — die Vorschauschicht der laufenden Session.
struct KameraVorschau: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> VorschauView {
        let view = VorschauView()
        view.schicht.session = session
        view.schicht.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ view: VorschauView, context: Context) {}

    final class VorschauView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var schicht: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}
