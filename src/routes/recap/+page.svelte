<script lang="ts">
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { fmtMonthName } from '$lib/data/dates';
  import { todayEpochDay, previousCalendarMonthRange } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PrideAurora from '$lib/components/PrideAurora.svelte';
  import RiveSlot from '$lib/components/RiveSlot.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let step = $state(0);

  let month = $derived(previousCalendarMonthRange(todayEpochDay()));
  let monthName = $derived(fmtMonthName(month.year, month.month));

  /* Every number below comes from journal.stats (ticket 10) and nothing is
     stored (ADR-0010): a recap is recomputed from entries, tags, milestones
     and dimension values each time it is opened. Twenty lines of this screen
     used to say in TypeScript what stats.ts says in SQL - and disagreed with
     it on the best streak, which was min(current streak, 28) and could count
     days outside the month. */
  let recapQuery = liveQuery(['entry', 'tag', 'milestone', 'dimension'], (j) =>
    j.stats.recap(month.start, month.end)
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

  let steps = $derived([
    { title: m.recap_your({ month: monthName }), body: 'One month, held in your own words.', rive: 'Recap opener: calendar pages turning', confetti: false },
    { title: `${recap?.entryCount ?? 0} entries`, body: recap?.entryCount ? 'You showed up, again and again. Some days were two-entry days — gender moves, and you caught it moving.' : 'A quiet month. Quiet counts too.', rive: null, confetti: false },
    { title: recap?.averageMood ? `Mood: ${recap.averageMood.toFixed(1)} of 5` : 'Mood', body: recap?.averageMood ? 'Averaged across the month. Not a grade — just where you were.' : 'No moods logged this month.', rive: null, confetti: false },
    { title: `Best streak: ${recap?.bestStreak ?? 0} days`, body: 'The longest run of days in a row you wrote something down. Consistency is a kindness to your future self.', rive: null, confetti: false },
    { title: 'Top tags', body: topTags.length ? topTags.map((t) => `${t.label} (${t.n})`).join(' · ') : 'No tags this month.', rive: null, confetti: false },
    { title: recap?.milestones.length ? `${recap.milestones.length} milestone${recap.milestones.length === 1 ? '' : 's'}` : 'Milestones', body: recap?.milestones.length ? recap.milestones.map((mi) => mi.name).join(' · ') : 'No milestones landed this month — some are on their way.', rive: null, confetti: false },
    { title: dimChange ? `${dimChange.name}: ${dimChange.change >= 0 ? '+' : ''}${Math.round(dimChange.change)}` : 'Your scales', body: dimChange ? 'The scale that moved furthest this month, first entry to last. Whichever direction it went, it is yours.' : 'Not enough logged on any one scale this month to show a shift.', rive: null, confetti: false },
    { title: `That was ${monthName}`, body: 'Thank you for keeping your own record. See you tomorrow.', rive: 'Recap finale: celebration in flag colours', confetti: true },
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
