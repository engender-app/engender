<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { TRASH_WINDOW_DAYS } from '$lib/data/journal/entries';
  import { toast } from '$lib/stores/toasts.svelte';
  import { fmtDay } from '$lib/data/dates';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  const DAY_MS = 24 * 60 * 60 * 1000;

  let trashQuery = liveList((j) => j.entries.trashedEntries());

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
  <ScreenHeader title={m.trash_title()} back="/settings" />

  <ReadGate read={trashQuery} variant="line" count={3}>
    {#snippet rows(trashed)}
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
    {/snippet}
    {#snippet empty()}
      <EmptyState title={m.trash_empty_title()} text={m.trash_empty_body()} />
    {/snippet}
    {#snippet failed()}
      <!-- One of the two surfaces that say more than "nothing here" when a
           read fails (phase 5 audit ticket 04). A person on this screen came
           to get something back, and "Trash is empty" would send them away
           believing a deleted entry is gone for good. -->
      <EmptyState title={m.trash_read_failed_title()} text={m.trash_read_failed_body()} />
    {/snippet}
  </ReadGate>
</div>
