import SwiftUI

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}

/// Design-Tokens — Werte 1:1 aus renderer.css (:root). Hell-only.
enum Theme {
    static let paper = Color(hex: 0xF2F1EC)
    static let card = Color(hex: 0xFBFAF7)
    static let ink = Color(hex: 0x1E2230)
    static let muted = Color(hex: 0x6B6F7E)
    static let line = Color(hex: 0xDCDAD1)
    static let chrome = Color(hex: 0xE7E5DD)
    static let es = Color(hex: 0xD4553E)
    static let ich = Color(hex: 0x4759C7)
    static let ueberich = Color(hex: 0xA87A25)
    static let ok = Color(hex: 0x2E7D4F)
    static let bad = Color(hex: 0xB3402E)

    /// Buch-Serif wie im Renderer (Iowan Old Style ist auf iOS vorinstalliert).
    static func serif(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .custom("Iowan Old Style", size: size).weight(weight)
    }
}

/// Micro-Caps-Zeile (Eyebrow/Labels) wie .micro im Mockup.
struct MicroCaps: ViewModifier {
    var size: CGFloat = 11
    func body(content: Content) -> some View {
        content
            .font(.system(size: size, weight: .semibold))
            .textCase(.uppercase)
            .tracking(1.4)
    }
}

extension View {
    func microCaps(_ size: CGFloat = 11) -> some View { modifier(MicroCaps(size: size)) }
}
