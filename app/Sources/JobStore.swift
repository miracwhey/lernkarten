import Foundation
import Supabase

/// Ein Bau-Auftrag aus public.generation_jobs. Der Client legt ihn an und liest ihn —
/// fortschreiben darf ihn nur der Worker (UPDATE ist für Client-Rollen entzogen).
struct GenerationJob: Codable, Identifiable, Equatable {
    let id: UUID
    let kind: String
    let topic: String?
    /// Bestätigte Quelle des Foto-Flusses (Buchtitel, Autor). Nullbar und in jeder
    /// Richtung optional: Jobs aus der Zeit vor der Spalte tragen sie nicht.
    let source: String?
    let sourceText: String?
    let status: String
    let stage: String?
    let error: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, kind, topic, source, status, stage, error
        case sourceText = "source_text"
        case createdAt = "created_at"
    }

    var failed: Bool { status == "failed" }

    /// Titel der Bibliothekszeile — beim eigenen Text gibt es kein Thema.
    var displayTitle: String {
        if let topic, !topic.isEmpty { return topic }
        return "Eigener Text"
    }

    /// Statuszeile der Bibliothek. Wording 1:1 aus Mockup S4 („Quellen sammeln",
    /// „Karten schreiben", „Fakten & Bilder prüfen") — die echten Pipeline-Stufen.
    var statusLine: String {
        if failed { return error ?? "Der Bau ist fehlgeschlagen." }
        switch stage {
        case "quellen": return "Wird gebaut – Quellen sammeln"
        case "karten": return "Wird gebaut – Karten schreiben"
        case "pruefen": return "Wird gebaut – Fakten & Bilder prüfen"
        default: return "Wird gebaut – In der Warteschlange"
        }
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
    @Published var enqueueError: String?

    private let localOnly = ProcessInfo.processInfo.arguments.contains("-jobs-local-only")
    private var channel: RealtimeChannelV2?
    private var listener: Task<Void, Never>?

    func start() async {
        guard !localOnly else { return }
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
                .select("id, kind, topic, source, source_text, status, stage, error, created_at")
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

    private func insert(_ new: NewJob) async {
        guard !localOnly else {
            jobs.insert(GenerationJob(id: UUID(), kind: new.kind, topic: new.topic, source: new.source,
                                      sourceText: new.source_text, status: "queued", stage: nil,
                                      error: nil, createdAt: .now), at: 0)
            return
        }

        do {
            try await Supa.signInIfNeeded()
            try await Supa.client.from("generation_jobs").insert(new).execute()
            enqueueError = nil
            await refresh()
        } catch {
            // Häufigster echter Fall: das Tageslimit von 20 Aufträgen ist erreicht.
            let text = String(describing: error)
            enqueueError = text.contains("rate limit")
                ? "Tageslimit erreicht — heute sind keine weiteren Lektionen möglich."
                : "Der Auftrag konnte nicht abgeschickt werden. Prüf die Verbindung."
            print("Job-Insert: \(error)")
        }
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
