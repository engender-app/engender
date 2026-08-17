<script lang="ts">
  /* The weekly and monthly wrapped (phase 4 features ticket 01): one screen
     you scroll once, glance at, and leave. Both cadences share it because
     the questions a week and a month answer are the same size - how much did
     I log, how did it move, what did I tag - and the only difference between
     them is the heading, which arrives as a prop.

     A year does not share it. WrappedYear.svelte is a separate presentation
     rather than this one with more sections, because twelve months of data
     supports a shape a week's worth cannot fill.

     Sections with nothing in them are left out rather than rendered saying
     "none". That is the same call the entry floor makes about the period as
     a whole, applied one card down: a wrapped is worth opening or it is not
     shown, and a card is worth reading or it is not there. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import type { DayAverage, Recap } from '$lib/data/journal/stats';
  import Icon from './Icon.svelte';
  import LineChart from './LineChart.svelte';
  import PhotoThumb from './PhotoThumb.svelte';

  let {
    title,
    subtitle,
    recap,
    moodTrend,
    dimChange,
    topTags
  }: {
    title: string;
    subtitle: string;
    recap: Recap;
    moodTrend: DayAverage[];
    /** The gender dimension that moved furthest, already named - the screens
        say "scale" for it (CONTEXT: Gender dimension). */
    dimChange: { name: string; from: number; to: number } | null;
    topTags: { label: string; count: number }[];
  } = $props();
</script>

<header class="wrapped-head">
  <h2 class="wrapped-title">{title}</h2>
  <p class="wrapped-sub">{subtitle}</p>
</header>

<div class="wrapped-stats">
  <div class="wrapped-stat">
    <strong>{recap.entryCount}</strong>
    <span>{m.wrapped_stat_entries()}</span>
  </div>
  <div class="wrapped-stat">
    <strong>{recap.bestStreak}</strong>
    <span>{m.wrapped_stat_streak()}</span>
  </div>
  {#if recap.averageMood !== null}
    <div class="wrapped-stat">
      <strong>{recap.averageMood.toFixed(1)}</strong>
      <span>{m.wrapped_stat_mood()}</span>
    </div>
  {/if}
</div>

<!-- Two points is what a line needs to be a line; below that the chart
     component draws its own "not enough data" state, and a wrapped would
     rather not have the card at all. -->
{#if moodTrend.length >= 2}
  <div class="card wrapped-block">
    <span class="row-title">{m.wrapped_mood_arc()}</span>
    <LineChart points={moodTrend} min={1} max={5} />
  </div>
{/if}

{#if dimChange}
  <div class="card wrapped-block">
    <span class="row-title">{m.wrapped_scale_arc()}</span>
    <p class="row-subtitle" style="margin-top:var(--space-1)">
      {m.wrapped_scale_arc_body({
        name: dimChange.name,
        from: String(Math.round(dimChange.from)),
        to: String(Math.round(dimChange.to))
      })}
    </p>
  </div>
{/if}

{#if topTags.length}
  <div class="card wrapped-block">
    <span class="row-title">{m.wrapped_tags()}</span>
    <div class="tag-row" style="margin-top:var(--space-2)">
      {#each topTags as t (t.label)}
        <span class="tag-chip is-mini">{m.recap_tag_count({ label: t.label, count: String(t.count) })}</span>
      {/each}
    </div>
  </div>
{/if}

{#if recap.milestones.length}
  <div class="card wrapped-block">
    <span class="row-title">{m.wrapped_milestones()}</span>
    <div class="wrapped-milestones">
      {#each recap.milestones as ms (ms.id)}
        <div class="wrapped-milestone">
          <Icon name="flag" size={16} />
          <span>{ms.name}</span>
          <span class="muted small">{fmtDay(ms.epochDay, { day: 'numeric', month: 'short' })}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if recap.photoHighlights.length}
  <div class="card wrapped-block">
    <span class="row-title">{m.wrapped_photos()}</span>
    <div class="wrapped-photos">
      {#each recap.photoHighlights as photo (photo.id)}
        <PhotoThumb {photo} size={72} label={fmtDay(photo.epochDay, { day: 'numeric', month: 'short' })} />
      {/each}
    </div>
  </div>
{/if}
