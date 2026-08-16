import XCTest

/// Foto-Fluss als echte Interaktion: Fake-Kamera statt AVCapture (der Simulator hat
/// keine), Fake-Erkennung statt Edge Function — der Rest ist der Produktionspfad.
/// Dieselben Testfälle liefern die Shots der echten Screens.
final class FotoFlowUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    // ── Fluss ──

    /// Der Gang, der zählt: zwei Fotos, Fertig, erkannte Quelle, Thema angefasst,
    /// Lektion bauen — danach ist das Sheet zu und die Bibliothek trägt die Zeile.
    func testFotoFlussLegtJobAn() throws {
        let app = starten(erkennung: "erkannt")
        kameraOeffnen(app)
        schiessen(app, 2)

        app.buttons["foto-fertig"].tap()

        let titel = app.staticTexts["foto-titel"]
        XCTAssert(titel.waitForExistence(timeout: 15), "Bestätigungs-Karte muss kommen")
        XCTAssertEqual(titel.label, "The 33 Strategies of War", "Titel kommt aus der Erkennung")

        let feld = themaFeld(app)
        XCTAssert(feld.waitForExistence(timeout: 3))
        feld.tap()
        feld.typeText(" Pruefung")

        let bauen = app.buttons["foto-bauen"]
        XCTAssert(bauen.isEnabled, "Mit Thema ist Bauen scharf")
        bauen.tap()

        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["sheet-kicker"].exists, "Der Foto-Fluss schließt auch das Sheet")

        let status = app.buttons["job-zeile"]
        XCTAssert(status.waitForExistence(timeout: 5), "Bau-Status gehört in die Bibliothekszeile")
        XCTAssert(status.label.contains("In der Warteschlange"), "Statuszeile: \(status.label)")

        let zeile = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Pruefung")).firstMatch
        XCTAssert(zeile.waitForExistence(timeout: 5), "Das editierte Thema betitelt die Bau-Zeile")
    }

    /// Ein 502 der Function ist ein technischer Fehler — er darf nie als „nicht
    /// sicher erkannt" auftreten, sonst wird Infrastruktur als Inhalts-Urteil verkauft.
    func testTechnischerFehlerIstKeinUnsicherZustand() throws {
        let app = starten(erkennung: "fehler")
        kameraOeffnen(app)
        schiessen(app, 1)

        app.buttons["foto-fertig"].tap()

        XCTAssert(app.staticTexts["foto-fehler"].waitForExistence(timeout: 15), "Fehlerhinweis muss erscheinen")
        XCTAssertFalse(app.staticTexts["Hilf kurz nach"].exists,
                       "Ein Netzfehler ist kein Erkennungs-Zweifel")
        XCTAssert(app.buttons["foto-retry"].exists, "Der Fehler braucht einen Weg zurück:\n\(app.debugDescription)")
        XCTAssert(app.buttons["foto-fertig"].exists, "Der Sucher bleibt — es gibt keinen neuen Screen")
    }

    /// „Neu fotografieren" führt zur Kamera zurück und der Stapel steht noch.
    func testUnsicherFuehrtMitStapelZurueck() throws {
        let app = starten(erkennung: "unsicher")
        kameraOeffnen(app)
        schiessen(app, 2)

        app.buttons["foto-fertig"].tap()
        XCTAssert(app.staticTexts["Hilf kurz nach"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["foto-bauen"].isEnabled, "Ohne Thema bleibt Bauen zu")

        app.buttons["foto-neu"].tap()
        let zaehler = app.staticTexts["foto-zaehler"]
        XCTAssert(zaehler.waitForExistence(timeout: 3))
        XCTAssertEqual(zaehler.label, "2", "Der Stapel überlebt den Rückweg")
    }

    /// Reißt der Upload endgültig ab, sagt die App WAS abgerissen ist und ruft die
    /// Erkennung gar nicht erst — mit halbem Stapel würde die Serie ihre Quelle
    /// verlieren. Das ist Leons Fehlerfall vom 15.08., nur erzwungen.
    func testAbgerissenerUploadNenntDenGrundUndErkenntNicht() throws {
        let app = starten(erkennung: "erkannt", upload: "fehler")
        kameraOeffnen(app)
        schiessen(app, 2)

        app.buttons["foto-fertig"].tap()

        let hinweis = app.staticTexts["foto-fehler"]
        XCTAssert(hinweis.waitForExistence(timeout: 15), "Der Abbruch muss sichtbar werden")
        XCTAssert(hinweis.label.contains("hochladen"), "Der Hinweis nennt die Stufe: \(hinweis.label)")
        XCTAssert(hinweis.label.contains("-1005"), "Und die technische Klasse: \(hinweis.label)")
        XCTAssertFalse(app.staticTexts["foto-titel"].exists,
                       "Ohne vollständigen Stapel darf keine Erkennung erscheinen")
        XCTAssert(app.images["foto-upload-fehler"].firstMatch.exists
                    || app.otherElements["foto-upload-fehler"].firstMatch.exists,
                  "Das betroffene Foto ist im Stapel markiert")
    }

    // ── Shots der echten Screens ──

    func testShotUploadFehler() throws {
        let app = starten(erkennung: "erkannt", upload: "fehler")
        kameraOeffnen(app)
        schiessen(app, 2)
        app.buttons["foto-fertig"].tap()
        XCTAssert(app.staticTexts["foto-fehler"].waitForExistence(timeout: 15))
        sleep(1)
        shot("upload-fehler")
    }

    func testShotAufnahme() throws {
        let app = starten(erkennung: nil)
        kameraOeffnen(app)
        schiessen(app, 2)
        shot("aufnahme")
    }

    /// Der Sucher gleich beim Öffnen — der eigentliche Punkt des UX-Blocks: kein
    /// Platzhalter, kein zweiter Screen, der Umschalter bleibt sichtbar.
    func testShotSheetSucher() throws {
        let app = starten(erkennung: nil)
        app.buttons["Neues lernen"].tap()
        XCTAssert(app.buttons["foto-ausloeser"].waitForExistence(timeout: 5))
        sleep(1)
        shot("sheet-sucher")
    }

    /// Der Umschalter führt zu Thema und Text zurück — der Sucher darf sie nicht
    /// verdrängen, sie sind gleichrangige Wege.
    func testUmschalterBleibtErreichbar() throws {
        let app = starten(erkennung: nil)
        app.buttons["Neues lernen"].tap()
        XCTAssert(app.buttons["foto-ausloeser"].waitForExistence(timeout: 5))

        app.buttons["mode-Thema"].tap()
        XCTAssert(app.textFields.firstMatch.waitForExistence(timeout: 3), "Thema-Eingabe muss kommen")
        XCTAssertFalse(app.buttons["foto-ausloeser"].exists, "Ohne Sucher kein Auslöser")

        app.buttons["mode-Foto"].tap()
        XCTAssert(app.buttons["foto-ausloeser"].waitForExistence(timeout: 3), "…und wieder zurück")
    }

    func testShotErkannt() throws {
        let app = starten(erkennung: "erkannt")
        kameraOeffnen(app)
        schiessen(app, 3)
        app.buttons["foto-fertig"].tap()
        XCTAssert(app.staticTexts["foto-titel"].waitForExistence(timeout: 15))
        sleep(1)
        shot("erkannt")
    }

    func testShotUnsicher() throws {
        let app = starten(erkennung: "unsicher")
        kameraOeffnen(app)
        schiessen(app, 2)
        app.buttons["foto-fertig"].tap()
        XCTAssert(app.staticTexts["Hilf kurz nach"].waitForExistence(timeout: 15))
        sleep(1)
        shot("unsicher")
    }

    func testShotDiagramm() throws {
        let app = starten(erkennung: "diagramm")
        kameraOeffnen(app)
        schiessen(app, 2)
        app.buttons["foto-fertig"].tap()
        XCTAssert(app.staticTexts["Schaubild aus deinem Foto"].waitForExistence(timeout: 15))
        sleep(1)
        shot("diagramm")
    }

    // ── Werkzeug ──

    /// Der Upload wird IMMER gefälscht. Ohne das lädt jeder UI-Testlauf echte
    /// Fotos in den Eingang — sie kämen dort nie wieder weg, weil die gefälschte
    /// Erkennung die Function gar nicht erst ruft, die sonst aufräumt.
    private func starten(erkennung: String?, upload: String = "ok") -> XCUIApplication {
        let app = XCUIApplication()
        var args = ["-srs-local-only", "-jobs-local-only", "-foto-fake-kamera",
                    "-foto-fake-upload", upload]
        if let erkennung { args += ["-foto-fake-erkennung", erkennung] }
        app.launchArguments = args
        app.launch()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 10))
        return app
    }

    private func kameraOeffnen(_ app: XCUIApplication) {
        app.buttons["Neues lernen"].tap()
        XCTAssert(app.buttons["foto-ausloeser"].waitForExistence(timeout: 5),
                  "Der Foto-Tab IST der Sucher — kein Zwischenschritt")
    }

    /// Auslösen und jedes Mal am Zähler nachweisen, dass das Foto im Stapel liegt.
    private func schiessen(_ app: XCUIApplication, _ anzahl: Int) {
        let zaehler = app.staticTexts["foto-zaehler"]
        XCTAssert(zaehler.waitForExistence(timeout: 5))
        for i in 1...anzahl {
            app.buttons["foto-ausloeser"].tap()
            expectation(for: NSPredicate(format: "label == %@", "\(i)"), evaluatedWith: zaehler)
            waitForExpectations(timeout: 10)
        }
    }

    /// Das Themenfeld ist ein mehrzeiliges TextField — je nach iOS-Fassung meldet
    /// es sich als TextView oder als TextField.
    private func themaFeld(_ app: XCUIApplication) -> XCUIElement {
        let mehrzeilig = app.textViews["foto-thema"]
        return mehrzeilig.exists ? mehrzeilig : app.textFields["foto-thema"]
    }

    private func shot(_ name: String) {
        let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }
}
