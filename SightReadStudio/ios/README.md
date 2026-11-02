# SightRead Studio · iPad MIDI companion

The browser app at https://nirav2000.github.io/SightReadStudio/ already works with USB MIDI on Chrome/Edge for macOS, but iPadOS Safari does not implement Web MIDI. This small native iPad app embeds the **same web interface** in WKWebView and makes MIDI input available using CoreMIDI. All recordings remain local to the app's own website storage, **separate from Safari storage**.

## Install on Sai's iPad (requires a Mac with Xcode)

1. Open `ios/SightReadCompanion.xcodeproj` in Xcode on a Mac.
2. Select the `SightReadCompanion` target → **Signing & Capabilities**, choose your Apple development team and change the bundle identifier if required.
3. Connect the iPad by USB or Xcode's wireless debugging, select it as the run destination, then press **Run**. This builds and installs the app; it is not an App Store release.
4. In the installed app open **Connect piano**. For the Casio CDP-S160, connect a USB-C→USB Type-B **data** cable to the iPad and piano (power on the piano). For the Yamaha CLP-745, connect the same way, or tap **Pair Yamaha Bluetooth MIDI** and select the Clavinova. This is Bluetooth **MIDI**, not Bluetooth audio.
5. Press a piano key. The live-key test will show its name. Select the correct input if other MIDI ports appear.
6. Return to *Note recognition*, *Rhythm lab*, *Two hands*, or *First read*. Start a timed/first-note session to record your performance.

## Limitations and privacy

- iOS native app is **source included**. It must be compiled and signed with Xcode for installation on an iPad; a website alone cannot install this bridge, and no IPA is distributed.
- CoreMIDI devices can be enumerated but hardware behaviour has not been verified on Sai's two physical pianos.
- Bluetooth MIDI latency varies; wired USB is preferable for the most accurate time measurements.
- If the Yamaha was not sold with Bluetooth MIDI in your region, use USB MIDI instead.
- The host navigation is restricted to `https://nirav2000.github.io/SightReadStudio/`. It does not request file, camera, or microphone permissions or capture audio.
- CoreMIDI 1 input uses MIDI1 byte messages, including notes and sustain pedal controller.
- If an iPadOS device uses an older Lightning connector, an appropriate Apple USB camera adapter and externally powered hub may be needed. Current USB-C iPad can use a class-compliant USB-B data cable.

## Build check

```sh
xcodebuild -project ios/SightReadCompanion.xcodeproj \
  -scheme SightReadCompanion -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

This project is self-contained (SwiftUI + CoreMIDI + CoreAudioKit + WebKit) and has no third-party libraries or paid APIs.
