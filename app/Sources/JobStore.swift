import Foundation
import Supabase

/// Die drei Stufen der Pipeline. Mehr Auflösung gibt es nicht — jede feinere
/// Anzeige wäre erfunden, und genau das soll die Wartezeit nicht sein.
enum BauStufe: String, CaseIterable, Identifiable {
    case quellen, karten, pruefen
    var id: String { rawValue }

    /// Wording 1:1 aus Mockup S4.
    var name: String {
        switch self {
        case .quellen: return "Quellen sammeln"
        case .karten: return "Karten schreiben"
        case .pruefen: return "Fakten & Bilder prüfen"
        }
    }
}

/// Eine Stufe, wie die Detail-Ansicht sie zeigt: Zustand und — wo gemessen —
/// die Dauer. `dauer` ist bei einer laufenden Stufe die bisher verstrichene Zeit.
struct StufenStand: Equatable, Identifiable {
    enum Zustand { case fertig, laeuft, offen, gescheitert }

    let stufe: BauStufe
    let zustand: Zustand
    let dauer: TimeInterval?

    var id: String { stufe.rawValue }
}

/// Ein Bau-Auftrag aus public.generation_jobs. Der Client legt ihn an und liest ihn —
/// fortschreiben darf ihn nur der Worker (UPDATE ist für Client-Rollen entzogen);
/// die einzige Ausnahme ist `retry_job`, die den eigenen gescheiterten Auftrag
/// zurück in die Queue setzt.
struct GenerationJob: Codable, Identifiable, Equatable {
    let id: UUID
    let kind: String
    let topic: String?
    /// Bestätigte Quelle des Foto-Flusses (Buchtitel, Autor). Nullbar und in jeder
    /// Richtung optional: Jobs aus der Zeit vor der Spalte tragen sie nicht.
    let source: String?
    let sourceText: String?
    /// Nullbar, obwohl die Spalte es nicht ist: ein knapperes select oder eine
    /// Zeile aus der Zeit vor der Spalte soll lesbar bleiben. Fehlt sie, wird die
    /// Tiefe nicht geraten — sie steht dann einfach nicht in der Ansicht.
    let depth: String?
    let status: String
    let stage: String?
    let error: String?
    let createdAt: Date
    /// Stufe → Startzeit als Rohtext, wie Postgres sie in jsonb ablegt. Bewusst
    /// nicht als `[String: Date]` decodiert: die Datums-Strategie des Decoders
    /// müsste dann für ein verschachteltes Feld mitraten, während hier genau
    /// zwei Schreibweisen vorkommen können (mit und ohne Sekundenbruchteile).
    let stageStartedRaw: [String: String]
    /// Vom Nutzer angestoßene Wiederholungen. Deckel 3 — der Constraint in der
    /// Tabelle ist die Autorität, der Knopf hier nur ihr Spiegel.
    let retries: Int

    enum CodingKeys: String, CodingKey {
        case id, kind, topic, source, depth, status, stage, error, retries
        case sourceText = "source_text"
        case createdAt = "created_at"
        case stageStartedRaw = "stage_started"
    }

    var failed: Bool { status == "failed" }
    var queued: Bool { status == "queued" }
    var tiefe: Depth? { depth.flatMap { slug in Depth.allCases.first { $0.slug == slug } } }
    var laufendeStufe: BauStufe? { stage.flatMap(BauStufe.init(rawValue:)) }
    var kannWiederholen: Bool { failed && retries < 3 }

    var stageStarted: [BauStufe: Date] {
        var map: [BauStufe: Date] = [:]
        for (schluessel, text) in stageStartedRaw {
            if let stufe = BauStufe(rawValue: schluessel), let zeit = JobZeit.parse(text) {
                map[stufe] = zeit
            }
        }
        return map
    }

    /// Beginn des laufenden Bauversuchs — NICHT die Einstellzeit: zwischen beiden
    /// liegt die Warteschlange, und die in „läuft seit" einzurechnen wäre gelogen.
    var bauBeginn: Date? { stageStarted[.quellen] }

    /// Titel der Bibliothekszeile — beim eigenen Text gibt es kein Thema.
    var displayTitle: String {
        if let topic, !topic.isEmpty { return topic }
        return "Eigener Text"
    }

    /// Statuszeile der Bibliothek. Wording 1:1 aus Mockup S4 („Quellen sammeln",
    /// „Karten schreiben", „Fakten & Bilder prüfen") — die echten Pipeline-Stufen.
    var statusLine: String {
        if failed { return error ?? "Der Bau ist fehlgeschlagen." }
        guard let laufendeStufe else { return "Wird gebaut – In der Warteschlange" }
        return "Wird gebaut – \(laufendeStufe.name)"
    }

    /// Kurzfassung für die Bibliothekszeile: „Karten schreiben · 2:41". Die Zeit
    /// ist die des ganzen Baus, nicht die der Stufe — in der Übersicht misst man
    /// gegen die Erwartung („meist 4 bis 6 Minuten"), die Stufenzeiten stehen eine
    /// Ebene tiefer. So steht es auch im abgenommenen Mockup.
    func kurzStatus(jetzt: Date) -> String {
        if failed { return "Bau gescheitert" }
        guard let laufendeStufe else { return "In der Warteschlange" }
        guard let beginn = bauBeginn else { return laufendeStufe.name }
        return "\(laufendeStufe.name) · \(JobZeit.mmss(jetzt.timeIntervalSince(beginn)))"
    }

    /// Anzahl abgeschlossener oder laufender Stufen — Füllstand des Balkens.
    var erreichteStufe: Int {
        guard let laufendeStufe else { return 0 }
        return (BauStufe.allCases.firstIndex(of: laufendeStufe) ?? 0) + 1
    }

    /// Dasselbe, was `retry_job` in der Datenbank tut — für den netzlosen Testlauf.
    func zurueckInDieQueue() -> GenerationJob {
        GenerationJob(id: id, kind: kind, topic: topic, source: source, sourceText: sourceText,
                      depth: depth, status: "queued", stage: nil, error: nil, createdAt: createdAt,
                      stageStartedRaw: [:], retries: retries + 1)
    }

    /// Alle drei Stufen mit Zustand und Dauer. Eine Stufe gilt als fertig, sobald
    /// eine spätere begonnen hat — die Pipeline meldet keine Enden, nur Anfänge.
    func stufen(jetzt: Date) -> [StufenStand] {
        let alle = BauStufe.allCases
        let zeiten = stageStarted
        return alle.enumerated().map { index, stufe in
            let start = zeiten[stufe]
            let naechsterStart = alle.dropFirst(index + 1).compactMap { zeiten[$0] }.first
            if let start, let naechsterStart {
                return StufenStand(stufe: stufe, zustand: .fertig,
                                   dauer: naechsterStart.timeIntervalSince(start))
            }
            if stufe == laufendeStufe {
                return StufenStand(stufe: stufe,
                                   zustand: failed ? .gescheitert : .laeuft,
                                   dauer: failed ? nil : start.map { jetzt.timeIntervalSince($0) })
            }
            // Startzeit ohne Nachfolger und ohne laufende Stufe: der Auftrag ist
            // an dieser Stelle stehengeblieben, gezählt wird sie trotzdem.
            return StufenStand(stufe: stufe, zustand: start == nil ? .offen : .fertig, dauer: nil)
        }
    }
}

extension GenerationJob {
    /// Eigenes Decodieren, weil ein fehlendes Feld die ganze Liste kosten würde:
    /// wer eine Spalte hinzufügt, entwertet sonst jede Zeile, die sie noch nicht
    /// trägt. Was fehlt, bekommt einen ehrlichen Leerwert — nie einen geratenen.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        kind = try c.decode(String.self, forKey: .kind)
        topic = try c.decodeIfPresent(String.self, forKey: .topic)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        sourceText = try c.decodeIfPresent(String.self, forKey: .sourceText)
        depth = try c.decodeIfPresent(String.self, forKey: .depth)
        status = try c.decode(String.self, forKey: .status)
        stage = try c.decodeIfPresent(String.self, forKey: .stage)
        error = try c.decodeIfPresent(String.self, forKey: .error)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        stageStartedRaw = try c.decodeIfPresent([String: String].self, forKey: .stageStartedRaw) ?? [:]
        retries = try c.decodeIfPresent(Int.self, forKey: .retries) ?? 0
    }
}

/// Zeitformate der Bau-Anzeige an einer Stelle: das Lesen der Postgres-Zeitstempel
/// und das mm:ss, in dem jede Dauer in der Oberfläche steht.
enum JobZeit {
    private static let mitBruchteilen: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let ohneBruchteile: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Postgres schreibt `now()` mit Mikrosekunden, aber eine runde Sekunde kommt
    /// ohne Bruchteil an — beide Schreibweisen müssen durchgehen.
    static func parse(_ text: String) -> Date? {
        mitBruchteilen.date(from: text) ?? ohneBruchteile.date(from: text)
    }

    static func mmss(_ dauer: TimeInterval) -> String {
        let sekunden = max(0, Int(dauer.rounded()))
        return String(format: "%d:%02d", sekunden / 60, sekunden % 60)
    }
}

/// Einfüge-Form: nur die Felder, die der Client setzen darf. user_id kommt aus
/// dem Default auth.uid(), status/attempts aus den Spalten-Defaults.
private struct NewJob: Encodable {
    let kind: String
    let topic: String?
    let source: String?
    let source_text: String?
    let depth: String
}

/// Gemeinsamer Supabase-Client für Reviews und Jobs — eine anonyme Sitzung,
/// nicht zwei konkurrierende.
enum Supa {
    static let client = SupabaseClient(supabaseURL: Config.supabaseURL, supabaseKey: Config.supabaseKey)

    static func signInIfNeeded() async throws {
        if (try? await client.auth.session) == nil {
            try await client.auth.signInAnonymously()
        }
    }
}

/// Bau-Aufträge und die daraus entstandenen Lektionen. Realtime hält die
/// Statuszeile aktuell; der Refresh beim Wechsel in den Vordergrund ist der
/// zweite Weg, falls die Verbindung im Hintergrund weggebrochen ist.
/// UITests laufen mit "-jobs-local-only" komplett ohne Netz.
@MainActor
final class JobStore: ObservableObject {
    @Published private(set) var jobs: [GenerationJob] = []
    @Published private(set) var remoteLessons: [Lesson] = []
    /// Was beim Anlegen oder Wiederholen eines Auftrags schiefging — beides sind
    /// Schreibversuche auf dieselbe Tabelle und teilen sich die Meldezeile.
    @Published var auftragsFehler: String?

    private let localOnly = ProcessInfo.processInfo.arguments.contains("-jobs-local-only")
    private var channel: RealtimeChannelV2?
    private var listener: Task<Void, Never>?

    func start() async {
        guard !localOnly else {
            if let art = Self.fakeArt { jobs = [Self.fakeJob(art)] }
            return
        }
        do {
            try await Supa.signInIfNeeded()
        } catch {
            print("JobStore ohne Sitzung: \(error)")
            return
        }
        await refresh()
        await listen()
    }

    /// Offene und gescheiterte Jobs plus die eigenen Lektionen. Fertige Jobs
    /// verschwinden aus der Liste — ihre Lektion steht dann in der Bibliothek.
    func refresh() async {
        guard !localOnly else { return }
        do {
            jobs = try await Supa.client.from("generation_jobs")
                .select("id, kind, topic, source, source_text, depth, status, stage, error, created_at, stage_started, retries")
                .in("status", values: ["queued", "running", "failed"])
                .order("created_at", ascending: false)
                .execute().value
        } catch {
            print("JobStore Jobs: \(error)")
        }
        do {
            remoteLessons = try await fetchLessons()
        } catch {
            print("JobStore Lektionen: \(error)")
        }
    }

    /// Lektionen der eigenen Rows — gleicher Bauweg wie die gebündelten Dateien,
    /// damit Renderer und SRS denselben Pfad sehen.
    private func fetchLessons() async throws -> [Lesson] {
        let data = try await Supa.client.from("lessons")
            .select("slug, title, source, cards")
            .order("created_at", ascending: false)
            .execute().data
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return rows.compactMap { row in
            guard let slug = row["slug"] as? String,
                  let title = row["title"] as? String,
                  let cards = row["cards"] as? [[String: Any]] else { return nil }
            return Lesson.make(id: slug, title: title, source: row["source"] as? String ?? "", cards: cards)
        }
    }

    func enqueue(mode: CaptureMode, topic: String, ownText: String, depth: Depth) async {
        let kind = mode == .text ? "text" : "topic"
        let trimmed = (kind == "text" ? ownText : topic).trimmingCharacters(in: .whitespacesAndNewlines)
        await insert(NewJob(
            kind: kind,
            topic: kind == "topic" ? trimmed : nil,
            source: nil,
            source_text: kind == "text" ? trimmed : nil,
            depth: depth.slug
        ))
    }

    /// Foto-Auftrag: bestätigtes Thema, bestätigte Quelle (darf fehlen) und der
    /// OCR-Block der Fotos. Die Längen sind die der Spalten-CHECKs — ein zu langes
    /// Thema soll den Auftrag kürzen, nicht scheitern lassen.
    func enqueuePhoto(topic: String, source: String?, sourceText: String, depth: Depth) async {
        let thema = String(topic.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
        let quelle = source
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .flatMap { $0.isEmpty ? nil : String($0.prefix(300)) }
        await insert(NewJob(
            kind: "photo",
            topic: thema,
            source: quelle,
            source_text: String(sourceText.prefix(FotoQuelltext.maxLaenge)),
            depth: depth.slug
        ))
    }

    /// „Noch einmal bauen": derselbe Auftrag geht zurück in die Queue. Thema,
    /// Quelle und erkannter Text stehen im gescheiterten Job — es braucht kein
    /// neues Foto und keinen zweiten Eintrag in der Bibliothek.
    func wiederholen(_ job: GenerationJob) async {
        guard !localOnly else {
            guard let i = jobs.firstIndex(where: { $0.id == job.id }) else { return }
            jobs[i] = job.zurueckInDieQueue()
            return
        }
        do {
            try await Supa.signInIfNeeded()
            try await Supa.client.rpc("retry_job", params: ["job_id": job.id.uuidString]).execute()
            auftragsFehler = nil
            await refresh()
        } catch {
            auftragsFehler = "Der Auftrag ließ sich nicht wiederholen. Prüf die Verbindung."
            print("Job-Retry: \(error)")
        }
    }

    private func insert(_ new: NewJob) async {
        guard !localOnly else {
            jobs.insert(GenerationJob(id: UUID(), kind: new.kind, topic: new.topic, source: new.source,
                                      sourceText: new.source_text, depth: new.depth, status: "queued",
                                      stage: nil, error: nil, createdAt: .now,
                                      stageStartedRaw: [:], retries: 0), at: 0)
            return
        }

        do {
            try await Supa.signInIfNeeded()
            try await Supa.client.from("generation_jobs").insert(new).execute()
            auftragsFehler = nil
            await refresh()
        } catch {
            // Häufigster echter Fall: das Tageslimit von 20 Aufträgen ist erreicht.
            let text = String(describing: error)
            auftragsFehler = text.contains("rate limit")
                ? "Tageslimit erreicht — heute sind keine weiteren Lektionen möglich."
                : "Der Auftrag konnte nicht abgeschickt werden. Prüf die Verbindung."
            print("Job-Insert: \(error)")
        }
    }

    // ── Testjobs ────────────────────────────────────────────────────────────
    /// `-jobs-fake laufend|gescheitert` legt beim Start einen Auftrag mit echten
    /// Feldern an, Stufenzeiten inklusive. Ohne das wäre die Bau-Detail-Ebene nur
    /// während eines echten, minutenlangen Baus zu sehen — und der Fehlerfall nur,
    /// wenn gerade wirklich etwas schiefgeht. Greift nur zusammen mit
    /// `-jobs-local-only`, kann also nie eine echte Zeile verdecken.
    private static var fakeArt: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-jobs-fake"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    /// Zeiten wie im abgenommenen Mockup: Quellen 0:52, seit 2:41 im Bau.
    private static func fakeJob(_ art: String) -> GenerationJob {
        let jetzt = Date()
        let stempel = ISO8601DateFormatter()
        stempel.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let gescheitert = art == "gescheitert"
        return GenerationJob(
            id: UUID(),
            kind: "photo",
            topic: "Graffiti macht Stadt",
            source: "Ihme-Passage, Hannover",
            sourceText: "QUELLE: Ihme-Passage",
            depth: "kompakt",
            status: gescheitert ? "failed" : "running",
            stage: "karten",
            error: gescheitert
                ? "Die Karten haben die Faktenprüfung nicht bestanden. Versuch es mit einem engeren Thema."
                : nil,
            createdAt: jetzt.addingTimeInterval(-181),
            stageStartedRaw: [
                "quellen": stempel.string(from: jetzt.addingTimeInterval(-161)),
                "karten": stempel.string(from: jetzt.addingTimeInterval(-109)),
            ],
            retries: 0
        )
    }

    private func listen() async {
        let channel = Supa.client.channel("generation-jobs")
        self.channel = channel
        // Jede Änderung an eigenen Job-Rows (RLS filtert fremde weg) löst einen
        // Refresh aus — die Nutzlast selbst wird nicht ausgewertet, weil ein
        // fertiger Job auch die Lektionsliste ändert.
        let changes = channel.postgresChange(AnyAction.self, schema: "public", table: "generation_jobs")
        await channel.subscribe()
        listener = Task { [weak self] in
            for await _ in changes {
                await self?.refresh()
            }
        }
    }
}
