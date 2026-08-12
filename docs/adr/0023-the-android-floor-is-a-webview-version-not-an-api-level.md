# The Android floor is a WebView version, not an API level

The app declares `minSdkVersion 26` because the spec asks for it, and
`minWebViewVersion 87` because that is the number that actually decides
whether it runs. A WebView below the floor gets `static/webview-too-old.html`,
which says so in both languages.

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

87 is where Vite compiles the bundle to - its default module target - so below
it the app is syntax the WebView cannot parse, whatever else it can do.
Everything the app needs at runtime sits at or under that: OPFS at 86,
`Object.fromEntries` at 73. One call was above it, `Object.hasOwn` at 93, on
the boot path in `prefs/catalogue.ts`; it was replaced with
`hasOwnProperty.call` rather than allowed to set the floor six versions higher
than the bundle needed.

It is still a floor rather than a measurement. Nothing has been run on a
WebView between 87 and the current one, and the two ends are what ticket 11
saw: Chrome 69 refuses the bundle, and a current one runs it.

## Consequences

**A device below the floor says so, but only because a page was written for
it.** `minWebViewVersion` on its own does nothing a user can see. Capacitor
checks it, and when there is no `server.errorPath` configured it logs
`Logger.error` and loads the app anyway - which is a blank page and a
SyntaxError in a log nobody holding a phone can read. Ticket 11 shipped that
mistake first and found it by looking at the emulator rather than at the code:
the setting was there, the screen was blank, and the two facts sat together
for an afternoon.

So `server.errorPath` points at `static/webview-too-old.html`: no script, no
build step, nothing newer than CSS2, because it exists precisely for the
browsers that could not run the app. Both languages are on it at once, since
choosing one would need the preference the app never got far enough to read.

**The API 26 emulator cannot run the app, and that is not a gap in support.**
`tests/android-tier/run.mjs` runs the native half of its suite there - the
SQLite build, FTS5, the window functions, the raw-key open, none of which
touch a WebView - and the full suite on a current Android. A real API 26
phone with a current WebView runs the same bundle as an API 35 one, and that
is the configuration the current-Android run covers.

**The floor moves when Vite's default does.** It is inherited rather than
chosen: `ESBUILD_MODULES_TARGET` is Vite's, not this repo's, and an upgrade
that changes it changes what the app runs on without anyone deciding to. Worth
pinning `build.target` explicitly the next time this is opened, so the number
in `capacitor.config.ts` and the number the bundle was compiled against cannot
drift apart silently.

**Two capabilities were fixed rather than declared.** `crypto.randomUUID`
(Chrome 92) mints every row's id (ADR-0002), and `Object.hasOwn` (93) is read
before the first paint. Both sat above the floor, so either would have been a
lie the first time someone opened the app on a device between the two.
`randomUUID` falls back to `getRandomValues` and `hasOwn` became
`hasOwnProperty.call` - a few lines each. A capability the floor does not
cover is a bug to fix while it is cheap, not a reason to raise the floor and
lose the devices in between.

**Nothing below the floor is tested, and the suite says so.** The API 26
emulator runs only the native half of `tests/android-tier/`, because its
WebView cannot start the app. What that run does prove is the error page: it
is the one device available on which the floor is not met, so it is where the
page was checked.
