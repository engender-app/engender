<script lang="ts">
  import { focusAfterRemoval } from '$lib/navigation/arrivalFocus';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { TRASH_WINDOW_DAYS } from '$lib/data/journal/entries';
  import { toast } from '$lib/stores/toasts.svelte';
  import { writer } from '$lib/stores/attempt.svelte';
  import { collapse } from '$lib/motion/reveal';
  import { fmtDay } from '$lib/data/dates';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';

  const DAY_MS = 24 * 60 * 60 * 1000;

  let trashQuery = liveList((j) => j.entries.trashedEntries());

  function daysLeft(trashedAt: number): number {
    const elapsedDays = Math.floor((Date.now() - trashedAt) / DAY_MS);
    return Math.max(0, TRASH_WINDOW_DAYS - elapsedDays);
  }

  /* One restore at a time across the list (last-audit UI ticket 46): a
     second tap while one is in flight writes nothing, and a restore that
     fails says so and leaves its row where it was for another try. */
  const restoring = writer();

  async function restore(id: number, control: HTMLElement) {
    const returnFocus = focusAfterRemoval(control, '[data-restore-entry]');
    if (!(await restoring.run(() => journal.entries.restoreEntry(id), m.entry_restore_failed()))) return;
    returnFocus();
    toast(m.trash_restored_toast(), { kind: 'saved' });
  }
</script>

<div class="screen">
  <ScreenHeader title={m.trash_title()} back="/settings" />

  <ReadGate read={trashQuery} variant="line" count={3}>
    {#snippet rows(trashed)}
      <!-- The list closes its own height when the last row is restored and
           the gate swaps it for the empty state, which opens under it;
           without these the list went and the empty state stood at full
           size in one frame. -->
      <div transition:collapse>
        <p class="muted small" style="margin-bottom:var(--space-3)">{m.trash_intro()}</p>
        <ListCard>
          {#each trashed as entry (entry.id)}
            <!-- Wrapped so a restored row gives its height back and the rows
                 under it close up with it (ADR-0078), rather than leaving in
                 the frame its read answers. -->
            <div class="rows-divide" transition:collapse>
              <ListRow
                static
                title={fmtDay(entry.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}
                subtitle={`${entry.note || m.entry()} · ${m.trash_days_left({ days: daysLeft(entry.trashedAt) })}`}
              >
                {#snippet trailing()}
                  <button
                    class="btn btn-soft"
                    data-restore-entry={entry.id}
                    disabled={restoring.busy}
                    onclick={(event) => restore(entry.id, event.currentTarget)}
                  >
                    <span>{m.trash_restore()}</span>
                  </button>
                {/snippet}
              </ListRow>
            </div>
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div transition:collapse>
        <EmptyState title={m.trash_empty_title()} text={m.trash_empty_body()} level={2} />
      </div>
    {/snippet}
    {#snippet failed()}
      <EmptyState title={m.trash_read_failed_title()} text={m.trash_read_failed_body()} level={2} />
    {/snippet}
  </ReadGate>
</div>
