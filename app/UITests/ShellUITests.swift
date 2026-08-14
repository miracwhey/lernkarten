import XCTest

/// Interaktionsbeweis für die drei Ebenen: echte Touch-Events statt Klick-Injektion.
final class ShellUITests: XCTestCase {
    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        // Kein Netz: weder Review-Events noch Bau-Aufträge landen in der echten DB.
        app.launchArguments = ["-srs-local-only", "-jobs-local-only"]
        app.launch()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 5))
    }

    private func shot(_ name: String) {
        let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    // Ebene 3: Lektion-Tap = direkt Lern-Session; Tap navigiert; X führt heim.
    func testLearnSessionTunnel() throws {
        app.staticTexts["Warum wir schlafen"].firstMatch.tap()
        let web = app.webViews.firstMatch
        XCTAssert(web.waitForExistence(timeout: 5))
        sleep(2)
        shot("learn-1-title")
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5)).tap()
        sleep(1)
        shot("learn-2-card2")
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.5)).tap()
        sleep(1)
        shot("learn-3-back-to-title")
        app.buttons["session-close"].tap()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 3))
    }

    // Ebene 3: Üben — Stufen-Tap wechselt die Karte, Nochmal reiht ans Ende, X führt heim.
    func testPracticeGrades() throws {
        app.buttons["Jetzt üben"].tap()
        let label = app.staticTexts["practice-card-label"]
        XCTAssert(label.waitForExistence(timeout: 3))
        sleep(2)
        let first = label.label
        shot("practice-1-first")
        app.buttons["grade-Gut"].tap()
        sleep(1)
        let second = label.label
        XCTAssertNotEqual(first, second, "Gut muss zur nächsten Karte wechseln")
        shot("practice-2-after-gut")
        app.buttons["grade-Nochmal"].tap()
        sleep(1)
        XCTAssertNotEqual(label.label, second, "Nochmal muss die Karte ans Ende reihen")
        app.buttons["practice-close"].tap()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 3))
    }

    // Ebene 2: Sheet — Segmente, Thema-Eingabe, Bestätigen; X bricht ab.
    func testCreateSheetFlow() throws {
        app.buttons["Neues lernen"].tap()
        XCTAssert(app.staticTexts["Erfassen"].waitForExistence(timeout: 3))
        shot("sheet-1-photo")
        app.buttons["Thema"].tap()
        let field = app.textFields.firstMatch
        XCTAssert(field.waitForExistence(timeout: 2))
        field.tap()
        field.typeText("Schwarze Löcher")
        shot("sheet-2-topic")
        app.buttons["Weiter"].tap()
        XCTAssert(app.staticTexts["Schwarze Löcher"].waitForExistence(timeout: 3))
        let build = app.buttons["build-lesson"]
        XCTAssert(build.exists)
        XCTAssert(build.isEnabled, "Thema steht und Standard ist vorgewählt — Bauen ist scharf")
        app.buttons["depth-Kompakt"].tap()
        shot("sheet-3-confirm")
        app.buttons["sheet-close"].tap()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 3))
    }

    // Ebene 2 → Ebene 1: „Lektion bauen" schließt das Sheet und der Bau-Status
    // erscheint als Zeile in der Bibliothek — nirgendwo sonst.
    func testBuildCreatesLibraryStatusRow() throws {
        XCTAssertFalse(app.staticTexts["job-status"].exists, "Ohne Auftrag keine Statuszeile")
        app.buttons["Neues lernen"].tap()
        XCTAssert(app.staticTexts["Erfassen"].waitForExistence(timeout: 3))
        app.buttons["Thema"].tap()
        let field = app.textFields.firstMatch
        XCTAssert(field.waitForExistence(timeout: 2))
        field.tap()
        field.typeText("Photosynthese")
        app.buttons["Weiter"].tap()
        XCTAssert(app.staticTexts["Schwarze Löcher"].exists == false)
        app.buttons["depth-Standard"].tap()
        app.buttons["build-lesson"].tap()

        // Sheet ist zu, Bibliothek trägt die Zeile.
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.staticTexts["Erfassen"].exists, "Das Erstellen-Sheet ist kurzlebig")
        let status = app.staticTexts["job-status"]
        XCTAssert(status.waitForExistence(timeout: 3), "Bau-Status gehört in die Bibliothekszeile")
        XCTAssert(status.label.contains("Wird gebaut"), "Statuszeile: \(status.label)")
        XCTAssert(app.staticTexts["Photosynthese"].exists, "Die Bau-Zeile trägt das Thema als Titel")
        shot("library-1-building-row")
    }
}
