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
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { deleter } from '$lib/stores/attempt.svelte';
  import { fade } from 'svelte/transition';
  import { motionDuration } from '$lib/motion/tokens';

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

  const dayOf = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* Delete forever (functional audit ticket 46). It cannot be undone, so
     the sheet asks first and the screen keeps a result line afterwards,
     focused, rather than a toast that goes away (the repo's rule for an
     action with no way back). Each purge gets its own line key so a second
     one crossfades over the first instead of swapping its words in place. */
  let purgeTarget = $state<{ id: number; epochDay: number } | null>(null);
  let purged = $state<{ key: number; day: string } | null>(null);
  let resultLine = $state<HTMLElement>();
  const purging = deleter();

  async function purge() {
    const target = purgeTarget;
    if (!target) return;
    if (!(await purging.run(() => journal.entries.purgeEntry(target.id)))) return;
    purgeTarget = null;
    purged = { key: (purged?.key ?? 0) + 1, day: dayOf(target.epochDay) };
    focusResult = true;
  }

  /* After the sheet hands focus back, or the launcher (the row's own
     button, now gone) would take it. preventScroll because the line
     arrives at the top, where the person already is. */
  let focusResult = false;
  function sheetClosed() {
    if (!focusResult) return;
    focusResult = false;
    resultLine?.focus({ preventScroll: true });
  }
</script>

<div class="screen">
  <ScreenHeader title={m.trash_title()} back="/settings" />

  {#if purged}
    <div transition:collapse>
      <p class="notice notice-info trash-result" role="status" tabindex="-1" bind:this={resultLine} data-trash-purged>
        {#key purged.key}
          <span transition:fade={{ duration: motionDuration('--dur-med') }}>{m.trash_deleted_forever({ date: purged.day })}</span>
        {/key}
      </p>
    </div>
  {/if}

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
                title={dayOf(entry.epochDay)}
                subtitle={`${entry.note || m.entry()} · ${m.trash_days_left({ days: daysLeft(entry.trashedAt) })}`}
              >
                {#snippet trailing()}
                  <span class="managed-actions">
                    <button
                      class="btn btn-soft"
                      data-restore-entry={entry.id}
                      disabled={restoring.busy}
                      onclick={(event) => restore(entry.id, event.currentTarget)}
                    >
                      <span>{m.trash_restore()}</span>
                    </button>
                    <button
                      class="icon-btn"
                      data-purge-entry={entry.id}
                      aria-label={m.trash_delete_forever_aria({ date: dayOf(entry.epochDay) })}
                      onclick={() => (purgeTarget = { id: entry.id, epochDay: entry.epochDay })}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </span>
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

  <ConfirmDeleteSheet
    open={purgeTarget !== null}
    title={m.trash_delete_forever()}
    question={purgeTarget ? m.trash_delete_forever_q({ date: dayOf(purgeTarget.epochDay) }) : ''}
    hint={m.trash_delete_forever_hint()}
    confirmLabel={m.trash_delete_forever()}
    cancelLabel={m.trash_delete_forever_keep()}
    confirmAttrs={{ 'data-confirm-purge': '' }}
    busy={purging.busy}
    failed={purging.failed}
    onConfirm={purge}
    onClosed={sheetClosed}
    onCancel={() => {
      purgeTarget = null;
      purging.dismiss();
    }}
  />
</div>

<style>
  .trash-result {
    display: grid;
    margin-bottom: var(--space-3);
  }
  /* Both lines stand in one cell while one fades over the other. */
  .trash-result > span {
    grid-area: 1 / 1;
  }
</style>
