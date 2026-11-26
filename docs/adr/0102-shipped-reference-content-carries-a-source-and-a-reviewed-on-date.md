# Shipped reference content carries a source, a reviewed-on date and a staleness limit

Status: Accepted
Decided: 2026-11-02
Last reviewed: 2026-11-02
Supersedes: none

Some of what the app ships is other people's facts: helpline numbers and
opening hours, Polish court procedure and the institutions to tell after a
ruling, figures read out of papers and clinical guides. Those go out of date
without any change in the code. Since the app makes no network request
(ADR-0100), it cannot fetch a fresh copy, so the copy it ships has to say where
it came from and how old it is.

The rule has three parts:

- **A source.** Every such fact names where it was read, next to the text in
  the code, in the shape that suits its owner.
- **A reviewed-on date.** An ISO day, kept beside the content, saying when a
  person last read it against that source. It is a claim that the reading
  happened, not a build stamp. Nobody bumps it without doing the reading.
- **A staleness limit.** Six months for helpline and legal content, which
  changes without notice. Twenty-four months for literature figures, which
  change when a paper or a guideline does.

## What it covers

Registered in `REVIEWED_CONTENT` in `src/lib/reviewedContent.ts`:

| Area | What | Kind | Date and source live in |
| --- | --- | --- | --- |
| Resources | every number, address and opening time | helpline | `RESOURCES_REVIEWED_ON` in `src/lib/resources/directory.ts`; each entry's own site |
| Roadmap | each legal pack's court steps | legal | each pack's `reviewedOn` in `src/lib/data/roadmap.ts`; sources beside the wording in `src/lib/data/vocabulary/roadmapLabels.ts` |
| Roadmap | institutions to update after the ruling | legal | `INSTITUTIONS_REVIEWED_ON` in `src/lib/data/roadmap.ts` |
| Voice | figures on the metric reference screen | literature | `VOICE_METRICS_REVIEWED_ON` in `src/lib/data/voice/metrics.ts` |
| Wear | the binder cue hours and each safety fact | literature | `WEAR_SAFETY_REVIEWED_ON` in `src/lib/data/journal/wearSessions.ts`; each fact's `source` in `src/lib/data/vocabulary/wearLabels.ts` |
| Onset bands | each effect's window | literature | `LITERATURE_SOURCES` and each window's `reviewedOn` in `src/lib/data/personalEffectWindow.ts` (ADR-0096) |

Where an area records one date per item, each item is its own row and falls due
by its own age.

## How it is enforced

`scripts/check-reviewed-content.mjs` runs in the release workflow
(`.github/workflows/release.yml`, step "Reviewed content within its limits"),
loads the real registry and prints one warning per entry past its limit, as a
GitHub annotation and in the step summary. A date that is not a real ISO day
always warns.

It warns and never fails a release. A stale date means "read the source again",
not "this is wrong", and a release that refused to ship over it would push
people towards bumping the date without reading anything.

`src/lib/reviewedContent.test.ts` holds each limit on both sides of its edge
and the month arithmetic (a review on the 31st falls due on the last day of a
shorter month). `tests/reviewed-content-check.test.ts` runs the script itself:
every entry warns on a far-future day, the run exits 0, and nothing warns on
the day of the latest review pass.

The guard checks dates and limits, not that a source is named: sources sit
beside their owners in different shapes (a site per helpline, a citation per
literature window, a research note per pack), and a review reads them. The
source half of the rule is held by review, the date half by the guard.

## Registering new content

Export the reviewed-on day next to the content, name its source there, and add
a row to `REVIEWED_CONTENT` with the kind that sets its limit. Content that
ships a figure or a phone number and is not in the registry never warns, so the
registry is only as complete as the people adding content keep it.

## Consequences

- Before each release somebody may have reading to do. The warnings say which
  area, which item, when it was last read and when it fell due.
- A source that cannot be re-read, such as a page taken down, is a reason to
  change or remove the content, not to keep the old date.

History: decided 2026-11-02.