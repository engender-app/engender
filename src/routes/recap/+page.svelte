<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { fmtMonthName } from '$lib/data/dates';
  import { todayEpochDay, previousCalendarMonthRange, previousCalendarYearRange } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PrideAurora from '$lib/components/PrideAurora.svelte';
  import RiveSlot from '$lib/components/RiveSlot.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let step = $state(0);

  let period = $derived.by(() => {
    const today = todayEpochDay();
    if (page.url.searchParams.get('period') === 'year') {
      const range = previousCalendarYearRange(today);
      return { ...range, name: String(range.year), kind: 'year' as const };
    }
    const range = previousCalendarMonthRange(today);
    return { ...range, name: fmtMonthName(range.year, range.month), kind: 'month' as const };
  });

  /* Every number below comes from journal.stats (ticket 10) and nothing is
     stored (ADR-0010): a recap is recomputed from entries, tags, milestones
     and dimension values each time it is opened. Twenty lines of this screen
     used to say in TypeScript what stats.ts says in SQL - and disagreed with
     it on the best streak, which was min(current streak, 28) and could count
     days outside the month. */
  let recapQuery = liveQuery(['entry', 'tag', 'milestone', 'dimension'], (j) =>
    j.stats.recap(period.start, period.end)
  );
  let recap = $derived(recapQuery.value);

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
  let isYear = $derived(period.kind === 'year');

  let steps = $derived([
    {
      title: isYear ? m.recap_year_title({ year: period.name }) : m.recap_your({ month: period.name }),
      body: isYear ? m.recap_open_year() : m.recap_open_month(),
      rive: m.rive_recap_open(),
      confetti: false
    },
    {
      title: m.recap_entries_title({ count: recap?.entryCount ?? 0 }),
      body: recap?.entryCount
        ? m.recap_entries_body()
        : isYear
          ? m.recap_entries_quiet_year()
          : m.recap_entries_quiet_month(),
      rive: null,
      confetti: false
    },
    {
      title: recap?.averageMood ? m.recap_mood_title({ value: recap.averageMood.toFixed(1) }) : m.mood(),
      body: recap?.averageMood
        ? isYear
          ? m.recap_mood_body_year()
          : m.recap_mood_body_month()
        : isYear
          ? m.recap_mood_none_year()
          : m.recap_mood_none_month(),
      rive: null,
      confetti: false
    },
    {
      title: m.recap_streak_title({ days: m.n_days({ n: recap?.bestStreak ?? 0 }) }),
      body: m.recap_streak_body(),
      rive: null,
      confetti: false
    },
    {
      title: m.recap_tags_title(),
      body: topTags.length
        ? topTags.map((t) => m.recap_tag_count({ label: t.label, count: String(t.n) })).join(' · ')
        : isYear
          ? m.recap_tags_none_year()
          : m.recap_tags_none_month(),
      rive: null,
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
          : m.recap_ms_none_month(),
      rive: null,
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
          : m.recap_scale_body_month()
        : isYear
          ? m.recap_scale_none_year()
          : m.recap_scale_none_month(),
      rive: null,
      confetti: false
    },
    {
      title: m.recap_end_title({ period: period.name }),
      body: m.recap_end_body(),
      rive: m.rive_recap_finale(),
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

  <!-- Held whole rather than stepping through half-known numbers: every card
       past the first states a figure, and "0 entries" that turns into 31 a
       moment later reads as a wrong answer rather than a pending one. -->
  {#if recapQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else}
    <div class="recap-stage">
      {#if s.rive}
        <RiveSlot label={s.rive} height={150} variant={s.confetti ? 'confetti' : 'bloom'} />
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
