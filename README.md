<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/mark/png/lockup-dark.png">
    <img src="brand/mark/png/lockup-light.png" alt="engender" height="64">
  </picture>
</h1>

[![Checks](https://github.com/engender-app/engender/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/engender-app/engender/actions/workflows/ci.yml)

engender is a private journal for tracking a gender transition, written by a
trans person for other trans people. It keeps daily entries, care records,
photos and milestones together on your own device. You can use it as an
installable web app or an Android app, in English or Polish.

The app is free software under GPLv3. There are no accounts, subscriptions,
analytics or backend for journal data. Both versions encrypt the journal at
rest and work offline. You choose what to record, which parts of the app to
use, and when to export or share anything.

## Inside the app

The app has four main sections. Settings holds your preferences and lists;
it is reachable from Today.

### Today

Today shows the areas you pin, an agenda of upcoming events and a way to
start an entry. You decide which areas appear, which kinds of events count
as upcoming, and which live tiles stay visible.

Quick add lets you log a mood, a backdated entry, a dose, a tally or a wear
session from the navigation bar. Each tracking screen also has its own add
control, so you can record something where you are already working.

### Journal

Entries can contain mood, gender feelings on scales you configure, tags,
notes, photos, voice recordings, video notes and feelings about body regions.
You can keep an entry brief or combine several kinds of records in one day.
Entry templates and your own lists let you choose what to ask yourself.

The calendar shows your recorded days as a heat map. Open a day to read its
entries, or use search and filters to find something across the journal.

### Look back

Choose a period to review day-by-day charts, tag insights, recaps and entries
that resurface from your history. The period you choose carries through the
section's readings. You can also prepare a journal book for printing or PDF
export, or share retrospective cards as images.

### Transition

Transition brings the other tracking areas together:

- Medication regimens, dose logs, lab results, appointments and a summary you
  can prepare for a clinician.
- Measurements and sizes, surgery records, hair progress and changes you
  notice during a regimen.
- Milestones, named eras, a roadmap and letters you write now to read later.
- Presentation tryouts, voice practice and recordings, binder or tucking
  wear sessions, and hair removal.
- Safe Space and a resource directory.
- A photo library covering entries, milestones and the other areas that hold
  photos, plus a document library with a PDF viewer.

The photo library includes comparisons, journey collages and timelapse
exports. Documents stay with the journal, so papers relevant to your
transition are available alongside the records they concern.

You choose which areas to use. Cycle tracking appears for an active
testosterone regimen or when you explicitly opt in. The app records values
and your observations; it does not interpret lab results or suggest doses.

## Appearance and everyday privacy

There are 16 palettes, each with light and dark themes: trans, nonbinary,
genderfluid, bisexual, lesbian, pansexual, rainbow, agender, gay men,
genderqueer, intersex, asexual, demiboy, demigirl, trigender and Polish.
On Android, the launcher icon follows your chosen palette.

Disguise mode uses a neutral name and icon and hides pride motifs. An app
lock controls access to the journal, and lock screens show no entries or
other journal data. Lock timing decides when the lock comes back: as soon as
you leave the app, after one or five minutes away, or only on a restart.
Android reminders use a generic label by default; you can choose to show
their titles instead.

The layout adapts to the space available, with a bottom navigation bar on
narrow screens and a rail on wider ones. The app uses bundled fonts and
respects reduced-motion preferences.

## Where your data lives

The web app keeps its database and media in your browser's storage for the
site. Android uses a native SQLCipher database and media files in the app's
private storage, with device keys protected by Android Keystore.

Unlock options depend on the platform. Both support a passphrase or PIN.
Supported browsers can use biometric verification through WebAuthn PRF;
Android can use its device lock or biometric prompt. You can also choose an
access mode without an in-app unlock prompt while keeping encryption at
rest.

The hosted web app contacts its own origin to load the app and check for
updates. That web host can observe ordinary request metadata, including
IP addresses and requested paths, but it receives no journal uploads.
The Android app does not request the `INTERNET` permission. External links
and files you share open through other apps, which have their own network
and privacy behaviour.

The full policies are available in
[English](docs/privacy-policy.en.md) and
[Polish](docs/privacy-policy.pl.md).

### Backups, recovery and moving devices

Export an encrypted Archive when you want a backup or need to move your
journal. Archives use a backup password you choose and can be restored on
another device. Android also supports scheduled encrypted backups.

The import tools accept supported exports from Daylio, Day One, TransTracks,
Track & Graph and Pixels. Plain CSV and JSON exports are available when you
want to work with your own records outside the app.

An optional recovery key can unlock the journal on the device that still
holds it. It cannot restore deleted data, move a journal to another device
or decrypt an Archive. Keep backups separately from the device holding
your journal: clearing browser storage, wiping app data or losing a device
can remove the only local copy. The maintainer cannot recover passwords
or keys.

CSV, JSON, journal books, clinician summaries and exported images or videos
are readable files. Anyone who receives them can read their contents.
Choose an encrypted Archive when you need a private backup.

## Web app and Android

The web app is a static SvelteKit SPA with a service worker. Once the app
has cached its release, it can start without a network connection. A new
release waits until journal operations allow it to activate. Fonts and
runtime assets come from the app's own origin; the lab scanner downloads
its OCR assets when first used and caches them for later offline use.

Android runs the same interface from a bundle installed in the APK. Native
plugins provide database access, device authentication, media handling,
notifications and home-screen widgets. Android updates arrive through an
updated app installation.

The web app needs a secure context for browser storage, the service worker
and authentication APIs. HTTPS is required when hosting it; localhost works
for development. Android needs WebView version 87 or newer and shows an
update explanation if its WebView is too old.

To host your own web app, follow the
[self-hosting guide](deploy/SELF-HOSTING.md). It covers Docker and nginx,
required headers, updates and the boundaries between different origins.
Changing the hostname does not move browser journals or passkeys; export
and restore an Archive to move between origins.

## Run from source

Before submitting a change, read [Contributing](CONTRIBUTING.md) for the
integration path and required checks.

Use Node.js 24, the version used in CI, and install from the lockfile:

```sh
npm ci
npm run dev
```

Once per clone, tell git to merge the message catalogues by key, so two
branches adding neighbouring keys no longer conflict (worktrees share it):

```sh
git config merge.catalogue.driver "node scripts/merge-catalogue.mjs %O %A %B %P"
```

The development server includes a demo control bar with sample data, theme
controls, phone-frame emulation and shortcuts to screens. Its reset control
restores the Alice persona. The phone-frame control constrains the app's
container, exercising the same layout rules as a narrow browser window.

For a production build and local preview:

```sh
npm run build
npm run preview
```

Production builds omit the demo controls. To include them in a static build,
use `VITE_DEMO=1 npm run build`. The development server does not register a
service worker, so edits are served directly rather than from a cached
release.

Build once on a fresh checkout before running the type checks or Node tests.
The build generates the translation runtime and service-worker asset list;
some tests also inspect the built app.

## Build Android

Install JDK 21 and the Android SDK, and set `$ANDROID_HOME` to the SDK
location. Then build the web app and sync it into the Capacitor project:

```sh
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

Run Capacitor sync before Gradle on a fresh checkout and after changing the
web bundle. Sync copies the web assets and generates plugin files that are
not committed. The debug APK is for development; signed release artifacts
come from the release workflow.

## Checks

The basic verification sequence is:

```sh
npm run build
npm run check
npm test
npm run check:copy
npm run check:licences
npm run check:screens-classes
npm run check:first-load-budget
```

`npm run check` treats Svelte warnings as failures. The copy check verifies
the English and Polish catalogues and prevents the number of untranslated
literals from increasing. The licence check inspects installed dependencies;
the first-load check measures the built app's initial assets.

The browser suites use Chromium. Set `CHROMIUM_PATH` if its executable is
not at the harness's default location. They cover storage contracts, complete
user flows and offline startup of the production build:

```sh
npm run test:browser
npm run test:walkthrough
npm run verify:build
```

The hosting check needs Docker running and accessible to your user. It tests
the nginx configuration, security and cache headers, SPA navigation and an
offline restart:

```sh
npm run verify:hosting
```

The Android tier needs the SDK, JDK and configured emulators. It defaults to
`gd26` and `tracker35`; `ANDROID_TIER_AVDS` accepts a comma-separated list
of alternatives. Set `ANDROID_TIER_HEADLESS=1` to run them without windows
on a machine that supports it.

```sh
npm run test:android
```

## Codebase

SvelteKit, Svelte 5 runes and TypeScript provide the interface. The static
adapter produces the web bundle, and Capacitor packages it for Android.
Paraglide handles English and Polish copy. Charts use SVG with D3 scales
and shapes. Nunito and Outfit are bundled with the app.

Screen components live in [src/routes](src/routes). Shared components and
application code live in [src/lib](src/lib), with journal storage, media and
Archive handling under [src/lib/data](src/lib/data). Platform differences
sit behind the database drivers and native bridges.

[Theme tokens](src/lib/theme) and [shared styles](src/lib/styles) control
appearance through palette and theme attributes. Responsive layouts use
container queries. User-facing strings live in
[messages/en.json](messages/en.json) and
[messages/pl.json](messages/pl.json). Native Android code is in
[android](android), and verification scripts are in [tests](tests).

## Releases and hosting

CI runs the build, type checks, Node tests, catalogue and licence checks,
browser suites and Android build checks. The
[release workflow](.github/workflows/release.yml) runs those checks again
for a version tag before publishing artifacts.

Release versions come from signed `v<semver>` tags. Ordinary checkouts build
as `0.0.0-dev`. Use the tag script rather than creating releases manually:

```sh
npm run release:tag -- 1.2.3 --dry-run
npm run release:tag -- 1.2.3
```

The script requires a clean main branch and notes for the version in
[CHANGELOG.md](CHANGELOG.md). Packaging builds the web app twice and checks
that both bundles have the same digest. Release artifacts include the web
bundle, source archive, signed Android APK and App Bundle, and checksums.
Release notes state schema changes, Archive format changes, security
migrations and the minimum supported version.

[Deployment notes](deploy/README.md) describe immutable web releases, the
atomic switch between them and rollback checks. A rollback refuses code
that cannot open the current journal schema by default.

F-Droid rebuilds use F-Droid's signing key. Moving between that channel and
an APK signed by this project's release workflow requires reinstalling and
restoring an Archive, because the signatures are not update-compatible.

## Support and licence

Report bugs and questions through GitHub Issues with the app version,
platform and steps to reproduce the problem. Use invented entries for a
reproduction. Support does not need your journal, backups or screenshots
containing private records; see the [support policy](SUPPORT.md).

Report vulnerabilities privately through the process in
[SECURITY.md](SECURITY.md).

engender is licensed under [GPL-3.0-only](LICENSE).
