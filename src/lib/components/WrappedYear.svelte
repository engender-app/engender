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

     Two things changed in the rebuild. The month strip was twelve
     hand-drawn bars with their own CSS and is the kit's horizontal bars,
     which is what that surface is: a label and a value on a line above a
     bar running the full width of the card. And the cover dropped the
     decorative bloom - an infinite ring animation - because the flag sun on
     Home is the whole of the app's ambient motion budget and a second loop
     spends it twice (DIRECTION.md, tiers 0 and 4). What carries the cover
     now is the year at display size over the flag's own bands, which is the
     same treatment the kit's tile gives a number that matters. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtMonthName } from '$lib/data/dates';
  import { localDateFromEpochDay } from '$lib/data/epochDay';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import type { DayAverage, Recap } from '$lib/data/journal/stats';
  import type { RecapDimChange } from '$lib/data/recapDisplay';
  import type { WrappedStreaks, WrappedTagInsight, WrappedTallyCounts } from '$lib/data/wrappedSections';
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';
  import BarRows, { type BarRow } from './kit/BarRows.svelte';
  import ChartCard from './kit/ChartCard.svelte';
  import ListCard from './kit/ListCard.svelte';
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

  const MOOD_MIN = 1;
  const MOOD_MAX = 5;

  /* Which stripe each area takes (DIRECTION.md, "flag colour reaches the
     whole app, categorically"). Every chart shares role 0, which is the
     brief's own exception rather than a shortcut: "colour that carries a
     value takes role 0", because roles run a flag's colours before its
     shades and index 0 is the only one guaranteed to be a colour on all 8
     palettes. Taken in reading order instead, a chart landed on trans's
     white band, and white bars on a dark card read as a set of disabled
     bars rather than as the flag. The lists take the stripes after it, where
     an achromatic band costs nothing - a tinted disc and a row wash carry no
     reading. The reason is written out in full on the Stats hub. */
  const AREA_ROLE = { charts: 0, figures: 1, milestones: 2 };
  /* The cover takes the whole flag rather than one stripe of it. */

  const fmtNative = (v: number) => (metricKey(prefs) === 'mood' ? v.toFixed(1) : String(Math.round(v)));
  const signed = (v: number, fmt: (n: number) => string) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;

  /* Twelve rows, always, including the months that hold nothing: a year with
     a silent spring reads as a year with a silent spring, and dropping those
     rows would quietly close the gap up. Averaged over the days that carried
     a mood rather than over all 28-31, so a month with four entries is not
     dragged toward the floor by the days nobody logged. */
  let monthRows = $derived.by((): BarRow[] => {
    const sums = Array.from({ length: 12 }, () => ({ total: 0, days: 0 }));
    for (const point of moodTrend) {
      const month = localDateFromEpochDay(point.day).getMonth();
      sums[month].total += point.value;
      sums[month].days += 1;
    }
    return sums.map((sum, month) => {
      const average = sum.days ? sum.total / sum.days : null;
      return {
        key: String(month),
        name: fmtMonthName(year, month),
        value: average === null ? '' : average.toFixed(1),
        /* A share of the mood range rather than the raw average, so a month
           at 1.0 still draws a visible sliver instead of nothing at all. */
        amount: average === null ? 0 : (average - MOOD_MIN) / (MOOD_MAX - MOOD_MIN)
      };
    });
  });

  let insightRows = $derived<BarRow[]>(
    insights.map((insight) => ({
      key: insight.id,
      name: insight.label,
      note: m.insight_row_sub({
        count: String(insight.count),
        with: fmtNative(insight.withAvg),
        without: fmtNative(insight.withoutAvg)
      }),
      value: signed(insight.delta, fmtNative),
      amount: Math.abs(insight.delta)
    }))
  );

  let tallyRows = $derived<BarRow[]>(
    tally
      ? [
          {
            key: 'misgendered',
            name: m.tally_misgendered(),
            value: String(tally.misgendered),
            amount: tally.misgendered
          },
          {
            key: 'correctly_gendered',
            name: m.tally_correctly_gendered(),
            value: String(tally.correctlyGendered),
            amount: tally.correctlyGendered
          }
        ]
      : []
  );

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
            value: `${recap.averageMood.toFixed(1)} / ${MOOD_MAX}`,
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
            value: signed(dimChange.change, (n) => String(Math.round(n))),
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
  <p class="wrapped-cover-label">{m.wrapped()}</p>
  <h2 class="wrapped-cover-year" data-wrapped-cover-year>{year}</h2>
  {#if flagFill}
    <span class="wrapped-cover-flag" style={`--flag-fill: ${flagFill}`} aria-hidden="true"></span>
  {/if}
  <p class="wrapped-cover-intro">{intro}</p>
</div>

<ChartCard heading={m.wrapped_year_months()} kind="wrapped-months" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
  <BarRows rows={monthRows} />
</ChartCard>

<SectionHeading text={m.wrapped_year_figures()} />
<ListCard role={roleAt(activeFlag.roles, AREA_ROLE.figures)}>
  {#each figures as figure (figure.key)}
    <div class="kit-row is-static" data-wrapped-figure>
      <span class="kit-row-text">
        <span class="kit-row-title">{figure.label}</span>
        {#if figure.note}<span class="kit-row-sub">{figure.note}</span>{/if}
      </span>
      <span class="kit-row-trail"><b class="wrapped-figure-value">{figure.value}</b></span>
    </div>
  {/each}
</ListCard>

{#if insightRows.length}
  <ChartCard heading={m.tag_insights()} kind="wrapped-insights" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    <BarRows rows={insightRows} />
  </ChartCard>
  <p class="wrapped-note">{m.insights_note()}</p>
{/if}

{#if tallyRows.length}
  <ChartCard heading={m.tally_trend_title()} kind="wrapped-tally" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    <BarRows rows={tallyRows} />
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
      <div class="kit-row is-static" data-wrapped-milestone>
        <span class="kit-row-ico"><Icon name="flag" size={22} /></span>
        <span class="kit-row-text"><span class="kit-row-title">{ms.name}</span></span>
        <span class="kit-row-trail">
          <span class="wrapped-figure-date">{fmtDay(ms.epochDay, { day: 'numeric', month: 'long' })}</span>
        </span>
      </div>
    {/each}
  </ListCard>
{/if}

<p class="wrapped-year-close">{m.wrapped_year_close({ year: String(year) })}</p>
