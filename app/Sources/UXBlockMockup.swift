import SwiftUI
import UIKit

/// MOCKUP des UX-Blocks (Design-Block 16.08.) — Vorschlag zur Abnahme, noch nicht verdrahtet.
/// Zwei Beschwerden von Leon, beide als Lock formuliert:
///   (1) „Weg zur Kamera zu viele Schritte" → der Sucher lebt IM Erstellen-Sheet,
///       kein Platzhalter, kein Extra-Screen.
///   (2) „Bau-Wartezeit ist ein blindes Loch" → Stufenbalken in der Bibliothekszeile,
///       Tap öffnet die Bau-Detail-Ebene.
/// Zahlen und Texte sind echt: Stufennamen aus dem Worker, Dauern aus den
/// gemessenen Läufen (kompakt 224–357 s), Lektionen aus Leons Bibliothek.
/// Kein Backend — Fake-State; Testfotos kommen aus dem App-Container.

enum UXMockupScreen: String {
    case sheet, bibliothek, detail, fehler
}

private func mockupFoto(_ n: String) -> UIImage? {
    guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    else { return nil }
    return UIImage(contentsOfFile: docs.appendingPathComponent("IMG_\(n).jpg").path)
}

// ── (1) Erstellen-Sheet: der Sucher IST der Foto-Tab ──

/// Gegenüber heute fällt zweierlei weg: die schwarze Platzhalter-Fläche mit dem
/// gemalten Auslöser und der Vollbild-Ausflug dahinter. Dafür muss der Kopf
/// schrumpfen — der Serif-Titel „Erfassen" kostete die Höhe, die der Sucher braucht.
struct UXSheetMockup: View {
    @State private var stapel: [String] = ["2844", "2845"]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Neues lernen")
                    .microCaps()
                    .foregroundStyle(Theme.muted)
                Spacer()
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 32, height: 32)
                    .background(Circle().stroke(Theme.line))
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 12)

            ZStack(alignment: .top) {
                RoundedRectangle(cornerRadius: 22)
                    .fill(Theme.ink)
                    .overlay {
                        if let img = mockupFoto("2846") {
                            Image(uiImage: img).resizable().scaledToFill()
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 22))

                // Rechts bleibt Luft, damit das Banner umbricht statt die
                // Sucher-Kante zu berühren — so stand es im abgenommenen Mockup.
                HStack {
                    Text("Cover + Seiten — alles wird EINE Lektion")
                        .microCaps()
                        .foregroundStyle(Theme.paper)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Theme.ink.opacity(0.55), in: RoundedRectangle(cornerRadius: 18))
                    Spacer(minLength: 56)
                }
                .padding(12)
            }
            .padding(.horizontal, 14)

            // Stapel · Auslöser · Fertig — unverändert aus dem abgenommenen
            // Aufnahme-Mockup, nur eine Ebene höher gezogen.
            HStack(spacing: 14) {
                HStack(spacing: 6) {
                    ForEach(stapel, id: \.self) { n in
                        Group {
                            if let img = mockupFoto(n) {
                                Image(uiImage: img).resizable().scaledToFill()
                            } else {
                                Rectangle().fill(Theme.chrome)
                            }
                        }
                        .frame(width: 44, height: 58)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.line))
                    }
                    Text("\(stapel.count)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 26, height: 26)
                        .background(Theme.chrome, in: Circle())
                }
                Spacer()
                Circle()
                    .stroke(Theme.ink.opacity(0.35), lineWidth: 3)
                    .frame(width: 62, height: 62)
                    .overlay(Circle().fill(Theme.ink).frame(width: 48, height: 48))
                Spacer()
                Text("Fertig")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.card)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                    .background(Theme.ink, in: Capsule())
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)

            // Der Umschalter bleibt sichtbar: Thema und eigener Text sind
            // gleichrangige Wege, nicht versteckte Sonderfälle.
            HStack(spacing: 6) {
                ForEach(["Foto", "Thema", "Eigener Text"], id: \.self) { m in
                    Text(m)
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(m == "Foto" ? Theme.ink : Theme.muted)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(m == "Foto" ? Theme.card : .clear, in: Capsule())
                }
            }
            .padding(4)
            .background(Theme.chrome, in: Capsule())
            .padding(.bottom, 10)
        }
        .background(Theme.paper)
    }
}

// ── (2a) Bibliothek: die Bau-Zeile bekommt einen Balken und ein Tap-Ziel ──

struct UXBibliothekMockup: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Sonntag, 16. August")
                        .microCaps()
                        .foregroundStyle(Theme.muted)
                    Text("Bibliothek")
                        .font(Theme.serif(34))
                        .foregroundStyle(Theme.ink)
                }
                .padding(.top, 8)

                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("14")
                            .font(.system(size: 44, weight: .bold))
                            .foregroundStyle(Theme.ink)
                        Text("Karten fällig")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Theme.ink)
                    }
                    Text("6 aus Manipulation · 8 aus Einkreisung")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                    Text("Jetzt üben")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.card)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Theme.ink, in: RoundedRectangle(cornerRadius: 14))
                }
                .padding(18)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.line))

                VStack(spacing: 0) {
                    UXBauZeile(titel: "Graffiti macht Stadt", stufe: 2, zeit: "2:41")
                    Divider().overlay(Theme.line.opacity(0.6))
                    UXLektionsZeile(titel: "Die Kunst der Psychologie",
                                    unter: "Annika Durand · 8 Karten", faellig: 6)
                    Divider().overlay(Theme.line.opacity(0.6))
                    UXLektionsZeile(titel: "Einkreisung ohne Front",
                                    unter: "Robert Greene · 8 Karten", faellig: 8)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .background(Theme.paper)
    }
}

/// Drei Segmente statt einer Prozentleiste: die Pipeline kennt genau drei Stufen,
/// mehr Auflösung gäbe es nur erfunden. Der Chevron sagt, dass es weitergeht.
struct UXBauZeile: View {
    let titel: String
    let stufe: Int          // 0 Warteschlange · 1 Quellen · 2 Karten · 3 Prüfen
    let zeit: String

    private var stufenName: String {
        switch stufe {
        case 1: return "Quellen sammeln"
        case 2: return "Karten schreiben"
        case 3: return "Fakten & Bilder prüfen"
        default: return "In der Warteschlange"
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(Color(hex: 0xC9C6BB).opacity(0.55)).frame(width: 20, height: 20).offset(x: -11)
                Circle().fill(Color(hex: 0xA9A69A).opacity(0.45)).frame(width: 20, height: 20).offset(x: -1)
            }
            .compositingGroup()
            .frame(width: 46, height: 24)

            VStack(alignment: .leading, spacing: 6) {
                Text(titel)
                    .font(Theme.serif(18, weight: .medium))
                    .foregroundStyle(Theme.muted)
                HStack(alignment: .firstTextBaseline, spacing: 7) {
                    Circle().fill(Theme.ich).frame(width: 7, height: 7).offset(y: -2)
                    Text("\(stufenName) · \(zeit)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.ich)
                }
                UXStufenBalken(stufe: stufe)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.muted.opacity(0.6))
        }
        .padding(.vertical, 13)
    }
}

struct UXStufenBalken: View {
    let stufe: Int

    var body: some View {
        HStack(spacing: 3) {
            ForEach(1...3, id: \.self) { i in
                Capsule()
                    .fill(i <= stufe ? Theme.ich : Theme.line)
                    .frame(height: 3)
            }
        }
        .frame(maxWidth: 168)
    }
}

struct UXLektionsZeile: View {
    let titel: String
    let unter: String
    let faellig: Int

    private static let palette = [Theme.es, Theme.ich, Theme.ueberich]

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(Self.palette[0]).frame(width: 20, height: 20).offset(x: -11)
                Circle().fill(Self.palette[1]).frame(width: 20, height: 20).offset(x: 11)
                Circle().fill(Self.palette[2]).frame(width: 20, height: 20)
            }
            .compositingGroup()
            .opacity(0.92)
            .frame(width: 46, height: 24)

            VStack(alignment: .leading, spacing: 3) {
                Text(titel)
                    .font(Theme.serif(18, weight: .medium))
                    .foregroundStyle(Theme.ink)
                Text(unter)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            VStack(spacing: 1) {
                Text("\(faellig)")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Theme.ink)
                Text("fällig")
                    .microCaps(9)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 13)
    }
}

// ── (2b) Bau-Detail: was gerade passiert, ohne Rätselraten ──

struct UXDetailMockup: View {
    var gescheitert = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image(systemName: "chevron.left")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .frame(width: 32, height: 32)
                    .background(Circle().stroke(Theme.line))
                Spacer()
            }
            .padding(.bottom, 18)

            Text(gescheitert ? "Bau gescheitert" : "Wird gebaut")
                .microCaps()
                .foregroundStyle(gescheitert ? Theme.bad : Theme.muted)
                .padding(.bottom, 6)
            Text("Graffiti macht Stadt")
                .font(Theme.serif(30))
                .foregroundStyle(Theme.ink)
            Text("Ihme-Passage, Hannover · Kompakt")
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .padding(.top, 4)
                .padding(.bottom, 22)

            VStack(spacing: 0) {
                UXStufenZeile(name: "Quellen sammeln", zustand: .fertig, zeit: "0:52")
                Divider().overlay(Theme.line.opacity(0.6))
                UXStufenZeile(name: "Karten schreiben",
                              zustand: gescheitert ? .gescheitert : .laeuft,
                              zeit: gescheitert ? nil : "läuft")
                Divider().overlay(Theme.line.opacity(0.6))
                UXStufenZeile(name: "Fakten & Bilder prüfen", zustand: .offen, zeit: nil)
            }
            .padding(.horizontal, 16)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line))

            if gescheitert {
                Text("Das Modell hat dreimal nacheinander keine gültigen Karten geliefert. Die Lektion wurde verworfen — dein erkannter Text ist gespeichert, der Bau lässt sich damit wiederholen.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(14)
                    .background(Theme.es.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.es.opacity(0.35)))
                    .padding(.top, 16)

                // Ohne diesen Knopf wäre der Auftrag eine Sackgasse: Thema, Quelle
                // und erkannter Text stehen im gescheiterten Job, der neue Bau
                // braucht kein neues Foto.
                Text("Noch einmal bauen")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.card)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(Theme.ink, in: RoundedRectangle(cornerRadius: 14))
                    .padding(.top, 12)
            } else {
                // Ehrliche Erwartung: die Spanne ist gemessen (224–357 s über fünf
                // kompakte Läufe), nicht geraten — und sie wird als Spanne genannt,
                // nicht als eine Zahl, die dann fast immer falsch ist.
                VStack(alignment: .leading, spacing: 4) {
                    Text("Läuft seit 2:41")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    Text("Kompakte Lektionen brauchen meist 4 bis 6 Minuten.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                }
                .padding(.top, 16)
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .background(Theme.paper)
    }
}

struct UXStufenZeile: View {
    enum Zustand { case fertig, laeuft, offen, gescheitert }

    let name: String
    let zustand: Zustand
    let zeit: String?

    private var symbol: (String, Color) {
        switch zustand {
        case .fertig: return ("checkmark.circle.fill", Theme.ok)
        case .laeuft: return ("circle.dotted.circle", Theme.ich)
        case .offen: return ("circle", Theme.line)
        case .gescheitert: return ("xmark.circle.fill", Theme.bad)
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol.0)
                .font(.system(size: 16))
                .foregroundStyle(symbol.1)
                .frame(width: 20)
            Text(name)
                .font(.system(size: 15, weight: zustand == .laeuft ? .semibold : .regular))
                .foregroundStyle(zustand == .offen ? Theme.muted : Theme.ink)
            Spacer()
            if let zeit {
                Text(zeit)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 14)
    }
}

// ── Host für den Direkteinstieg ──

struct UXMockupHost: View {
    let screen: UXMockupScreen

    var body: some View {
        switch screen {
        case .sheet: UXSheetMockup()
        case .bibliothek: UXBibliothekMockup()
        case .detail: UXDetailMockup()
        case .fehler: UXDetailMockup(gescheitert: true)
        }
    }
}
