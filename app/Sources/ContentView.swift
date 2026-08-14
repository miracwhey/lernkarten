import SwiftUI

/// Schritt-2-Beweisstand: lädt die Beispiel-Lektion und fährt sie als Session-Fläche
/// (Karten-Canvas + native Topbar). Bibliothek/Sheet/Session-Shell folgen in Schritt 3.
struct ContentView: View {
    @State private var cards: [String] = []
    @State private var idx = 0

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Button {
                    idx = 0
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color(red: 0.12, green: 0.13, blue: 0.19))
                        .frame(width: 36, height: 36)
                        .background(Circle().stroke(Color(red: 0.86, green: 0.85, blue: 0.82)))
                }
                ProgressView(value: cards.isEmpty ? 0 : Double(idx + 1), total: Double(max(cards.count, 1)))
                    .tint(Color(red: 0.28, green: 0.35, blue: 0.78))
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 10)

            if cards.indices.contains(idx) {
                CardCanvas(cardJSON: cards[idx]) { event in
                    switch event {
                    case .tap(let dir):
                        idx = min(cards.count - 1, max(0, idx + dir))
                    case .advance:
                        idx = min(cards.count - 1, idx + 1)
                    case .quizResult, .save:
                        break
                    }
                }
            } else {
                Spacer()
            }
        }
        .background(Color(red: 0.984, green: 0.98, blue: 0.969))
        .onAppear(perform: load)
    }

    private func load() {
        guard cards.isEmpty,
              let url = Bundle.main.url(forResource: "sleep-v2", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rawCards = obj["cards"] as? [[String: Any]] else { return }
        cards = rawCards.compactMap {
            guard let d = try? JSONSerialization.data(withJSONObject: $0) else { return nil }
            return String(data: d, encoding: .utf8)
        }
    }
}
