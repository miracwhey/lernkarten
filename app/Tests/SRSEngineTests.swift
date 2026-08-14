import XCTest
@testable import Lernkarten

final class SRSEngineTests: XCTestCase {
    let day: TimeInterval = 86400
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    func testFirstGradesMatchMockupIntervals() {
        XCTAssertEqual(SRSEngine.apply(nil, grade: .again, at: t0).interval, 600)
        XCTAssertEqual(SRSEngine.apply(nil, grade: .hard, at: t0).interval, 2 * day)
        XCTAssertEqual(SRSEngine.apply(nil, grade: .good, at: t0).interval, 4 * day)
        XCTAssertEqual(SRSEngine.apply(nil, grade: .easy, at: t0).interval, 8 * day)
    }

    func testGoodGrowsByEase() {
        var s = SRSEngine.apply(nil, grade: .good, at: t0)                    // 4d, ease 2.5
        s = SRSEngine.apply(s, grade: .good, at: t0.addingTimeInterval(4 * day))
        XCTAssertEqual(s.interval, 10 * day, accuracy: 1)                     // 4d * 2.5
        XCTAssertEqual(s.due.timeIntervalSince(t0), 14 * day, accuracy: 1)
        XCTAssertEqual(s.reps, 2)
    }

    func testAgainResetsAndLowersEase() {
        var s = SRSEngine.apply(nil, grade: .good, at: t0)
        s = SRSEngine.apply(s, grade: .again, at: t0.addingTimeInterval(day))
        XCTAssertEqual(s.reps, 0)
        XCTAssertEqual(s.ease, 2.3, accuracy: 0.001)
        XCTAssertEqual(s.interval, 600)
    }

    func testEaseFloor() {
        var s: CardSRS? = nil
        for i in 0..<12 {
            s = SRSEngine.apply(s, grade: .again, at: t0.addingTimeInterval(Double(i) * 600))
        }
        XCTAssertEqual(s!.ease, 1.3, accuracy: 0.001)
    }

    func testEasyRaisesEase() {
        let s = SRSEngine.apply(nil, grade: .easy, at: t0)
        XCTAssertEqual(s.ease, 2.65, accuracy: 0.001)
    }

    func testReplayIsOrderIndependent() {
        let e1 = ReviewEvent(lessonSlug: "a", cardIndex: 1, grade: .good, reviewedAt: t0)
        let e2 = ReviewEvent(lessonSlug: "a", cardIndex: 1, grade: .good, reviewedAt: t0.addingTimeInterval(4 * day))
        let e3 = ReviewEvent(lessonSlug: "b", cardIndex: 2, grade: .again, reviewedAt: t0)
        let sorted = SRSEngine.replay([e1, e2, e3])
        let shuffled = SRSEngine.replay([e3, e2, e1])
        XCTAssertEqual(sorted[CardKey(slug: "a", index: 1)]?.interval, 10 * day)
        XCTAssertEqual(sorted[CardKey(slug: "a", index: 1)]?.interval,
                       shuffled[CardKey(slug: "a", index: 1)]?.interval)
        XCTAssertEqual(sorted[CardKey(slug: "b", index: 2)]?.reps, 0)
    }

    func testNeverReviewedIsDue() {
        let srs: [CardKey: CardSRS] = [:]
        let lesson = Lesson(id: "x", title: "X", source: "", eyebrow: "",
                            cardsJSON: ["{}", "{}", "{}"], cardTypes: ["title", "curve", "quiz"])
        XCTAssertEqual(lesson.dueIndices(srs), [1, 2])
    }

    func testDueFiltersFutureCards() {
        let lesson = Lesson(id: "x", title: "X", source: "", eyebrow: "",
                            cardsJSON: ["{}", "{}", "{}"], cardTypes: ["title", "curve", "quiz"])
        var srs: [CardKey: CardSRS] = [:]
        srs[CardKey(slug: "x", index: 1)] = SRSEngine.apply(nil, grade: .good, at: .now)  // fällig in 4d
        srs[CardKey(slug: "x", index: 2)] = SRSEngine.apply(nil, grade: .good, at: .now.addingTimeInterval(-5 * day))
        XCTAssertEqual(lesson.dueIndices(srs), [2])
    }

    func testFormat() {
        XCTAssertEqual(SRSEngine.format(600), "10 Min")
        XCTAssertEqual(SRSEngine.format(2 * day), "2 Tage")
        XCTAssertEqual(SRSEngine.format(10 * day), "10 Tage")
        XCTAssertEqual(SRSEngine.format(28 * day), "4 Wo")
    }
}
