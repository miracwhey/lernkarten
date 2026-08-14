import SwiftUI

/// Ebene 3 — Lern-Session. Vollbild-Tunnel: rein, durch, X raus. Keine Navigation innerhalb.
struct LearnSessionView: View {
    let lesson: Lesson
    @Environment(\.dismiss) private var dismiss
    @State private var idx = 0

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
                .accessibilityIdentifier("session-close")
                SegmentProgress(total: lesson.cardsJSON.count, done: idx + 1)
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 10)

            CardCanvas(cardJSON: lesson.cardsJSON[idx]) { event in
                switch event {
                case .tap(let dir): advance(dir)
                case .advance: advance(1)
                case .quizResult, .save: break
                }
            }
        }
        .background(Theme.card)
    }

    private func advance(_ dir: Int) {
        let next = idx + dir
        if next >= lesson.cardsJSON.count {
            dismiss()   // durch — Tunnel endet automatisch zu Hause
        } else {
            idx = max(0, next)
        }
    }
}

/// Segmentierter Fortschrittsbalken wie im Mockup (ein Segment pro Karte).
struct SegmentProgress: View {
    let total: Int
    let done: Int

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<total, id: \.self) { i in
                Capsule()
                    .fill(i < done ? Theme.ich : Theme.chrome)
                    .frame(height: 4)
            }
        }
    }
}
