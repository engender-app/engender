# Installed Android upgrade

This opt-in stage installs a candidate over a filled rc.1 journal in
`dev.engender.app.test.upgrade40`. It accepts an explicitly named emulator and
serial. It does not use the personal package or a physical phone.

Commit the candidate first. Set `JAVA_HOME` to JDK 21 and `ANDROID_HOME` to the
Android SDK. The SDK needs `aapt`, and Gradle/npm dependencies must be cached for
the offline kit build. Build the kit with:

```sh
npm run test:android:upgrade:kit -- .claude/android-upgrade-kit/candidate
```

The recipe checks out the released `v1.0.0-rc.1` and the candidate into temporary
detached worktrees, builds each source's web bundle, runs `cap sync android`, and
builds four debug APKs with the same debug signing key. The package ID changes
only in those temporary sources. No release signing key or tag is created.
The healthy candidate is unchanged apart from the synthetic package and test
version. The row-deleting control appends testing 06's row deletion (the oldest
side effect) to migration 89. The failed-migration control uses its milestone deletion, which
leaves a photo foreign key dangling. Both controls have the candidate source
identity and an explicit derivative marker in `manifest.json`.

The kit also generates a 32-day synthetic Archive through the released journal
and Archive writer, with JPEG photos and the long-journal fixture's other media.
`fixture.json` records its released source, schema and SHA-256. The retained
testing 06 recipes supplied these control migrations; removed historical APKs
are not required. Temporary worktrees are removed even if a build fails. APKs,
the Archive, the manifest and build logs stay in the output directory.

Start a fresh isolated emulator with a current WebView, then prepare its old
installation. For example, if its serial is `emulator-5590` and AVD name is
`upgrade40`:

```sh
npm run test:android:upgrade:prepare -- emulator-5590 upgrade40 .claude/android-upgrade-kit/candidate/manifest.json 9340
npm run test:android:upgrade -- emulator-5590 upgrade40 .claude/android-upgrade-kit/candidate/manifest.json 9340
```

Preparation refuses an existing synthetic package, including retained data from
an uninstalled copy. It creates PIN `2468`, feeds
the synthetic Archive to the normal file input, imports through the released
reader and encrypted stores, and enables daily check-in and medication alarms. It also finishes the return
surface and waits for its preference write before capturing the baseline.
The file-input hook is fixture setup; it is not proof of the native picker.
Preparation removes its package if it fails. Use an unused CDP port; both commands
refuse an existing forward and remove only the forward they create.

The upgrade command checks input APK hashes, `aapt` package/version metadata and
source identities. Every install verifies the actual installed base APK's hash
and version before opening it. It requires a healthy schema-88 baseline with
entries, side effects, media, alarms and a photo attached to the first milestone.
It snapshots the live native SQLite connection, encrypted media SHA-256 values
and stable alarm facts. The healthy pair must preserve the row count of every
table that still exists after the upgrade (tables the migrations drop are read from
`migrations.ts` and skipped, one that goes missing otherwise is a loss), entry
UUID, media filename/checksum, integrity and foreign-key result, declared schema
version and alarm time/mode. Its JSON before/after table names every difference.

Each control starts from the saved encrypted app data in the same test package.
The Keystore identity stays in place: this tests an installed update and migration
recovery, not transfer to a new installation. A side-effect row must disappear
only in the row-deleting control, and that comparison must reject it. The failing
build must show the saved-copy action. Restoring must copy the encrypted database
byte for byte; reopening with the healthy candidate must return the original
filled journal through its normal migration. The current app adopts credential
wraps into native durable storage and removes the old OPFS record, so the released
rc.1 binary cannot unlock that adopted credential. The stage does not downgrade
credentials or claim that reinstalling the old binary is supported.
The command reuses `android-failed-migration.test.ts` for the closed-session Node
regression rather than adding another fake failure scenario.

Runs retain logs, baseline ciphertext, screenshots and before/after tables under
`.claude/android-tier/` (`ANDROID_TIER_LOG_DIR` overrides the parent). Only a fully
completed run reaches the shared Android evidence writer. It records the actual
four APK identities and completed checks as `installed-upgrade`; there is no
instrumentation APK in this CDP stage. A failed run keeps its failure log and
cannot publish a passing stage. Finally, the command restores the filled rc.1 test
package and stops it. After inspecting evidence, uninstall that package and shut
down the owned emulator. These results cover the synthetic debug package and the
tested WebView, not installed updates through Play or F-Droid.
