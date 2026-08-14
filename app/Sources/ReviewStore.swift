import Foundation
import Supabase

enum Config {
    static let supabaseURL = URL(string: "https://putffdkzcefpfpamjqlt.supabase.co")!
    static let supabaseKey = "sb_publishable_OUqtclcDwUqxkxzPTxkFNw_DER8qPXb"
}

/// Review-Events: sofort lokal angewendet, in eine persistente Outbox geschrieben und
/// nach Supabase geflusht (append-only Log, Insert idempotent über Client-Id).
/// UITests laufen mit "-srs-local-only" komplett ohne Netz.
@MainActor
final class ReviewStore: ObservableObject {
    @Published private(set) var srs: [CardKey: CardSRS] = [:]
    @Published private(set) var doneToday = 0

    private var events: [ReviewEvent] = []
    private var outbox: [ReviewEvent] = []
    private let localOnly = ProcessInfo.processInfo.arguments.contains("-srs-local-only")
    private var client: SupabaseClient?

    private let outboxURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("review-outbox.json")
    }()

    func start() async {
        if localOnly {
            rebuild()
            return
        }
        outbox = (try? JSONDecoder.iso.decode([ReviewEvent].self, from: Data(contentsOf: outboxURL))) ?? []
        let client = SupabaseClient(supabaseURL: Config.supabaseURL, supabaseKey: Config.supabaseKey)
        self.client = client
        do {
            if (try? await client.auth.session) == nil {
                try await client.auth.signInAnonymously()
            }
            await flushOutbox()
            events = try await client.from("review_events")
                .select("id, lesson_slug, card_index, grade, reviewed_at")
                .order("reviewed_at")
                .execute().value
        } catch {
            // Ohne Netz/Session bleibt der lokale Stand nutzbar; Outbox flusht beim nächsten Start.
            print("ReviewStore offline: \(error)")
        }
        rebuild()
    }

    func record(_ slug: String, _ index: Int, _ grade: Grade) {
        let event = ReviewEvent(lessonSlug: slug, cardIndex: index, grade: grade, reviewedAt: .now)
        outbox.append(event)
        saveOutbox()
        rebuild()
        Task { await flushOutbox() }
    }

    private func rebuild() {
        srs = SRSEngine.replay(events + outbox)
        let today = Calendar.current.startOfDay(for: .now)
        doneToday = (events + outbox).filter { $0.reviewedAt >= today && $0.grade != .again }.count
    }

    private func saveOutbox() {
        guard !localOnly else { return }
        try? JSONEncoder.iso.encode(outbox).write(to: outboxURL, options: .atomic)
    }

    private func flushOutbox() async {
        guard let client, !outbox.isEmpty else { return }
        for event in outbox {
            do {
                try await client.from("review_events").insert(event).execute()
            } catch {
                // 23505 = Client-Id schon eingefügt (Doppel-Flush) -> als Erfolg werten
                let message = String(describing: error)
                guard message.contains("23505") else { continue }
            }
            outbox.removeAll { $0.id == event.id }
            events.append(event)
        }
        saveOutbox()
        rebuild()
    }
}

extension JSONDecoder {
    static let iso: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601withFractionalSeconds
        return d
    }()
}

extension JSONEncoder {
    static let iso: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601withFractionalSeconds
        return e
    }()
}

extension JSONDecoder.DateDecodingStrategy {
    static let iso8601withFractionalSeconds = custom { decoder in
        let s = try decoder.singleValueContainer().decode(String.self)
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        guard let d = f.date(from: s) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Kein ISO-Datum: \(s)"))
        }
        return d
    }
}

extension JSONEncoder.DateEncodingStrategy {
    static let iso8601withFractionalSeconds = custom { date, encoder in
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var c = encoder.singleValueContainer()
        try c.encode(f.string(from: date))
    }
}
