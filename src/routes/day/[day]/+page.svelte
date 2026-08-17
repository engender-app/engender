<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { smartBack } from '$lib/navigation/smart-back';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  let epochDay = $derived(page.params.day === 'today' ? todayEpochDay() : Number(page.params.day));
  let isToday = $derived(epochDay === todayEpochDay());

  /* The query reads `epochDay` before its first await, which is what makes it
     re-run on navigation - see liveQuery's contract. */
  let dayEntries = liveQuery(['entry'], (j) => j.entries.entriesForDay(epochDay));
  let entries = $derived(dayEntries.value ?? []);
</script>

<div class="screen">
  <header class="screen-header">
    <button class="icon-btn" aria-label={m.back()} onclick={() => smartBack('/calendar')}><Icon name="arrowLeft" /></button>
    <h1 class="screen-title">{isToday ? m.today() : fmtDay(epochDay, { weekday: 'long' })}</h1>
    <div class="header-action"></div>
  </header>
  <p class="editor-date">{fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}</p>

  {#if dayEntries.loading}
    <Skeleton variant="card" count={2} />
  {:else if entries.length}
    <div class="card">
      <span class="muted small">{m.entries_this_day({ count: entries.length })}</span>
    </div>
    <div class="stack-3" style="margin-top:var(--space-4)">
      {#each entries as e (e.id)}
        <div class="day-entry-row">
          <span class="day-entry-time">{fmtTime(e.timestamp)}</span>
          <EntryCard entry={e} showDay={false} />
        </div>
      {/each}
    </div>
  {:else}
    <EmptyState title={m.nothing_logged()} text={m.nothing_logged_body()} />
  {/if}

  <div style="margin-top:var(--space-6)">
    <button class="btn btn-soft" data-add onclick={() => goto(`/entry/new/${epochDay}`)}>
      <Icon name="plus" size={20} /><span>{m.add_another_entry()}</span>
    </button>
  </div>
</div>
