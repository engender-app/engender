# Ticket 50 copy coverage

`copy-coverage-50.json` maps every current catalogue key to one primary review
family and each direct caller in shipped `src/` code. English and Polish use
the same 3,456 keys. All 3,456 have a shipped caller. The map covers 227
source files; 423 keys have more than one direct caller. Test and script
references do not count as shipped callers.

| English review | Polish review | Primary keys | Surface |
| --- | --- | ---: | --- |
| 38 | 44 | 474 | Journal, day, search and readback |
| 39 | 45 | 1,280 | Body, care and health |
| 40 | 46 | 539 | Transition, voice and reflection |
| 41 | 47 | 298 | Setup, access, recovery and gates |
| 42 | 48 | 474 | Preferences and reminders |
| 43 | 49 | 391 | Files, system and shared controls |

Five keys appear in both ticket 38 and ticket 40 inventories. The map gives
them ticket 38 as primary owner; both passes reviewed them. For other keys,
the primary owner follows the screen or message module that displays the
value. Shared controls use ticket 43 when no screen owns their wording.
Values remain in `messages/en.json` and `messages/pl.json`; the map records
ownership and reachability, not a second copy of either translation.

## Copy outside the catalogues

- `scripts/check-copy.mjs` finds zero shipped Svelte markup literals and now
  checks unused keys against `src/` only. A test reference had kept
  `care_regimen_several` alive after its screen stopped calling it. Both
  obsolete values are gone. Dynamic message lookup has no shipped caller.
- `src/lib/disguise/identity.ts` owns `Notes` and `New tab`. Both stay in
  English for the browser and launcher disguise. The native launcher uses
  `Notes` too.
- `static/manifest.webmanifest` and `static/manifest-pl.webmanifest` own
  normal install descriptions and the launcher shortcut. Both shortcuts
  open `/entry/new/today`. `static/manifest-notes.webmanifest` and its Polish
  partner own neutral install descriptions and expose no shortcut.
  `src/app.html` selects the locale before boot; the layout keeps the link
  current after preferences load.
- `android/app/src/main/res/values/strings.xml` owns widget names, widget
  descriptions and backup failure fallbacks. `values-pl/strings.xml` supplies
  all 11 translatable resource names. App names and machine identifiers
  inherit their base values. Widget and backup tests cover the native
  resource names and notification title behavior.
- `docs/privacy-policy.en.md` and `docs/privacy-policy.pl.md` are the two
  repository privacy policies. Ticket 41/47 reviewed them against access,
  export and Android permission behavior. Manifest permission tests cover
  both documents. There is no in-app privacy-policy route in this tree.
- Reminder and retrospective notification wording comes from catalogue
  calls in `src/lib/reminders/`, `src/lib/unprompted/` and
  `src/lib/data/archive/auto-export-scheduler.ts`. Native receivers use
  those payloads or the paired Android fallback resources.

## Reconciliation

The app copy guide and domain glossary guided the final scan. The scan found
two cross-screen misses: a dose tile used "due", and the clinician summary
called personal details a "Patient profile". Both English and Polish pairs
now use neutral terms. Removing the unused regimen sentence leaves no state
unexplained because the care screen already renders one lane per regimen.

Risk copy remains in the access, export and privacy sources owned by tickets
41/47 and 43/49. This pass did not alter their security claims. The launcher
manifest now says the journal is stored on this device, without suggesting
that exports never leave it.

Polish speaker sign-off remains human-step 16. It is a human review item,
not a missing catalogue value.

## Verification

Production and demo builds, `npm run check` and `npm run check:copy` passed.
The full Node suite passed outside the filesystem sandbox: 478 files and
6,259 tests. The sandbox run had two release-script subprocess failures;
both passed in the unrestricted rerun. Focused manifest, privacy, widget,
notification and copy checks passed. Android assets synced and JDK 21 compiled
the app's Java and resources. No emulator notification delivery was run.

The demo build was opened in English and Polish at 390px and at 640px,
the repository's 200% reflow viewport. Settings, care, clinician summary
and export had no horizontal overflow or page errors. Each language loaded
its matching install manifest in the browser.
