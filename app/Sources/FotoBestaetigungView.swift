import SwiftUI

/// Bestätigungs-Karte — Layout 1:1 aus FotoBestaetigungMockup (abgenommene Spec),
/// gespeist aus der echten Erkennung und den echten Fotos des Stapels. Der Tap auf
/// „Lektion bauen" ist die Bestätigung: alles darüber ist editierbar.
struct FotoBestaetigungView: View {
    let ergebnis: ErkennungsErgebnis
    let fotos: [AufgenommenesFoto]
    var onZurueck: () -> Void
    var onClose: () -> Void
    var onBauen: (_ thema: String, _ quelle: String?, _ interpretation: String?, _ depth: Depth) -> Void

    @State private var thema: String
    @State private var interpretation: String
    @State private var depth: Depth = .standard

    private let zustand: BestaetigungsZustand

    init(ergebnis: ErkennungsErgebnis,
         fotos: [AufgenommenesFoto],
         onZurueck: @escaping () -> Void,
         onClose: @escaping () -> Void,
         onBauen: @escaping (String, String?, String?, Depth) -> Void) {
        self.ergebnis = ergebnis
        self.fotos = fotos
        self.onZurueck = onZurueck
        self.onClose = onClose
        self.onBauen = onBauen
        zustand = FotoErkennung.zustand(ergebnis)
        // Vorbefüllt aus der Erkennung — im Zustand „unsicher" bleibt das Feld leer,
        // weil dort nichts zu bestätigen ist, sondern etwas beizusteuern.
        _thema = State(initialValue: zustand == .unsicher ? "" : (ergebnis.thema ?? ""))
        _interpretation = State(initialValue: ergebnis.interpretation ?? "")
    }

    private var kicker: String {
        switch zustand {
        case .erkannt: return "Erkannt · \(fotos.count) \(fotos.count == 1 ? "Foto" : "Fotos")"
        case .unsicher: return "Nicht sicher erkannt"
        case .diagramm: return "Diagramm erkannt"
        }
    }

    private var titel: String {
        switch zustand {
        case .erkannt: return FotoText.titel(quelle: ergebnis.quelle, typ: ergebnis.typ)
        case .unsicher: return "Hilf kurz nach"
        case .diagramm: return "Schaubild aus deinem Foto"
        }
    }

    private var canBuild: Bool {
        !thema.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if zustand == .erkannt { quellenKarte }
                    if zustand == .unsicher { unsicherHinweis }
                    if zustand == .diagramm { interpretationsKarte }

                    themaFeld

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Tiefe")
                            .microCaps()
                            .foregroundStyle(Theme.muted)
                        DepthPicker(depth: $depth)
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollDismissesKeyboard(.interactively)

            bauenButton
        }
        .background(Theme.paper)
    }

    private var header: some View {
        VStack(spacing: 6) {
            HStack {
                Button(action: onZurueck) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 32, height: 32)
                        .background(Circle().stroke(Theme.line))
                }
                .accessibilityIdentifier("foto-zurueck")
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 32, height: 32)
                        .background(Circle().stroke(Theme.line))
                }
                .accessibilityIdentifier("foto-close")
            }
            Text(kicker)
                .microCaps()
                .foregroundStyle(zustand == .unsicher ? Theme.es : Theme.muted)
            Text(titel)
                .font(Theme.serif(28))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("foto-titel")
            if zustand == .erkannt, let autor = FotoText.autor(quelle: ergebnis.quelle) {
                Text(autor)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 18)
    }

    /// Erkannt: die Quelle als ruhige Karte mit den echten Foto-Vorschauen.
    private var quellenKarte: some View {
        HStack(spacing: 10) {
            ForEach(fotos.prefix(3)) { foto in
                Image(uiImage: foto.bild)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 52, height: 68)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.line))
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(FotoText.inhalt(typ: ergebnis.typ, anzahl: fotos.count))
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Text("Die Lektion baut auf deinen fotografierten Seiten auf.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line))
    }

    /// Unsicher: ehrliche Degradation — kein Raten, klare nächste Schritte.
    /// „Neu fotografieren" führt zurück zur Kamera MIT dem bestehenden Stapel.
    private var unsicherHinweis: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Ich konnte nicht sicher lesen, was auf den Fotos ist. Sag mir das Thema — oder fotografiere noch einmal näher und ruhig.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                if let erstes = fotos.first {
                    Image(uiImage: erstes.bild)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 44, height: 58)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .opacity(0.45)
                }
                Button(action: onZurueck) {
                    Text("Neu fotografieren")
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(Theme.chrome, in: Capsule())
                }
                .accessibilityIdentifier("foto-neu")
                Spacer()
            }
        }
        .padding(14)
        .background(Theme.es.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.es.opacity(0.35)))
    }

    /// Diagramm: die Interpretation ist Inhalt-Quelle → Leon bestätigt sie
    /// wörtlich (editierbar) — sein Tap ist das Gate, das sonst fehlt.
    private var interpretationsKarte: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("So lese ich dein Schaubild")
                    .microCaps()
                    .foregroundStyle(Theme.ich)
                Spacer()
                Image(systemName: "pencil")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
            TextField("", text: $interpretation, axis: .vertical)
                .font(Theme.serif(17, weight: .medium))
                .foregroundStyle(Theme.ink)
                .lineLimit(2...5)
                .accessibilityIdentifier("foto-interpretation")
            Text("Stimmt das nicht, tippe rein und korrigiere — die Lektion baut darauf auf.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.muted)
        }
        .padding(14)
        .background(Theme.ich.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.ich.opacity(0.4)))
    }

    private var themaFeld: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(zustand == .unsicher ? "Worum geht es?" : "Thema der Lektion")
                .microCaps()
                .foregroundStyle(Theme.muted)
            HStack(spacing: 8) {
                TextField("Thema eingeben", text: $thema, axis: .vertical)
                    .font(Theme.serif(19, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .accessibilityIdentifier("foto-thema")
                if !thema.isEmpty {
                    Image(systemName: "pencil")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                }
            }
            .padding(14)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line))
        }
    }

    private var bauenButton: some View {
        Button {
            onBauen(
                thema,
                ergebnis.quelle,
                zustand == .diagramm ? interpretation : nil,
                depth
            )
        } label: {
            Text("Lektion bauen")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.card)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(
                    canBuild ? Theme.ink : Theme.muted.opacity(0.4),
                    in: RoundedRectangle(cornerRadius: 14)
                )
        }
        .disabled(!canBuild)
        .accessibilityIdentifier("foto-bauen")
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }
}
