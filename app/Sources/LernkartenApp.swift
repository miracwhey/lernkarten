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

    var body: some Scene {
        WindowGroup {
            if let screen = mockupScreen {
                FotoMockupHost(screen: screen)
            } else {
                RootView()
            }
        }
    }
}
