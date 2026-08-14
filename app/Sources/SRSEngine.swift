import Foundation

enum Grade: String, Codable, CaseIterable {
    case again, hard, good, easy
}

struct CardKey: Hashable {
    let slug: String
    let index: Int
}

/// SRS-Zustand einer Karte — entsteht ausschließlich per Replay des Event-Logs.
struct CardSRS {
    var reps = 0
    var ease = 2.5
    var interval: TimeInterval = 0
    var due = Date.distantPast   // nie geübt = sofort fällig
}

struct ReviewEvent: Codable {
    var id = UUID()              // Client-Id macht den Insert idempotent
    let lessonSlug: String
    let cardIndex: Int
    let grade: Grade
    let reviewedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case lessonSlug = "lesson_slug"
        case cardIndex = "card_index"
        case grade
        case reviewedAt = "reviewed_at"
    }

    var key: CardKey { CardKey(slug: lessonSlug, index: cardIndex) }
}

/// SM-2-Variante mit den Mockup-Erstabständen: Nochmal 10 Min · Schwer 2 Tage · Gut 4 Tage · Leicht 8 Tage.
enum SRSEngine {
    private static let minute: TimeInterval = 60
    private static let day: TimeInterval = 86400

    static func apply(_ state: CardSRS?, grade: Grade, at: Date) -> CardSRS {
        var s = state ?? CardSRS()
        switch grade {
        case .again:
            s.reps = 0
            s.ease = max(1.3, s.ease - 0.2)
            s.interval = 10 * minute
        case .hard:
            s.interval = s.reps == 0 ? 2 * day : s.interval * 1.2
            s.ease = max(1.3, s.ease - 0.15)
            s.reps += 1
        case .good:
            s.interval = s.reps == 0 ? 4 * day : s.interval * s.ease
            s.reps += 1
        case .easy:
            s.interval = s.reps == 0 ? 8 * day : s.interval * s.ease * 1.3
            s.ease += 0.15
            s.reps += 1
        }
        s.due = at.addingTimeInterval(s.interval)
        return s
    }

    /// Nächstes Intervall für die Stufen-Beschriftung (ehrlicher nächster Abstand).
    static func nextInterval(_ state: CardSRS?, grade: Grade) -> TimeInterval {
        apply(state, grade: grade, at: .now).interval
    }

    static func replay(_ events: [ReviewEvent]) -> [CardKey: CardSRS] {
        var result: [CardKey: CardSRS] = [:]
        for e in events.sorted(by: { $0.reviewedAt < $1.reviewedAt }) {
            result[e.key] = apply(result[e.key], grade: e.grade, at: e.reviewedAt)
        }
        return result
    }

    static func format(_ interval: TimeInterval) -> String {
        switch interval {
        case ..<(60 * minute): return "\(Int((interval / minute).rounded())) Min"
        case ..<day: return "\(Int((interval / 3600).rounded())) Std"
        case ..<(14 * day): return "\(Int((interval / day).rounded())) Tage"
        default:
            let weeks = interval / (7 * day)
            return String(format: "%.0f Wo", weeks.rounded())
        }
    }
}
