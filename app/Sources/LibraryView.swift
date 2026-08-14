import SwiftUI

/// Ebene 1 — Bibliothek. Der einzige dauerhafte Ort: Fällig-Block, Lektionen, „Neues lernen".
struct LibraryView: View {
    let lessons: [Lesson]
    var onLearn: (Lesson) -> Void
    var onPractice: () -> Void
    var onCreate: () -> Void

    private var dueTotal: Int { lessons.reduce(0) { $0 + $1.practiceIndices.count } }

    private var dueBreakdown: String {
        lessons.filter { !$0.practiceIndices.isEmpty }
            .prefix(3)
            .map { "\($0.practiceIndices.count) aus \(shortName($0))" }
            .joined(separator: " · ")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(Self.dateLine())
                        .microCaps()
                        .foregroundStyle(Theme.muted)
                    Text("Bibliothek")
                        .font(Theme.serif(34))
                        .foregroundStyle(Theme.ink)
                }
                .padding(.top, 8)

                dueBlock

                VStack(spacing: 0) {
                    ForEach(lessons) { lesson in
                        Button { onLearn(lesson) } label: { LessonRow(lesson: lesson) }
                            .buttonStyle(.plain)
                        if lesson.id != lessons.last?.id {
                            Divider().overlay(Theme.line.opacity(0.6))
                        }
                    }
                }

                VStack(spacing: 10) {
                    Button(action: onCreate) {
                        Label("Neues lernen", systemImage: "camera")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.card)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(Theme.ink, in: RoundedRectangle(cornerRadius: 14))
                    }
                    Text("Buchseite fotografieren oder Thema eingeben")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                }
                .padding(.top, 6)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .background(Theme.paper)
    }

    private var dueBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(dueTotal)")
                    .font(.system(size: 44, weight: .bold))
                    .foregroundStyle(Theme.ink)
                Text("Karten fällig")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.ink)
            }
            if !dueBreakdown.isEmpty {
                Text(dueBreakdown)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
            }
            Button(action: onPractice) {
                Text("Jetzt üben")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.card)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Theme.ink, in: RoundedRectangle(cornerRadius: 14))
            }
            .disabled(dueTotal == 0)
        }
        .padding(18)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.line))
    }

    private func shortName(_ lesson: Lesson) -> String {
        switch lesson.id {
        case "warum-wir-schlafen": return "Schlaf"
        case "thinking-fast-slow": return "Kahneman"
        case "atomic-habits": return "Atomic Habits"
        case "naval-almanack": return "Naval"
        case "freud-psyche": return "Freud"
        default: return lesson.author
        }
    }

    static func dateLine() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.dateFormat = "EEEE, d. MMMM"
        return f.string(from: Date())
    }
}

/// Lektionszeile: Farb-Motiv, Titel (Serif), Autor · Kartenzahl, rechts Fällig-Count.
struct LessonRow: View {
    let lesson: Lesson

    private static let palette = [Theme.es, Theme.ich, Theme.ueberich]

    var body: some View {
        HStack(spacing: 14) {
            motif
            VStack(alignment: .leading, spacing: 3) {
                Text(lesson.title)
                    .font(Theme.serif(18, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.leading)
                Text("\(lesson.author) · \(lesson.cardsJSON.count) Karten")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            VStack(spacing: 1) {
                Text("\(lesson.practiceIndices.count)")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Theme.ink)
                Text("fällig")
                    .microCaps(9)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    private var motif: some View {
        let c = Self.palette
        let s = lesson.motifSeed
        return ZStack {
            Circle().fill(c[s % 3]).frame(width: 20, height: 20).offset(x: -11)
            Circle().fill(c[(s + 1) % 3]).frame(width: 20, height: 20).offset(x: 11)
            Circle().fill(c[(s + 2) % 3]).frame(width: 20, height: 20)
        }
        .compositingGroup()
        .opacity(0.92)
        .frame(width: 46, height: 24)
    }
}
