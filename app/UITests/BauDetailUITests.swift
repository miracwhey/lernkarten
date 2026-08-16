import XCTest

/// Die Bau-Ebene aus dem UX-Block: die Bibliothekszeile führt weiter, die
/// Detail-Ansicht sagt was läuft und wie lange, und ein gescheiterter Auftrag ist
/// keine Sackgasse. Die Aufträge kommen aus `-jobs-fake` — mit echten Feldern und
/// echten Stufenzeiten, aber ohne minutenlangen Bau.
final class BauDetailUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func starten(_ art: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-srs-local-only", "-jobs-local-only", "-jobs-fake", art]
        app.launch()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 10))
        return app
    }

    /// Vor dem UX-Block war die Zeile eine Sackgasse: Zustand ohne Weg dahinter.
    func testBauZeileFuehrtInsDetail() throws {
        let app = starten("laufend")

        let zeile = app.buttons["job-zeile"].firstMatch
        XCTAssert(zeile.waitForExistence(timeout: 5))
        XCTAssert(zeile.label.contains("Karten schreiben"), "Die Zeile trägt die Stufe: \(zeile.label)")
        XCTAssert(zeile.label.contains(":"), "…und die Zeit: \(zeile.label)")

        zeile.tap()

        XCTAssert(app.staticTexts["bau-kicker"].waitForExistence(timeout: 5), "Die Detail-Ebene muss aufgehen")
        XCTAssertEqual(app.staticTexts["bau-kicker"].label, "WIRD GEBAUT", "Kicker steht in microCaps")
        XCTAssert(app.staticTexts["Graffiti macht Stadt"].exists, "Der Titel des Auftrags")
        XCTAssert(app.staticTexts["Ihme-Passage, Hannover · Kompakt"].exists, "Quelle · Tiefe")

        // Alle drei Stufen stehen da — erledigt, laufend, offen.
        for stufe in ["quellen", "karten", "pruefen"] {
            XCTAssert(stufenZeile(app, stufe).exists, "Stufe \(stufe) fehlt in der Liste")
        }
        XCTAssert(stufenZeile(app, "quellen").label.contains("0:52"),
                  "Die erledigte Stufe zeigt ihre gemessene Dauer: \(stufenZeile(app, "quellen").label)")

        let laufzeit = app.staticTexts["bau-laufzeit"]
        XCTAssert(laufzeit.exists)
        XCTAssert(laufzeit.label.hasPrefix("Läuft seit"), "Laufzeit: \(laufzeit.label)")

        app.buttons["bau-zurueck"].tap()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 3))
    }

    /// Ohne den Knopf verspricht der Fehlertext einen Weg, den die Ansicht nicht
    /// hat: Thema, Quelle und erkannter Text stehen im gescheiterten Job.
    func testGescheiterterBauLaesstSichWiederholen() throws {
        let app = starten("gescheitert")

        app.buttons["job-zeile"].firstMatch.tap()
        XCTAssert(app.staticTexts["bau-kicker"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["bau-kicker"].label, "BAU GESCHEITERT")
        XCTAssert(app.staticTexts["bau-fehlertext"].exists, "Der Grund steht im Klartext da")
        XCTAssert(stufenZeile(app, "karten").exists)

        let wiederholen = app.buttons["bau-wiederholen"]
        XCTAssert(wiederholen.exists, "Der gescheiterte Auftrag braucht einen Weg weiter")
        wiederholen.tap()

        // Derselbe Auftrag, zurück in der Warteschlange — keine zweite Zeile.
        let kicker = app.staticTexts["bau-kicker"]
        XCTAssert(kicker.waitForExistence(timeout: 5))
        XCTAssertEqual(kicker.label, "WIRD GEBAUT", "Nach der Wiederholung läuft er wieder")
        XCTAssertFalse(app.buttons["bau-wiederholen"].exists, "Ein laufender Bau wird nicht wiederholt")

        app.buttons["bau-zurueck"].tap()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.buttons.matching(identifier: "job-zeile").count, 1,
                       "Die Wiederholung legt keinen zweiten Auftrag an")
    }

    // ── Shots ──

    func testShotBibliothekMitBauzeile() throws {
        let app = starten("laufend")
        XCTAssert(app.buttons["job-zeile"].firstMatch.waitForExistence(timeout: 5))
        sleep(1)
        shot("bibliothek-bauzeile")
    }

    func testShotBauDetail() throws {
        let app = starten("laufend")
        app.buttons["job-zeile"].firstMatch.tap()
        XCTAssert(app.staticTexts["bau-kicker"].waitForExistence(timeout: 5))
        sleep(1)
        shot("bau-detail")
    }

    func testShotBauFehler() throws {
        let app = starten("gescheitert")
        app.buttons["job-zeile"].firstMatch.tap()
        XCTAssert(app.staticTexts["bau-fehlertext"].waitForExistence(timeout: 5))
        sleep(1)
        shot("bau-fehler")
    }

    /// Die zusammengefasste Stufenzeile meldet sich je nach iOS-Fassung als
    /// otherElement oder als StaticText — beide Wege gelten.
    private func stufenZeile(_ app: XCUIApplication, _ stufe: String) -> XCUIElement {
        let anders = app.otherElements["stufe-\(stufe)"].firstMatch
        return anders.exists ? anders : app.staticTexts["stufe-\(stufe)"].firstMatch
    }

    private func shot(_ name: String) {
        let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }
}
