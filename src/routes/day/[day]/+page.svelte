<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { db } from '$lib/data/db.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { entriesForDay, dayMetricValue } from '$lib/data/repositories/entries';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  let epochDay = $derived(page.params.day === 'today' ? todayEpochDay() : Number(page.params.day));
  let entries = $derived(entriesForDay(epochDay));
  let metric = $derived(metricKey(prefs));
  let metricName = $derived(
    metric === 'mood' ? m.mood() : (db.dimensions.find((d) => d.key === metric)?.name ?? m.mood())
  );
  let avg = $derived(dayMetricValue(epochDay, metric));
  let isToday = $derived(epochDay === todayEpochDay());
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/calendar" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{isToday ? m.today() : fmtDay(epochDay, { weekday: 'long' })}</h1>
    <div class="header-action"></div>
  </header>
  <p class="editor-date">{fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}</p>

  {#if entries.length}
    <div class="card day-avg">
      <div>
        <span class="chip-value">{avg == null ? '—' : Math.round((metric === 'mood' ? avg / 20 : avg) * 10) / 10}</span>
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
    <EmptyState riveLabel="Quiet day illustration" title={m.nothing_logged()} text={m.nothing_logged_body()} />
  {/if}

  <div style="margin-top:var(--space-6)">
    <button class="btn btn-soft" data-add onclick={() => goto(`/entry/new/${epochDay}`)}>
      <Icon name="plus" size={20} /><span>{m.add_another_entry()}</span>
    </button>
  </div>
</div>
