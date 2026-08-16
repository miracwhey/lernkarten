import SwiftUI

/// Ebene 2 — Bau-Detail. Beantwortet die Frage, die die Bibliothekszeile offen
/// lässt: was passiert gerade, wie lange schon, und woran ist es gescheitert.
/// Vor dem UX-Block war die Wartezeit ein blindes Loch (Mockup-Abnahme 16.08.).
///
/// Alle Zeiten sind gemessen: die Stufen-Startzeiten schreibt der Worker beim
/// Wechsel, die Dauer einer Stufe ist der Abstand zur nächsten. Es gibt bewusst
/// keine Prozentanzeige — die Pipeline kennt drei Stufen, alles Feinere wäre
/// erfunden.
struct BauDetailView: View {
    let job: GenerationJob
    var fehler: String?
    var onWiederholen: () -> Void
    var onZurueck: () -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { takt in
            inhalt(jetzt: takt.date)
        }
        .background(Theme.paper)
    }

    private func inhalt(jetzt: Date) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Button(action: onZurueck) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.ink)
                            .frame(width: 32, height: 32)
                            .background(Circle().stroke(Theme.line))
                    }
                    .accessibilityIdentifier("bau-zurueck")
                    Spacer()
                }
                .padding(.bottom, 18)

                Text(job.failed ? "Bau gescheitert" : "Wird gebaut")
                    .microCaps()
                    .foregroundStyle(job.failed ? Theme.bad : Theme.muted)
                    .padding(.bottom, 6)
                    .accessibilityIdentifier("bau-kicker")
                Text(job.displayTitle)
                    .font(Theme.serif(30))
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let herkunft {
                    Text(herkunft)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 4)
                }

                stufenliste(jetzt: jetzt)
                    .padding(.top, 22)

                if job.failed {
                    fehlerteil
                } else {
                    laufzeit(jetzt: jetzt)
                }

                if let fehler {
                    Text(fehler)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(Theme.bad)
                        .padding(.top, 12)
                        .accessibilityIdentifier("bau-fehler")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 24)
        }
    }

    /// „Quelle · Tiefe" — die Quelle hat nur ein Foto-Auftrag, die Tiefe jeder.
    private var herkunft: String? {
        let teile = [job.source, job.tiefe?.rawValue].compactMap { $0 }.filter { !$0.isEmpty }
        return teile.isEmpty ? nil : teile.joined(separator: " · ")
    }

    private func stufenliste(jetzt: Date) -> some View {
        VStack(spacing: 0) {
            let staende = job.stufen(jetzt: jetzt)
            ForEach(Array(staende.enumerated()), id: \.element.id) { index, stand in
                StufenZeile(stand: stand)
                if index < staende.count - 1 {
                    Divider().overlay(Theme.line.opacity(0.6))
                }
            }
        }
        .padding(.horizontal, 16)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line))
    }

    /// Ehrliche Erwartung: die Spanne für „kompakt" ist an fünf echten Läufen
    /// gemessen und wird als Spanne genannt — eine einzelne Zahl wäre fast immer
    /// falsch. Für die anderen Tiefen sagt der Satz, dass er hochgerechnet ist.
    private func laufzeit(jetzt: Date) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(laufzeitZeile(jetzt: jetzt))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .accessibilityIdentifier("bau-laufzeit")
            if let satz = job.tiefe?.dauerSatz {
                Text(satz)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.top, 16)
    }

    /// In der Warteschlange läuft noch nichts — dann zählt die Wartezeit, nicht
    /// eine Bauzeit, die es noch gar nicht gibt.
    private func laufzeitZeile(jetzt: Date) -> String {
        if let beginn = job.bauBeginn {
            return "Läuft seit \(JobZeit.mmss(jetzt.timeIntervalSince(beginn)))"
        }
        return "Wartet seit \(JobZeit.mmss(jetzt.timeIntervalSince(job.createdAt)))"
    }

    private var fehlerteil: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(job.error ?? "Der Bau ist fehlgeschlagen.")
                .font(.system(size: 13.5))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.es.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.es.opacity(0.35)))
                .padding(.top, 16)
                .accessibilityIdentifier("bau-fehlertext")

            // Ohne diesen Knopf wäre der Auftrag eine Sackgasse: Thema, Quelle und
            // erkannter Text stehen im gescheiterten Job, der neue Bau braucht
            // kein neues Foto.
            if job.kannWiederholen {
                Button(action: onWiederholen) {
                    Text("Noch einmal bauen")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.card)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(Theme.ink, in: RoundedRectangle(cornerRadius: 14))
                }
                .accessibilityIdentifier("bau-wiederholen")
                .padding(.top, 12)
            } else {
                // Der Deckel steht als Constraint in der Tabelle; hier steht, was
                // er für den Nutzer bedeutet — ein toter Knopf wäre schlimmer.
                Text("Dieser Auftrag wurde dreimal wiederholt. Formuliere das Thema enger oder fotografiere die Quelle neu.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
                    .accessibilityIdentifier("bau-erschoepft")
            }
        }
    }
}

/// Eine Stufe in der Liste: Symbol, Name, rechts die Zeit. Die laufende Stufe
/// trägt ihre bisher verstrichene Zeit, abgeschlossene ihre gemessene Dauer.
struct StufenZeile: View {
    let stand: StufenStand

    private var symbol: (String, Color) {
        switch stand.zustand {
        case .fertig: return ("checkmark.circle.fill", Theme.ok)
        case .laeuft: return ("circle.dotted.circle", Theme.ich)
        case .offen: return ("circle", Theme.line)
        case .gescheitert: return ("xmark.circle.fill", Theme.bad)
        }
    }

    private var zeit: String? {
        guard let dauer = stand.dauer else { return stand.zustand == .laeuft ? "läuft" : nil }
        return JobZeit.mmss(dauer)
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol.0)
                .font(.system(size: 16))
                .foregroundStyle(symbol.1)
                .frame(width: 20)
            Text(stand.stufe.name)
                .font(.system(size: 15, weight: stand.zustand == .laeuft ? .semibold : .regular))
                .foregroundStyle(stand.zustand == .offen ? Theme.muted : Theme.ink)
            Spacer()
            if let zeit {
                Text(zeit)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("stufe-\(stand.stufe.rawValue)")
    }
}
