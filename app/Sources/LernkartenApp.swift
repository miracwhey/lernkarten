import SwiftUI

@main
struct LernkartenApp: App {
    /// `-foto-mockup <aufnahme|erkannt|unsicher|diagramm>` startet direkt einen
    /// Mockup-Zustand des Foto-Flusses (Simulator-Shots, Design-Block 15.08.).
    private var mockupScreen: FotoMockupScreen? {
        guard let i = ProcessInfo.processInfo.arguments.firstIndex(of: "-foto-mockup"),
              i + 1 < ProcessInfo.processInfo.arguments.count
        else { return nil }
        return FotoMockupScreen(rawValue: ProcessInfo.processInfo.arguments[i + 1])
    }

    /// `-ux-mockup <sheet|bibliothek|detail|fehler>` startet direkt eine Ansicht des
    /// UX-Blocks (Sucher im Sheet · Bau-Fortschritt, Design-Block 16.08.).
    private var uxMockupScreen: UXMockupScreen? {
        guard let i = ProcessInfo.processInfo.arguments.firstIndex(of: "-ux-mockup"),
              i + 1 < ProcessInfo.processInfo.arguments.count
        else { return nil }
        return UXMockupScreen(rawValue: ProcessInfo.processInfo.arguments[i + 1])
    }

    var body: some Scene {
        WindowGroup {
            if let screen = mockupScreen {
                FotoMockupHost(screen: screen)
            } else if let screen = uxMockupScreen {
                UXMockupHost(screen: screen)
            } else {
                RootView()
            }
        }
    }
}
