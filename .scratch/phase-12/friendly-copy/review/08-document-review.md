# Ticket 08: Documents and linking copy review

The [paired ledger](08-document-pairs.json) covers 127 current English/Polish pairs: every document-category key, import and reader wording, the hub and day labels, all four link target kinds, every bundled roadmap target title, shared date controls, read failures, save and discard feedback, export outcomes and source-return controls. Each row records final wording, keep, shorten or remove decision, reason and current callers. This includes unchanged strings and all plural branches, not just audit candidates.

124 pairs keep their purpose, two explanations are shortened and one pair is removed. Four retained pairs receive an edit in at least one language. The paperwork aside adds warmth without making the reader or their gender the joke. Clear labels, placeholders and factual failure messages stay.

## Final editorial decisions

| Key | Final English | Final Polish | Decision and reason |
| --- | --- | --- | --- |
| documents_empty_title | No documents yet | Jeszcze nie ma tu dokumentów | Keep. English already works; Polish becomes an ordinary sentence instead of an inventory heading. |
| documents_empty_body | Photos and PDFs stay encrypted on this device. Paperwork without the paper pile. | Zdjęcia i PDF-y zostają zaszyfrowane na tym urządzeniu. Papierologia bez sterty papierów. | Keep. Preserve formats, encryption and this-device scope. Remove the repeated Add instruction; give the paperwork a small aside. |
| documents_intro | Search finds titles only. The app doesn't read the text on the pages. | Dokumenty wyszukasz tylko po tytule. Aplikacja nie czyta tekstu na stronach. | Shorten. Preserve search limitation and the fact that page text is not read; use natural wording in each language. |
| document_link_empty_body | First, add a milestone, surgery journey, regimen or roadmap step. | Najpierw dodaj kamień milowy, dziennik operacji, kurację lub krok na mapie tranzycji. | Shorten. Preserve all four eligible targets and the creation prerequisite; linking is already named by the heading. |
| document_missing_body | Removed | Removed | Remove. Repeats the missing-document heading. Remove the Notice text prop and both unused keys; Notice then renders no text paragraph. The heading and return control stay. |

No paper citations occur in the selected document flow. Roadmap source notes are not shown in the picker and stay outside this ticket. Manifests, Android identities, disguise names and privacy policies are untouched.

## Author baseline

The baseline is main at `1a828acc` plus the author's current working values, captured before editing. No document-category key has an uncommitted author edit. Two retained Polish roadmap target titles do: `roadmap_goal_pl_legal_driving_licence` and `roadmap_goal_pl_legal_zus_ceidg`. Their final ledger values preserve the author's `w ciągu` wording. `committed_final` separately records their branch values because those existing author edits remain uncommitted in the original main working tree. This ticket does not take ownership of them. All other existing catalogue edits and other worktrees stay outside the implementation diff.

## Behaviour and invariants

Import selects one file before opening metadata. Picker cancellation opens no editor. Refused files show the existing format, HEIC, 25 MB or picker failure feedback. Documents use a file-provider selection, with no app-owned microphone or recording states and no new permission wording. Native provider and OS permission dialogs are outside the app catalogue.

The selected bytes count as unsaved work even when the title is blank or metadata is reverted. Title guidance explains disabled Save through a live paragraph linked to the field. Keep editing retains bytes and fields; Discard writes nothing. Pending save disables the fieldset. Failure retains the draft and announces the retry message. Success closes the sheet and displays the saved row, without another picker or invented completion toast.

The index preserves title/date/kind, thumbnail, linked target name, grouping and count/size summary. Title-only search and unread page text remain explicit. The reader preserves stored identity, first-page thumbnail, rendered page, one-page and multipage feedback, enlargement, metadata editing, original-file export and unreadable-page fallbacks. Export still warns that the delivered copy is unencrypted and readable by anyone who receives it. Deletion still names the document and permanently removes both record and file, with no undo.

The link picker uses the existing four target reads and vocabulary. Choosing or clearing a link remains an immediate write. A restored unresolved target remains distinct from unlinked and still-loading states. Destination screens retain linked-document rows and source-return controls. Deleting a custom roadmap target keeps its documents and removes their links; its plural consequence wording stays.

The empty-link notice is currently unreachable in shipped code: `documentTargets.svelte.ts` always includes the built-in `POLISH_PACK.goals`. Its shortened creation instruction remains valid for the existing empty branch. Rendering evidence uses a temporary route with the exact Sheet/Notice markup and real catalogue calls; it does not claim an empty picker was reached through normal product use. The fixture route is removed before final checks and commit.

## Rendered evidence

The browser proof imports an actual two-page PDF through the file input, retains an unnamed import through discard/continue, injects a save failure, retries the same draft and opens the saved document. It captures empty and populated lists, required-title guidance, discard confirmation, failed import, reader, linking control, populated picker, delete confirmation, missing document and the empty-link fixture. Scrolled captures show the revised empty-list and empty-link paragraphs.

52 captures run in English and Polish at 390px with CSS zoom 1 and 2. Screenshots and runnable proof scripts live in `.claude/ticket08-proof/`; the tracked [rendered record](08-rendered.json) contains laid-out text, accessible labels, disabled controls, field descriptions, live/status/alert attributes and geometry. The changed empty-list and empty-link paragraphs were visually inspected at both zoom settings. All recorded surfaces have no horizontal overflow and the browser reported zero uncaught errors.

Startup storage toasts and the demo bar are hidden only for capture; inline save and title feedback remain visible.

Limits: CSS zoom checks layout reflow, not browser-toolbar zoom, pinch zoom or OS text scaling. At 200%, the effective layout width is 195 CSS pixels. Long words wrap and the screen and sheets need vertical scrolling; viewport captures do not show all content simultaneously. No physical Android provider or permission prompt, screen-reader speech test or human Polish review ran. Palette/theme combinations are not exhaustively captured because this ticket changes no colour or theme tokens.

## Verification and review

Targeted document, acceptance, target and picker tests passed all 38 tests in four files. Intermediate typecheck passed with zero errors and zero warnings. Svelte analyzer inspected the changed route; its navigation and effect suggestions concern existing code outside the removed text prop.

An initial sandbox build could not fetch the configured Inlang plugin and generated empty messages. Only this worktree's failed plugin cache was moved aside; a network-enabled regeneration restored the catalogue. Final proof uses those restored messages. This failure is not attributed to main.

The latest observed main CI run was `37056608582`, failed at `57671ed3`. That is older than the worktree baseline. This ticket does not claim main is green or attribute a local failure to that run.

Final production build passed. Typecheck passed with zero errors and zero warnings. The full suite passed all 6,629 tests in 497 files. Copy checks passed serializer order, EN/PL key parity, zero hardcoded literals, ungendered Polish and zero unused keys. The dev server was stopped and the temporary fixture route removed before these final checks.

[Catalogue contracts](08-contracts.json) verify all 127 final pairs, complete document-prefix coverage, unchanged interpolation, unchanged plural objects and no remaining caller for the removed pair. The two existing author working overrides are explicitly distinguished from branch values. No changed string has a plural or select branch; retained branches are checked by exact equality.

Main advanced to `99c2e4be` during verification. Its changes affect three hosting/guard test files, with no catalogue or document caller change. The review comparison uses this current main. Human Polish sign-off remains open; its existing ticket is untouched.


## Standards

The parallel Standards review of `0658ecb5` against pinned current main `99c2e4be` found zero documented-standard violations and zero baseline smells. Catalogue wording follows the voice and domain rules. Removing the optional Notice text prop omits its paragraph through the existing component contract, preserving heading and return action.

## Spec

The parallel Spec review found zero missing requirements, scope additions or incorrect implementations. All category pairs and selected shared controls have final wording, decisions and reasons. Targets, creation prerequisite, import/draft behaviour, encryption/sharing limits, deletion, accessible names and catalogue contracts remain intact. The unreachable empty-link fixture and CSS zoom limitations are explicit. Human Polish sign-off remains open.

Review totals: Standards 0 findings; Spec 0 findings. Screenshots and proof scripts are preserved in the original repository's `.claude/ticket08-proof/` before the isolated worktree is removed.


## Merge and handoff

Merged into main as `f460600e` with `--no-ff`. Autostash restored the author's catalogue edits. Every edited key in the premerge snapshot and the initial author snapshot was checked against the resulting working tree; all values survived. Every final value in the 127-pair ledger also matches the merged working tree.

Ticket 08 is marked done in the local tracker. Human Polish sign-off remains open. The latest CI refresh before merge was run `37130163278`, in progress at `99c2e4be`; no local verification failure is attributed to main.

All 52 screenshots, runnable capture/contract/check scripts and final verification logs are preserved in the original repository's `.claude/ticket08-proof/`. Cleanup removes only this ticket's isolated worktree and branch.
