import SwiftUI
import WebKit

/// Ereignis aus der Karten-Fläche (postMessage-Bridge von card-canvas.html).
enum CardEvent {
    case tap(dir: Int)
    case advance
    case quizResult(correct: Bool)
    case save(saved: Bool)
}

/// Die Karten-Fläche: ein WKWebView, das card-canvas.html lädt und pro Karte
/// window.renderCard(json) aufruft. Renderer = dieselbe Quelle wie Mockup und Audit-Kette.
struct CardCanvas: UIViewRepresentable {
    let cardJSON: String
    var onEvent: (CardEvent) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(onEvent: onEvent) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "card")
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.isScrollEnabled = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.pendingJSON = cardJSON
        let url = Bundle.main.url(forResource: "card-canvas", withExtension: "html")!
        web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        context.coordinator.onEvent = onEvent
        context.coordinator.render(cardJSON, in: web)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        var onEvent: (CardEvent) -> Void
        var pendingJSON: String?
        private var ready = false
        private var lastRendered: String?

        init(onEvent: @escaping (CardEvent) -> Void) { self.onEvent = onEvent }

        func render(_ json: String, in web: WKWebView) {
            guard ready else { pendingJSON = json; return }
            guard json != lastRendered else { return }
            lastRendered = json
            web.evaluateJavaScript("renderCard(\(json))")
        }

        func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else { return }
            switch type {
            case "ready":
                ready = true
                if let json = pendingJSON, let web = message.webView {
                    pendingJSON = nil
                    render(json, in: web)
                }
            case "tap":
                onEvent(.tap(dir: body["dir"] as? Int ?? 1))
            case "advance":
                onEvent(.advance)
            case "quizResult":
                onEvent(.quizResult(correct: body["correct"] as? Bool ?? false))
            case "save":
                onEvent(.save(saved: body["saved"] as? Bool ?? false))
            default:
                break
            }
        }
    }
}
