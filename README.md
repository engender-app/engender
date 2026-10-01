<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/mark/png/lockup-dark.png">
    <img src="brand/mark/png/lockup-light.png" alt="engender" height="64">
  </picture>
</h1>

[![Checks](https://github.com/barankiewicz/gender-diary/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/barankiewicz/gender-diary/actions/workflows/ci.yml)

engender is a private journal for tracking a gender transition. Record mood,
gender feelings, notes, tags, photos, voice recordings and milestones. Keep
care records, measurements and documents alongside the journal, then look back
through the calendar, search and charts. The app is available as an installable
web app and an Android app. Both use the same SvelteKit codebase.

There are no accounts, subscriptions, analytics or backend for journal data.
Your journal stays on your device. The web app stores it in browser storage;
Android stores it in app-private storage. Both encrypt the journal at rest.
You choose when to export an Archive or share other files. The hosted web app
still contacts its own origin to load the app and check for updates; see the
[privacy policy](docs/privacy-policy.en.md) for details.

## What you can do

- Make entries with configurable gender scales, mood, tags, notes and media.
- Track milestones, medication, labs, measurements and other parts of a
  transition without the app interpreting medical values or suggesting doses.
- Find entries by date or search, and review trends and recaps.
- Choose among eight flag palettes, light and dark themes, and English or
  Polish. Use disguise mode and an app lock when privacy matters.
- Export an encrypted backup and restore it on another device. The web app
  works offline after installation; Android runs from its installed bundle.

## Privacy and support

- [Privacy policy (English)](docs/privacy-policy.en.md) and
  [polityka prywatności (polski)](docs/privacy-policy.pl.md)
- [Security reports](SECURITY.md)
- [Support](SUPPORT.md)
- [Self-hosting the web app](deploy/SELF-HOSTING.md)

## Run from source

Install dependencies, then start the development server:

```sh
npm ci
npm run dev
```

Once per clone, tell git to merge the message catalogues by key, so two
branches adding neighbouring keys no longer conflict (worktrees share it):

```sh
git config merge.catalogue.driver "node scripts/merge-catalogue.mjs %O %A %B %P"
```

The development server includes a demo control bar with sample data. A normal
production build leaves the demo controls out.

```sh
npm run build
npm run preview
```

`npm run build` writes the static web app. Serve it from the root
of an HTTPS origin with the headers described in the
[self-hosting guide](deploy/SELF-HOSTING.md). Build once before running
`npm run check` on a fresh checkout so generated files exist.

## Android build

Android needs JDK 21 and an Android SDK at `$ANDROID_HOME`. Capacitor copies
the built web app and generates Android plugin files during sync:

```sh
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The Android app uses a native SQLCipher-backed journal, app-private media
storage and Android Keystore. It does not request the `INTERNET` permission.

## Verify

```sh
npm run build
npm run check
npm test
npm run check:copy
npm run check:licences
```

Browser, hosting and Android checks need a browser, web server or Android
emulators respectively.

## Releases and licence

The release workflow builds web and Android artifacts from a signed
`v<semver>` tag. Use `npm run release:tag -- <semver>` to cut a tag;
[deployment notes](deploy/README.md) cover hosting and rollback. Source is
licensed under [GPL-3.0-only](LICENSE).
