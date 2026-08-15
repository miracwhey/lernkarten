import SwiftUI
import UIKit

/// Kamera-Screen — Layout 1:1 aus FotoAufnahmeMockup (abgenommene Spec): Sucher im
/// abgerundeten Rechteck, Banner oben, darunter Stapel-Leiste mit Auslöser und
/// „Fertig". Neu gegenüber dem Mockup ist nur, was das Mockup nicht regelt: das
/// Warten auf die Erkennung (Sucher friert ein) und der technische Fehler.
struct FotoAufnahmeView: View {
    @ObservedObject var modell: FotoFlussModel
    var onClose: () -> Void

    @StateObject private var kamera = FotoKamera()

    /// Höchstens drei Vorschauen in der Leiste — bei fünf Fotos passt die Zeile
    /// sonst nicht mehr neben Auslöser und „Fertig"; der Zähler trägt die Wahrheit.
    private var sichtbareVorschauen: [AufgenommenesFoto] { Array(modell.fotos.prefix(3)) }

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                RoundedRectangle(cornerRadius: 22)
                    .fill(Theme.ink)
                    .overlay { sucher }
                    .clipShape(RoundedRectangle(cornerRadius: 22))
                    .overlay(alignment: .bottom) { wartehinweis }

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
                    .accessibilityIdentifier("foto-close")
                }
                .padding(12)
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)

            if modell.phase == .fehler { fehlerkarte }

            leiste
        }
        .background(Theme.paper)
        .task { await kamera.starten() }
        .onDisappear { kamera.stoppen() }
    }

    // ── Sucher ──

    @ViewBuilder
    private var sucher: some View {
        if modell.phase == .erkennung || modell.phase == .fehler {
            // Eingefroren: das zuletzt Geschossene bleibt stehen, kein neuer Screen.
            if let letztes = modell.fotos.last {
                Image(uiImage: letztes.bild)
                    .resizable()
                    .scaledToFill()
                    .allowsHitTesting(false)
                    .overlay(Theme.ink.opacity(0.35))
            }
        } else if FotoFake.kamera {
            Image(uiImage: FotoFake.naechstes(modell.fotos.count))
                .resizable()
                .scaledToFill()
                .allowsHitTesting(false)
        } else if kamera.laeuft {
            KameraVorschau(session: kamera.session)
                .allowsHitTesting(false)
        } else if kamera.abgelehnt {
            Text("Ohne Kamera-Erlaubnis kann ich nichts sehen. Du kannst sie in den Einstellungen freigeben.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.paper.opacity(0.8))
                .multilineTextAlignment(.center)
                .padding(28)
        }
    }

    @ViewBuilder
    private var wartehinweis: some View {
        if modell.phase == .erkennung {
            HStack(spacing: 8) {
                ProgressView()
                    .controlSize(.small)
                    .tint(Theme.paper)
                // Solange noch Bilder rausgehen, sagt der Hinweis genau das — sonst
                // behauptet er ein Anschauen, das noch gar nicht begonnen hat.
                Text(modell.uploadsLaufen ? "Deine Fotos gehen noch raus" : "Ich schaue mir deine Fotos an")
                    .microCaps()
                    .foregroundStyle(Theme.paper)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Theme.ink.opacity(0.55), in: Capsule())
            .padding(.bottom, 16)
            .accessibilityIdentifier("foto-warten")
        }
    }

    /// Ein 502 der Function ist ein technischer Fehler — nie der Zustand „unsicher".
    /// Der Grund steht im Klartext dabei: am Gerät gibt es keine Konsole, in die
    /// man schauen könnte, also ist dieser Kasten die einzige Fehlerquelle.
    private var fehlerkarte: some View {
        HStack(spacing: 10) {
            Text(modell.fehlertext ?? "Technischer Fehler — versuch es gleich noch einmal")
                .font(.system(size: 13.5))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("foto-fehler")
            Spacer(minLength: 0)
            Button { Task { await modell.nochmal() } } label: {
                Text("Nochmal")
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(Theme.chrome, in: Capsule())
            }
            .accessibilityIdentifier("foto-retry")
        }
        .padding(14)
        .background(Theme.es.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.es.opacity(0.35)))
        .padding(.horizontal, 14)
        .padding(.top, 12)
    }

    // ── Stapel-Leiste ──

    private var leiste: some View {
        HStack(spacing: 14) {
            HStack(spacing: 6) {
                ForEach(sichtbareVorschauen) { foto in
                    Image(uiImage: foto.bild)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 44, height: 58)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.line))
                        // Der Normalfall bleibt still — das Mockup zeigt hier nackte
                        // Vorschauen. Nur ein endgültig gescheiterter Upload meldet
                        // sich, damit kein Foto unbemerkt aus dem Stapel fällt.
                        .overlay(alignment: .topTrailing) {
                            if foto.upload.gescheitert {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 11))
                                    .foregroundStyle(Theme.bad)
                                    .padding(2)
                                    .background(Theme.paper, in: Circle())
                                    .offset(x: 4, y: -4)
                                    .accessibilityIdentifier("foto-upload-fehler")
                            }
                        }
                }
                Text("\(modell.fotos.count)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 26, height: 26)
                    .background(Theme.chrome, in: Circle())
                    .accessibilityIdentifier("foto-zaehler")
            }
            Spacer()
            Button(action: ausloesen) {
                Circle()
                    .stroke(Theme.ink.opacity(0.35), lineWidth: 3)
                    .frame(width: 62, height: 62)
                    .overlay(Circle().fill(Theme.ink).frame(width: 48, height: 48))
                    .opacity(modell.kannAusloesen ? 1 : 0.4)
            }
            .disabled(!modell.kannAusloesen)
            .accessibilityIdentifier("foto-ausloeser")
            Spacer()
            Button { Task { await modell.erkennen() } } label: {
                Text("Fertig")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.card)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                    .background(modell.kannFertig ? Theme.ink : Theme.muted.opacity(0.4), in: Capsule())
            }
            .disabled(!modell.kannFertig)
            .accessibilityIdentifier("foto-fertig")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    private func ausloesen() {
        if FotoFake.kamera {
            modell.aufnehmen(FotoFake.naechstes(modell.fotos.count))
        } else {
            kamera.ausloesen { bild in
                guard let bild else { return }
                modell.aufnehmen(bild)
            }
        }
    }
}
