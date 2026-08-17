<script lang="ts">
  /* The yearly wrapped (phase 4 features ticket 01). Deliberately not
     WrappedCompact with more cards in it: a year holds twelve months of
     shape, and the interesting question about it is where the shape went,
     which a 365-point day chart flattens and a month-by-month strip shows.

     So the structure is different rather than longer - a cover, the year
     read month by month, its figures as one run of numbers instead of a
     stack of separate cards, and the photos as a strip you scroll. The
     compact template's card-per-question layout is the right answer for a
     week and the wrong one here. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtMonthName } from '$lib/data/dates';
  import { localDateFromEpochDay } from '$lib/data/epochDay';
  import type { DayAverage, Recap } from '$lib/data/journal/stats';
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';
  import RiveSlot from './RiveSlot.svelte';

  let {
    year,
    intro,
    recap,
    moodTrend,
    dimChange,
    topTags
  }: {
    /** The calendar year, as a number: the cover prints it and the month
        names are formatted in it, and a string round-tripped through
        `Number()` could arrive as an empty one. */
    year: number;
    intro: string;
    recap: Recap;
    moodTrend: DayAverage[];
    dimChange: { name: string; from: number; to: number } | null;
    topTags: { label: string; count: number }[];
  } = $props();

  const MOOD_MIN = 1;
  const MOOD_MAX = 5;

  /* Twelve rows, always, including the months that hold nothing: a year with
     a silent spring reads as a year with a silent spring, and dropping those
     rows would quietly close the gap up. Averaged over the days that carried
     a mood rather than over all 28-31, so a month with four entries is not
     dragged toward the floor by the days nobody logged. */
  let months = $derived.by(() => {
    const sums = Array.from({ length: 12 }, () => ({ total: 0, days: 0 }));
    for (const point of moodTrend) {
      const month = localDateFromEpochDay(point.day).getMonth();
      sums[month].total += point.value;
      sums[month].days += 1;
    }
    return sums.map((sum, month) => ({
      month,
      name: fmtMonthName(year, month),
      average: sum.days ? sum.total / sum.days : null,
      /* Width as a share of the mood range, so an average of 1 still draws a
         visible sliver rather than nothing at all. */
      share: sum.days ? (sum.total / sum.days - MOOD_MIN) / (MOOD_MAX - MOOD_MIN) : 0
    }));
  });

  let figures = $derived([
    { label: m.wrapped_stat_entries(), value: String(recap.entryCount) },
    { label: m.wrapped_stat_streak(), value: m.n_days({ n: recap.bestStreak }) },
    ...(recap.averageMood !== null
      ? [{ label: m.wrapped_stat_mood(), value: `${recap.averageMood.toFixed(1)} / ${MOOD_MAX}` }]
      : []),
    ...(dimChange
      ? [
          {
            label: m.wrapped_scale_arc(),
            value: m.wrapped_scale_arc_body({
              name: dimChange.name,
              from: String(Math.round(dimChange.from)),
              to: String(Math.round(dimChange.to))
            })
          }
        ]
      : [])
  ]);
</script>

<div class="wrapped-cover">
  <RiveSlot height={140} variant="bloom" />
  <p class="wrapped-cover-label">{m.wrapped()}</p>
  <h2 class="wrapped-cover-year">{year}</h2>
  <p class="wrapped-cover-intro">{intro}</p>
</div>

<section class="wrapped-year-section">
  <h3 class="wrapped-year-heading">{m.wrapped_year_months()}</h3>
  <div class="wrapped-months">
    {#each months as row (row.month)}
      <div class="wrapped-month">
        <span class="wrapped-month-name">{row.name}</span>
        <!-- The bar is decoration over a number that is already text: the
             stats screen learned that a chart with no readable values is a
             chart a screen reader cannot report (accessibility-audit). -->
        <span class="wrapped-month-bar" aria-hidden="true">
          <span class="wrapped-month-fill" style:width="{Math.max(row.share * 100, row.average === null ? 0 : 4)}%"
          ></span>
        </span>
        <span class="wrapped-month-value">{row.average === null ? '' : row.average.toFixed(1)}</span>
      </div>
    {/each}
  </div>
</section>

<section class="wrapped-year-section">
  <h3 class="wrapped-year-heading">{m.wrapped_year_figures()}</h3>
  <dl class="wrapped-figures">
    {#each figures as figure (figure.label)}
      <div class="wrapped-figure">
        <dt>{figure.label}</dt>
        <dd>{figure.value}</dd>
      </div>
    {/each}
  </dl>
</section>

<!-- All of them, with their counts, not just the year's single loudest tag:
     the ticket asks every cadence to cover top tags, and one bare name is a
     different, smaller answer. Full-size chips rather than the compact
     template's mini ones, which is the year reading its own way. -->
{#if topTags.length}
  <section class="wrapped-year-section">
    <h3 class="wrapped-year-heading">{m.wrapped_tags()}</h3>
    <div class="tag-row">
      {#each topTags as tag (tag.label)}
        <span class="tag-chip">{m.recap_tag_count({ label: tag.label, count: String(tag.count) })}</span>
      {/each}
    </div>
  </section>
{/if}

{#if recap.photoHighlights.length}
  <section class="wrapped-year-section">
    <h3 class="wrapped-year-heading">{m.wrapped_photos()}</h3>
    <div class="wrapped-photo-strip">
      {#each recap.photoHighlights as photo (photo.id)}
        <PhotoThumb {photo} size={116} label={fmtDay(photo.epochDay, { day: 'numeric', month: 'short' })} />
      {/each}
    </div>
  </section>
{/if}

{#if recap.milestones.length}
  <section class="wrapped-year-section">
    <h3 class="wrapped-year-heading">{m.wrapped_milestones()}</h3>
    <div class="wrapped-year-timeline">
      {#each recap.milestones as ms (ms.id)}
        <div class="wrapped-year-milestone">
          <span class="wrapped-year-dot"><Icon name="flag" size={14} /></span>
          <span class="wrapped-year-milestone-name">{ms.name}</span>
          <span class="muted small">{fmtDay(ms.epochDay, { day: 'numeric', month: 'long' })}</span>
        </div>
      {/each}
    </div>
  </section>
{/if}

<p class="wrapped-year-close">{m.wrapped_year_close({ year: String(year) })}</p>
