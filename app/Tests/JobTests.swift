import XCTest
@testable import Lernkarten

/// Bau-Auftrag: Freischalt-Logik des Bauen-Knopfs und die Statuszeile der Bibliothek.
final class JobTests: XCTestCase {

    private static let stempel: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private func job(status: String, stage: String? = nil, error: String? = nil,
                     topic: String? = "Photosynthese", kind: String = "topic",
                     depth: String = "kompakt", stageStarted: [String: String] = [:],
                     retries: Int = 0, createdAt: Date = .now) -> GenerationJob {
        GenerationJob(id: UUID(), kind: kind, topic: topic, source: nil,
                      sourceText: kind == "text" ? "Text" : nil, depth: depth,
                      status: status, stage: stage, error: error, createdAt: createdAt,
                      stageStartedRaw: stageStarted, retries: retries)
    }

    /// Stufenzeiten relativ zu `bezug`, so wie der Worker sie schreiben würde.
    private func zeiten(_ paare: [(String, TimeInterval)], bezug: Date) -> [String: String] {
        Dictionary(uniqueKeysWithValues: paare.map { ($0.0, Self.stempel.string(from: bezug.addingTimeInterval($0.1))) })
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

    // ── Stufen, Zeiten, Wiederholung (UX-Block) ──

    /// Die Pipeline meldet nur Anfänge. Eine Stufe ist deshalb genau dann fertig,
    /// wenn die nächste begonnen hat — ihre Dauer ist der Abstand dazwischen.
    func testAbgeschlosseneStufeMisstBisZumNaechstenStart() {
        let jetzt = Date()
        let j = job(status: "running", stage: "karten",
                    stageStarted: zeiten([("quellen", -161), ("karten", -109)], bezug: jetzt))
        let stufen = j.stufen(jetzt: jetzt)

        XCTAssertEqual(stufen[0].zustand, .fertig)
        XCTAssertEqual(stufen[0].dauer.map { Int($0.rounded()) }, 52, "0:52 wie im Mockup")
        XCTAssertEqual(stufen[1].zustand, .laeuft)
        XCTAssertEqual(stufen[1].dauer.map { Int($0.rounded()) }, 109)
        XCTAssertEqual(stufen[2].zustand, .offen)
        XCTAssertNil(stufen[2].dauer)
    }

    /// Beim Fehler bleibt die Stufe stehen, an der es scheiterte — sonst wäre die
    /// Antwort auf „woran?" nicht mehr in der Zeile.
    func testGescheiterteStufeIstMarkiert() {
        let jetzt = Date()
        let j = job(status: "failed", stage: "karten", error: "Faktenprüfung nicht bestanden.",
                    stageStarted: zeiten([("quellen", -161), ("karten", -109)], bezug: jetzt))
        let stufen = j.stufen(jetzt: jetzt)

        XCTAssertEqual(stufen[0].zustand, .fertig)
        XCTAssertEqual(stufen[1].zustand, .gescheitert)
        XCTAssertNil(stufen[1].dauer, "Eine gescheiterte Stufe hat keine Dauer, nur ein Ende")
        XCTAssertEqual(stufen[2].zustand, .offen)
    }

    /// Alt-Aufträge ohne Stufenzeiten dürfen nicht raten: keine Zeiten, kein Beginn.
    func testJobOhneStufenzeitenZeigtKeineDauern() {
        let j = job(status: "running", stage: "quellen")
        let stufen = j.stufen(jetzt: .now)
        XCTAssertEqual(stufen[0].zustand, .laeuft)
        XCTAssertNil(stufen[0].dauer)
        XCTAssertNil(j.bauBeginn)
    }

    /// Die Wartezeit in der Queue gehört nicht in „läuft seit" — der Bau beginnt
    /// mit der ersten Stufe, nicht mit dem Abschicken.
    func testBauBeginnIstDieErsteStufeNichtDieEinstellzeit() {
        let jetzt = Date()
        let j = job(status: "running", stage: "quellen",
                    stageStarted: zeiten([("quellen", -60)], bezug: jetzt),
                    createdAt: jetzt.addingTimeInterval(-600))
        XCTAssertEqual(j.bauBeginn.map { Int(jetzt.timeIntervalSince($0).rounded()) }, 60)
    }

    /// Die Zeile misst den ganzen Bau (2:41), nicht die laufende Stufe (1:49) —
    /// gegen diese Zahl liest man die versprochene Spanne.
    func testKurzStatusTraegtStufeUndGesamtzeit() {
        let jetzt = Date()
        let j = job(status: "running", stage: "karten",
                    stageStarted: zeiten([("quellen", -161), ("karten", -109)], bezug: jetzt))
        XCTAssertEqual(j.kurzStatus(jetzt: jetzt), "Karten schreiben · 2:41")
        XCTAssertEqual(job(status: "queued").kurzStatus(jetzt: jetzt), "In der Warteschlange")
    }

    func testBalkenFuellstandFolgtDerStufe() {
        XCTAssertEqual(job(status: "queued").erreichteStufe, 0)
        XCTAssertEqual(job(status: "running", stage: "quellen").erreichteStufe, 1)
        XCTAssertEqual(job(status: "running", stage: "karten").erreichteStufe, 2)
        XCTAssertEqual(job(status: "running", stage: "pruefen").erreichteStufe, 3)
    }

    /// Der Deckel steht als CHECK in der Tabelle; der Knopf darf nichts anbieten,
    /// was die Datenbank ablehnen würde.
    func testWiederholenNurBeiFehlerUndUnterDemDeckel() {
        XCTAssert(job(status: "failed", retries: 0).kannWiederholen)
        XCTAssert(job(status: "failed", retries: 2).kannWiederholen)
        XCTAssertFalse(job(status: "failed", retries: 3).kannWiederholen, "Drei Wiederholungen sind das Ende")
        XCTAssertFalse(job(status: "running", stage: "karten").kannWiederholen, "Ein laufender Bau wird nicht wiederholt")
    }

    /// Postgres schreibt `now()` mit Mikrosekunden — eine runde Sekunde kommt aber
    /// ohne Bruchteil an. Beide Schreibweisen müssen durchgehen, sonst fehlt genau
    /// dann die Zeit, wenn der Zufall es will.
    func testZeitstempelBeideSchreibweisen() {
        XCTAssertNotNil(JobZeit.parse("2026-08-16T18:22:33.123456+00:00"))
        XCTAssertNotNil(JobZeit.parse("2026-08-16T18:22:33+00:00"))
        XCTAssertNil(JobZeit.parse("gestern"))
    }

    func testMinutenSekundenFormat() {
        XCTAssertEqual(JobZeit.mmss(52), "0:52")
        XCTAssertEqual(JobZeit.mmss(161), "2:41")
        XCTAssertEqual(JobZeit.mmss(-5), "0:00", "Eine Uhr, die rückwärts läuft, zeigt nichts Negatives")
    }

    /// Die Tiefe-Kacheln versprechen Zeiten — kompakt ist gemessen, der Rest
    /// hochgerechnet, und der Satz muss diesen Unterschied sagen.
    func testDauerSaetzeTrennenGemessenVonHochgerechnet() {
        XCTAssert(Depth.kompakt.gemessen)
        XCTAssert(Depth.kompakt.dauerSatz.contains("meist 4 bis 6 Minuten"))
        XCTAssertFalse(Depth.standard.gemessen)
        XCTAssert(Depth.standard.dauerSatz.contains("hochgerechnet"))
        XCTAssert(Depth.tief.dauerSatz.contains("hochgerechnet"))
        XCTAssert(Depth.kompakt.estimate.contains("4–6 Min"))
    }

    /// Der Auftrag geht zurück in die Queue — mit sauberem Stand, aber gezählter
    /// Wiederholung.
    func testWiederholungLeertDenAltenStand() {
        let alt = job(status: "failed", stage: "karten", error: "kaputt",
                      stageStarted: zeiten([("quellen", -161)], bezug: .now), retries: 1)
        let neu = alt.zurueckInDieQueue()
        XCTAssertEqual(neu.id, alt.id, "Es bleibt derselbe Auftrag, kein zweiter")
        XCTAssertEqual(neu.status, "queued")
        XCTAssertNil(neu.stage)
        XCTAssertNil(neu.error)
        XCTAssertNil(neu.bauBeginn, "Die Zeiten des alten Versuchs gehören nicht zum neuen")
        XCTAssertEqual(neu.retries, 2)
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
