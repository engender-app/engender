<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import type { CounterevidenceEntry, CounterevidenceSnapshot, DoubtEntry } from '$lib/data/types';
  import { moodName } from '$lib/data/vocabulary/labels';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  // Same limit the stats screen's tag-insight sheet reads a tag's entries
  // with (INSIGHT_ENTRIES, +page.svelte) - counterevidence is that same
  // query, just always on rather than opened from a sheet.
  const COUNTEREVIDENCE_LIMIT = 20;
  const HISTORY_LIMIT = 50;

  let today = $derived(todayEpochDay());
  let text = $state('');

  let counterevidenceQuery = liveQuery(['entry', 'tag'], (j) => j.entries.entriesWithTag('g-euphoria', COUNTEREVIDENCE_LIMIT));
  let counterevidence = $derived(counterevidenceQuery.value ?? []);

  let entriesQuery = liveQuery(['doubtJournal'], (j) => j.doubtJournal.getEntries(HISTORY_LIMIT));
  let pastEntries = $derived(entriesQuery.value ?? []);

  let snapshotsQuery = liveQuery(['doubtJournal'], (j) => j.doubtJournal.getSnapshots(HISTORY_LIMIT));
  let snapshots = $derived(snapshotsQuery.value ?? []);

  async function saveEntry() {
    const trimmed = text.trim();
    if (!trimmed) return;
    await journal.doubtJournal.addEntry({ epochDay: today, text: trimmed });
    text = '';
  }

  async function saveSnapshot() {
    if (counterevidence.length === 0) return;
    const items: CounterevidenceEntry[] = counterevidence.map((e) => ({ epochDay: e.epochDay, mood: e.mood, note: e.note }));
    await journal.doubtJournal.saveSnapshot(today, items);
  }

  let entryDeleteTarget = $state<DoubtEntry | null>(null);
  async function deleteEntry() {
    if (!entryDeleteTarget) return;
    const id = entryDeleteTarget.id;
    entryDeleteTarget = null;
    await journal.doubtJournal.deleteEntry(id);
  }

  let snapshotDeleteTarget = $state<CounterevidenceSnapshot | null>(null);
  async function deleteSnapshot() {
    if (!snapshotDeleteTarget) return;
    const id = snapshotDeleteTarget.id;
    snapshotDeleteTarget = null;
    await journal.doubtJournal.deleteSnapshot(id);
  }

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { weekday: 'short', day: 'numeric', month: 'short' });
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.doubt_title()}</h1>
  </header>

  <div class="card">
    <p class="quicklog-title">{m.doubt_compose_title()}</p>
    <textarea class="input" rows="5" placeholder={m.doubt_compose_placeholder()} bind:value={text}></textarea>
    <button
      class="btn btn-primary btn-block"
      style="margin-top:var(--space-3)"
      disabled={text.trim().length === 0}
      onclick={saveEntry}
    >
      <span>{m.doubt_save_entry()}</span>
    </button>
  </div>

  <SectionTitle text={m.doubt_counterevidence_title()} />
  <p class="muted small" style="margin-bottom:var(--space-3)">{m.doubt_counterevidence_sub()}</p>
  {#if counterevidenceQuery.loading}
    <Skeleton variant="card" count={2} />
  {:else if counterevidence.length}
    {#each counterevidence as e (e.id)}
      <EntryCard entry={e} />
    {/each}
    <button class="btn btn-soft btn-block" style="margin-top:var(--space-3)" onclick={saveSnapshot}>
      <Icon name="heart" size={18} /> <span>{m.doubt_save_snapshot()}</span>
    </button>
  {:else}
    <EmptyState title={m.doubt_no_counterevidence_title()} text={m.doubt_no_counterevidence_body()} />
  {/if}

  {#if pastEntries.length}
    <SectionTitle text={m.doubt_past_entries_title()} />
    <div class="list-group">
      {#each pastEntries as entry (entry.id)}
        <div class="list-row">
          <span class="row-text">
            <span class="row-title">{dayLabel(entry.epochDay)} · {fmtTime(entry.timestamp)}</span>
            <span class="row-subtitle">{entry.text}</span>
          </span>
          <button class="icon-btn" aria-label={m.doubt_entry_delete_sheet()} onclick={() => (entryDeleteTarget = entry)}>
            <Icon name="trash" size={18} />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  {#if snapshots.length}
    <SectionTitle text={m.doubt_snapshots_title()} />
    {#each snapshots as snap (snap.id)}
      <div class="card">
        <div class="spread">
          <span class="row-title">{dayLabel(snap.epochDay)} · {fmtTime(snap.timestamp)}</span>
          <button class="icon-btn" aria-label={m.doubt_snapshot_delete_sheet()} onclick={() => (snapshotDeleteTarget = snap)}>
            <Icon name="trash" size={18} />
          </button>
        </div>
        {#each snap.items as item, i (i)}
          <p class="entry-note" style="margin-top:var(--space-2)">
            {#if item.mood != null}<strong>{moodName(item.mood)}</strong> · {/if}{dayLabel(item.epochDay)}: {item.note}
          </p>
        {/each}
      </div>
    {/each}
  {/if}

  <Sheet open={entryDeleteTarget !== null} title={m.doubt_entry_delete_sheet()} onClose={() => (entryDeleteTarget = null)}>
    {#if entryDeleteTarget}
      <h3>{m.doubt_entry_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.doubt_entry_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-doubt-entry onclick={deleteEntry}><span>{m.doubt_entry_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (entryDeleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet open={snapshotDeleteTarget !== null} title={m.doubt_snapshot_delete_sheet()} onClose={() => (snapshotDeleteTarget = null)}>
    {#if snapshotDeleteTarget}
      <h3>{m.doubt_snapshot_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.doubt_snapshot_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-doubt-snapshot onclick={deleteSnapshot}><span>{m.doubt_snapshot_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (snapshotDeleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
