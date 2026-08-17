<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtMonthName } from '$lib/data/dates';
  import {
    customInclusiveRange,
    dateInputValueFromEpochDay,
    epochDayFromDateInputValue,
    ongoingWindowRange,
    previousCalendarMonthRange,
    previousCalendarYearRange,
    todayEpochDay,
    yearToDateRange
  } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PrideAurora from '$lib/components/PrideAurora.svelte';
  import RiveSlot from '$lib/components/RiveSlot.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { DayAverage } from '$lib/data/journal/stats';

  type RecapChoice = 'month' | 'year' | 'd7' | 'd30' | 'd90' | 'ytd' | 'custom';
  type RecapKind = 'month' | 'year' | 'ongoing' | 'custom';

  interface RecapPeriod {
    start: number;
    end: number;
    name: string;
    kind: RecapKind;
  }

  const PERIODS: { key: RecapChoice; label: () => string }[] = [
    { key: 'month', label: () => m.recap_period_previous_month() },
    { key: 'year', label: () => m.recap_period_previous_year() },
    { key: 'd7', label: () => m.recap_period_7d() },
    { key: 'd30', label: () => m.recap_period_30d() },
    { key: 'd90', label: () => m.recap_period_90d() },
    { key: 'ytd', label: () => m.recap_period_ytd() },
    { key: 'custom', label: () => m.recap_period_custom() }
  ];

  let step = $state(0);

  let today = $derived(todayEpochDay());
  let todayInput = $derived(dateInputValueFromEpochDay(today));
  let urlPeriod = $derived(page.url.searchParams.get('period'));

  let choice = $state<RecapChoice>('month');
  let customStart = $state('');
  let customEnd = $state('');

  $effect(() => {
    choice = urlPeriod === 'year' ? 'year' : 'month';
    customStart = '';
    customEnd = '';
    step = 0;
  });

  let period = $derived.by((): RecapPeriod | null => {
    if (choice === 'year') {
      const range = previousCalendarYearRange(today);
      return { ...range, name: String(range.year), kind: 'year' };
    }
    if (choice === 'month') {
      const range = previousCalendarMonthRange(today);
      return { ...range, name: fmtMonthName(range.year, range.month), kind: 'month' };
    }
    if (choice === 'd7') {
      const range = ongoingWindowRange(today, 7);
      return { ...range, name: m.recap_period_7d(), kind: 'ongoing' };
    }
    if (choice === 'd30') {
      const range = ongoingWindowRange(today, 30);
      return { ...range, name: m.recap_period_30d(), kind: 'ongoing' };
    }
    if (choice === 'd90') {
      const range = ongoingWindowRange(today, 90);
      return { ...range, name: m.recap_period_90d(), kind: 'ongoing' };
    }
    if (choice === 'ytd') {
      const range = yearToDateRange(today);
      return { ...range, name: m.recap_period_ytd(), kind: 'ongoing' };
    }
    const custom = customInclusiveRange(epochDayFromDateInputValue(customStart), epochDayFromDateInputValue(customEnd));
    if (!custom || custom.end > today) return null;
    return {
      ...custom,
      name: `${fmtDay(custom.start, { day: 'numeric', month: 'short' })} to ${fmtDay(custom.end, {
        day: 'numeric',
        month: 'short'
      })}`,
      kind: 'custom'
    };
  });

  let periodKey = $derived(period ? `${period.kind}:${period.start}:${period.end}` : 'none');
  $effect(() => {
    periodKey;
    step = 0;
  });

  /* Every number below comes from journal.stats (ticket 10) and nothing is
     stored (ADR-0010): a recap is recomputed from entries, tags, milestones
     and dimension values each time it is opened. Twenty lines of this screen
     used to say in TypeScript what stats.ts says in SQL - and disagreed with
     it on the best streak, which was min(current streak, 28) and could count
     days outside the month. */
  let recapQuery = liveQuery(['entry', 'tag', 'milestone', 'dimension'], (j) =>
    period ? j.stats.recap(period.start, period.end) : Promise.resolve(null)
  );
  let recap = $derived(recapQuery.value);

  let moodTrendQuery = liveQuery(['entry'], (j) =>
    period ? j.stats.dayAverages('mood', period.start, period.end) : Promise.resolve([])
  );
  let moodTrend = $derived((moodTrendQuery.value ?? []) as DayAverage[]);

  let moodChange = $derived.by(() => {
    if (moodTrend.length < 2) return null;
    const from = moodTrend[0].value;
    const to = moodTrend[moodTrend.length - 1].value;
    return { from, to, change: to - from };
  });

  /* The dimension that moved furthest, named. The pick is the journal's,
     ranked by how far the value moved through its own range - a 20-point move
     on a 0-100 scale and a 3-point move on a 0-10 one are not comparable as
     numbers - and the change is reported in native units (ADR-0012). The
     wording on screen says "scale", which is what the interface calls a
     gender dimension. */
  let dimChange = $derived.by(() => {
    const change = recap?.biggestDimensionChange;
    if (!change) return null;
    return { name: vocabulary.dimensions.find((d) => d.key === change.key)?.name ?? change.key, change: change.change };
  });
  let topTags = $derived(
    (recap?.topTags ?? []).map((t) => ({ label: vocabulary.tag(t.id)?.label ?? t.id, n: t.count }))
  );

  /* A month and a year are separate messages rather than one sentence with
     the period injected: Polish inflects the noun, and "this {month}" would
     need a case the English never asks for (docs/ui-copy.md). */
  let isYear = $derived(period?.kind === 'year');
  let isMonth = $derived(period?.kind === 'month');
  let steps = $derived([
    {
      title: isYear
        ? m.recap_year_title({ year: period?.name ?? '' })
        : isMonth
          ? m.recap_your({ month: period?.name ?? '' })
          : m.recap_range_title({ period: period?.name ?? '' }),
      body: isYear ? m.recap_open_year() : isMonth ? m.recap_open_month() : m.recap_open_range(),
      rive: true,
      confetti: false
    },
    {
      title: m.recap_entries_title({ count: recap?.entryCount ?? 0 }),
      body: recap?.entryCount
        ? m.recap_entries_body()
        : isYear
          ? m.recap_entries_quiet_year()
          : isMonth
            ? m.recap_entries_quiet_month()
            : m.recap_entries_quiet_range(),
      rive: false,
      confetti: false
    },
    {
      title: recap?.averageMood ? m.recap_mood_title({ value: recap.averageMood.toFixed(1) }) : m.mood(),
      body: recap?.averageMood
        ? isYear
          ? m.recap_mood_body_year()
          : isMonth
            ? m.recap_mood_body_month()
            : m.recap_mood_body_range()
        : isYear
          ? m.recap_mood_none_year()
          : isMonth
            ? m.recap_mood_none_month()
            : m.recap_mood_none_range(),
      rive: false,
      confetti: false
    },
    {
      title: m.recap_streak_title({ days: m.n_days({ n: recap?.bestStreak ?? 0 }) }),
      body: m.recap_streak_body(),
      rive: false,
      confetti: false
    },
    {
      title: m.recap_tags_title(),
      body: topTags.length
        ? topTags.map((t) => m.recap_tag_count({ label: t.label, count: String(t.n) })).join(' · ')
        : isYear
          ? m.recap_tags_none_year()
          : isMonth
            ? m.recap_tags_none_month()
            : m.recap_tags_none_range(),
      rive: false,
      confetti: false
    },
    {
      title: recap?.milestones.length
        ? m.recap_ms_title({ count: recap.milestones.length })
        : m.milestones(),
      body: recap?.milestones.length
        ? recap.milestones.map((mi) => mi.name).join(' · ')
        : isYear
          ? m.recap_ms_none_year()
          : isMonth
            ? m.recap_ms_none_month()
            : m.recap_ms_none_range(),
      rive: false,
      confetti: false
    },
    {
      title: dimChange
        ? m.recap_scale_title({
            name: dimChange.name,
            change: `${dimChange.change >= 0 ? '+' : ''}${Math.round(dimChange.change)}`
          })
        : m.recap_scales_title(),
      body: dimChange
        ? isYear
          ? m.recap_scale_body_year()
          : isMonth
            ? m.recap_scale_body_month()
            : m.recap_scale_body_range()
        : isYear
          ? m.recap_scale_none_year()
          : isMonth
            ? m.recap_scale_none_month()
            : m.recap_scale_none_range(),
      rive: false,
      confetti: false
    },
    {
      title: m.recap_end_title({ period: period?.name ?? '' }),
      body: m.recap_end_body(),
      rive: true,
      confetti: true
    },
  ]);

  let s = $derived(steps[Math.min(step, steps.length - 1)]);
</script>

<div class="screen">
  <PrideAurora />
  <header class="screen-header">
    <a class="icon-btn" href="/stats" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.recap()}</h1>
    <div class="header-action"></div>
  </header>

  <div class="segmented recap-periods" role="radiogroup" aria-label={m.recap_period_group()}>
    {#each PERIODS as p (p.key)}
      <button
        class="segment"
        class:is-active={choice === p.key}
        role="radio"
        aria-checked={choice === p.key}
        onclick={() => (choice = p.key)}>{p.label()}</button
      >
    {/each}
  </div>

  {#if choice === 'custom'}
    <div class="card recap-custom-picker">
      <div class="recap-custom-grid">
        <label for="recap-custom-start">{m.recap_custom_start_label()}</label>
        <input
          class="input"
          id="recap-custom-start"
          type="date"
          bind:value={customStart}
          max={todayInput}
          aria-label={m.recap_custom_start_label()}
        />
        <label for="recap-custom-end">{m.recap_custom_end_label()}</label>
        <input
          class="input"
          id="recap-custom-end"
          type="date"
          bind:value={customEnd}
          min={customStart || undefined}
          max={todayInput}
          aria-label={m.recap_custom_end_label()}
        />
      </div>
      {#if period === null}
        <p class="muted small" style="margin-top:var(--space-2)">{m.recap_custom_range_required()}</p>
      {/if}
    </div>
  {/if}

  {#if period}
    <div class="card" style="margin-bottom:var(--space-3)">
      <div class="spread" style="margin-bottom:var(--space-2)">
        <span class="row-title">{m.recap_trend_title()}</span>
        <span class="small muted">{period.name}</span>
      </div>
      <LineChart points={moodTrend} min={1} max={5} />
    </div>

    <div class="card" style="margin-bottom:var(--space-3)">
      <span class="row-title">{m.recap_change_summary_title()}</span>
      <p class="row-subtitle" style="margin-top:var(--space-1)">
        {#if moodChange}
          {m.recap_change_summary_body({
            from: moodChange.from.toFixed(1),
            to: moodChange.to.toFixed(1),
            change: `${moodChange.change >= 0 ? '+' : ''}${moodChange.change.toFixed(1)}`
          })}
        {:else}
          {m.recap_change_summary_not_enough()}
        {/if}
      </p>
    </div>
  {/if}

  <!-- Held whole rather than stepping through half-known numbers: every card
       past the first states a figure, and "0 entries" that turns into 31 a
       moment later reads as a wrong answer rather than a pending one. -->
  {#if period === null}
    <!-- The custom range requires both boundaries. -->
  {:else if recapQuery.loading || moodTrendQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else}
    <div class="recap-stage" aria-live="polite">
      {#if s.rive}
        <RiveSlot height={150} variant={s.confetti ? 'confetti' : 'bloom'} />
      {/if}
      <h2 class="recap-title">{s.title}</h2>
      <p class="recap-body">{s.body}</p>
      <div class="recap-progress">
        {#each steps as _, i (i)}<span class="ob-dot" class:is-done={i <= step}></span>{/each}
      </div>
      <div class="ob-actions">
        {#if step < steps.length - 1}
          <button class="btn btn-primary" data-next onclick={() => step++}><span>{m.next()}</span></button>
          {#if step > 0}
            <button class="btn btn-ghost" onclick={() => step--}><span>{m.back()}</span></button>
          {/if}
        {:else}
          <button
            class="btn btn-primary"
            onclick={() => {
              step = 0;
              goto('/stats');
            }}><span>{m.done()}</span></button
          >
        {/if}
      </div>
    </div>
  {/if}
</div>
