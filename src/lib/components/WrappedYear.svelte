<script lang="ts">
  /* The yearly wrapped (phase 4 features ticket 01, rebuilt on the kit by
     phase 5 UX ticket 23). Deliberately not WrappedCompact with more cards
     in it: a year holds twelve months of shape, and the interesting question
     about it is where the shape went, which a 365-point day chart flattens
     and a month-by-month strip shows.

     So the structure is different rather than longer - a cover, the year
     read month by month, its figures, and the photos as a strip you scroll.
     The compact template's card-per-question layout is the right answer for
     a week and the wrong one here.

     The month strip was twelve hand-drawn bars with their own CSS, then the
     kit's horizontal bars, and is now a grid of every day of the year on
     mood's own ramp: twelve bars say where the shape went, and a year of
     cells says what the year was. And the cover dropped the
     decorative bloom - an infinite ring animation - because the flag sun on
     Home is the whole of the app's ambient motion budget and a second loop
     spends it twice - and Alicja put it back: a yearly wrapped is opened
     deliberately, once, and it is the one screen allowed to be an occasion.
     What the cover also gained is the year at display size over the flag's
     own bands, which is the same treatment the kit's tile gives a number
     that matters, in place of the gradient text the craft floor refuses. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtMonthName } from '$lib/data/dates';
  import { epochDayFromLocalDate } from '$lib/data/epochDay';
  import { moodYear } from '$lib/charts/moodYear';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { MOOD_RANGE } from '$lib/data/metricRange';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import {
    WRAPPED_AREA_ROLE,
    nativeValue,
    signedValue,
    tagInsightRows,
    tallyRows
  } from '$lib/data/wrappedDisplay';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import type { DayAverage, Recap } from '$lib/data/journal/stats';
  import type { RecapDimChange } from '$lib/data/recapDisplay';
  import type { WrappedStreaks, WrappedTagInsight, WrappedTallyCounts } from '$lib/data/wrappedSections';
  import PhotoThumb from './PhotoThumb.svelte';
  import RiveSlot from './RiveSlot.svelte';
  import BarRows from './kit/BarRows.svelte';
  import type { BarRow } from './kit/barRow';
  import MoodYear from './kit/MoodYear.svelte';
  import ChartCard from './kit/ChartCard.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';

  let {
    year,
    intro,
    recap,
    moodTrend,
    dimChange,
    topTags,
    anchorDuration = null,
    insights = [],
    tally = null,
    streaks = null
  }: {
    /** The calendar year, as a number: the cover prints it and the month
        names are formatted in it, and a string round-tripped through
        `Number()` could arrive as an empty one. */
    year: number;
    intro: string;
    recap: Recap;
    moodTrend: DayAverage[];
    dimChange: RecapDimChange | null;
    topTags: { label: string; count: number }[];
    /** The journey anchor's duration (phase 5 ticket 25), already named and
        formatted - the caller resolves the anchor milestone and formats its
        gap to today, the same division of labour dimChange's name
        resolution already follows. Null while no anchor is set - the figure
        is left out rather than shown as a gap. */
    anchorDuration?: { name: string; duration: string } | null;
    insights?: (WrappedTagInsight & { label: string })[];
    tally?: WrappedTallyCounts | null;
    streaks?: WrappedStreaks | null;
  } = $props();

  /* Which stripe each area takes, and the two ways this app writes a number,
     both from $lib/data/wrappedDisplay - shared with the compact
     presentation so the year and the week cannot drift into colouring or
     formatting the same reading differently. The cover takes the whole flag
     rather than one stripe of it. */
  const AREA_ROLE = WRAPPED_AREA_ROLE;

  /* The year, a day at a time. It was twelve bars, one per month: those said
     where the shape went and this says what the year was, which is what a
     yearly retrospective is for - and a month is still legible in it as a
     block of columns (Alicja, 2026-08-25). */
  let grid = $derived(moodYear(year, moodTrend.map((p) => ({ day: p.day, value: p.value }))));

  const shortMonth = (month: number) =>
    fmtDay(epochDayFromLocalDate(new Date(year, month, 1)), { month: 'short' });

  const dayLabel = (epochDay: number, step: number | null) => {
    const day = fmtDay(epochDay, { weekday: 'short', day: 'numeric', month: 'short' });
    return step === null ? day : `${day} · ${moodName(step)}`;
  };

  let insightRows = $derived(tagInsightRows(insights, metricKey(prefs)));
  let tally_rows = $derived(tallyRows(tally));

  let figures = $derived([
    { key: 'entries', label: m.wrapped_stat_entries(), value: String(recap.entryCount), note: undefined },
    ...(streaks
      ? [
          {
            key: 'streak',
            label: m.wrapped_stat_streak(),
            value: m.n_days({ n: streaks.inPeriod }),
            note: `${m.wrapped_stat_streak_ever()}: ${m.n_days({ n: streaks.ever })}`
          }
        ]
      : []),
    ...(recap.averageMood !== null
      ? [
          {
            key: 'mood',
            label: m.wrapped_stat_mood(),
            value: `${recap.averageMood.toFixed(1)} / ${MOOD_RANGE.max}`,
            note: undefined
          }
        ]
      : []),
    ...(anchorDuration
      ? [
          {
            key: 'anchor',
            label: m.journey_anchor_since({ name: anchorDuration.name }),
            value: anchorDuration.duration,
            note: undefined
          }
        ]
      : []),
    ...(dimChange
      ? [
          {
            key: 'scale',
            label: m.wrapped_scale_arc(),
            value: signedValue(dimChange.change, (n) => String(Math.round(n))),
            note: m.wrapped_scale_arc_body({
              name: dimChange.name,
              from: String(Math.round(dimChange.from)),
              to: String(Math.round(dimChange.to))
            })
          }
        ]
      : [])
  ]);

  /* The flag itself under the year, in its own hex values and its own
     proportions, nudged for nothing (DIRECTION.md decision 1). Absent under
     disguise, where the publisher hands out no flag at all (ADR-0035). */
  let flagFill = $derived(activeFlag.fill === 'none' ? undefined : activeFlag.fill);
</script>

<div class="wrapped-cover" data-wrapped-cover>
  <!-- Kept, at Alicja's call (2026-08-25). This ticket had taken it off,
       reading DIRECTION's "the sun is the whole of the app's ambient budget"
       as covering it; a yearly retrospective is opened deliberately, once,
       and it is the one screen in the app that is allowed to be a bit of an
       occasion. -->
  <RiveSlot height={140} variant="bloom" />
  <p class="wrapped-cover-label">{m.wrapped()}</p>
  <h2 class="wrapped-cover-year" data-wrapped-cover-year>{year}</h2>
  {#if flagFill}
    <span class="wrapped-cover-flag" style={`--flag-fill: ${flagFill}`} aria-hidden="true"></span>
  {/if}
  <p class="wrapped-cover-intro">{intro}</p>
</div>

<ChartCard heading={m.wrapped_year_months()} kind="wrapped-months" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
  <!-- Short month names: full ones took 70px of a 340px card, which is a
       fifth of the grid's width spent on labels the reader already knows the
       order of. -->
  <MoodYear {grid} monthName={shortMonth} {dayLabel} />
</ChartCard>

<SectionHeading text={m.wrapped_year_figures()} />
<ListCard role={roleAt(activeFlag.roles, AREA_ROLE.figures)}>
  {#each figures as figure (figure.key)}
    <ListRow static data-wrapped-figure title={figure.label} subtitle={figure.note}>
      {#snippet trailing()}<b class="wrapped-figure-value">{figure.value}</b>{/snippet}
    </ListRow>
  {/each}
</ListCard>

{#if insightRows.length}
  <ChartCard heading={m.tag_insights()} kind="wrapped-insights" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    <BarRows rows={insightRows} />
  </ChartCard>
  <p class="wrapped-note">{m.insights_note()}</p>
{/if}

{#if tally_rows.length}
  <ChartCard heading={m.tally_trend_title()} kind="wrapped-tally" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    <BarRows rows={tally_rows} />
  </ChartCard>
{/if}

<!-- All of them, with their counts, not just the year's single loudest tag:
     the ticket asks every cadence to cover top tags, and one bare name is a
     different, smaller answer. Full-size chips rather than the compact
     template's mini ones, which is the year reading its own way. -->
{#if topTags.length}
  <SectionHeading text={m.wrapped_tags()} />
  <div class="tag-row" data-wrapped-tags>
    {#each topTags as tag (tag.label)}
      <span class="tag-chip">{m.recap_tag_count({ label: tag.label, count: String(tag.count) })}</span>
    {/each}
  </div>
{/if}

{#if recap.photoHighlights.length}
  <SectionHeading text={m.wrapped_photos()} />
  <div class="wrapped-photo-strip" data-wrapped-photos>
    {#each recap.photoHighlights as photo (photo.id)}
      <PhotoThumb {photo} size={116} label={fmtDay(photo.epochDay, { day: 'numeric', month: 'short' })} />
    {/each}
  </div>
{/if}

{#if recap.milestones.length}
  <SectionHeading text={m.wrapped_milestones()} />
  <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.milestones)}>
    {#each recap.milestones as ms (ms.id)}
      <ListRow static data-wrapped-milestone icon="flag" title={ms.name}>
        {#snippet trailing()}
          <span class="wrapped-figure-date">{fmtDay(ms.epochDay, { day: 'numeric', month: 'long' })}</span>
        {/snippet}
      </ListRow>
    {/each}
  </ListCard>
{/if}

<p class="wrapped-year-close">{m.wrapped_year_close({ year: String(year) })}</p>
