# The Android floor is a WebView version, not an API level

The app declares `minSdkVersion 26` because the spec asks for it, and
`minWebViewVersion 86` because that is the number that actually decides
whether it runs. A WebView below the floor gets Capacitor's upgrade screen.

## Why

Android has shipped its WebView as a separately updatable component since
API 21. The API level therefore says almost nothing about what the app is
running in: an API 26 phone that has taken updates has a current WebView,
and the two numbers move independently for the rest of the device's life.

Ticket 11 found this the practical way. The app installed and launched on an
API 26 emulator and showed a blank screen, with `Uncaught SyntaxError:
Unexpected token .` in a log no one holding a phone can read. The image ships
Chrome 69, from 2018, which has neither optional chaining nor - the part that
cannot be compiled around - OPFS, where every photo the app stores lives.

86 is where OPFS arrived, so it is the first version at which the app can do
what it claims. It is a floor rather than a measurement: nothing has been run
on a WebView between 86 and the current one.

## Consequences

**A device below the floor says so.** Capacitor renders its own "update your
WebView" screen when `minWebViewVersion` is not met. The alternative is what
ticket 11 saw first: a blank page that looks identical to a crash, on a
device whose owner has no way to find out why.

**The API 26 emulator cannot run the app, and that is not a gap in support.**
`tests/android-tier/run.mjs` runs the native half of its suite there - the
SQLite build, FTS5, the window functions, the raw-key open, none of which
touch a WebView - and the full suite on a current Android. A real API 26
phone with a current WebView runs the same bundle as an API 35 one, and that
is the configuration the current-Android run covers.

**The floor is a claim to re-check, not a constant.** It was derived from one
API - OPFS - and the app's bundle is compiled by Vite against its own default
target, which is newer than 86. Nothing today proves the two agree, and the
honest way to find out is a WebView in that range rather than more reading.
Ticket 19's audit is the natural place for it.

**One thing already found this way is fixed rather than declared.** Every
journal write mints an id with `crypto.randomUUID` (ADR-0002), which arrived
in Chrome 92 - above the floor, so declaring 86 would have been a lie the
first time anyone saved anything. It now falls back to `getRandomValues`,
which predates everything here. A capability the floor does not cover is a
bug to fix while it is cheap, not a reason to raise the floor and lose the
devices in between.
