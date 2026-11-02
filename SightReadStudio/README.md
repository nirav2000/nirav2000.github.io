# SightRead Studio · v2.0.0

Live hosted app: **https://nirav2000.github.io/SightReadStudio/**

SightRead Studio is a piano-reading coach targeting note identification, rhythm and two-hand sight-reading, from foundations towards Grade 3. The four-bar scores are **generated original exercises**, not official ABRSM exam material. Progress and MIDI performance records are stored only on the device unless exported; the app does not capture audio or use a paid API.

## Added in v2

- **Connect piano**: macOS Chrome/Edge Web MIDI input, USB-MIDI auto detection, source selection and key-on key test for Casio CDP-S160 or Yamaha CLP-745; unplug/replug handling.
- **iPad companion source** in [`ios/`](ios/README.md): a small SwiftUI/WKWebView host with a CoreMIDI bridge for wired USB and Yamaha Bluetooth MIDI; it needs Xcode signing and physical iPad installation. iPad Safari alone cannot access MIDI devices.
- **Actual keyboard inputs** in Note recognition, Rhythm lab and Two hands. The on-screen keys remain available, with no MIDI required.
- **First-read MIDI capture**: first-note start or a four-beat count-in, actual MIDI note-on/off messages, fixed target tempo and manual completion. A colour-coded, detailed assessment shows pitch accuracy, time errors, late/missed/extra notes, both-hand onset synchronisation, hesitations and duration estimate.
- **Colourful assessment demonstration** using clearly labelled synthetic performances, without saving them as Sai's real results.
- **Progress history**: stores MIDI assessment details locally for review; JSON/CSV export; automatic level advancement only after repeated unseen successes and supporting drills.
- Accessible, responsive desktop, iPad and phone layouts; PWA offline caching and installable icon.

## Setup

### Mac / Windows with supported browser

1. Open the hosted app in Chrome or Edge. Connect either instrument's USB TO HOST (USB-B) port using a USB-C ⇄ USB-B **data** cable, then switch it on.
2. Choose **Connect piano**, press **Connect / allow MIDI**, grant browser permission, and select the device. Play a key: the page should display its note name.
3. Practice notes or rhythm on the real keys, or open **First read**. Reveal the score for 30 seconds, then choose **Start on first note** or **4-beat count-in**, play once and press **Finish & assess**.

### iPad Pro

- **No app installation necessary** for a demonstration, parent-assisted scoring and touchscreen drills; use Safari and **Add to Home Screen**.
- For **real MIDI scoring** on an iPad, build/sign/install the native companion described in [`ios/README.md`](ios/README.md). Native CoreMIDI is used because Safari/iPadOS lacks Web MIDI. USB-C to USB-B for both pianos, or Yamaha CLP-745 Bluetooth MIDI if fitted in your region.
- Safari and the companion have separate local storage. Export and import JSON to transfer progress between them.

## Assessment maths and limitations

The deterministic `midi-core.js` compares incoming pitch/onsets against each exercise's expected beat at its selected tempo; it does **not** do transcription from microphone audio. Colour semantics: green = on time, amber = within the broader timing window, red = off-beat/missing. Unexpected pitches are counted separately. The app scores pitch, rhythm, pauses, and simultaneously notated RH/LH attacks. **MIDI cannot identify the physical hand that pressed a key**, and cannot reliably distinguish both hands playing the same key. Bluetooth introduces more jitter than wired USB. The marks are coaching estimates, **not ABRSM exam scores**.

Unseen performance is intentionally scored on the **first attempt**; a synthetic demo never changes progress. Parent-assisted scores remain available when the keyboard is disconnected. Local grade advancement requires at least two strong first reads at the current level plus demonstrated note and rhythm/hands skills; it can be disabled in Settings.

## Development and testing

All web files are vanilla HTML/CSS/JavaScript and static-hostable, with no package/runtime dependencies. Test scripts require Node 22+ and Python Playwright/Chromium for visual/browser integration.

```sh
node --check app.js
node tests/original2.cjs
node tests/midi-core.test.cjs
python tests/smoke.py
python tests/browser-integration.py
```

The tests use simulated MIDI message traffic. Automated browser and core scoring checks have passed; **physical Casio/Yamaha and a signed iOS build are not yet hardware verified**. Native iPad project sources are provided with a macOS build CI workflow.

## Data and preservation

- localStorage key `sightread-studio-progress-v1` preserves v1 data through the v2 upgrade; old JSON backups continue to import.
- Local records can be exported/imported from Settings. MIDI clips remain note-event data, not audio.
- No credentials, Firebase keys or private teaching information are embedded. Existing `nirav2000/SightReading` Grade 2 assets are untouched.
