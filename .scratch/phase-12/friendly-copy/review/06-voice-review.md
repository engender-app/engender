# Voice copy review

Reviewed on 2026-10-02 against main at `98002c80` and the author's working
catalogue values. This review covers the entire voice screen: benchmark,
practice, comparison, entry recordings, comfort band, metric reference and
their shared controls. Human Polish sign-off remains open.

## Paired wording

[06-voice-pairs.json](06-voice-pairs.json) records 259 English/Polish pairs,
including every `vb_`, `vc_`, `vm_` and `voice_` key and the shared controls
used by their current callers. Each record has the author's baseline, final
wording, decision, reason and current callers. Plural declarations, selectors
and every text branch are included, not flattened into one example.

There are 233 keep decisions, 25 shorten decisions and one removal. Keep
means the wording or its useful function stays; five retained messages have
an action or warmth rewrite, recorded in `changedFromAuthor`. Shorten removes
explanatory detail. Remove drops both the rendered paragraph and paired key.

Six English and 44 Polish authored voice values differed from committed
main when work started. Those working values supplied the baseline. Unrelated
author edits were not copied into the ticket. Authored short explanations,
vocabulary and omissions stay, including `Na razie nic nie słyszę.` The
analysis-method and 13-to-61 cm questions remain outside this ticket, with
`vm_resonance_how` and `vm_room_changes` unchanged from that baseline.

All six audited candidates have explicit decisions. Clipping advice names
the distance action. Repeated denial points to permissions. The Polish
unknown-setup sentence no longer uses a collective speaker. Room scope stays
limited to its recording; pitch range and movement no longer tour studies.

Reference text contains no paper citations, publication dates, sample sizes
or named study details. Band captions still identify the read-passage
population, language and mean plus or minus one standard deviation. Figures
keep their units and interpretation limits. Rate keeps its same-passage
condition; resonance keeps its equipment condition and unavailable third and
fourth formants. No desired gendered result or medical advice was added.

The repeated reference introduction was removed. The visible overall title,
accessible sheet title and each figure heading stay.
Recordings get a small audition joke. Errors and measurements remain direct.

## Trigger trace

`quality.ts` fails clipping when peak reaches `PEAK_CEILING`, 0.98. Both
benchmark and practice use that result for live advice. Benchmark retry uses
the decoded recording's same gate. The rewritten message asks for distance
from the microphone; it makes no judgement about the person's voice.

`openMicrophone` maps `NotAllowedError` to denial and other open failures to
unavailable. Benchmark and practice show the microphone request button after
the first denial. Another failed open sets `askedAgain`; the request button
then disappears. Copy describes the permission check, without claiming the
app can grant access or that another request must display an OS prompt.

`captureChainBreak` returns `unrecorded` when either chain is null, including
two null chains. The series refuses to join those takes. The Polish wording
keeps the either-side condition and does not invent a different device.

## Rendered evidence

[06-rendered.json](06-rendered.json) records 172 actual app captures, their
rendered text and measured paragraph/heading overflow. Screenshots remain in
`.claude/voice-copy06-shots/` in the main checkout after worktree removal.

Chromium ran both languages at a 390px viewport and CSS zoom 1 and 2, reapplied
after every navigation. States include benchmark idle, custom passage,
first/repeated denial in benchmark and practice, live clipping, clipping
retry, practice review, silence, benchmark summary, recordings empty,
comparison empty/populated, unknown-setup series and all seven references.
Synthetic microphone streams and refusal errors enter through
`navigator.mediaDevices.getUserMedia`; the app's own transitions and quality
gates run unchanged. The summary uses a clean synthetic take and skips the
optional vowels. Live clipping retains `aria-live="polite"`; repeated denial
removes the request button after exactly two attempts.

The first Polish 200% capture exposed `uprawnieniach` wider than the notice
body. Shared notice body now allows word wrapping, preserving the permission
wording. The first probe also lost CSS zoom after navigation; its 69 partial
captures were replaced by the complete 92-state rerun and focused review follow-up with persistent zoom.
The runs found no overflowing paragraphs/headings and no page errors.
The follow-up adds unavailable and unsupported microphones in both flows,
unsteady vowel live/retry feedback, all three vowel instructions, the note
placeholder attribute, revised reference fields and populated recording
playback. It uses a short WebM attached to a fixture entry. Final captures
scroll clipping and unsteady feedback into view. Screenshot inspection also
found the Polish note placeholder wrapping beyond two rows at 200%; its
invitation was shortened to `Coś o tym dniu?`. The final capture records the
placeholder attribute and checks its height against the field in both locales
and zoom settings. Earlier captures document the intermediate wording; the
`note-placeholder-fit` and visible-feedback captures show the final state.

Limits: CSS zoom checks layout reflow, not OS text scaling or pinch zoom.
These are headless Chromium fixtures, not an Android permission dialog,
physical microphone, real voice, screen-reader session or human Polish
review. The benchmark summary's pitch card extends beyond the viewport at
200% zoom; its figure layout was not changed by this copy ticket. Reference
sheets scroll, so screenshots show their current viewport while the JSON
records all laid-out reference text. Palette and theme combinations were not
exhaustively captured; changes introduce no colour or theme tokens.

## Verification

The browser runner closes its dev server before final checks. Final build
passed; typecheck found zero errors and zero warnings. Full test run passed
6,629 tests in 497 files. Targeted voice checks passed 90 tests in seven files.
Copy check passed catalogue parity, literal, gender-neutral address and
caller checks. Licence, screen-class and first-load-budget checks passed.

An initial sandbox build could not fetch the configured Inlang plugin and
cached empty generated messages. That cache, belonging only to this
worktree, was moved aside; a network-enabled regeneration restored the
catalogue. Final build and checks use the restored messages.

Svelte analyzer reviewed the route. Its warnings concern existing link and
effect patterns outside the two removed lines; this ticket does not change
those patterns. Main's latest CI run was checked with `gh run list`: run
`37048920055` was cancelled on the final refresh. Local final checks provide
this ticket's proof.

## Review

Standards and Spec reviews run against main after the implementation commit.
Standards found an English relative-clause error and loss of the Polish-data
qualification in two reference sentences. Both were fixed. Its optional
Polish suggestion was applied to the new pitch-movement range sentence.

Spec found missing rendered evidence for unsteady-note and unavailable or
unsupported microphone wording, and the same lost scientific qualification.
The focused captures close those gaps and record the note placeholder.
Spec also caught an inaccurate description of the removed reference title:
the sheet title is accessible only. The visible overall heading was restored;
only the redundant introduction is removed.

[06-contracts.json](06-contracts.json) checks interpolation contracts, unchanged
plural forms and protected authored values in both locales. It also records
20 generated calls across both plural messages, both locales and counts
0, 1, 2, 5 and 1.5. No selector, declaration, parameter or plural branch changed.

Final parallel rechecks passed on `cefdb4b7` against pinned main
`57671ed3`. Standards reported no remaining violations or new code smells.
Spec reported no missing, incorrect or out-of-scope requirements.

Main advanced while this worktree was active. A paired-key comparison found
no later voice edits and no conflicting changes to reviewed shared controls.
Unrelated author edits stay outside this ticket and will remain in the main
working tree. Human Polish sign-off remains open.
