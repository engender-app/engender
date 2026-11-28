# Architecture decision records

One file per decision, named `NNNN-slug.md`. A number is allocated when the
record lands on `main`, and a record not yet numbered is `draft-<slug>.md` and
is cited as `ADR draft-<slug>`.

See [Writing an ADR](../../CONTRIBUTING.md#writing-an-adr) for the header and size rules. CI checks that citations resolve and that public files point to material available in a clone.

## Live records

- [ADR-0001](0001-epoch-day-is-the-local-calendar-day.md): Epoch day is the local calendar day
- [ADR-0002](0002-dual-identity-rowid-plus-travelling-uuid.md): Every row has two identities: a local rowid and a travelling key
- [ADR-0003](0003-preferences-split-portable-and-device-local.md): Preferences are split into portable and device-local, and live in SQLite with a small boot cache
- [ADR-0004](0004-reference-data-mirrored-entry-data-async.md): Reference data is mirrored in memory; entry data is queried asynchronously
- [ADR-0005](0005-search-folds-text-in-the-app-not-in-the-tokenizer.md): Search folds text in the app, not in the tokenizer
- [ADR-0006](0006-forward-only-migrations-with-a-pre-migration-copy.md): Migrations are forward-only, copy the database first, and refuse newer schemas
- [ADR-0007](0007-archive-is-a-framed-container-with-chunked-aes-gcm.md): The archive is a framed container with chunked AES-GCM
- [ADR-0008](0008-photos-are-normalized-on-import.md): Photos are normalized to JPEG on import, stripped of metadata, and originals are not kept
- [ADR-0010](0010-the-schema-does-not-store-derived-state.md): The schema does not store derived state
- [ADR-0011](0011-import-writes-files-first-and-never-deletes.md): Import writes files first, swaps the database last, and never deletes
- [ADR-0012](0012-native-units-for-numbers-normalized-values-for-colour.md): Native units for numbers, normalized values for colour, and no worst-to-best legend
- [ADR-0013](0013-argon2id-parameters-are-tuned-per-consumer.md): Argon2id parameters are tuned per consumer, not shared
- [ADR-0017](0017-the-journal-is-one-handle-bound-to-a-driver.md): The journal is one handle bound to a driver
- [ADR-0018](0018-journal-data-is-encrypted-under-a-random-key.md): Journal data is encrypted under a random key
- [ADR-0019](0019-the-landing-site-and-journal-use-separate-origins.md): The landing site and Journal use separate origins
- [ADR-0020](0020-encryption-is-whole-database-not-application-level.md): Encryption is whole-database, not application-level
- [ADR-0021](0021-the-offline-shell-is-one-document-and-one-cache-per-release.md): The offline shell is one document and one cache per release
- [ADR-0022](0022-the-public-version-name-comes-from-a-signed-tag.md): The public version name comes from a signed tag
- [ADR-0023](0023-the-android-floor-is-a-webview-version-not-an-api-level.md): The Android floor is a WebView version, not an API level
- [ADR-0026](0026-known-analyte-unit-conversion-is-a-narrow-allowlisted-exception.md): Known-analyte unit conversion is a narrow, allowlisted exception to no-conversion
- [ADR-0027](0027-a-data-area-travels-because-it-registers-an-archive-section.md): A data area travels in an archive because it registers a section
- [ADR-0033](0033-photos-align-after-capture-and-only-video-and-progress-photos-use-a-live-camera.md): Photo alignment is a post-capture review, and only video notes and progress photos get a live camera surface
- [ADR-0037](0037-the-doubt-journal-becomes-a-read-only-counterevidence-check.md): The doubt journal becomes a read-only counterevidence check, and its written entries are removed
- [ADR-0041](0041-one-wrap-system-three-secret-sources-plus-no-secret-at-all.md): One wrap system, three secret sources, plus no secret at all
- [ADR-0042](0042-scheduled-archive-kdf-runs-behind-the-android-bridge.md): Scheduled archive KDF runs behind the Android bridge
- [ADR-0045](0045-an-automatic-trigger-never-mints-a-milestone-without-confirmation.md): An automatic trigger never mints a milestone without confirmation
- [ADR-0046](0046-stock-is-a-projection-not-a-stored-count.md): Stock is a projection over the dose log, never a stored count
- [ADR-0047](0047-the-reminder-payload-is-wrapped-under-its-own-keystore-key.md): The reminder payload is wrapped under its own Keystore key
- [ADR-0048](0048-a-presentation-is-a-grouping-key-never-a-set-of-scales.md): A presentation is a grouping key, never a set of scales
- [ADR-0049](0049-an-era-is-a-named-span-and-owns-nothing-else.md): An era is a named span, and owns nothing else
- [ADR-0052](0052-an-area-can-be-hidden-and-can-be-finished-and-the-two-are-separate.md): An area can be hidden, and can be finished, and the two are separate
- [ADR-0053](0053-an-update-on-an-unknown-id-throws-a-delete-does-not.md): An update on an unknown id throws; a delete does not
- [ADR-0054](0054-a-recovery-key-is-an-optional-second-wrap-of-the-data-key.md): A recovery key is an optional second wrap of the data key
- [ADR-0055](0055-there-is-no-streak.md): There is no streak
- [ADR-0059](0059-the-pitch-graph-carries-no-population-reference-bands.md): The pitch graph carries no population reference bands
- [ADR-0061](0061-a-benchmark-carries-its-capture-chain-and-device-sensitive-figures-compare-only-within-one.md): A benchmark carries its capture chain, and device-sensitive figures compare only within one
- [ADR-0063](0063-a-platform-gate-hides-a-facility-never-a-record-the-person-created.md): A platform gate hides a facility, never a record the person created
- [ADR-0065](0065-a-document-is-paper-the-person-keeps-and-the-app-never-reads-it.md): A document is paper the person keeps, and the app never reads it
- [ADR-0066](0066-there-is-one-appointment-record-and-a-consult-is-a-case-of-it.md): There is one appointment record, and a consult is a case of it
- [ADR-0067](0067-what-is-coming-up-is-one-read-and-five-kinds-of-fact-earn-a-mark.md): What is coming up is one read, and five kinds of fact earn a mark
- [ADR-0068](0068-a-roadmap-goal-is-a-step-not-a-record.md): A roadmap goal is a step, not a record
- [ADR-0073](0073-the-front-page-is-pinned-and-the-app-ranks-nothing-centrally.md): The front page is pinned, and the app ranks nothing centrally
- [ADR-0084](0084-a-reference-area-is-managed-in-settings-and-takes-no-hub-row.md): A reference area is managed in Settings and takes no hub row
- [ADR-0085](0085-a-photograph-is-browsed-in-one-library-and-owned-by-its-own-table.md): A photograph is browsed in one library and owned by its own table
- [ADR-0088](0088-the-launcher-icon-follows-the-chosen-flag.md): The launcher icon follows the chosen flag, at the price of immediacy
- [ADR-0089](0089-the-android-driver-pipelines-bridge-calls-and-the-plugin-owns-order.md): The Android driver pipelines bridge calls; the plugin owns order
- [ADR-0092](0092-an-explicit-feature-choice-beats-automatic-cycle-visibility.md): An explicit feature choice beats automatic cycle visibility
- [ADR-0094](0094-hrt-start-anchors-on-hrt-episodes.md): The effects timeline counts from the HRT start, and a drug class says what HRT is
- [ADR-0095](0095-checks-hold-structural-invariants-only.md): A CHECK holds a structural invariant, never a vocabulary
- [ADR-0096](0096-onset-bands-follow-soc8-table-1.md): Onset bands follow SOC8 Appendix C Table 1 and wait behind "What the literature says"
- [ADR-0097](0097-cost-on-records.md): A cost is three fields on the record, and amounts never cross currencies
- [ADR-0098](0098-archive-merge-keeps-the-newer-copy.md): Archive Merge keeps the newer copy of each row and carries deletions
- [ADR-0099](0099-folder-sync-merges-another-devices-auto-export.md): Folder sync merges another device's auto-export, on Android only
- [ADR-0100](0100-the-app-makes-no-network-request.md): The app makes no network request, and Android declares no INTERNET permission
- [ADR-0101](0101-disguise-hides-the-app-from-the-outside-and-stops-at-unlock.md): Disguise hides the app from the outside, and stops at unlock
- [ADR-0102](0102-shipped-reference-content-carries-a-source-and-a-reviewed-on-date.md): Shipped reference content carries a source, a reviewed-on date and a staleness limit
- [ADR-0103](0103-a-column-holding-a-uuid-is-named-uuid.md): A column that holds a uuid is named `*_uuid`, and device-local state gets its own table
- [ADR-0105](0105-unlock-shows-the-flag.md): An unlock shows Today's sun, not the app's name
- [ADR-0106](0106-the-window-follows-the-keyboard.md): The window follows the keyboard on every frame

## Tombstones

A number that has no file gets one line here, opening with the number, saying
where the decision lives now. Numbers are never reused. A pruning on
2026-11-02 merged, moved or retired every record below except 0080, which was
never written.

- ADR-0009: preferences live in SQLite with a small boot cache; merged into ADR-0003.
- ADR-0014: a forgotten PIN resets the app and wrong attempts get a growing delay; merged into ADR-0041.
- ADR-0015: photo metadata is stripped on normalize; merged into ADR-0008.
- ADR-0016: the Node tier does not import paraglide; merged into ADR-0017.
- ADR-0024: screens read vocabulary, the reference mirror stays internal; merged into ADR-0017.
- ADR-0025: mood gets its own colour scale; moved to private documentation.
- ADR-0028: Java and TypeScript twin logic is pinned by one shared fixture of cases; moved to the header comment of `src/lib/android/launch-routes.ts`.
- ADR-0029: the walkthrough grips `data-*` handles, ids and ARIA, never classes or copy; moved to CONTRIBUTING.md, "Test conventions".
- ADR-0030: ticked scales rank suggestion lists, never gate them; moved to private documentation.
- ADR-0031: a clinician summary section prints because it registers; moved to the header comment of `src/lib/data/journal/clinicianSummary.ts`, which already said it.
- ADR-0032: the streak read the journaling pause and the run-out rate never reads a dose pause; retired. There is no streak (ADR-0055) and the run-out rule is in ADR-0046.
- ADR-0034: a video note records through a live camera surface and photos still do not; merged into ADR-0033.
- ADR-0035: the pride flag is a Home-only motif; visual decision moved to private documentation and disguise decision moved to ADR-0101.
- ADR-0036: feature surfaces live in a More hub and Settings holds only preferences; merged into ADR-0084.
- ADR-0038: cross-block spacing is stamped by a `[data-kit-surface]` attribute, not enumerated by class; moved to the comment above the adjacency rules in `src/lib/styles/kit.css`.
- ADR-0039: Home live tiles are gated on data, not preference; merged into ADR-0073.
- ADR-0040: Safe Space is a read-only crisis-mode screen named for the moment, not the mechanism; moved to private documentation.
- ADR-0043: cycle tracking surfaces through a testosterone regimen or an explicit opt-in; merged into ADR-0092.
- ADR-0044: an entry and its contextual rows commit in one transaction, checked first; moved to the comment above `resolveContextual` in `src/lib/data/journal/entries.ts`.
- ADR-0050: the ambient motion budget was two loops on Home, reversed before it shipped; retired, with history in private documentation.
- ADR-0051: the flourish is dropped and the ambient budget goes back to one loop; moved to private documentation.
- ADR-0056: the Stats door has one emptiness rule and two floors and indexes no areas; moved to private documentation.
- ADR-0057: an entry template seeds a presentation and never becomes one; merged into ADR-0048.
- ADR-0058: chart form follows whether the data is ordered; moved to private documentation.
- ADR-0060: a reference band was keyed to the passage's language; merged into ADR-0059, which records why the bands went.
- ADR-0062: the return surface is a one-time moment that reports what is waiting, threshold `RETURN_GAP_DAYS`; moved to private documentation.
- ADR-0064: a wear session has a closed kind and only a binder gets a duration cue; moved to private documentation.
- ADR-0069: a long log grows in rendered batches while search stays paged by its control; moved to the header comment of `src/lib/components/kit/BatchedList.svelte`.
- ADR-0070: progress is one shared component, and cancel answers what has already changed; moved to private documentation.
- ADR-0071: the mood faces are the second ambient loop; moved to private documentation.
- ADR-0072: a row declares which screen draws it; merged into ADR-0084.
- ADR-0074: the agenda is a projection of the days ahead and never counts what did not happen; moved to private documentation.
- ADR-0075: colour lives in a field and in blocks and nowhere else; moved to private documentation.
- ADR-0076: preferences are chrome, one persistent control and not a hub row; merged into ADR-0084.
- ADR-0077: mood's ramp runs between two hues and its face sits on a block; moved to private documentation.
- ADR-0078: a state change moves unless its change says why not; moved to private documentation.
- ADR-0079: setup does not vary by disguise and offers it last; merged into ADR-0101.
- ADR-0080: a state change inside one tab carries the field's blind (the step-by-step travel in `screen-transition`); recorded in private documentation.
- ADR-0081: a body region is one value on one scale, the midpoint never stored; moved to private documentation.
- ADR-0082: a held vowel and a read passage answer to different floors; moved to the comments on `VOICED_SECONDS_PER_WORD` and `MAX_PLAUSIBLE_WPM` in `src/lib/audio/quality.ts`.
- ADR-0083: a distribution over a continuous axis is a density and keeps the axis; moved to private documentation.
- ADR-0086: an auto-logged dose is a standing instruction, not an inference; merged into ADR-0045.
- ADR-0087: one silhouette, and neutrality is measured; moved to private documentation.
- ADR-0090: LAN pairing keeps journal keys local; superseded by ADR-0100, the app makes no network request.
- ADR-0091: each mood step picks its own ink; moved to private documentation.
- ADR-0093: a secondary button is a block of the page; moved to private documentation.
- ADR-0104: progress photos take a live camera with the last shot as a ghost; merged into ADR-0033.
