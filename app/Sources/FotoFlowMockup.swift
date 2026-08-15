import SwiftUI
import UIKit

/// MOCKUP des Foto-Flusses (Design-Block 15.08.) — bindend nach Leon-Abnahme.
/// Vier Zustände: Aufnahme (Mehr-Foto-Stapel) · Bestätigung erkannt ·
/// Bestätigung unsicher (ehrliche Degradation zum Formular) · Diagramm
/// (Klartext-Interpretation als bestätigbarer Block). Inhalte = echte
/// Erkennungs-Ergebnisse aus dem Qwen-32B-Bench (probes/foto-testset).
/// Kein Backend, keine Kamera — Fake-State; Testfotos werden im Simulator
/// direkt vom Mac-Dateisystem geladen (nie im Bundle, Repo ist public).

enum FotoMockupScreen: String {
    case aufnahme, erkannt, unsicher, diagramm
}

// Die Testfotos liegen im Documents-Ordner des App-Containers (der Shot-Runner
// kopiert sie via `simctl get_app_container … data` hinein) — die iOS-Sandbox
// gilt auch im Simulator, Mac-Pfade außerhalb des Containers sind nicht lesbar.
private func testFoto(_ n: String) -> UIImage? {
    guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    else { return nil }
    return UIImage(contentsOfFile: docs.appendingPathComponent("IMG_\(n).jpg").path)
}

// ── Aufnahme: Mehr-Foto-Stapel, eine Quelle pro Durchgang ──

struct FotoAufnahmeMockup: View {
    var onFertig: () -> Void = {}
    var onClose: () -> Void = {}
    @State private var stapel: [String] = ["2844", "2845"]

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                // Sucher — im echten Bau die Kamera-Vorschau (VisionKit).
                RoundedRectangle(cornerRadius: 22)
                    .fill(Theme.ink)
                    .overlay {
                        if let img = testFoto("2846") {
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFill()
                                .allowsHitTesting(false)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 22))

                HStack {
                    Text("Cover + Seiten — alles wird EINE Lektion")
                        .microCaps()
                        .foregroundStyle(Theme.paper)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Theme.ink.opacity(0.55), in: Capsule())
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.paper)
                            .frame(width: 32, height: 32)
                            .background(Theme.ink.opacity(0.55), in: Circle())
                    }
                }
                .padding(12)
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)

            // Stapel-Leiste: geschossene Fotos + Auslöser + Fertig.
            HStack(spacing: 14) {
                HStack(spacing: 6) {
                    ForEach(stapel, id: \.self) { n in
                        if let img = testFoto(n) {
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 44, height: 58)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.line))
                        }
                    }
                    Text("\(stapel.count)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 26, height: 26)
                        .background(Theme.chrome, in: Circle())
                }
                Spacer()
                Button { stapel.append("2846") } label: {
                    Circle()
                        .stroke(Theme.ink.opacity(0.35), lineWidth: 3)
                        .frame(width: 62, height: 62)
                        .overlay(Circle().fill(Theme.ink).frame(width: 48, height: 48))
                }
                Spacer()
                Button(action: onFertig) {
                    Text("Fertig")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.card)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 11)
                        .background(Theme.ink, in: Capsule())
                }
                .accessibilityIdentifier("foto-fertig")
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
        }
        .background(Theme.paper)
    }
}

// ── Bestätigung: drei Zustände einer Karte ──

struct FotoBestaetigungMockup: View {
    enum Zustand { case erkannt, unsicher, diagramm }
    let zustand: Zustand
    var onClose: () -> Void = {}
    var onBack: () -> Void = {}

    @State private var thema: String
    @State private var interpretation =
        "Die Kurve zeigt: Der Schlafdruck steigt über den Tag stetig an und fällt erst im Schlaf wieder ab."
    @State private var depth: Depth = .standard

    init(zustand: Zustand, onClose: @escaping () -> Void = {}, onBack: @escaping () -> Void = {}) {
        self.zustand = zustand
        self.onClose = onClose
        self.onBack = onBack
        // Thema = echtes Qwen-32B-Ergebnis aus dem Bench (Serie B); der
        // Diagramm-Zustand bekommt ein zur Beispiel-Interpretation passendes Thema.
        let start: String
        switch zustand {
        case .unsicher: start = ""
        case .diagramm: start = "Schlafdruck: Warum die Müdigkeit über den Tag wächst"
        case .erkannt: start = "Strategien der Kriegsführung und psychologische Einkreisung"
        }
        _thema = State(initialValue: start)
    }

    private var quelle: (kicker: String, titel: String) {
        switch zustand {
        case .erkannt: return ("Erkannt · 3 Fotos", "The 33 Strategies of War")
        case .unsicher: return ("Nicht sicher erkannt", "Hilf kurz nach")
        case .diagramm: return ("Diagramm erkannt", "Schaubild aus deinem Foto")
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

            bauenButton
        }
        .background(Theme.paper)
    }

    private var header: some View {
        VStack(spacing: 6) {
            HStack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 32, height: 32)
                        .background(Circle().stroke(Theme.line))
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 32, height: 32)
                        .background(Circle().stroke(Theme.line))
                }
            }
            Text(quelle.kicker)
                .microCaps()
                .foregroundStyle(zustand == .unsicher ? Theme.es : Theme.muted)
            Text(quelle.titel)
                .font(Theme.serif(28))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)
            if zustand == .erkannt {
                Text("Robert Greene")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 18)
    }

    /// Erkannt: die Quelle als ruhige Karte mit den Foto-Thumbnails.
    private var quellenKarte: some View {
        HStack(spacing: 10) {
            ForEach(["2844", "2845", "2846"], id: \.self) { n in
                if let img = testFoto(n) {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 52, height: 68)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.line))
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Cover + 2 Seiten")
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
    private var unsicherHinweis: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Ich konnte nicht sicher lesen, was auf den Fotos ist. Sag mir das Thema — oder fotografiere noch einmal näher und ruhig.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                if let img = testFoto("2842") {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 44, height: 58)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .opacity(0.45)
                }
                Button {} label: {
                    Text("Neu fotografieren")
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(Theme.chrome, in: Capsule())
                }
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
        Button {} label: {
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
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }
}

/// Direkteinstieg für Simulator-Shots: Launch-Argument `-foto-mockup <screen>`.
struct FotoMockupHost: View {
    let screen: FotoMockupScreen

    var body: some View {
        switch screen {
        case .aufnahme: FotoAufnahmeMockup()
        case .erkannt: FotoBestaetigungMockup(zustand: .erkannt)
        case .unsicher: FotoBestaetigungMockup(zustand: .unsicher)
        case .diagramm: FotoBestaetigungMockup(zustand: .diagramm)
        }
    }
}
