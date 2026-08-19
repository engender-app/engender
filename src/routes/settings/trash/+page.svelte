<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { TRASH_WINDOW_DAYS } from '$lib/data/journal/entries';
  import { toast } from '$lib/stores/toasts.svelte';
  import { fmtDay } from '$lib/data/dates';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const DAY_MS = 24 * 60 * 60 * 1000;

  let trashQuery = liveQuery(['entry'], (j) => j.entries.trashedEntries());
  let trashed = $derived(trashQuery.value ?? []);

  function daysLeft(trashedAt: number): number {
    const elapsedDays = Math.floor((Date.now() - trashedAt) / DAY_MS);
    return Math.max(0, TRASH_WINDOW_DAYS - elapsedDays);
  }

  async function restore(id: number) {
    await journal.entries.restoreEntry(id);
    toast(m.trash_restored_toast(), { kind: 'saved' });
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.trash_title()}</h1>
    <div class="header-action"></div>
  </header>

  {#if trashQuery.loading}
    <Skeleton variant="line" count={3} />
  {:else if trashed.length}
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.trash_intro()}</p>
    <div class="list-group">
      {#each trashed as entry (entry.id)}
        <div class="list-row">
          <span class="row-text">
            <span class="row-title">{fmtDay(entry.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span class="row-subtitle">
              {entry.note || m.entry()} · {m.trash_days_left({ days: daysLeft(entry.trashedAt) })}
            </span>
          </span>
          <button class="btn btn-soft" data-restore-entry={entry.id} onclick={() => restore(entry.id)}>
            <span>{m.trash_restore()}</span>
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <EmptyState title={m.trash_empty_title()} text={m.trash_empty_body()} />
  {/if}
</div>
