import XCTest
@testable import Lernkarten

/// Bau-Auftrag: Freischalt-Logik des Bauen-Knopfs und die Statuszeile der Bibliothek.
final class JobTests: XCTestCase {

    private func job(status: String, stage: String? = nil, error: String? = nil,
                     topic: String? = "Photosynthese", kind: String = "topic") -> GenerationJob {
        GenerationJob(id: UUID(), kind: kind, topic: topic, source: nil,
                      sourceText: kind == "text" ? "Text" : nil,
                      status: status, stage: stage, error: error, createdAt: .now)
    }

    // ── Freischalt-Logik ──
    func testBuildNeedsInput() {
        XCTAssertFalse(CreateSheetView.canBuild(mode: .thema, topic: "", ownText: "", depth: .standard))
        XCTAssertFalse(CreateSheetView.canBuild(mode: .thema, topic: "   ", ownText: "", depth: .standard))
        XCTAssertFalse(CreateSheetView.canBuild(mode: .text, topic: "Thema da", ownText: "", depth: .standard),
                       "Im Text-Modus zählt nur der Text, nicht ein Thema aus dem anderen Segment")
    }

    func testBuildNeedsDepth() {
        XCTAssertFalse(CreateSheetView.canBuild(mode: .thema, topic: "Photosynthese", ownText: "", depth: nil))
    }

    func testBuildEnabledWithInputAndDepth() {
        XCTAssert(CreateSheetView.canBuild(mode: .thema, topic: "Photosynthese", ownText: "", depth: .standard))
        XCTAssert(CreateSheetView.canBuild(mode: .text, topic: "", ownText: "Ein eigener Text", depth: .tief))
    }

    // ── Tiefe → Spaltenwert ──
    func testDepthSlugsMatchColumnCheck() {
        XCTAssertEqual(Depth.allCases.map(\.slug), ["kompakt", "standard", "tief"])
    }

    // ── Statuszeile (Wording aus Mockup S4) ──
    func testStatusLinePerStage() {
        XCTAssertEqual(job(status: "queued").statusLine, "Wird gebaut – In der Warteschlange")
        XCTAssertEqual(job(status: "running", stage: "quellen").statusLine, "Wird gebaut – Quellen sammeln")
        XCTAssertEqual(job(status: "running", stage: "karten").statusLine, "Wird gebaut – Karten schreiben")
        XCTAssertEqual(job(status: "running", stage: "pruefen").statusLine, "Wird gebaut – Fakten & Bilder prüfen")
    }

    func testFailedShowsErrorText() {
        let j = job(status: "failed", error: "Alle Modelle sind gerade am Kontingent-Limit.")
        XCTAssert(j.failed)
        XCTAssertEqual(j.statusLine, "Alle Modelle sind gerade am Kontingent-Limit.")
    }

    func testFailedWithoutErrorStillReadable() {
        XCTAssertEqual(job(status: "failed", error: nil).statusLine, "Der Bau ist fehlgeschlagen.")
    }

    func testOwnTextJobHasTitle() {
        XCTAssertEqual(job(status: "queued", topic: nil, kind: "text").displayTitle, "Eigener Text")
    }

    // ── Remote-Lektion baut denselben Lesson-Typ wie eine Bundle-Datei ──
    func testRemoteLessonMapsToRenderablePaths() throws {
        let cards: [[String: Any]] = [
            ["type": "title", "eyebrow": "Biologie · Fachgebiet", "title": "Photosynthese"],
            ["type": "curve", "relation": "trend", "text": "Licht steigt"],
            ["type": "quiz", "question": "?"],
            ["type": "insight", "quote": "Zitat"],
        ]
        let lesson = try XCTUnwrap(Lesson.make(id: "photosynthese-a1b2c3", title: "Photosynthese",
                                               source: "Dossier", cards: cards))
        XCTAssertEqual(lesson.id, "photosynthese-a1b2c3")
        XCTAssertEqual(lesson.cardsJSON.count, 4)
        XCTAssertEqual(lesson.practiceIndices, [1, 2, 3], "Die Titelkarte wird nie geübt")
        XCTAssertEqual(lesson.author, "Fachgebiet")
        // Jede Karte muss als JSON an window.renderCard() gehen können.
        for json in lesson.cardsJSON {
            XCTAssertNotNil(try? JSONSerialization.jsonObject(with: Data(json.utf8)))
        }
    }

    func testEmptyCardsIsNoLesson() {
        XCTAssertNil(Lesson.make(id: "x", title: "X", source: "", cards: []))
    }
}
