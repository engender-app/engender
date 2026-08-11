<script lang="ts">
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { db } from '$lib/data/db.svelte';
  import { fmtMonthName } from '$lib/data/dates';
  import { todayEpochDay, previousCalendarMonthRange } from '$lib/data/epochDay';
  import { normalize } from '$lib/data/metricScale';
  import Icon from '$lib/components/Icon.svelte';
  import PrideAurora from '$lib/components/PrideAurora.svelte';
  import RiveSlot from '$lib/components/RiveSlot.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let step = $state(0);

  let recap = $derived.by(() => {
    const { start, end, year, month } = previousCalendarMonthRange(todayEpochDay());
    const monthName = fmtMonthName(year, month);
    const entries = db.entries.filter((e) => e.epochDay >= start && e.epochDay <= end);
    const moods = entries.filter((e) => e.mood != null).map((e) => e.mood!);
    const avgMood = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
    const tagCounts: Record<string, number> = {};
    entries.forEach((e) => e.tags.forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => ({ label: vocabulary.tag(id)?.label ?? id, n }));
    const milestonesReached = db.milestones.filter((mi) => mi.epochDay >= start && mi.epochDay <= end);

    // The longest run of consecutive days inside the month, which is not
    // the same question as "the streak ending today" - the old code showed
    // min(current streak, 28) and could report days outside the month.
    const days = [...new Set(entries.map((e) => e.epochDay))].sort((a, b) => a - b);
    let bestStreak = 0;
    let run = 0;
    days.forEach((d, i) => {
      run = i > 0 && d === days[i - 1] + 1 ? run + 1 : 1;
      bestStreak = Math.max(bestStreak, run);
    });

    /* Every active scale, not a hardcoded one, ranked by how far it moved
       through its own range and reported in native units (ADR-0012): a
       20-point move on a 0-100 axis and a 3-point move on a 0-10 one are
       not comparable as numbers. */
    const inOrder = [...entries].sort((a, b) => a.epochDay - b.epochDay || a.timestamp - b.timestamp);
    const dimChange = vocabulary.activeDimensions
      .map((d) => {
        const vals = inOrder.map((e) => e.dims?.[d.key]).filter((v): v is number => v != null);
        if (vals.length < 2) return null;
        const [from, to] = [vals[0], vals[vals.length - 1]];
        const scale = { min: d.min, max: d.max };
        return { name: d.name, change: to - from, span: Math.abs(normalize(to, scale) - normalize(from, scale)) };
      })
      .filter((c) => c != null)
      .sort((a, b) => b.span - a.span)[0];

    return { monthName, entries, avgMood, topTags, milestonesReached, bestStreak, dimChange };
  });

  let steps = $derived([
    { title: m.recap_your({ month: recap.monthName }), body: 'One month, held in your own words.', rive: 'Recap opener: calendar pages turning', confetti: false },
    { title: `${recap.entries.length} entries`, body: recap.entries.length ? 'You showed up, again and again. Some days were two-entry days — gender moves, and you caught it moving.' : 'A quiet month. Quiet counts too.', rive: null, confetti: false },
    { title: recap.avgMood ? `Mood: ${recap.avgMood.toFixed(1)} of 5` : 'Mood', body: recap.avgMood ? 'Averaged across the month. Not a grade — just where you were.' : 'No moods logged this month.', rive: null, confetti: false },
    { title: `Best streak: ${recap.bestStreak} days`, body: 'The longest run of days in a row you wrote something down. Consistency is a kindness to your future self.', rive: null, confetti: false },
    { title: 'Top tags', body: recap.topTags.length ? recap.topTags.map((t) => `${t.label} (${t.n})`).join(' · ') : 'No tags this month.', rive: null, confetti: false },
    { title: recap.milestonesReached.length ? `${recap.milestonesReached.length} milestone${recap.milestonesReached.length === 1 ? '' : 's'}` : 'Milestones', body: recap.milestonesReached.length ? recap.milestonesReached.map((mi) => mi.name).join(' · ') : 'No milestones landed this month — some are on their way.', rive: null, confetti: false },
    { title: recap.dimChange ? `${recap.dimChange.name}: ${recap.dimChange.change >= 0 ? '+' : ''}${Math.round(recap.dimChange.change)}` : 'Your scales', body: recap.dimChange ? 'The scale that moved furthest this month, first entry to last. Whichever direction it went, it is yours.' : 'Not enough logged on any one scale this month to show a shift.', rive: null, confetti: false },
    { title: `That was ${recap.monthName}`, body: 'Thank you for keeping your own record. See you tomorrow.', rive: 'Recap finale: celebration in flag colours', confetti: true },
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
</div>
