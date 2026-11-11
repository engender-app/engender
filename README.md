<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/mark/png/lockup-dark.png">
    <img src="brand/mark/png/lockup-light.png" alt="engender" height="64">
  </picture>
</h1>

[![Checks](https://github.com/engender-app/engender/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/engender-app/engender/actions/workflows/ci.yml)

engender is a journal for your gender and your transition, written by a trans
person for other trans people. You mark how each day feels and look back over
months, and it keeps those entries, care records, photos and milestones
together on your own device. You can use it as an installable web app or an
Android app, in English or Polish.

The app is free software under GPLv3. There are no accounts, subscriptions,
visitor profiles or backend for journal data. The hosted web app and website
keep private hourly page-opening totals, without individual visit records. Both versions encrypt the journal at
rest and work offline. You choose what to record, which parts of the app to
use, and when to export or share anything.

Read [How engender is built](ARCHITECTURE.md) for the architecture,
data flow and encryption model, with diagrams and links to the code.

## Documentation

| Guide | Start here to... |
|---|---|
| [Architecture](ARCHITECTURE.md) | Understand the codebase and find where a change belongs |
| [Contributing](CONTRIBUTING.md) | Prepare a change for review and integration |
| [Self-hosting](deploy/SELF-HOSTING.md) | Run your own web app |
| [Security](SECURITY.md) | Report a vulnerability privately |
| Privacy: [English](PRIVACY.md), [Polish](PRIVACY.pl.md) | Understand what stays on your device and what you can share |

## Inside the app

The app has four main sections. Settings holds your preferences and lists;
it is reachable from Today.

### Today

Today shows the areas you pin, an agenda of upcoming events and a way to
start an entry. You decide which areas appear and which live tiles stay
visible.

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

Choose a period to review day-by-day charts, tag insights, what you spent,
recaps and entries that resurface from your history. The period you choose
carries through the section's readings. You can also prepare a journal book
for printing or PDF export. Muted eras stay out of On this day and Wrapped.

### Transition

Transition brings the other tracking areas together:

- Medication regimens, dose logs, lab results, appointments and a summary you
  can prepare for a clinician. Appointments also hold referrals and waiting
  lists, and your own notes on the people you see. Costs can be recorded on
  appointments, procedures, labs, medication stock and hair removal.
- Surgery records, hair progress and changes you
  notice during a regimen.
- Milestones, named eras, a roadmap with name and document changes tracked
  per institution, and letters you write now to read later.
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

Disguise mode changes what shows outside the unlocked app: the launcher icon
and name, the lock screen, widgets, notifications, the Recents preview, export
file names, printed letterheads and the web tab. Inside the unlocked app
nothing changes. An app lock controls access to the journal, and lock screens show no entries or
other journal data. Lock timing decides when the lock comes back: as soon as
you leave the app, after one or five minutes away, or only on a restart.
On the web, locking also closes the journal's database and lets go of its
key until you unlock again.
Android reminders use a generic label by default; you can choose to show
their titles instead.

Journal text fields turn off browser autofill and session restoration on the
web. Android always asks keyboards not to learn from the app's text fields;
the keyboard decides whether to honor that request. Text saved by earlier
versions is not removed from browser profiles or keyboard storage.

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
[English](PRIVACY.md) and
[Polish](PRIVACY.pl.md).

### Backups, recovery and moving devices

Export an encrypted Archive when you want a backup or need to move your
journal. Archives use a backup password you choose and can be restored on
another device. Android also supports scheduled encrypted backups to its local
storage provider. Delivery syncs the file and folder, then checks the bytes read
back before reporting success. Providers without that boundary report an
incomplete backup. Android keeps
the five newest verified automatic backups and prunes older automatic backups
only after a new one verifies. Manual backups remain untouched. When two
Android devices back up to the same folder, each can merge in the other's
newer backup when the app opens; both need the same backup password.

Daylio is the only app you can import from, through its CSV export or its
`.daylio` backup. Plain CSV and JSON exports are available when you want to
work with your own records outside the app.

A Daylio backup may be up to 1024 MiB on disk, and its ZIP may hold up to
1536 MiB of decompressed content. Large imports also need enough free memory
on the device. Attachment previews read only file headers; attachment bodies
are loaded when the import commits.

This build refuses journals left by the old plaintext version and leaves
their files untouched. It does not convert them.

An optional recovery key can unlock the journal on the device that still
holds it. It cannot restore deleted data, move a journal to another device
or decrypt an Archive. Keep backups separately from the device holding
your journal: clearing browser storage, wiping app data or losing a device
can remove the only local copy. The maintainer cannot recover passwords
or keys.

Creating or replacing a recovery key and changing access mode ask for the
current PIN, passphrase or biometrics again. Web device-bound mode instead
explains that the unlocked browser has this authority. Android unlocked mode
requires biometrics or an existing recovery key and blocks the change without
either. A recovery unlock approves one immediate protection setup only.

CSV, JSON, journal books, clinician summaries and exported images or videos
are readable files. Anyone who receives them can read their contents.
Choose an encrypted Archive when you need a private backup.

## Web app and Android

The web app is a static SvelteKit SPA with a service worker. Once the app
has cached its release, it can start without a network connection. A new
release waits until journal operations allow it to activate. Fonts and
runtime assets come from the app's own origin. Installation includes the complete
English and Polish OCR engine before offline readiness. Recognition starts only
when you scan a photo.

Android runs the same interface from a bundle installed in the APK. Native
plugins provide database access, device authentication, media handling,
notifications and home-screen widgets. Android updates arrive through an
updated app installation. English and Polish lab recognition assets are bundled
in the APK, so the first scan can run offline.

The web app needs a secure context for browser storage, the service worker
and authentication APIs. HTTPS is required when hosting it; localhost works
for development. Android needs WebView version 104 or newer.

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
The build compiles one English and one Polish client graph, then joins their
assets into one static release. The shell selects the saved language before
loading scripts; changing language still reloads the page. The service worker
caches both graphs for offline switching. Development serves both catalogues
through the ordinary Vite server.

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

`npm test` includes 320 seeded importer and sniffer fuzz cases. Run
`FUZZ_LONG=1 FUZZ_SEED=7 npm test` for 16,000 cases. Failures keep their exact
inputs and seed/index receipts in `ci-logs/fuzz/`; see
[tests/PROBES.md](tests/PROBES.md) for replay and strict typed-refusal checks.

The screen and walkthrough suites use Chromium. Set `CHROMIUM_PATH` if its
executable is not at the harness's default location. They cover storage
contracts, rendered screens, complete user flows and offline startup of the
production build:

```sh
npm run test:browser
npm run test:walkthrough
npm run verify:build
```

The browser capability matrix also runs
Firefox and automated WebKit against the built app. Run
`npm run build && npm run verify:capabilities` runs both production and
lifecycle checks, with a pinned matching Playwright container for WebKit.
The combined matrix records source/build identity, current BFCache controls,
splash defect controls, engine limitations and duration. It is a pre-release
check outside routine CI. Podman and host Chromium/Playwright Firefox are
required. Automated WebKit provides engine evidence; actual Safari and iOS
PWA remain unverified. See `tests/PROBES.md` for output and runtime options.


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

The opt-in [installed-upgrade stage](tests/android-tier/installed-upgrade.md)
checks a candidate over a filled rc.1 synthetic package, including row loss and
failed-migration recovery. Its documented kit and preparation commands rebuild
the old APK, candidate controls and Archive fixture from source.

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

For copy review, run `npm run strings` and open the local URL it prints.
The editor shows English and Polish together, with theme and review filters.
Besides the catalogues it lists the copy kept elsewhere: Android widget and
notification strings, both web manifests, the Play Store listing and the
privacy policy, one paragraph per row. Those rows are keyed `android:`,
`manifest:`, `notes-manifest:`, `store:` and `privacy:`, and a save rewrites
only that value in its own file.
Click a text to edit it. Leaving the field saves it, Enter saves a one-line
value and Esc puts the saved text back. Text that differs from `main` is
tinted. Review checkboxes work per key or for the shown keys in a group.
Progress is saved in `.scratch/copy-review.json`; changing either language
makes that key need review again. A save that conflicts with a change on disk
is refused without overwriting it: the edit stays in the field with the reason
under it, and **Save unsaved fields** retries it.
Find and replace matches literal, case-sensitive text in Polish, English, or
both. Limit it to shown keys or choose **All keys (global)**. Preview lists
every affected field, including plural forms. **Apply and save** writes the
replacements to their files.

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

Before tagging, run `npm run test:android` on the clean candidate. A passing
run writes its source revision, device/API identities, APK hashes and completed
stages into `scripts/progressive-release-record.json`. The required roster is
API 26 native instrumentation, PIN-wait persistence and native backup deferral,
plus current-Android instrumentation, PIN-wait persistence, Archive recovery
and native backup lifecycle stages. Current Android also runs fresh English and
Polish OCR in airplane mode under an isolated package, with separate APK hashes.
Commit the record after the run. Only that
record may differ from the tested candidate source.

Focused backup, recovery and locked-process-death runs do not replace the core
roster. The record names optional stages as completed or absent; the core pass
count does not claim an installed-upgrade or locked-process-death run.

The script requires a clean main branch, matching Android-tier evidence and
notes for the version in [CHANGELOG.md](CHANGELOG.md). Packaging builds the web app twice and checks
that both bundles have the same digest. Release artifacts include the web
bundle, source archive, signed Android APK and App Bundle, and checksums.
The release gate rejects signatures from unexpected certificates.
[Android signing guidance](SECURITY.md#android-signing-certificates) records
the GitHub APK, AAB upload and Play app-signing fingerprints.
Release notes state schema changes, Archive format changes, security
migrations and the minimum supported version. The stable section uses
`{{schema}}`, resolved from the candidate migration list by the notes generator
and shared with `release.json`. Generation rejects stale schema or minimum
version facts. The released-format tests migrate a copy of the rc.1 schema-88
fixture and check retained row counts; they do not replace the human exercise
of updating an installed release or set release-matrix success flags.

Keep private local evidence in the ignored working directories or root paths
starting with `evidence`. CI rejects those root paths if they enter the index;
the committed export policy also excludes them from `git archive` source
packages. Application source and intentional test fixtures remain included,
including nested directories named `evidence`. The policy prevents future
packages from including these paths; it does not rewrite published history.

[Deployment notes](deploy/README.md) describe immutable web releases, the
atomic switch between them and rollback checks. A rollback refuses code
that cannot open the current journal schema by default.

GitHub and Obtainium use the same release APK. The planned F-Droid route
preserves that APK's developer signature after F-Droid verifies a reproducible
source build. GitHub/F-Droid switching is not yet verified: it requires that
build evidence and installed-update checks in both directions with synthetic
journals. A matching certificate alone is insufficient. Wait for a compatible
equal-or-newer version at the destination; do not downgrade to change channels.

Play keeps its current, separate app-signing key and existing update path.
Direct switching between Play and the other channels is not supported. Before
uninstalling to move between incompatible channels, export an Archive and
verify its restore on a separate disposable installation. Uninstalling removes
the local journal. See [channel verification](deploy/README.md#android-channel-verification)
for the evidence required before claiming a supported switch.

## Support and licence

Report bugs and questions through GitHub Issues with the app version,
platform and steps to reproduce the problem. Use invented entries for a
reproduction. Support does not need your journal, backups or screenshots
containing private records; see the [support policy](SUPPORT.md).

Report vulnerabilities privately through the process in
[SECURITY.md](SECURITY.md).

engender is licensed under [GPL-3.0-only](LICENSE).
