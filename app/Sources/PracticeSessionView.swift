import SwiftUI

struct PracticeItem: Identifiable {
    let id = UUID()
    let lesson: Lesson
    let cardIndex: Int
    var cardJSON: String { lesson.cardsJSON[cardIndex] }
    var label: String { "\(lesson.title) · Karte \(cardIndex + 1)" }
}

/// Ebene 3 — Üben. Fällige Karten quer über alle Lektionen, gleiche Karten-Anatomie,
/// dazu die vier Stufen (SM-2-Abstände). Events-Persistenz folgt mit Schritt 4.
struct PracticeSessionView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var queue: [PracticeItem]
    @State private var doneCount = 0
    @State private var seenIDs = Set<UUID>()

    init(lessons: [Lesson]) {
        // Round-robin quer über die Lektionen — nie eine Lektion am Stück.
        var items: [PracticeItem] = []
        let perLesson = lessons.map { l in l.practiceIndices.map { PracticeItem(lesson: l, cardIndex: $0) } }
        let maxLen = perLesson.map(\.count).max() ?? 0
        for i in 0..<maxLen {
            for cards in perLesson where i < cards.count {
                items.append(cards[i])
            }
        }
        _queue = State(initialValue: items)
    }

    private var newCount: Int { queue.filter { !seenIDs.contains($0.id) }.count }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 36, height: 36)
                        .background(Circle().stroke(Theme.line))
                }
                .accessibilityIdentifier("practice-close")
                Text("Üben")
                    .font(Theme.serif(28))
                    .foregroundStyle(Theme.ink)
                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)

            HStack(spacing: 18) {
                counter(queue.count, "fällig")
                counter(newCount, "neu")
                counter(doneCount, "heute geschafft")
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            if let item = queue.first {
                VStack(alignment: .leading, spacing: 8) {
                    Text(item.label)
                        .microCaps(10)
                        .foregroundStyle(Theme.muted)
                        .padding(.horizontal, 6)
                        .accessibilityIdentifier("practice-card-label")
                    CardCanvas(cardJSON: item.cardJSON) { _ in }
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line))
                }
                .padding(.horizontal, 16)

                HStack(spacing: 8) {
                    grade("Nochmal", "10 Min", Theme.bad) { requeue(item) }
                    grade("Schwer", "2 Tage", Theme.ink) { complete(item) }
                    grade("Gut", "4 Tage", Theme.ok) { complete(item) }
                    grade("Leicht", "8 Tage", Theme.ich) { complete(item) }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            } else {
                Spacer()
            }
        }
        .background(Theme.paper)
    }

    private func counter(_ n: Int, _ label: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text("\(n)")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Theme.ink)
            Text(label)
                .microCaps(9)
                .foregroundStyle(Theme.muted)
        }
    }

    private func grade(_ title: String, _ sub: String, _ color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(title)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(color)
                Text(sub)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("grade-\(title)")
    }

    private func requeue(_ item: PracticeItem) {
        seenIDs.insert(item.id)
        guard !queue.isEmpty else { return }
        queue.append(queue.removeFirst())
    }

    private func complete(_ item: PracticeItem) {
        seenIDs.insert(item.id)
        guard !queue.isEmpty else { return }
        queue.removeFirst()
        doneCount += 1
        if queue.isEmpty { dismiss() }   // durch — zurück nach Hause
    }
}
