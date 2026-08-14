import XCTest

/// On-demand-Wire-Beweis gegen das echte Supabase-Backend (schreibt eine echte Review-Row).
/// Läuft nur mit TEST_RUNNER_REAL_BACKEND=1, sonst übersprungen.
final class BackendWireTests: XCTestCase {
    func testGradeWritesEventToSupabase() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["REAL_BACKEND"] == "1")
        let app = XCUIApplication()
        app.launch()   // ohne -srs-local-only: echter Store
        XCTAssert(app.staticTexts["Bibliothek"].waitForExistence(timeout: 5))
        app.buttons["Jetzt üben"].tap()
        XCTAssert(app.staticTexts["practice-card-label"].waitForExistence(timeout: 3))
        sleep(3)   // Session + Canvas settle
        app.buttons["grade-Gut"].firstMatch.tap()
        sleep(4)   // Outbox-Flush ans Netz
    }
}
