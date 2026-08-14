import SwiftUI

/// Wurzel-Routing: Bibliothek ist der einzige dauerhafte Ort; Erstellen (Sheet) und
/// Session (Vollbild) sind die beiden Ausflüge. Maximale Tiefe 2.
struct RootView: View {
    @StateObject private var store = ReviewStore()
    @StateObject private var jobStore = JobStore()
    @Environment(\.scenePhase) private var scenePhase
    @State private var bundled: [Lesson] = []
    @State private var learning: Lesson?
    @State private var practicing = false
    @State private var creating = false

    /// Selbst gebaute Lektionen zuerst (neueste oben), darunter die gebündelten
    /// in ihrer kuratierten Reihenfolge.
    private var lessons: [Lesson] { jobStore.remoteLessons + bundled }

    var body: some View {
        LibraryView(
            lessons: lessons,
            srs: store.srs,
            jobs: jobStore.jobs,
            enqueueError: jobStore.enqueueError,
            onLearn: { learning = $0 },
            onPractice: { practicing = true },
            onCreate: { creating = true }
        )
        .fullScreenCover(item: $learning) { LearnSessionView(lesson: $0) }
        .fullScreenCover(isPresented: $practicing) { PracticeSessionView(lessons: lessons, store: store) }
        .sheet(isPresented: $creating) { CreateSheetView(jobs: jobStore) }
        .onAppear {
            if bundled.isEmpty { bundled = LessonStore.loadAll() }
        }
        .task { await store.start() }
        .task { await jobStore.start() }
        // Zweiter Weg neben Realtime: im Hintergrund bricht die Verbindung weg,
        // beim Zurückkommen zählt der frisch geholte Stand.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await jobStore.refresh() } }
        }
    }
}
