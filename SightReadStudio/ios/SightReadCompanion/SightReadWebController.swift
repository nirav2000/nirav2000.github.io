import UIKit
import WebKit
import CoreMIDI
import CoreAudioKit

/// Restricted, first-party host for the SightRead Studio website.
/// The website never talks directly to CoreMIDI: it sends commands through the
/// `sightread` WKScriptMessageHandler and receives normalised MIDI1 events.
final class SightReadWebController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private let appURL = URL(string: "https://nirav2000.github.io/SightReadStudio/")!
    private var webView: WKWebView!
    private var midi: PianoMidiInput!
    private var webLoaded = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.06, green: 0.10, blue: 0.17, alpha: 1)
        let contentController = WKUserContentController()
        contentController.add(self, name: "sightread")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(webView)
        webView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        midi = PianoMidiInput()
        midi.onSourcesChanged = { [weak self] sources in
            self?.sendToWeb(["type": "sources", "sources": sources])
        }
        midi.onMessage = { [weak self] sourceID, bytes in
            self?.sendToWeb(["type": "midi", "sourceId": sourceID, "bytes": bytes.map(Int.init)])
        }
        midi.start()
        webView.load(URLRequest(url: appURL, cachePolicy: .returnCacheDataElseLoad))
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "sightread")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webLoaded = true
        sendToWeb(["type": "sources", "sources": midi.sources()])
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let allowed = url.scheme == "https" && url.host == appURL.host &&
                      (url.path == "/SightReadStudio" || url.path.hasPrefix("/SightReadStudio/"))
        if allowed { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated, url.scheme == "https" {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "sightread", message.frameInfo.isMainFrame,
              webView.url?.host == appURL.host,
              webView.url?.path.hasPrefix("/SightReadStudio/") == true,
              let payload = message.body as? [String: Any],
              let command = payload["type"] as? String else { return }
        switch command {
        case "list": midi.scanAndConnect()
        case "select": midi.selected = payload["id"] as? String
        case "pairBluetooth":
            // Bluetooth MIDI pairing is done in CoreAudioKit, not iOS Settings' audio pairing screen.
            let pairing = CABTMIDICentralViewController()
            present(pairing, animated: true)
        default: break
        }
    }

    private func sendToWeb(_ object: [String: Any]) {
        guard webLoaded, JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('sightread-native-message',{detail:\(json)}));",
                completionHandler: nil
            )
        }
    }
}

/// CoreMIDI 1.0 input. Class-compliant USB sources (Casio and Yamaha) and
/// Bluetooth LE MIDI sources (Yamaha, where fitted) appear the same way.
final class PianoMidiInput {
    var onSourcesChanged: (([[String: String]]) -> Void)?
    var onMessage: ((String, [UInt8]) -> Void)?
    var selected: String?

    private var client: MIDIClientRef = 0
    private var input: MIDIPortRef = 0
    private var connected = Set<MIDIEndpointRef>()
    private var activeSources = [MIDIEndpointRef]()

    func start() {
        let status = MIDIClientCreateWithBlock("SightRead Studio" as CFString, &client) { [weak self] _ in
            DispatchQueue.main.async { self?.scanAndConnect() }
        }
        guard status == noErr else { return }
        let result = MIDIInputPortCreateWithBlock(client, "Piano Input" as CFString, &input) { [weak self] packetList, connection in
            guard let self else { return }
            let sourceID = String(UInt(bitPattern: connection))
            // Apple provides an unsafe sequence which traverses variable-length MIDI packets
            // correctly; never call MIDIPacketNext on a copied MIDIPacket.
            for packet in packetList.unsafeSequence() {
                let bytes = Array(packet.sequence())
                self.parse(bytes, sourceID: sourceID)
            }
        }
        guard result == noErr else { return }
        scanAndConnect()
    }

    func scanAndConnect() {
        let count = Int(MIDIGetNumberOfSources())
        let endpoints = (0..<count).map { MIDIGetSource($0) }.filter { $0 != 0 }
        let current = Set(endpoints)
        for old in connected.subtracting(current) { MIDIPortDisconnectSource(input, old) }
        for endpoint in current.subtracting(connected) {
            let opaque = UnsafeMutableRawPointer(bitPattern: Int(endpoint))
            _ = MIDIPortConnectSource(input, endpoint, opaque)
        }
        connected = current
        activeSources = endpoints
        onSourcesChanged?(sources())
    }

    func sources() -> [[String: String]] {
        activeSources.map { endpoint in
            ["id": String(endpoint),
             "name": property(endpoint, kMIDIPropertyDisplayName) ?? property(endpoint, kMIDIPropertyName) ?? "MIDI Keyboard",
             "manufacturer": property(endpoint, kMIDIPropertyManufacturer) ?? "MIDI",
             "state": "connected"]
        }
    }

    private func property(_ endpoint: MIDIEndpointRef, _ id: CFString) -> String? {
        var string: Unmanaged<CFString>?
        guard MIDIObjectGetStringProperty(endpoint, id, &string) == noErr else { return nil }
        return string?.takeRetainedValue() as String?
    }

    private func parse(_ bytes: [UInt8], sourceID: String) {
        guard bytes.count <= 4096 else { return }
        var runningStatus: UInt8 = 0
        var i = 0
        while i < bytes.count {
            let byte = bytes[i]
            if byte >= 0xF8 { i += 1; continue } // Real-time clock, not a note.
            if byte >= 0x80 {
                if byte >= 0xF0 { runningStatus = 0; i += 1; continue }
                runningStatus = byte
                i += 1
            }
            let kind = runningStatus & 0xF0
            guard runningStatus != 0 else { i += 1; continue }
            let dataLength = (kind == 0xC0 || kind == 0xD0) ? 1 : 2
            guard i + dataLength <= bytes.count else { break }
            let values = Array(bytes[i..<(i+dataLength)])
            i += dataLength
            if (kind == 0x80 || kind == 0x90 || kind == 0xB0) && values.count == 2 {
                let message = [runningStatus, values[0], values[1]]
                DispatchQueue.main.async { [weak self] in
                    guard self?.selected == nil || self?.selected == sourceID else { return }
                    self?.onMessage?(sourceID, message)
                }
            }
        }
    }

    deinit {
        if input != 0 { MIDIPortDispose(input) }
        if client != 0 { MIDIClientDispose(client) }
    }
}
