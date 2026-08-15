import UIKit
import XCTest
@testable import Lernkarten

/// Foto-Fluss ohne Kamera und ohne Netz: Zustands-Abbildung der Erkennung,
/// Quelltext des Jobs, Wording der Bestätigungs-Karte und das Verkleinern.
final class FotoTests: XCTestCase {

    private func ergebnis(erkennbar: Bool = true, typ: String = "cover",
                          quelle: String? = "The 33 Strategies of War, Robert Greene",
                          thema: String? = "Strategien der Kriegsführung",
                          sicherheit: String = "hoch",
                          interpretation: String? = nil) -> ErkennungsErgebnis {
        ErkennungsErgebnis(erkennbar: erkennbar, typ: typ, quelle: quelle, thema: thema,
                           sicherheit: sicherheit, interpretation: interpretation)
    }

    // ── Erkennung → Bestätigungs-Zustand ──

    func testErkanntBrauchtThemaUndSicherheit() {
        XCTAssertEqual(FotoErkennung.zustand(ergebnis()), .erkannt)
    }

    func testNichtErkennbarWirdUnsicher() {
        XCTAssertEqual(FotoErkennung.zustand(ergebnis(erkennbar: false)), .unsicher)
    }

    func testFehlendesThemaWirdUnsicher() {
        XCTAssertEqual(FotoErkennung.zustand(ergebnis(thema: nil)), .unsicher)
        XCTAssertEqual(FotoErkennung.zustand(ergebnis(thema: "   ")), .unsicher,
                       "Ein Thema aus Leerzeichen ist kein Thema")
    }

    func testNiedrigeSicherheitWirdUnsicher() {
        XCTAssertEqual(FotoErkennung.zustand(ergebnis(sicherheit: "niedrig")), .unsicher)
    }

    func testDiagrammBrauchtInterpretation() {
        XCTAssertEqual(FotoErkennung.zustand(ergebnis(typ: "diagramm", interpretation: "Die Kurve steigt.")), .diagramm)
        XCTAssertEqual(FotoErkennung.zustand(ergebnis(typ: "diagramm", interpretation: nil)), .erkannt,
                       "Ohne Klartext gibt es nichts zu bestätigen — dann ist es eine normale Quelle")
    }

    func testZweifelSchlaegtDiagramm() {
        let e = ergebnis(typ: "diagramm", sicherheit: "niedrig", interpretation: "Die Kurve steigt.")
        XCTAssertEqual(FotoErkennung.zustand(e), .unsicher,
                       "Eine unsichere Interpretation darf nicht als bestätigungsreifer Klartext durchgehen")
    }

    /// Die Fake-Antworten sind die Testgrundlage für UITests und Shots — sie müssen
    /// genau die drei Zustände treffen, die sie behaupten.
    func testFakeAntwortenTreffenIhrenZustand() async throws {
        for (fake, soll) in [(FotoFakeErkennung.erkannt, BestaetigungsZustand.erkannt),
                             (.unsicher, .unsicher),
                             (.diagramm, .diagramm)] {
            let e = try await fake.antwort()
            XCTAssertEqual(FotoErkennung.zustand(e), soll, "Fake \(fake.rawValue)")
        }
    }

    func testFakeFehlerWirftStattZuAntworten() async {
        do {
            _ = try await FotoFakeErkennung.fehler.antwort()
            XCTFail("Der Fehler-Fake muss werfen — sonst prüft er den Fehlerpfad nicht")
        } catch {}
    }

    // ── Quelltext des Jobs ──

    func testQuelltextTraegtKopfUndFotos() {
        let text = FotoQuelltext.bauen(quelle: "The 33 Strategies of War, Robert Greene",
                                       typ: "cover", interpretation: nil,
                                       ocr: ["Seite eins", "Seite zwei"])
        XCTAssertEqual(text, """
        QUELLE: The 33 Strategies of War, Robert Greene
        TYP: cover

        --- FOTO 1 (OCR) ---
        Seite eins
        --- FOTO 2 (OCR) ---
        Seite zwei
        """)
    }

    func testQuelltextOhneQuelleSagtUnbekannt() {
        let text = FotoQuelltext.bauen(quelle: nil, typ: "unklar", interpretation: nil, ocr: [""])
        XCTAssert(text.hasPrefix("QUELLE: unbekannt\nTYP: unklar\n"), text)
    }

    func testQuelltextNimmtInterpretationNurWennDa() {
        let mit = FotoQuelltext.bauen(quelle: nil, typ: "diagramm",
                                      interpretation: "Der Druck steigt über den Tag.", ocr: [])
        XCTAssert(mit.contains("INTERPRETATION (vom Nutzer bestätigt): Der Druck steigt über den Tag."))
        let ohne = FotoQuelltext.bauen(quelle: nil, typ: "cover", interpretation: "   ", ocr: [])
        XCTAssertFalse(ohne.contains("INTERPRETATION"))
    }

    func testQuelltextWirdAufSpaltenlaengeGekappt() {
        let lang = String(repeating: "a", count: 30_000)
        let text = FotoQuelltext.bauen(quelle: nil, typ: "textseite", interpretation: nil, ocr: [lang])
        XCTAssertEqual(text.count, 20_000, "Die Spalte lässt genau 20000 Zeichen zu")
    }

    // ── Wording der Karte ──

    func testTitelUndAutorKommenAusEinerQuellenzeile() {
        XCTAssertEqual(FotoText.titel(quelle: "The 33 Strategies of War, Robert Greene", typ: "cover"),
                       "The 33 Strategies of War")
        XCTAssertEqual(FotoText.autor(quelle: "The 33 Strategies of War, Robert Greene"), "Robert Greene")
        XCTAssertNil(FotoText.autor(quelle: "Tabakverpackung mit Warnhinweis"))
    }

    func testOhneQuelleBleibtDieKarteOffenStattStreng() {
        XCTAssertEqual(FotoText.titel(quelle: nil, typ: "textseite"), "Deine Seiten")
        XCTAssertEqual(FotoText.titel(quelle: "   ", typ: "objekt"), "Dein Objekt")
        XCTAssertNil(FotoText.autor(quelle: nil))
    }

    func testInhaltsLabelZaehltRichtig() {
        XCTAssertEqual(FotoText.inhalt(typ: "cover", anzahl: 3), "Cover + 2 Seiten")
        XCTAssertEqual(FotoText.inhalt(typ: "cover", anzahl: 2), "Cover + 1 Seite")
        XCTAssertEqual(FotoText.inhalt(typ: "cover", anzahl: 1), "Buch-Cover")
        XCTAssertEqual(FotoText.inhalt(typ: "textseite", anzahl: 2), "2 Textseiten")
        XCTAssertEqual(FotoText.inhalt(typ: "unklar", anzahl: 4), "4 Fotos")
    }

    // ── Verkleinern vor dem Netz ──

    func testVerkleinernBegrenztDieLaengsteKante() {
        let ziel = FotoBild.zielGroesse(CGSize(width: 4032, height: 3024))
        XCTAssertEqual(max(ziel.width, ziel.height), FotoBild.maxKante)
        XCTAssertEqual(ziel, CGSize(width: 1600, height: 1200))
    }

    func testKleineBilderBleibenWieSieSind() {
        let ziel = FotoBild.zielGroesse(CGSize(width: 800, height: 600))
        XCTAssertEqual(ziel, CGSize(width: 800, height: 600))
    }

    func testVerkleinernLiefertJpegInZielgroesse() throws {
        let gross = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 2000)).image { ctx in
            UIColor.gray.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 3000, height: 2000))
        }
        let foto = try XCTUnwrap(FotoBild.verkleinern(gross))
        XCTAssertEqual(max(foto.bild.size.width, foto.bild.size.height), 1600)
        XCTAssertFalse(foto.jpeg.isEmpty)
        XCTAssertNil(foto.ocr, "OCR füllt erst der Hintergrundlauf")
    }

    // ── Echte Leitung zur Edge Function ──

    /// Der Erkennungs-Weg der App gegen die echte Function: dieselben Testfotos,
    /// dasselbe Verkleinern, derselbe Aufruf. Nur mit REAL_BACKEND=1, weil es ein
    /// echter Modell-Aufruf ist. Die Fotos liegen im Documents des Test-Hosts.
    func testErkennungGegenEchteEdgeFunction() async throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["REAL_BACKEND"] == "1")
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        // WIRE_FOTOS begrenzt die Serie — für die Frage, ab welcher Nutzlast die
        // Leitung trägt (der Simulator bricht große Uploads gern ab).
        let anzahl = Int(ProcessInfo.processInfo.environment["WIRE_FOTOS"] ?? "3") ?? 3
        var bilder: [Data] = []
        for n in ["2844", "2845", "2846"].prefix(anzahl) {
            let pfad = docs.appendingPathComponent("IMG_\(n).jpg").path
            let roh = try XCTUnwrap(UIImage(contentsOfFile: pfad), "IMG_\(n).jpg fehlt im Container")
            bilder.append(try XCTUnwrap(FotoBild.verkleinern(roh)).jpeg)
        }
        print("WIRE Bild-KB: \(bilder.map { $0.count / 1024 }) gesamt \(bilder.reduce(0) { $0 + $1.count } / 1024)")

        let e = try await FotoErkennung.erkennen(bilder: bilder)
        print("WIRE Ergebnis: \(e)")
        XCTAssert(e.erkennbar, "Serie B ist erkennbar")
        XCTAssertEqual(FotoErkennung.zustand(e), .erkannt)
    }

    // ── Alteinträge ohne die neue Spalte ──

    func testJobOhneSourceSpalteDekodiert() throws {
        let alt = """
        {"id":"1D3D8C22-1B0E-4E5F-9A5B-9F0C9B5E0A11","kind":"topic","topic":"Photosynthese",
         "source_text":null,"status":"queued","stage":null,"error":null,
         "created_at":"2026-08-14T10:00:00Z"}
        """
        let job = try JSONDecoder.iso.decode(GenerationJob.self, from: Data(alt.utf8))
        XCTAssertNil(job.source, "Ein Job von vor der Spalte muss lesbar bleiben")
        XCTAssertEqual(job.displayTitle, "Photosynthese")
    }

    func testFotoJobMitQuelleDekodiert() throws {
        let neu = """
        {"id":"1D3D8C22-1B0E-4E5F-9A5B-9F0C9B5E0A12","kind":"photo","topic":"Einkreisung",
         "source":"The 33 Strategies of War, Robert Greene","source_text":"QUELLE: ...",
         "status":"queued","stage":null,"error":null,"created_at":"2026-08-15T10:00:00.123Z"}
        """
        let job = try JSONDecoder.iso.decode(GenerationJob.self, from: Data(neu.utf8))
        XCTAssertEqual(job.source, "The 33 Strategies of War, Robert Greene")
        XCTAssertEqual(job.kind, "photo")
        XCTAssertEqual(job.statusLine, "Wird gebaut – In der Warteschlange")
    }
}
