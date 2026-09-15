<script lang="ts">
  /* The counterevidence check (ADR-0037, CONTEXT: "counterevidence pool"
     and "counterevidence snapshot"), lifted out of Safe space by phase 10
     redesign ticket 47.

     The pool is entries the person tagged as euphoria, marked a high
     euphoria body region on, or starred - offered back on a day that says
     none of it happened. A snapshot is a frozen copy of the pool, kept so
     that a good week can be read on a bad one after the pool itself has
     moved on.

     The two are one mechanism and so they are one screen: the control that
     saves a snapshot sits under the pool it saves, and what it produced
     sits under that. Ticket 47 considered sending the snapshots to the
     letters-and-photos screen with the rest of what a person deliberately
     kept, and refused it for this - a save whose result appears somewhere
     else is a save nobody can see happen.

     Purely a read apart from that one save and its delete (ADR-0037,
     src/lib/data/journal/safeSpaceReads.test.ts pins it at the driver):
     opening this screen writes nothing. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { EUPHORIA_TAG_KEYS } from '$lib/data/vocabulary/builtins';
  import { COUNTEREVIDENCE_LIMIT } from '$lib/data/counterevidence';
  import type { CounterevidenceEntry, CounterevidenceSnapshot } from '$lib/data/types';
  import { moodName } from '$lib/data/vocabulary/labels';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';

  const HISTORY_LIMIT = 50;

  let today = $derived(todayEpochDay());

  let counterevidenceQuery = liveList((j) =>
    j.entries.counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT)
  );
  let counterevidence = $derived(counterevidenceQuery.rows);

  let snapshotsQuery = liveList((j) => j.doubtJournal.getSnapshots(HISTORY_LIMIT));
  let snapshots = $derived(snapshotsQuery.rows);

  async function saveSnapshot() {
    if (counterevidence.length === 0) return;
    const items: CounterevidenceEntry[] = counterevidence.map((e) => ({
      epochDay: e.epochDay,
      mood: e.mood,
      note: e.note
    }));
    await journal.doubtJournal.saveSnapshot(today, items);
  }

  let snapshotDeleteTarget = $state<CounterevidenceSnapshot | null>(null);
  async function deleteSnapshot() {
    if (!snapshotDeleteTarget) return;
    const id = snapshotDeleteTarget.id;
    snapshotDeleteTarget = null;
    await journal.doubtJournal.deleteSnapshot(id);
  }

  const dayLabel = (epochDay: number) =>
    fmtDay(epochDay, { weekday: 'short', day: 'numeric', month: 'short' });
</script>

<div class="screen">
  <ScreenHeader
    title={m.safe_space_counterevidence_title()}
    back="/doubt"
    subtitle={m.safe_space_counterevidence_sub()}
    screen="safe-space-evidence"
  />

  <ReadGate read={counterevidenceQuery} variant="card" count={2}>
    {#snippet rows()}
      {#each counterevidence as e (e.id)}
        <EntryCard entry={e} />
      {/each}
      <button type="button" class="btn btn-soft btn-block press" onclick={saveSnapshot}>
        <Icon name="heart" size={18} /> <span>{m.doubt_save_snapshot()}</span>
      </button>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="sparkle"
        key="no-counterevidence"
        title={m.doubt_no_counterevidence_title()}
        text={m.doubt_no_counterevidence_body()}
      />
    {/snippet}
  </ReadGate>

  {#if snapshots.length}
    <SectionHeading text={m.doubt_snapshots_title()} />
    <div class="stack-3">
      {#each snapshots as snap (snap.id)}
        <div class="kit-panel" data-kit-surface {...roleAttrs(roleAt(activeFlag.roles, 3))}>
          <div class="spread">
            <span class="kit-row-title">{dayLabel(snap.epochDay)} · {fmtTime(snap.timestamp)}</span>
            <button
              type="button"
              class="icon-btn"
              aria-label={m.doubt_snapshot_delete_sheet()}
              onclick={() => (snapshotDeleteTarget = snap)}
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
          {#each snap.items as item, i (i)}
            <p class="kit-entry-note">
              {#if item.mood != null}<strong>{moodName(item.mood)}</strong> · {/if}{dayLabel(item.epochDay)}: {item.note}
            </p>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  <ConfirmDeleteSheet
    open={snapshotDeleteTarget !== null}
    title={m.doubt_snapshot_delete_sheet()}
    question={m.doubt_snapshot_delete_q()}
    hint={m.doubt_snapshot_delete_hint()}
    confirmLabel={m.doubt_snapshot_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-doubt-snapshot': '' }}
    onConfirm={deleteSnapshot}
    onCancel={() => (snapshotDeleteTarget = null)}
  />
</div>
