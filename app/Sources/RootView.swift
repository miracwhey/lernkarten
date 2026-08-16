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
    /// Die einzige Vertiefung der Bibliothek: der Bau-Auftrag. Im Pfad steht seine
    /// Id, nicht der Job selbst — so zeigt die Detail-Ansicht immer den Stand aus
    /// dem Store und friert nicht auf dem Zustand des Antippens ein.
    @State private var bauPfad: [UUID] = []

    /// Selbst gebaute Lektionen zuerst (neueste oben), darunter die gebündelten
    /// in ihrer kuratierten Reihenfolge.
    private var lessons: [Lesson] { jobStore.remoteLessons + bundled }

    var body: some View {
        NavigationStack(path: $bauPfad) {
            LibraryView(
                lessons: lessons,
                srs: store.srs,
                jobs: jobStore.jobs,
                auftragsFehler: jobStore.auftragsFehler,
                onLearn: { learning = $0 },
                onJob: { bauPfad.append($0.id) },
                onPractice: { practicing = true },
                onCreate: { creating = true }
            )
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: UUID.self) { id in
                bauDetail(id)
                    .toolbar(.hidden, for: .navigationBar)
            }
        }
        // Ist der Auftrag durch, verschwindet er aus der Liste — und die Ansicht,
        // die ihn zeigte, hat kein Thema mehr. Zurück in die Bibliothek, wo die
        // fertige Lektion jetzt steht.
        .onChange(of: jobStore.jobs) { _, jobs in
            if let id = bauPfad.last, !jobs.contains(where: { $0.id == id }) {
                bauPfad.removeAll()
            }
        }
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

    @ViewBuilder
    private func bauDetail(_ id: UUID) -> some View {
        if let job = jobStore.jobs.first(where: { $0.id == id }) {
            BauDetailView(
                job: job,
                fehler: jobStore.auftragsFehler,
                onWiederholen: { Task { await jobStore.wiederholen(job) } },
                onZurueck: { bauPfad.removeAll() }
            )
        }
    }
}
