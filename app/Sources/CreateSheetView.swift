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

    var estimate: String {
        switch self {
        case .kompakt: return "ca. 7 Karten · 4 Min"
        case .standard: return "ca. 12 Karten · 7 Min"
        case .tief: return "ca. 20 Karten · 12 Min"
        }
    }
}

/// Ebene 2 — Erstellen. Kurzlebiges Sheet: Erfassen → Bestätigen → Sheet schließt.
/// Jederzeit abbrechbar, hinterlässt keine halben Zustände.
/// Kamera (VisionKit) und „Lektion bauen" werden mit Foto-Fluss/Worker verdrahtet.
struct CreateSheetView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var mode: CaptureMode = .foto
    @State private var topic = ""
    @State private var ownText = ""
    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            captureStep
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: String.self) { _ in
                    confirmStep.toolbar(.hidden, for: .navigationBar)
                }
        }
    }

    // ── S2 Erfassen ──
    private var captureStep: some View {
        VStack(spacing: 0) {
            sheetHeader(kicker: "Neues lernen", title: "Erfassen")

            VStack(spacing: 16) {
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
                    }
                }
                .padding(4)
                .background(Theme.chrome, in: Capsule())
            }
            .padding(.horizontal, 20)

            Spacer()
        }
        .background(Theme.paper)
    }

    private var photoPane: some View {
        VStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 22)
                .fill(Theme.ink)
                .frame(height: 360)
                .overlay {
                    VStack(spacing: 14) {
                        Image(systemName: "text.viewfinder")
                            .font(.system(size: 44, weight: .light))
                            .foregroundStyle(Theme.paper.opacity(0.85))
                        Text("Seite ins Bild — Text wird auf dem Gerät gelesen")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.paper.opacity(0.75))
                    }
                }
            // Auslöser — scharf geschaltet mit dem Foto-Fluss (VisionKit).
            Circle()
                .stroke(Theme.ink.opacity(0.3), lineWidth: 3)
                .frame(width: 62, height: 62)
                .overlay(Circle().fill(Theme.ink.opacity(0.25)).frame(width: 48, height: 48))
        }
    }

    private var topicPane: some View {
        VStack(spacing: 14) {
            TextField("Worüber willst du lernen?", text: $topic)
                .font(Theme.serif(20, weight: .medium))
                .padding(16)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line))
            continueButton(enabled: !topic.trimmingCharacters(in: .whitespaces).isEmpty)
        }
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
        }
    }

    private func continueButton(enabled: Bool) -> some View {
        Button { path.append("confirm") } label: {
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
                DepthPicker()
            }
            .padding(.horizontal, 20)

            Spacer()

            // Verdrahtet mit dem Worker (Job-Queue) in Schritt 5.
            Button {} label: {
                Text("Lektion bauen")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.card)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(Theme.muted.opacity(0.4), in: RoundedRectangle(cornerRadius: 14))
            }
            .disabled(true)
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
        }
        .background(Theme.paper)
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
                Button { dismiss() } label: {
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
    @State private var depth: Depth = .standard

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
