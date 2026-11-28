# Onset bands follow SOC8 Appendix C Table 1 and wait behind "What the literature says"

Status: Accepted
Decided: 2026-10-21
Last reviewed: 2026-11-02
Supersedes: none

Every personal-effects onset band follows WPATH SOC8 Appendix C Table 1 cell for
cell. Each band carries its source and a reviewed-on date, and no band shows
until the person opens "What the literature says". The sources were checked for
independent authorship.

## Why

The bands used to come from two places: Hembree et al. 2017 (the Endocrine
Society guideline) and GenderGP's HRT timeline page, which reproduces WPATH
SOC7. Resources already sent people to SOC8, and the bands sat beside the
person's own first-noticed marker. SOC8 has one timing table, whose footer says
"Adapted from Hembree et al., 2017". Four Hembree authors are SOC8 authors and
WPATH co-sponsored Hembree, so SOC8 is not an independent check on it. Hembree's
own tables say "Estimates represent clinical observations", and the one cited
paper that measures physical effects follows people for a year. These figures
are expert estimates, not measured averages.

## Rules

1. **Cell for cell.** Years become months (2-5 y is 24-60), "> N years" is an
   open completion from N, and "unknown" or "variable" is no completion. A row
   SOC8 gives "variable" for both figures has no band; a row it gives an onset
   for gets one.
2. **Source and date per band** in `src/lib/data/personalEffectWindow.ts`
   (`source: 'soc8-appendix-c-table-1'`, `reviewedOn`), with the full citation
   in `LITERATURE_SOURCES`. `literatureReviews()` feeds the release-time
   staleness guard of ADR-0102 (24 months for literature).
3. **No band shows until "What the literature says" is opened.** One
   disclosure above the groups, closed on every visit, holds the bands, the
   limitation line, the method and variability notes and a source line. The
   editor sheet carries the same toggle under the date, bound to the same
   state. Closed, timelines draw only the person's markers and today.
4. **The source line names the organisation and the date, not the paper**:
   "Clinicians' estimates, from WPATH's care guidelines. Checked 21 October
   2026." The copy rules keep titles, authors and years out of app copy.
5. **Re-reviewing** means checking for a SOC8 correction, a SOC9, or an
   Endocrine Society guideline that replaces Hembree 2017, then updating the
   table, the test's literal copy of it and `reviewedOn` together.

## Where SOC8 departs from Hembree

SOC8 changes several cells without a stated reason or citation; following it
exactly means following them. The largest: voice deepening on testosterone
starts at 1-6 months (Hembree 6-12), breast growth completes at 2-5 years
(Hembree 2-3), and cessation of menses gets a one to two year maximum that may
be a layout slip. The cell-by-cell comparison is in the research note.

## Consequences

- The bands no longer compete with the person's own markers for the first read
  of the screen. The earlier always-visible limitation line and "About shaded
  bands" disclosure are gone; their text moved inside the new one.
- A person who marked "hair loss slowing" keeps the marker; the row just has no
  band.

## Known exposure

Copying SOC8 copies its unexplained departures. The maintainer chose SOC8 exactly over a
per-cell judgement (2026-10-21), so the app's figures match the guideline
Resources links rather than a reading of its sources. Nothing was checked for
errata to either guideline.

History: decided 2026-10-21, replacing the earlier sourcing of the bands.