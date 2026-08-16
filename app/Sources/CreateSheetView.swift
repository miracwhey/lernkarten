import SwiftUI

enum CaptureMode: String, CaseIterable, Identifiable {
    case foto = "Foto"
    case thema = "Thema"
    case text = "Eigener Text"
    var id: String { rawValue }
}

enum Depth: String, CaseIterable, Identifiable {
    case kompakt = "Kompakt"
    case standard = "Standard"
    case tief = "Tief"
    var id: String { rawValue }

    /// Wert der Spalte generation_jobs.depth (ASCII, klein — so steht es im CHECK).
    var slug: String {
        switch self {
        case .kompakt: return "kompakt"
        case .standard: return "standard"
        case .tief: return "tief"
        }
    }

    /// Erwartete Bau-Dauer in Minuten. Kompakt ist an fünf echten Läufen gemessen
    /// (224/258/264/273/357 s, also 3:44 bis 5:57 — inklusive Warteschlange);
    /// Standard und Tief sind daraus über die Kartenzahl hochgerechnet und nie
    /// gemessen worden. Deshalb sagt der Text unten „hochgerechnet" statt „meist":
    /// eine Zahl, die genauer klingt als ihre Messung, ist eine falsche Zusage.
    var spanne: (min: Int, max: Int) {
        switch self {
        case .kompakt: return (4, 6)
        case .standard: return (7, 10)
        case .tief: return (11, 17)
        }
    }

    var gemessen: Bool { self == .kompakt }

    var estimate: String {
        switch self {
        case .kompakt: return "ca. 7 Karten · \(spanne.min)–\(spanne.max) Min"
        case .standard: return "ca. 12 Karten · \(spanne.min)–\(spanne.max) Min"
        case .tief: return "ca. 20 Karten · \(spanne.min)–\(spanne.max) Min"
        }
    }

    /// Satz unter „Läuft seit" in der Bau-Detail-Ansicht.
    var dauerSatz: String {
        let wie = gemessen ? "brauchen meist" : "brauchen hochgerechnet"
        let art: String
        switch self {
        case .kompakt: art = "Kompakte Lektionen"
        case .standard: art = "Standard-Lektionen"
        case .tief: art = "Tiefe Lektionen"
        }
        return "\(art) \(wie) \(spanne.min) bis \(spanne.max) Minuten."
    }
}

/// Die zweite Ebene des Sheets: bestätigen, was erfasst wurde.
enum SheetSchritt: Hashable {
    case bestaetigenEingabe
    case bestaetigenFoto
}

/// Ebene 2 — Erstellen. Kurzlebiges Sheet: Erfassen → Bestätigen → Sheet schließt.
/// Jederzeit abbrechbar, hinterlässt keine halben Zustände. „Lektion bauen" legt
/// den Job an und schließt sofort — der Bau-Status wohnt in der Bibliothek.
///
/// Der Foto-Tab IST der Sucher (UX-Block 16.08.): kein Platzhalter, kein zweiter
/// Screen. Dafür ist der Kopf auf Kicker und ✕ geschrumpft — der Serif-Titel
/// „Erfassen" kostete genau die Höhe, die der Sucher braucht.
struct CreateSheetView: View {
    @ObservedObject var jobs: JobStore
    @Environment(\.dismiss) private var dismiss
    @StateObject private var foto = FotoFlussModel()
    @StateObject private var kamera = FotoKamera()
    @State private var mode: CaptureMode = .foto
    @State private var topic = ""
    @State private var ownText = ""
    @State private var depth: Depth = .standard
    @State private var path: [SheetSchritt] = []

    /// Bauen ist scharf, sobald eine Eingabe steht (Thema oder eigener Text) und
    /// eine Tiefe gewählt ist — im Mockup ist Standard vorgewählt.
    static func canBuild(mode: CaptureMode, topic: String, ownText: String, depth: Depth?) -> Bool {
        guard depth != nil else { return false }
        let input = mode == .text ? ownText : topic
        return !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var buildEnabled: Bool {
        Self.canBuild(mode: mode, topic: topic, ownText: ownText, depth: depth)
    }

    /// Die Kamera läuft genau dann, wenn ihr Bild auch zu sehen ist: nicht im
    /// Thema-Tab, nicht auf der Bestätigungs-Ebene, nicht während der Erkennung.
    /// Sonst filmte sie im Hintergrund weiter und zöge Strom für nichts.
    private var sucherSichtbar: Bool {
        mode == .foto && path.isEmpty && foto.phase == .aufnahme
    }

    var body: some View {
        NavigationStack(path: $path) {
            captureStep
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: SheetSchritt.self) { schritt in
                    Group {
                        switch schritt {
                        case .bestaetigenEingabe: confirmStep
                        case .bestaetigenFoto: fotoBestaetigung
                        }
                    }
                    .toolbar(.hidden, for: .navigationBar)
                }
        }
        // Die Erlaubnis wird beim Öffnen des Sheets gefragt, nicht erst nach einem
        // Tap auf eine Attrappe: der Sucher ist der Einstieg, und ein Dialog vor
        // dem ersten Bild ist ehrlicher als einer mitten in der Aufnahme.
        .task { await kameraNachfuehren() }
        .onChange(of: sucherSichtbar) { _, _ in Task { await kameraNachfuehren() } }
        .onDisappear { kamera.stoppen() }
        // Die Erkennung ist durch: eine Ebene tiefer wird bestätigt.
        .onChange(of: foto.phase) { _, phase in
            if phase == .bestaetigung, path.last != .bestaetigenFoto {
                path.append(.bestaetigenFoto)
            }
        }
        // Zurück zum Sucher — auch per Wischgeste, die den Weg zurück nicht über
        // unsere Knöpfe nimmt.
        .onChange(of: path) { _, neu in
            if neu.isEmpty, foto.phase == .bestaetigung { foto.zurueckZurKamera() }
        }
    }

    private func kameraNachfuehren() async {
        if sucherSichtbar { await kamera.starten() } else { kamera.stoppen() }
    }

    // ── S2 Erfassen ──
    /// Kopf, Erfassungs-Fläche, Umschalter. Die Fläche bekommt allen Platz, der
    /// zwischen den beiden übrig bleibt — beim Foto ist sie der Sucher.
    private var captureStep: some View {
        VStack(spacing: 0) {
            captureHeader

            switch mode {
            case .foto: photoPane
            case .thema: topicPane
            case .text: textPane
            }

            HStack(spacing: 6) {
                ForEach(CaptureMode.allCases) { m in
                    Button { mode = m } label: {
                        Text(m.rawValue)
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundStyle(mode == m ? Theme.ink : Theme.muted)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(
                                mode == m ? Theme.card : .clear,
                                in: Capsule()
                            )
                    }
                    .accessibilityIdentifier("mode-\(m.rawValue)")
                }
            }
            .padding(4)
            .background(Theme.chrome, in: Capsule())
            .padding(.bottom, 10)
        }
        .background(Theme.paper)
    }

    /// Nur Kicker und ✕ — der Serif-Titel ist dem Sucher gewichen.
    private var captureHeader: some View {
        HStack {
            Text("Neues lernen")
                .microCaps()
                .foregroundStyle(Theme.muted)
                .accessibilityIdentifier("sheet-kicker")
            Spacer()
            Button { schliessen() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 32, height: 32)
                    .background(Circle().stroke(Theme.line))
            }
            .accessibilityIdentifier("sheet-close")
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }

    /// Der Foto-Tab: Live-Sucher, darunter Stapel, Auslöser und „Fertig".
    private var photoPane: some View {
        VStack(spacing: 0) {
            FotoSucher(modell: foto, kamera: kamera)
                .padding(.horizontal, 14)

            if foto.phase == .fehler { FotoFehlerkarte(modell: foto) }

            FotoLeiste(
                modell: foto,
                onAusloesen: ausloesen,
                onFertig: { Task { await foto.erkennen() } }
            )
        }
    }

    private func ausloesen() {
        if FotoFake.kamera {
            foto.aufnehmen(FotoFake.naechstes(foto.fotos.count))
        } else {
            kamera.ausloesen { bild in
                guard let bild else { return }
                foto.aufnehmen(bild)
            }
        }
    }

    /// Beim Schließen bleiben keine Fotos im Eingang liegen.
    private func schliessen() {
        Task { await foto.verwerfen() }
        dismiss()
    }

    private var topicPane: some View {
        VStack(spacing: 14) {
            TextField("Worüber willst du lernen?", text: $topic)
                .font(Theme.serif(20, weight: .medium))
                .padding(16)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line))
            continueButton(enabled: !topic.trimmingCharacters(in: .whitespaces).isEmpty)
            Spacer()
        }
        .padding(.horizontal, 20)
    }

    private var textPane: some View {
        VStack(spacing: 14) {
            TextEditor(text: $ownText)
                .font(.system(size: 15))
                .scrollContentBackground(.hidden)
                .padding(12)
                .frame(height: 220)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line))
            continueButton(enabled: !ownText.trimmingCharacters(in: .whitespaces).isEmpty)
            Spacer()
        }
        .padding(.horizontal, 20)
    }

    private func continueButton(enabled: Bool) -> some View {
        Button { path.append(.bestaetigenEingabe) } label: {
            Text("Weiter")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.card)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    enabled ? Theme.ink : Theme.muted.opacity(0.4),
                    in: RoundedRectangle(cornerRadius: 14)
                )
        }
        .disabled(!enabled)
    }

    // ── S3 Bestätigen ──
    private var confirmStep: some View {
        VStack(spacing: 0) {
            sheetHeader(
                kicker: mode == .thema ? "Dein Thema" : "Dein Text",
                title: mode == .thema ? topic : "Eigener Text",
                onBack: { path.removeLast() }
            )

            VStack(alignment: .leading, spacing: 10) {
                Text("Tiefe")
                    .microCaps()
                    .foregroundStyle(Theme.muted)
                DepthPicker(depth: $depth)
            }
            .padding(.horizontal, 20)

            Spacer()

            // Job anlegen und sofort schließen — der Worker übernimmt, die
            // Bibliothekszeile berichtet. Kein Warte-Screen im Sheet.
            Button {
                let (m, t, o, d) = (mode, topic, ownText, depth)
                Task { await jobs.enqueue(mode: m, topic: t, ownText: o, depth: d) }
                dismiss()
            } label: {
                Text("Lektion bauen")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.card)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(
                        buildEnabled ? Theme.ink : Theme.muted.opacity(0.4),
                        in: RoundedRectangle(cornerRadius: 14)
                    )
            }
            .disabled(!buildEnabled)
            .accessibilityIdentifier("build-lesson")
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
        }
        .background(Theme.paper)
    }

    // ── S3 Bestätigen (Foto) ──
    /// Dieselbe Bestätigungs-Karte wie bisher, nur eine Ebene tiefer im Sheet
    /// statt in einem eigenen Vollbild — der Weg zurück ist der normale Chevron.
    @ViewBuilder
    private var fotoBestaetigung: some View {
        if let ergebnis = foto.ergebnis {
            FotoBestaetigungView(
                ergebnis: ergebnis,
                fotos: foto.fotos,
                onZurueck: { path.removeLast() },
                onClose: schliessen,
                onBauen: bauenAusFoto
            )
        }
    }

    /// Die Fotos hat die Erkennung serverseitig schon aus dem Eingang geräumt —
    /// hier gibt es nichts mehr zu verwerfen, nur den Auftrag anzulegen.
    private func bauenAusFoto(thema: String, quelle: String?, interpretation: String?, depth: Depth) {
        let quelltext = foto.quelltext(quelle: quelle, interpretation: interpretation)
        Task { await jobs.enqueuePhoto(topic: thema, source: quelle, sourceText: quelltext, depth: depth) }
        dismiss()
    }

    private func sheetHeader(kicker: String, title: String, onBack: (() -> Void)? = nil) -> some View {
        VStack(spacing: 6) {
            HStack {
                if let onBack {
                    Button(action: onBack) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.ink)
                            .frame(width: 32, height: 32)
                            .background(Circle().stroke(Theme.line))
                    }
                    .accessibilityIdentifier("sheet-back")
                }
                Spacer()
                Button { schliessen() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 32, height: 32)
                        .background(Circle().stroke(Theme.line))
                }
                .accessibilityIdentifier("sheet-close")
            }
            Text(kicker)
                .microCaps()
                .foregroundStyle(Theme.muted)
            Text(title)
                .font(Theme.serif(30))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 22)
    }
}

struct DepthPicker: View {
    @Binding var depth: Depth

    var body: some View {
        VStack(spacing: 8) {
            ForEach(Depth.allCases) { d in
                Button { depth = d } label: {
                    HStack {
                        Text(d.rawValue)
                            .font(.system(size: 15.5, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                        Spacer()
                        Text(d.estimate)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(
                        depth == d ? Theme.ich.opacity(0.14) : Theme.card,
                        in: RoundedRectangle(cornerRadius: 12)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(depth == d ? Theme.ich : Theme.line)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("depth-\(d.rawValue)")
            }
        }
    }
}
