import SwiftUI

/// Ebene 1 — Bibliothek. Der einzige dauerhafte Ort: Fällig-Block, Lektionen, „Neues lernen".
struct LibraryView: View {
    let lessons: [Lesson]
    let srs: [CardKey: CardSRS]
    var jobs: [GenerationJob] = []
    var auftragsFehler: String?
    var onLearn: (Lesson) -> Void
    var onJob: (GenerationJob) -> Void
    var onPractice: () -> Void
    var onCreate: () -> Void

    private var dueTotal: Int { lessons.reduce(0) { $0 + $1.dueIndices(srs).count } }

    private var dueBreakdown: String {
        lessons.filter { !$0.dueIndices(srs).isEmpty }
            .prefix(3)
            .map { "\($0.dueIndices(srs).count) aus \(shortName($0))" }
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
                    // Laufende und gescheiterte Bau-Aufträge stehen als normale
                    // Zeile oben in der Liste — der einzige Ort für Bau-Status.
                    // Der Takt hält die Stufenzeit lebendig; ohne laufenden Bau
                    // gibt es ihn nicht.
                    if !jobs.isEmpty {
                        TimelineView(.periodic(from: .now, by: 1)) { takt in
                            ForEach(jobs) { job in
                                Button { onJob(job) } label: {
                                    JobRow(job: job, jetzt: takt.date)
                                }
                                .buttonStyle(.plain)
                                // Der Identifier gehört an den Knopf: die Zeile ist
                                // jetzt eine Bedienung, und ihre Ansage fasst Titel
                                // und Stand zu einem Element zusammen.
                                .accessibilityIdentifier("job-zeile")
                                Divider().overlay(Theme.line.opacity(0.6))
                            }
                        }
                    }
                    ForEach(lessons) { lesson in
                        Button { onLearn(lesson) } label: {
                            LessonRow(lesson: lesson, dueCount: lesson.dueIndices(srs).count)
                        }
                            .buttonStyle(.plain)
                        if lesson.id != lessons.last?.id {
                            Divider().overlay(Theme.line.opacity(0.6))
                        }
                    }
                }

                if let auftragsFehler {
                    Text(auftragsFehler)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(Theme.bad)
                        .accessibilityIdentifier("auftrag-fehler")
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
        // Kein Werktitel als Bibliotheks-Name: die Lektion erklärt Gewohnheiten,
        // das Buch steht als Quelle auf der Karte. Autorennamen sind in Ordnung.
        case "atomic-habits": return "Gewohnheiten"
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

/// Bau-Zeile: gedämpftes Motiv, gedämpfter Titel, darunter Punkt + Stufe, darunter
/// der Stufenbalken. Seit dem UX-Block führt der Chevron eine Ebene tiefer — vorher
/// stand hier ein Zustand ohne jeden Weg, ihn genauer anzusehen.
struct JobRow: View {
    let job: GenerationJob
    let jetzt: Date

    private var accent: Color { job.failed ? Theme.bad : Theme.ich }

    var body: some View {
        HStack(spacing: 14) {
            motif
            VStack(alignment: .leading, spacing: 6) {
                Text(job.displayTitle)
                    .font(Theme.serif(18, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.leading)
                HStack(alignment: .firstTextBaseline, spacing: 7) {
                    Circle()
                        .fill(accent)
                        .frame(width: 7, height: 7)
                        .offset(y: -2)
                    // Beim Fehler steht der Grund hier, sonst Stufe und Zeit: die
                    // Zeile beantwortet damit genau die Frage, die man vor ihr hat.
                    Text(job.failed ? job.statusLine : job.kurzStatus(jetzt: jetzt))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(accent)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                StufenBalken(erreicht: job.erreichteStufe, farbe: accent)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.muted.opacity(0.6))
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    /// Zwei blasse Kreise statt der drei Farbkreise — die Lektion hat noch kein Motiv.
    private var motif: some View {
        ZStack {
            Circle().fill(Color(hex: 0xC9C6BB).opacity(0.55)).frame(width: 20, height: 20).offset(x: -11)
            Circle().fill(Color(hex: 0xA9A69A).opacity(0.45)).frame(width: 20, height: 20).offset(x: -1)
        }
        .compositingGroup()
        .frame(width: 46, height: 24)   // gleicher Rahmen wie LessonRow — Motive fluchten
    }
}

/// Drei Segmente statt einer Prozentleiste: die Pipeline kennt genau drei Stufen,
/// mehr Auflösung gäbe es nur erfunden.
struct StufenBalken: View {
    let erreicht: Int
    let farbe: Color

    var body: some View {
        HStack(spacing: 3) {
            ForEach(1...3, id: \.self) { i in
                Capsule()
                    .fill(i <= erreicht ? farbe : Theme.line)
                    .frame(height: 3)
            }
        }
        .frame(maxWidth: 168)
    }
}

/// Lektionszeile: Farb-Motiv, Titel (Serif), Autor · Kartenzahl, rechts Fällig-Count.
struct LessonRow: View {
    let lesson: Lesson
    let dueCount: Int

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
                Text("\(dueCount)")
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
