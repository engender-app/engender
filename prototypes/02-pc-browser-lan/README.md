# PC browser LAN transport probe

**Decision, 2026-09-28: defer PC browser implementation.** Without Android
`INTERNET` permission, the app could not open TCP or UDP sockets on the target
phone. With that permission granted in a temporary debug build, the deployed
HTTPS PC app and native app WebView exchanged encrypted test strings over a
private IPv4 WebRTC route. This settles the socket and browser transport
questions, but not QR-bound pairing or the required internet-disconnected
run. No production permission or CSP changed. Earlier browser trials and
[transport research](RESEARCH.md) remain below as context.

## With Network permission

The temporary debug manifest in [AndroidManifest.debug.xml](AndroidManifest.debug.xml)
added `android.permission.INTERNET`. GrapheneOS listed that permission as
requested but did not grant Network access automatically. Before the grant,
TCP and UDP still failed with `EPERM`; after the grant, both socket tests
passed. The app WebView then gathered a private IPv4 host candidate at
`192.168.0.97` with no ICE servers. It had gathered none before the grant.

`probe-native-webrtc.mjs` opened the deployed HTTPS app in Fedora Chromium
153 and used the installed app's `https://localhost/` WebView on the phone.
It passed SDP between them through ADB DevTools, using no hosted signaling,
STUN, or TURN service. The script kept only the phone's private IPv4
candidate. Both sides received their fixed test string. The selected UDP
pair used the phone's `192.168.0.97` host candidate. A second run opened a
new PC tab and succeeded. After stopping and reopening the Android app, a
third run also succeeded with a new WebView DevTools tunnel.

The data channel used WebRTC's DTLS certificate fingerprints from the SDP.
`--tamper-fingerprint` changed one digit of the fingerprint delivered to the
PC: ICE still connected, but DTLS failed and neither test string arrived.
This proves that channel rejects a fingerprint mismatch. It does not bind
the fingerprint to the person or device until a trusted pairing exchange
does that.

These are lab actions, not product setup. The run needed a debug APK with
`INTERNET`, GrapheneOS Network permission, ADB DevTools forwarding, and a PC
script to exchange SDP. No QR exchange or browser UI exists yet. Internet
remained available over Wi-Fi, so the run did not satisfy the offline gate.
The selected route was private IPv4, but the test did not rule out every
possible internet route under other network conditions. Only fixed strings
crossed the channel; no journal data or keys were read.

To repeat the lab, copy the manifest above to
`android/app/src/debug/AndroidManifest.xml`, then build with JDK 21 and
install the debug APK with `adb install -r`. Grant GrapheneOS Network
permission in App info or with `adb shell pm grant dev.engender.app
android.permission.INTERNET`. Launch the app and inspect
`adb shell cat /proc/net/unix` for its `webview_devtools_remote_<pid>`
socket. Forward that socket to local port 9223 with `adb forward`, then run
`node prototypes/02-pc-browser-lan/probe-native-webrtc.mjs`. Repeat the
script for a new PC tab. For app restart, force-stop and reopen the app,
refresh the ADB forward for its new socket, and run the script again. Run
the script with `--tamper-fingerprint` for the mismatch test. Remove the
copied manifest and reinstall the normal debug APK when finished. The
phone was restored this way after the trial; the test APK and ADB tunnel
were removed.

## Native Android permission check

The installed `0.0.0-dev` app on a Pixel 10a running GrapheneOS Android 17
did not request `android.permission.INTERNET`. An instrumentation test ran in
its process and called `new ServerSocket(0)` and `new DatagramSocket(0)`.
Both failed at socket creation with `java.net.SocketException: socket failed:
EPERM (Operation not permitted)`. No journal record or key was read. The
test APK was removed after the run; the main app was not reinstalled.

The test source is [LanPermissionProbeTest.java](LanPermissionProbeTest.java).
To repeat the check, use JDK 21 and run these commands from the repository
root. Keep the already installed main app; the test runs against that app.

```sh
cp prototypes/02-pc-browser-lan/LanPermissionProbeTest.java \
  android/app/src/androidTest/java/dev/engender/app/
npm run build
npx cap sync android
(cd android && ./gradlew :app:assembleDebugAndroidTest)
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w -e class dev.engender.app.LanPermissionProbeTest \
  dev.engender.app.test/androidx.test.runner.AndroidJUnitRunner
adb uninstall dev.engender.app.test
rm android/app/src/androidTest/java/dev/engender/app/LanPermissionProbeTest.java
```

The test deliberately fails twice when sockets are denied. Remove the copied
source so those expected failures do not enter regular Android test runs.

The app's WebView was checked separately through a temporary ADB DevTools
tunnel. `probe-webview.mjs` created a WebRTC offer with `iceServers: []`
inside the real `https://localhost/` app document. Its context was secure,
but after ten seconds ICE was still gathering and its SDP had zero
candidates. This result does not by itself prove why WebRTC failed. The
socket failures establish the native HTTP and native WebRTC candidates'
permission blocker.

No product setup or reconnect sequence exists under the no-permission
constraint. The phone and PC were not disconnected from internet during this
negative test: socket creation failed before any address or route could be
used. With permission, the transport trial above is partial; ticket 04 must
not treat the complete PC browser flow as proven.

## PC check after reopening

`probe-local-http.mjs` loaded the deployed HTTPS app in Fedora Chromium
153.0.8010.52 and asked it to fetch a fixed string from a listener on the
PC's own LAN address. The real response header blocked the fetch at
`connect-src 'self'`; the listener received zero requests. In a second run,
the script replaced only that CSP header in the browser and granted Chrome's
local network permission. The fetch returned `local-only probe`, and the
listener received one request. The script checks both results and exits with
an error if either changes.

```sh
node prototypes/02-pc-browser-lan/probe-local-http.mjs 192.168.0.74
```

Use the PC's current LAN IPv4 address in place of `192.168.0.74`. The script
starts and stops its own listener. The second run is a controlled browser
check, not the deployed policy: Playwright grants the permission without a
human prompt, and no Android device participates. It establishes that this
Chromium build can reach a private HTTP address from the app's HTTPS origin
when policy and permission allow it. It does not establish a product pairing
flow, encrypted messages, an offline route to Android, or reconnect. The
Android app still lacks `INTERNET` permission and a listener. No production
policy changed for this check.

## What ran

PC used Fedora Chromium 153. Phone was a Pixel 10a running GrapheneOS
Vanadium 154. PC and phone were on the same Wi-Fi subnet at `192.168.0.74`
and `192.168.0.97`. VPN was off. Phone mobile data was disabled for the test
and restored afterward. Phone pinged PC over Wi-Fi: one reply from
`192.168.0.74`, 53.6 ms. Phone browser loaded the probe from PC over the
same LAN.

The disposable server serves one page over HTTP and HTTPS. HTTPS responses
carry the current production nginx CSP from
`deploy/nginx/journal-headers.conf`, including `connect-src 'self'`. Both
pages use `RTCPeerConnection` with no ICE servers, so the probe cannot use
STUN or TURN. A local Node server exchanges SDP between pages. Browser
certificate warnings were bypassed for a one-day self-signed test
certificate. This was a lab exception, not a product setup path.

Chromium reported a secure context and two host candidates. Vanadium also
reported a secure context, but completed gathering with **zero candidates**.
It received PC's SDP fingerprint and returned its own; no ICE route was
selected and no data channel opened. Earlier HTTP trial likewise returned
zero Android candidates. No peer authentication, encrypted transfer,
reconnect after tab or app restart, or local-only data route was shown.

The repository's documented `app.engender.dev` address did not resolve. The
actual public app is `https://app.gender-diary.barankiewicz.dev/`. Its HTML
was last modified on 2026-08-12, so it is older than this checkout. A fresh
Chromium 153 profile loaded that HTTPS app and received its real CSP header
and meta policy. `probe-deployed.mjs` created an offer there with no ICE
servers and gathered two host candidates. This proves the old deployed
browser page can start WebRTC under its CSP. It does not prove a connection.

The two-device probe used a local page with the current nginx CSP header. It
did not run inside either version of the app document. It used Vanadium in
place of the Android app. The installed Android app reports version
`0.0.0-dev` and has no `INTERNET` permission. PC internet access remained
available during the trial, and Wi-Fi still had internet access while phone
mobile data was off. The required internet-disconnected test did not happen.
These limits prevent a pass decision.

## Setup actions and missing path

To repeat the lab, connect both devices to one LAN and disable phone mobile
data and VPN. Generate a one-day certificate, start the server with the PC
LAN address, then run the PC browser script in a second terminal:

```sh
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /tmp/pc-probe-key.pem -out /tmp/pc-probe-cert.pem \
  -days 1 -subj /CN=localhost
node prototypes/02-pc-browser-lan/server.mjs \
  /tmp/pc-probe-key.pem /tmp/pc-probe-cert.pem 192.168.0.74
node prototypes/02-pc-browser-lan/run-pc.mjs
```

Replace `192.168.0.74` with the PC's LAN address. Open the Android URL
printed by the server in Vanadium and accept its certificate warning. The
PC script accepts the test certificate through Playwright. The Node server
must stay up for the automatic SDP exchange. Its pages send only fixed test
strings; they never read journal content or keys. To retry after a tab or
app restart, stop and restart the server to clear its stored offer and
answer, then repeat the page opens. That is a lab reset, not a proven
product reconnect procedure.

This setup is **not** an acceptable implicit requirement for PC sync.
No user-run helper, certificate installation, or certificate-warning bypass
has been approved as a product step. Manual QR signaling and identity
comparison were not demonstrated. The probe prints SDP fingerprints but
does not pin or compare them, so its signaling helper could substitute a
peer. No reconnect procedure was demonstrated. A browser cannot listen for
an incoming LAN connection through the current app surface; this prototype
did not find a helper-free signaling path.

The permission check above supersedes this earlier trial's possible paths.
Android-to-Android and PC-to-Android LAN socket transport both fail under
the required no-`INTERNET` manifest. Ticket 04 must carry this deferral;
browser CSP must not be widened for speculative peer traffic.
