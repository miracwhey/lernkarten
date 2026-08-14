import Foundation

struct Lesson: Identifiable {
    let id: String
    let title: String
    let source: String
    let eyebrow: String
    /// Jede Karte als serialisiertes JSON für window.renderCard().
    let cardsJSON: [String]
    let cardTypes: [String]

    /// Kurz-Autor für die Bibliothekszeile, aus dem Eyebrow („Gesundheit · Matthew Walker" → „Walker").
    var author: String {
        let name = eyebrow.components(separatedBy: "·").last ?? title
        return name.trimmingCharacters(in: .whitespaces)
            .components(separatedBy: " ").last ?? title
    }

    /// Übbare Karten: alles außer der Titelkarte (Cover).
    var practiceIndices: [Int] {
        cardTypes.indices.filter { cardTypes[$0] != "title" }
    }

    /// Fällige Karten laut SRS-Zustand (nie geübt = fällig).
    func dueIndices(_ srs: [CardKey: CardSRS], now: Date = .now) -> [Int] {
        practiceIndices.filter { (srs[CardKey(slug: id, index: $0)]?.due ?? .distantPast) <= now }
    }

    /// Stabiler Farbdreh fürs Bibliotheks-Motiv (hashValue ist pro Launch zufällig gesalzen).
    var motifSeed: Int {
        id.unicodeScalars.reduce(0) { $0 + Int($1.value) }
    }
}

enum LessonStore {
    /// Feste Kuratierungs-Reihenfolge der gebündelten Beispiel-Lektionen.
    private static let order = [
        "warum-wir-schlafen", "thinking-fast-slow", "atomic-habits",
        "naval-almanack", "freud-psyche",
    ]

    static func loadAll() -> [Lesson] {
        let urls = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: nil) ?? []
        let lessons = urls.compactMap(load(from:))
        return lessons.sorted {
            (order.firstIndex(of: $0.id) ?? .max) < (order.firstIndex(of: $1.id) ?? .max)
        }
    }

    private static func load(from url: URL) -> Lesson? {
        guard let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = obj["id"] as? String,
              let title = obj["title"] as? String,
              let cards = obj["cards"] as? [[String: Any]] else { return nil }
        let jsons: [String] = cards.compactMap {
            guard let d = try? JSONSerialization.data(withJSONObject: $0) else { return nil }
            return String(data: d, encoding: .utf8)
        }
        guard jsons.count == cards.count else { return nil }
        return Lesson(
            id: id,
            title: title,
            source: obj["source"] as? String ?? "",
            eyebrow: cards.first?["eyebrow"] as? String ?? "",
            cardsJSON: jsons,
            cardTypes: cards.map { $0["type"] as? String ?? "" }
        )
    }
}
