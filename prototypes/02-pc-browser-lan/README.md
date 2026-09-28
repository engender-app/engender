# PC browser LAN transport probe

**Decision, 2026-09-28: defer PC browser sync.** This probe did not establish
an authenticated, encrypted Android connection from the deployed PC app. Do
not add browser sync, a hosted signaling service, or a broader network policy
on this evidence.

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

Ticket 04 should keep PC sync deferred until a new proof uses the deployed
HTTPS app in the target PC browser and the real Android app, with internet
disconnected on both devices. That proof must show QR-bound peer identity,
encrypted transfer, selected local candidate addresses, and reconnection
after each side restarts. It must list every setup and reconnect action.
Until then, Android-to-Android sync can proceed without changing the PC
browser CSP for speculative peer traffic.
