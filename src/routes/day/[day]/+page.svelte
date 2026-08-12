<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let epochDay = $derived(page.params.day === 'today' ? todayEpochDay() : Number(page.params.day));
  let metric = $derived(metricKey(prefs));
  let metricName = $derived(vocabulary.metricName);
  let isToday = $derived(epochDay === todayEpochDay());

  /* Both queries read `epochDay` (and the average also `metric`) before their
     first await, which is what makes them re-run on navigation and on a
     metric change - see liveQuery's contract. */
  let dayEntries = liveQuery(['entry'], (j) => j.entries.entriesForDay(epochDay));
  let entries = $derived(dayEntries.value ?? []);

  // A one-day range: the day average is the same aggregate the stats charts
  // plot, asked for one day (ADR-0012), rather than a second implementation.
  let average = liveQuery(['entry'], (j) => j.stats.dayAverages(metric, epochDay, epochDay));
  let avg = $derived(average.value?.[0]?.value ?? null);
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/calendar" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{isToday ? m.today() : fmtDay(epochDay, { weekday: 'long' })}</h1>
    <div class="header-action"></div>
  </header>
  <p class="editor-date">{fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}</p>

  {#if dayEntries.loading}
    <Skeleton variant="card" count={2} />
  {:else if entries.length}
    <div class="card day-avg">
      <div>
        <!-- The day average arrives in native units (ADR-0012); the /20
             that used to be here undid a x20 that no longer happens. -->
        <span class="chip-value">{avg == null ? '—' : Math.round(avg * 10) / 10}</span>
        <span class="muted small">{m.day_avg({ metric: metricName })}{metric === 'mood' ? ' (1–5)' : ''}</span>
      </div>
      <span class="muted small">{m.entries_this_day({ count: String(entries.length) })}</span>
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
    <EmptyState riveLabel={m.rive_quiet_day()} title={m.nothing_logged()} text={m.nothing_logged_body()} />
  {/if}

  <div style="margin-top:var(--space-6)">
    <button class="btn btn-soft" data-add onclick={() => goto(`/entry/new/${epochDay}`)}>
      <Icon name="plus" size={20} /><span>{m.add_another_entry()}</span>
    </button>
  </div>
</div>
