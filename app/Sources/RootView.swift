import SwiftUI

/// Wurzel-Routing: Bibliothek ist der einzige dauerhafte Ort; Erstellen (Sheet) und
/// Session (Vollbild) sind die beiden Ausflüge. Maximale Tiefe 2.
struct RootView: View {
    @StateObject private var store = ReviewStore()
    @State private var lessons: [Lesson] = []
    @State private var learning: Lesson?
    @State private var practicing = false
    @State private var creating = false

    var body: some View {
        LibraryView(
            lessons: lessons,
            srs: store.srs,
            onLearn: { learning = $0 },
            onPractice: { practicing = true },
            onCreate: { creating = true }
        )
        .fullScreenCover(item: $learning) { LearnSessionView(lesson: $0) }
        .fullScreenCover(isPresented: $practicing) { PracticeSessionView(lessons: lessons, store: store) }
        .sheet(isPresented: $creating) { CreateSheetView() }
        .onAppear {
            if lessons.isEmpty { lessons = LessonStore.loadAll() }
        }
        .task { await store.start() }
    }
}
