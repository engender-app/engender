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
     and are a list card, which is what let the best-streak-ever figure
     arrive as the line under the streak it sits against rather than as a
     fifth tile saying a number about a different period. The mood arc is the
     kit's area chart, so it carries a value scale and a mark per day and
     re-tweens rather than being redrawn. Tag insights and the tally are the
     kit's horizontal bars. The rest - milestones, photos, the tags you used
     - is the same content on the kit's own surfaces.

     Sections with nothing in them are left out rather than rendered saying
     "none". That is the same call the entry floor makes about the period as
     a whole, applied one card down: a wrapped is worth opening or it is not
     shown, and a card is worth reading or it is not there. Every one of the
     four sections spec 06 adds arrives already answered - null for "no
     section" - from $lib/data/wrappedSections. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import type { DayAverage, Recap } from '$lib/data/journal/stats';
  import type { RecapDimChange } from '$lib/data/recapDisplay';
  import type { WrappedStreaks, WrappedTagInsight, WrappedTallyCounts } from '$lib/data/wrappedSections';
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';
  import AreaChart from './kit/AreaChart.svelte';
  import BarRows, { type BarRow } from './kit/BarRows.svelte';
  import ChartCard from './kit/ChartCard.svelte';
  import ListCard from './kit/ListCard.svelte';
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
    streaks = null
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
    streaks?: WrappedStreaks | null;
  } = $props();

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

  const MOOD_MIN = 1;
  const MOOD_MAX = 5;

  const fmtNative = (v: number) => (metricKey(prefs) === 'mood' ? v.toFixed(1) : String(Math.round(v)));
  const signed = (v: number, fmt: (n: number) => string) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;

  /* Bars from the size of the movement and never from its direction: the two
     ends of a scale are not better and worse, so a tag that went with lower
     days draws the same length as one that went with higher and says which
     way in its own number. */
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

  /* Two counts, side by side, with no ratio between them and no direction
     named: the two counters never combine into a score (stats.ts, ticket
     10), and a retrospective is where that rule is most tempting to break. */
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
</script>

<header class="wrapped-head">
  <h2 class="wrapped-title" data-wrapped-title>{title}</h2>
  <p class="wrapped-sub">{subtitle}</p>
</header>

<!-- The figures. A list rather than a row of small tiles, which is what let
     the best-ever streak sit under the period's own best as the thing it is
     measured against instead of becoming a fifth tile stating a number about
     a different period. -->
<div class="wrapped-figure-list" data-wrapped-stats>
<ListCard role={roleAt(activeFlag.roles, AREA_ROLE.figures)}>
  <div class="kit-row is-static" data-wrapped-stat>
    <span class="kit-row-text"><span class="kit-row-title">{m.wrapped_stat_entries()}</span></span>
    <span class="kit-row-trail"><b class="wrapped-figure-value">{recap.entryCount}</b></span>
  </div>
  {#if streaks}
    <div class="kit-row is-static" data-wrapped-stat>
      <span class="kit-row-text">
        <span class="kit-row-title">{m.wrapped_stat_streak()}</span>
        <!-- The period's best against the best there has ever been. Never a
             verdict on the pair: the label says which is which and the
             numbers say the rest. -->
        <span class="kit-row-sub">
          {m.wrapped_stat_streak_ever()}: {m.n_days({ n: streaks.ever })}
        </span>
      </span>
      <span class="kit-row-trail"><b class="wrapped-figure-value">{m.n_days({ n: streaks.inPeriod })}</b></span>
    </div>
  {/if}
  {#if recap.averageMood !== null}
    <div class="kit-row is-static" data-wrapped-stat>
      <span class="kit-row-text"><span class="kit-row-title">{m.wrapped_stat_mood()}</span></span>
      <span class="kit-row-trail"><b class="wrapped-figure-value">{recap.averageMood.toFixed(1)}</b></span>
    </div>
  {/if}
  {#if anchorDuration}
    <div class="kit-row is-static" data-wrapped-stat>
      <span class="kit-row-text">
        <span class="kit-row-title">{m.journey_anchor_since({ name: anchorDuration.name })}</span>
      </span>
      <span class="kit-row-trail"><b class="wrapped-figure-value">{anchorDuration.duration}</b></span>
    </div>
  {/if}
  {#if dimChange}
    <!-- The scale that moved furthest, with the movement itself and not only
         its two endpoints (spec 06). Signed, because which way a gender
         dimension went is not better or worse (F15), only different. -->
    <div class="kit-row is-static" data-wrapped-stat data-wrapped-dim-change>
      <span class="kit-row-text">
        <span class="kit-row-title">{m.wrapped_scale_arc()}</span>
        <span class="kit-row-sub">
          {m.wrapped_scale_arc_body({
            name: dimChange.name,
            from: String(Math.round(dimChange.from)),
            to: String(Math.round(dimChange.to))
          })}
        </span>
      </span>
      <span class="kit-row-trail">
        <b class="wrapped-figure-value">{signed(dimChange.change, (n) => String(Math.round(n)))}</b>
      </span>
    </div>
  {/if}
</ListCard>
</div>

<!-- Two points is what a line needs to be a line; below that a wrapped would
     rather not have the card at all. -->
{#if moodTrend.length >= 2}
  <ChartCard heading={m.wrapped_mood_arc()} kind="wrapped-mood" role={roleAt(activeFlag.roles, AREA_ROLE.charts)}>
    <AreaChart
      points={moodTrend.map((p) => ({ x: p.day, y: p.value }))}
      min={MOOD_MIN}
      max={MOOD_MAX}
      from={fmtDay(moodTrend[0].day, { day: 'numeric', month: 'short' })}
      to={fmtDay(moodTrend[moodTrend.length - 1].day, { day: 'numeric', month: 'short' })}
      formatValue={(v) => v.toFixed(1)}
      ariaLabel={m.wrapped_mood_arc()}
    />
  </ChartCard>
{/if}

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
      <div class="kit-row is-static" data-wrapped-milestone>
        <span class="kit-row-ico"><Icon name="flag" size={22} /></span>
        <span class="kit-row-text"><span class="kit-row-title">{ms.name}</span></span>
        <span class="kit-row-trail">
          <span class="wrapped-figure-date">{fmtDay(ms.epochDay, { day: 'numeric', month: 'short' })}</span>
        </span>
      </div>
    {/each}
  </ListCard>
{/if}

{#if recap.photoHighlights.length}
  <SectionHeading text={m.wrapped_photos()} />
  <div class="wrapped-photos" data-wrapped-photos>
    {#each recap.photoHighlights as photo (photo.id)}
      <PhotoThumb {photo} size={72} label={fmtDay(photo.epochDay, { day: 'numeric', month: 'short' })} />
    {/each}
  </div>
{/if}
