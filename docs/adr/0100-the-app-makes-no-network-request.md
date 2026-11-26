# The app makes no network request, and Android declares no INTERNET permission

Status: Accepted
Decided: 2026-11-02
Last reviewed: 2026-11-02
Supersedes: ADR-0090 (LAN pairing keeps journal keys local)

engender never sends a request to anything but its own origin. On Android it
does not hold the permission that would let it open a socket at all. A journal
leaves the device only as a file the person makes: an export, a backup, a
printed page, or the auto-export folder another app may carry somewhere. Any
sync between devices stays file-based.

This rule used to live only in a manifest comment and the checks that enforce
it. ADR-0090 said the opposite: that two devices would pair and exchange
changes over the local network. That work was parked on 21 October 2026, and
this record replaces it.

## What holds it

- **The manifest.** `android/app/src/main/AndroidManifest.xml` declares no
  `android.permission.INTERNET`, with a comment saying why. It also opts out of
  WebView diagnostic uploads (`android.webkit.WebView.MetricsOptOut`).
- **The source test.** `tests/android-manifest-permissions.test.ts` fails if
  `INTERNET` comes back into the source manifest and lists every declared
  permission with its reason.
- **The packaged APK.** A dependency can add a permission through manifest
  merging, which the source test never sees. `scripts/check-release-artifacts.mjs`
  reads the built APK's permissions through aapt2 and refuses anything outside
  its expected list; `tests/check-release-artifacts.test.ts` checks that it
  rejects a dependency-added `INTERNET` or `ACCESS_NETWORK_STATE`.
- **The content security policy.** `svelte.config.js` sets `connect-src 'self'`
  and `default-src 'self'` in the document's own policy, so it applies inside
  the Capacitor WebView where no server header exists. Script injection is the
  bug that could reach the data key in memory, and this leaves it nowhere to
  send it.
- **The built app, online and offline.** `tests/browser-tier/verify-build.mjs`
  records every request the production build makes and fails on any that
  leaves the build's origin, once with the network up and once without.

On Android the bundle is served out of the APK by Capacitor's asset loader, so
even the app's own origin never touches a socket. On the web the origin is a
server and the service worker caches the build for offline use. Fonts, the
SQLite wasm, OCR language data and PDF fonts all come from that origin. A link
to an outside site, such as a helpline in Resources, opens in the person's
browser (`target="_blank"` in `src/routes/support/resources/+page.svelte`); the
browser makes that request, and the person chose it.

## Why

The permission list is the one privacy claim somebody can check without
trusting the code. An app that declares `INTERNET` and promises not to use it
asks to be taken at its word. Without it, "no telemetry, no account, no
server" can be verified from the Play listing or `aapt dump permissions`.

Every feature that might seem to need the network already works without it:
backup and restore are files, Archive Merge (ADR-0098) carries edits and
deletions through an archive, and folder sync (ADR-0099) merges another
device's auto-export from a folder something else keeps in step.

## Why LAN pairing is dropped

ADR-0090 decided how keys would stay local if two devices paired over the local
network. No app code was built on it; only a browser transport proof existed.
Shipping it would have meant putting `INTERNET` back, a second persistence path
every new area had to answer to, and a listener kept running. Merge and folder
sync give most of what pairing would: the same journal on two devices, kept in
step by a tool the person already trusts to move files.

The sync-over-LAN design stays parked. If users ask for live sync after Merge and
folder sync ship, it returns as a new decision that argues against this one,
not as a revival of ADR-0090.

## Consequences

- A feature that wants the network needs a new ADR superseding this one, the
  permission put back with a comment naming what needs it, and the
  release-artifact list widened on purpose. Each of the checks above fails
  until then.
- Anything that looks things up has to ship its data. Reference content is
  bundled and dated instead of fetched (ADR-0102).
- Crash reports, analytics and any server of our own are out. On Android an
  update arrives through the store; on the web it is a new build at the same
  origin.

History: ADR-0090 (LAN pairing) decided 2026-08-18, parked 2026-10-21; replaced by this record 2026-11-02.