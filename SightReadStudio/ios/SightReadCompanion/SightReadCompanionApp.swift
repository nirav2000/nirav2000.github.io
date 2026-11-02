import SwiftUI

@main
struct SightReadCompanionApp: App {
    var body: some Scene {
        WindowGroup {
            SightReadBrowser()
                .ignoresSafeArea(edges: .bottom)
        }
    }
}

struct SightReadBrowser: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> SightReadWebController {
        SightReadWebController()
    }

    func updateUIViewController(_ uiViewController: SightReadWebController, context: Context) {}
}
