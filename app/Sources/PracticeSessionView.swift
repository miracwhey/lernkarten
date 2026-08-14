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
    @ObservedObject var store: ReviewStore
    @State private var queue: [PracticeItem]

    init(lessons: [Lesson], store: ReviewStore) {
        self.store = store
        // Round-robin quer über die Lektionen — nur fällige Karten, nie eine Lektion am Stück.
        var items: [PracticeItem] = []
        let perLesson = lessons.map { l in l.dueIndices(store.srs).map { PracticeItem(lesson: l, cardIndex: $0) } }
        let maxLen = perLesson.map(\.count).max() ?? 0
        for i in 0..<maxLen {
            for cards in perLesson where i < cards.count {
                items.append(cards[i])
            }
        }
        _queue = State(initialValue: items)
    }

    private var newCount: Int {
        queue.filter { store.srs[CardKey(slug: $0.lesson.id, index: $0.cardIndex)] == nil }.count
    }

    private func srsState(_ item: PracticeItem) -> CardSRS? {
        store.srs[CardKey(slug: item.lesson.id, index: item.cardIndex)]
    }

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
                counter(store.doneToday, "heute geschafft")
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
                    grade("Nochmal", interval(item, .again), Theme.bad) { answer(item, .again) }
                    grade("Schwer", interval(item, .hard), Theme.ink) { answer(item, .hard) }
                    grade("Gut", interval(item, .good), Theme.ok) { answer(item, .good) }
                    grade("Leicht", interval(item, .easy), Theme.ich) { answer(item, .easy) }
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

    /// Ehrlicher nächster Abstand laut SRS für die Stufen-Beschriftung.
    private func interval(_ item: PracticeItem, _ g: Grade) -> String {
        SRSEngine.format(SRSEngine.nextInterval(srsState(item), grade: g))
    }

    private func answer(_ item: PracticeItem, _ g: Grade) {
        store.record(item.lesson.id, item.cardIndex, g)
        guard !queue.isEmpty else { return }
        if g == .again {
            queue.append(queue.removeFirst())   // nochmal in dieser Session
        } else {
            queue.removeFirst()
            if queue.isEmpty { dismiss() }      // durch — zurück nach Hause
        }
    }
}
