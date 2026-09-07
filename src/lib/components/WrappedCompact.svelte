<script lang="ts">
  /* The weekly, monthly and picked-range wrapped (phase 4 features ticket
     01, rebuilt on the kit by phase 5 UX ticket 23). One screen you scroll
     once, glance at, and leave. The three share it because the questions a
     week, a month and an arbitrary window answer are the same size - how
     much did I log, how did it move, what did I tag - and the only
     difference between them is the heading, which arrives as a prop.

     A year does not share it. WrappedYear.svelte is a separate presentation
     rather than this one with more sections, because twelve months of data
     supports a shape a week's worth cannot fill.

     What changed in the rebuild. The figures were four small tiles in a row
     and are a list card, so a figure can carry a supporting line under it
     instead of every one of them being a tile saying a bare number. The
     mood arc is the kit's area chart, so it carries a value scale and a
     mark per day and re-tweens rather than being redrawn. Tag insights and
     the tally are the kit's horizontal bars. The rest - milestones, photos, the tags you used
     - is the same content on the kit's own surfaces.

     Sections with nothing in them are left out rather than rendered saying
     "none". That is the same call the entry floor makes about the period as
     a whole, applied one card down: a wrapped is worth opening or it is not
     shown, and a card is worth reading or it is not there. Every one of the
     four sections spec 06 adds arrives already answered - null for "no
     section" - from $lib/data/wrappedSections. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { atGrain, type Grain } from '$lib/charts/grain';
  import { MOOD_RANGE } from '$lib/data/metricRange';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
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
  import type { WrappedTagInsight, WrappedTallyCounts } from '$lib/data/wrappedSections';
  import ResurfacedPhoto from './ResurfacedPhoto.svelte';
  import AreaChart from './kit/AreaChart.svelte';
  import BarRows from './kit/BarRows.svelte';
  import ChartCard from './kit/ChartCard.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';

  let {
    title,
    subtitle,
    recap,
    moodTrend,
    dimChange,
    topTags,
    anchorDuration = null,
    insights = [],
    tally = null,
  }: {
    title: string;
    subtitle: string;
    recap: Recap;
    moodTrend: DayAverage[];
    /** The gender dimension that moved furthest, already named - the screens
        say "scale" for it (CONTEXT: Gender dimension). Carries the signed
        movement as well as the two endpoints (spec 06). */
    dimChange: RecapDimChange | null;
    topTags: { label: string; count: number }[];
    /** The journey anchor's duration (phase 5 ticket 25), already named and
        formatted. Optional and null by default so a caller with no anchor
        concept of its own does not have to pass one. */
    anchorDuration?: { name: string; duration: string } | null;
    /** Which tags went with better or worse days, already named. Empty
        where the period has nothing to say (spec 06). */
    insights?: (WrappedTagInsight & { label: string })[];
    tally?: WrappedTallyCounts | null;
  } = $props();

  /* Which stripe each area takes, and the two ways this app writes a
     number, both from $lib/data/wrappedDisplay - shared with the year so the
     two presentations cannot drift into colouring or formatting the same
     reading differently. */
  const AREA_ROLE = WRAPPED_AREA_ROLE;

  const fmtNative = (v: number) => nativeValue(metricKey(prefs), v);

  let plotted = $derived(
    atGrain(
      moodTrend.map((p) => ({ x: p.day, y: p.value })),
      Math.max(1, moodTrend[moodTrend.length - 1].day - moodTrend[0].day + 1)
    )
  );

  const GRAIN_WEEK_SPAN = 6;
  const grainLabel = (grain: Grain) => (point: { x: number }) => {
    const short = { day: 'numeric', month: 'short' } as const;
    if (grain === 'day') return fmtDay(point.x, { weekday: 'short', ...short });
    if (grain === 'month') return fmtDay(point.x, { month: 'long', year: 'numeric' });
    return `${fmtDay(point.x, short)} - ${fmtDay(point.x + GRAIN_WEEK_SPAN, short)}`;
  };

  /* Which scale the insight bars are of, named once in the heading. The
     rows carry only their counts (wrappedDisplay.ts): a wrapped draws these
     against whichever metric the preference held, and unlike /stats it has
     no picker for the heading line to hold, because a retrospective cannot
     change the scale it is a retrospective of. */
  let metric = $derived(metricKey(prefs));
  let insightRows = $derived(tagInsightRows(insights, metric));
  let tally_rows = $derived(tallyRows(tally));
</script>

<header class="wrapped-head">
  <h2 class="wrapped-title" data-wrapped-title>{title}</h2>
  <p class="wrapped-sub">{subtitle}</p>
</header>

<!-- The figures. A list rather than a row of small tiles, so a figure can
     carry a supporting line under it instead of every one of them having to
     be a tile stating a bare number. -->
<div class="wrapped-figure-list" data-kit-surface data-wrapped-stats>
<ListCard role={roleAt(activeFlag.roles, AREA_ROLE.figures)}>
  <ListRow static data-wrapped-stat title={m.wrapped_stat_entries()}>
    {#snippet trailing()}<b class="wrapped-figure-value">{recap.entryCount}</b>{/snippet}
  </ListRow>
  {#if recap.averageMood !== null}
    {@const mood = recap.averageMood}
    <ListRow static data-wrapped-stat title={m.wrapped_stat_mood()}>
      {#snippet trailing()}<b class="wrapped-figure-value">{mood.toFixed(1)}</b>{/snippet}
    </ListRow>
  {/if}
  {#if anchorDuration}
    <ListRow static data-wrapped-stat title={m.journey_anchor_since({ name: anchorDuration.name })}>
      {#snippet trailing()}<b class="wrapped-figure-value">{anchorDuration.duration}</b>{/snippet}
    </ListRow>
  {/if}
  {#if dimChange}
    <!-- The scale that moved furthest, with the movement itself and not only
         its two endpoints (spec 06). Signed, because which way a gender
         dimension went is not better or worse (F15), only different. -->
    <ListRow
      static
      data-wrapped-stat
      data-wrapped-dim-change
      title={m.wrapped_scale_arc()}
      subtitle={m.wrapped_scale_arc_body({
        name: dimChange.name,
        from: String(Math.round(dimChange.from)),
        to: String(Math.round(dimChange.to))
      })}
    >
      {#snippet trailing()}
        <b class="wrapped-figure-value">{signedValue(dimChange.change, (n) => String(Math.round(n)))}</b>
      {/snippet}
    </ListRow>
  {/if}
</ListCard>
</div>

<!-- Two points is what a line needs to be a line; below that a wrapped would
     rather not have the card at all. -->
{#if moodTrend.length >= 2}
  <ChartCard heading={m.wrapped_mood_arc()} kind="wrapped-mood" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    <AreaChart
      points={plotted.points}
      scrubLabel={grainLabel(plotted.grain)}
      min={MOOD_RANGE.min}
      max={MOOD_RANGE.max}
      from={fmtDay(moodTrend[0].day, { day: 'numeric', month: 'short' })}
      to={fmtDay(moodTrend[moodTrend.length - 1].day, { day: 'numeric', month: 'short' })}
      formatValue={(v) => v.toFixed(1)}
      ariaLabel={m.wrapped_mood_arc()}
    />
  </ChartCard>
{/if}

{#if insightRows.length}
  <ChartCard
    heading={m.tag_insights_of({ metric: vocabulary.metricNameOf(metric) })}
    kind="wrapped-insights" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    <BarRows rows={insightRows} />
  </ChartCard>
  <p class="wrapped-note">{m.insights_note()}</p>
{/if}

{#if tally_rows.length}
  <ChartCard heading={m.tally_trend_title()} kind="wrapped-tally" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    <BarRows rows={tally_rows} />
  </ChartCard>
{/if}

<!-- The tags you used, as the chip row: flush to the page with no container
     at all, which is the surface DIRECTION.md 2b gives a set of small
     labels. A different question from the insights above - how often, not
     which days - so the two are not one card said twice. -->
{#if topTags.length}
  <SectionHeading text={m.wrapped_tags()} />
  <div class="tag-row" data-wrapped-tags>
    {#each topTags as t (t.label)}
      <span class="tag-chip is-mini">{m.recap_tag_count({ label: t.label, count: String(t.count) })}</span>
    {/each}
  </div>
{/if}

{#if recap.milestones.length}
  <SectionHeading text={m.wrapped_milestones()} />
  <ListCard role={roleAt(activeFlag.roles, AREA_ROLE.milestones)}>
    {#each recap.milestones as ms (ms.id)}
      <ListRow static data-wrapped-milestone icon="flag" title={ms.name}>
        {#snippet trailing()}
          <span class="wrapped-figure-date">{fmtDay(ms.epochDay, { day: 'numeric', month: 'short' })}</span>
        {/snippet}
      </ListRow>
    {/each}
  </ListCard>
{/if}

{#if recap.photoHighlights.length}
  <SectionHeading text={m.wrapped_photos()} />
  <div class="wrapped-photos" data-wrapped-photos>
    {#each recap.photoHighlights as photo (photo.id)}
      <ResurfacedPhoto {photo} size={72} label={fmtDay(photo.epochDay, { day: 'numeric', month: 'short' })} />
    {/each}
  </div>
{/if}
