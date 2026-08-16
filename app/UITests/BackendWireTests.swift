import XCTest

/// On-demand-Wire-Beweis gegen das echte Supabase-Backend (schreibt echte Rows).
/// Läuft nur mit REAL_BACKEND=1 im Test-Runner-Prozess, sonst übersprungen:
///   TEST_RUNNER_REAL_BACKEND=1 xcodebuild test …
/// (als Shell-Env, NIE als xcodebuild-Argument — sonst wird daraus ein Build-Setting)
final class BackendWireTests: XCTestCase {
    private func skipUnlessReal() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["REAL_BACKEND"] == "1")
    }

    func testGradeWritesEventToSupabase() throws {
        try skipUnlessReal()
        let app = XCUIApplication()
        app.launch()   // ohne -srs-local-only: echter Store
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 5))
        app.buttons["Jetzt üben"].tap()
        XCTAssert(app.staticTexts["practice-card-label"].waitForExistence(timeout: 3))
        sleep(3)   // Session + Canvas settle
        app.buttons["grade-Gut"].firstMatch.tap()
        sleep(4)   // Outbox-Flush ans Netz
    }

    /// Insert → Select-Roundtrip über die App: der Job muss nach dem Tap aus der
    /// Datenbank zurückkommen (die Statuszeile speist sich aus dem Refresh, nicht
    /// aus einem lokalen Optimismus — der lokale Pfad ist nur mit -jobs-local-only aktiv).
    func testBuildInsertsJobAndReadsItBack() throws {
        try skipUnlessReal()
        let app = XCUIApplication()
        app.launch()   // echter JobStore
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 5))

        app.buttons["Neues lernen"].tap()
        XCTAssert(app.staticTexts["sheet-kicker"].waitForExistence(timeout: 3))
        app.buttons["mode-Thema"].tap()
        let field = app.textFields.firstMatch
        XCTAssert(field.waitForExistence(timeout: 2))
        field.tap()
        // WIRE_TOPIC setzt ein echtes Thema für den End-zu-End-Lauf (der Worker baut
        // daraus wirklich eine Lektion); ohne Vorgabe bleibt es eine reine Wire-Probe.
        let topic = ProcessInfo.processInfo.environment["WIRE_TOPIC"]
            ?? "Wire-Probe \(Int(Date().timeIntervalSince1970))"
        field.typeText(topic)
        app.buttons["Weiter"].tap()
        app.buttons["depth-Standard"].tap()
        app.buttons["build-lesson"].tap()

        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 5))
        XCTAssert(app.staticTexts[topic].waitForExistence(timeout: 15),
                  "Der Job muss aus der DB zurückgelesen werden")
        let status = app.buttons["job-zeile"]
        XCTAssert(status.waitForExistence(timeout: 5))
        XCTAssert(status.label.contains("Wird gebaut"), "Statuszeile: \(status.label)")

        shot("wire-job-row")
    }

    /// Abnahme der gebauten Lektion: sie steht in der Bibliothek, öffnet sich und
    /// die Karten lassen sich durchtappen — gleicher Renderer-Pfad wie die
    /// gebündelten Lektionen. Titel über WIRE_LESSON_TITLE, weil ihn das Modell wählt.
    func testBuiltLessonOpensAndAdvances() throws {
        try skipUnlessReal()
        let title = try XCTUnwrap(ProcessInfo.processInfo.environment["WIRE_LESSON_TITLE"],
                                  "WIRE_LESSON_TITLE setzen (Titel der gebauten Lektion)")
        let app = XCUIApplication()
        app.launch()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 5))

        let row = app.staticTexts[title]
        XCTAssert(row.waitForExistence(timeout: 15), "Gebaute Lektion fehlt in der Bibliothek")
        shot("built-0-library")

        row.tap()
        let web = app.webViews.firstMatch
        XCTAssert(web.waitForExistence(timeout: 5))
        sleep(3)
        shot("built-1-title-card")

        web.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5)).tap()
        sleep(2)
        shot("built-2-card2")
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5)).tap()
        sleep(2)
        shot("built-3-card3")

        app.buttons["session-close"].tap()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 3))
    }

    /// Foto-Fluss gegen die echte Edge Function `erkenne-foto`: Fake-Kamera (der
    /// Simulator hat keine), aber echter Function-Aufruf mit den echten Testfotos
    /// der Serie B. Es wird NICHT gebaut — der Lauf prüft die Erkennungs-Leitung,
    /// nicht die Job-Queue, und legt darum keine Row an.
    func testFotoErkennungWireGegenEdgeFunction() throws {
        try skipUnlessReal()
        let app = XCUIApplication()
        app.launchArguments = ["-srs-local-only", "-foto-fake-kamera"]
        app.launch()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 10))

        app.buttons["Neues lernen"].tap()
        XCTAssert(app.buttons["foto-ausloeser"].waitForExistence(timeout: 5))

        let zaehler = app.staticTexts["foto-zaehler"]
        for i in 1...3 {
            app.buttons["foto-ausloeser"].tap()
            expectation(for: NSPredicate(format: "label == %@", "\(i)"), evaluatedWith: zaehler)
            waitForExpectations(timeout: 10)
        }

        app.buttons["foto-fertig"].tap()

        // 60s: echter Modell-Aufruf inkl. Bild-Upload.
        let titel = app.staticTexts["foto-titel"]
        XCTAssert(titel.waitForExistence(timeout: 60), "Erkennung kam nicht zurück")
        XCTAssertFalse(app.staticTexts["foto-fehler"].exists,
                       "Technischer Fehler statt Erkennung — Function-Leitung prüfen")
        shot("wire-foto-erkennung")
        print("WIRE-ERKENNUNG Titel: \(titel.label)")
    }

    private func shot(_ name: String) {
        let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }
}
