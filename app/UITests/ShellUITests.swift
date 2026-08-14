import XCTest

/// Interaktionsbeweis für die drei Ebenen: echte Touch-Events statt Klick-Injektion.
final class ShellUITests: XCTestCase {
    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
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

    // Ebene 2: Sheet — Segmente, Thema-Eingabe, Bestätigen; Bauen bleibt bis Worker aus; X bricht ab.
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
        let build = app.buttons["Lektion bauen"]
        XCTAssert(build.exists)
        XCTAssertFalse(build.isEnabled, "Bauen ist erst mit dem Worker scharf")
        app.buttons["depth-Kompakt"].tap()
        shot("sheet-3-confirm")
        app.buttons["sheet-close"].tap()
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 3))
    }
}
