# PC browser and Android LAN options

Research checked 2026-09-28. This is a source review, not a successful device
test. The failed [probe](README.md) does not establish that a separate install
is necessary.

The later native app test settled the no-`INTERNET` permission constraint:
TCP and UDP socket creation both failed with `EPERM` on the target phone.
The HTTP and native WebRTC paths below require those sockets. A temporary
debug build with `INTERNET` granted opened both socket types, and its WebView
exchanged encrypted test strings with the deployed PC browser over a private
IPv4 WebRTC route. See the README for the remaining pairing and offline
gaps. Neither path is approved for production under the current spec.

## First approach to prove

The existing Android app can contain a small HTTP server. The PC keeps using
the trusted HTTPS web app and connects to the phone's private IP address.
Chrome's Local Network Access documentation explicitly permits
`fetch('http://192.168.0.1/ping')` from a secure page after the user grants
local network permission. It exempts this request from mixed content blocking
because the hostname is a private IP literal. Chrome announced this permission
for version 142. This removes the assumption that every HTTPS-to-phone request
needs a trusted certificate on the phone. [Chrome documentation][1]

[NanoHTTPD][2] is an existing Java library for an embedded HTTP server; its
documentation names serving files from Android as a use case. It would ship
inside the journal app. The user would update that app, open sync on both
devices, pair them, and accept the browser's local network prompt. They would
not install a PC helper, browser extension, or trusted certificate. This is
an implementation proposal, not behavior already present in the app.

HTTP itself does not protect journal data. The transport must carry only
authenticated encrypted protocol messages, with peer identity bound through
QR pairing and replay protection. Reuse an established cryptographic protocol
or the sync architecture's reviewed protocol; NanoHTTPD supplies HTTP, not
these guarantees. The PC must continue loading executable code from its
trusted HTTPS origin or that origin's offline cache. Serving the journal UI
from the phone over HTTP would change its storage origin and expose bootstrap
code to network modification.

The existing CSP uses `connect-src 'self'`, which blocks this cross-origin
fetch. Both enforced CSP policies would need an intentional change; the
browser's permission does not override them. The Android endpoint also needs
appropriate CORS handling, request limits, and authentication. The app needs
native networking permission and should open its listener only during an
explicit sync session. The current manifest omits `INTERNET`. These are app
changes, not extra installations. [Repository CSP][3] [Android manifest][4]

The first proof should target the actual PC Chromium build. The Chrome source
does not establish equivalent behavior in Firefox or Safari. Check the cached
HTTPS app after internet disconnection, including permission prompts and
reopening the tab. Private IP connectivity still depends on the LAN allowing
communication between clients. A changed phone address can require another
address entry step; the paired identity should remain valid.

## WebRTC remains an alternative

The browser already contains WebRTC. Android can embed a native implementation
instead of relying on Vanadium. [libdatachannel][5] explicitly supports Android,
browser interoperability, and encrypted data channels. Its API permits no ICE
servers and supports binding to a local address. That makes it a concrete
candidate for a LAN-only transport, subject to testing on this phone. Configure
both peers without external STUN or TURN services. ICE can still exchange
STUN connectivity checks directly between peers; those checks are not a
hosted STUN service. [libdatachannel API][6]

Signaling can travel through manually exchanged QR payloads instead of an
internet server. The payloads must include the complete offer and answer with
gathered candidates, and bind the peer's identity to its certificate
fingerprint. Both directions need a usable transfer step; a PC without a
camera needs another way to import the phone's response. Reconnection needs
fresh negotiation. WebRTC encryption alone does not prove the intended peer's
identity: RFC 8827 describes fingerprint substitution attacks and verification
through an independent channel. [WebRTC security architecture][7]

[simple-peer][8] wraps browser WebRTC and exposes signaling messages for the
application to deliver. Its `trickle: false` option emits one signaling object,
which suits manual exchange. Its defaults include Google and Twilio STUN
servers, so an offline design must explicitly use `config: { iceServers: [] }`.
It does not supply a native Android transport or bypass browser restrictions.
[PeerJS][9] includes a PeerServer signaling model; adding it alone does not
solve offline discovery or signaling.

The previous phone trial used Vanadium on GrapheneOS. GrapheneOS documents a
most-private default WebRTC IP handling policy and a toggle to change it.
That policy is a plausible reason to investigate the zero-candidate result.
Its causal role was not tested, and a Vanadium result cannot establish how
a native Android WebRTC library would behave. [GrapheneOS features][10]

## Evidence still needed for ticket 02

Use the deployed HTTPS app's complete policies and the real Android app, with
internet unavailable on both devices. Show pairing that rejects the wrong
peer, encrypted bidirectional transfer, a verified local route, and reconnect
after each app restarts. Record every user action. Test the embedded HTTP path
first: Chrome documents the needed browser capability, and it fits an Android
listener without introducing WebRTC signaling. Keep the WebRTC path available
if the HTTP path fails a required browser or policy constraint.

[1]: https://developer.chrome.com/blog/local-network-access
[2]: https://github.com/NanoHttpd/nanohttpd
[3]: ../../deploy/nginx/journal-headers.conf
[4]: ../../android/app/src/main/AndroidManifest.xml
[5]: https://github.com/paullouisageneau/libdatachannel
[6]: https://github.com/paullouisageneau/libdatachannel/blob/master/DOC.md#rtcCreatePeerConnection
[7]: https://www.rfc-editor.org/rfc/rfc8827.html#section-9.1
[8]: https://github.com/feross/simple-peer#api
[9]: https://github.com/peers/peerjs
[10]: https://grapheneos.org/features
