<script lang="ts">
  /* Good moments (ADR-0037, CONTEXT: "counterevidence pool" and
     "counterevidence snapshot"), lifted out of Safe space by phase 10
     redesign ticket 47 and bounded by phase 11 ticket 15.

     The pool is days the person named as good - tagged as euphoria, or
     starred - offered back on a day that says none of it happened. A
     snapshot is a frozen copy of the pool, kept so that a good week can be
     read on a bad one after the pool itself has moved on.

     The two are one mechanism and so they are one screen: the control that
     saves a snapshot sits under the pool it saves, and what it produced
     sits under that. Ticket 47 considered sending the snapshots to the
     letters-and-photos screen with the rest of what a person deliberately
     kept, and refused it for this - a save whose result appears somewhere
     else is a save nobody can see happen.

     **Six, then the rest on request.** Twenty entry cards ran the screen to
     3990px on the demo journal, and the save control sat at the bottom of
     it, so the one thing a person came here to do was twenty cards away.
     Six is what fits above it in a viewport. The rest are not gone and not
     a second screen: "See all" discloses them in place (ADR-0078), and the
     save stays where it was, under the six, because it is the reason the
     bound exists.

     **What the subtitle promises, the query keeps.** The pool's third arm
     used to admit an entry on one positively marked body region alone, so
     the screen could hand back a day the person had tagged as dysphoria
     and written up as miserable. entries.ts narrows that arm; the subtitle
     here is the rule stated in the person's own terms, and the two have to
     move together.

     Purely a read apart from that one save and its delete (ADR-0037,
     src/lib/data/journal/safeSpaceReads.test.ts pins it at the driver):
     opening this screen writes nothing. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { EUPHORIA_TAG_KEYS } from '$lib/data/vocabulary/builtinTemplates';
  import { COUNTEREVIDENCE_LIMIT, previewWholeDays } from '$lib/data/counterevidence';
  import type { CounterevidenceEntry, CounterevidenceSnapshot } from '$lib/data/types';
  import { moodName } from '$lib/data/vocabulary/labels';
  import Icon from '$lib/components/Icon.svelte';
  import EntryDays from '$lib/components/EntryDays.svelte';
  import { entryDayGroups } from '$lib/data/recentEntries';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import { disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';

  const HISTORY_LIMIT = 50;

  let today = $derived(currentDay());

  let counterevidenceQuery = liveList((j) =>
    j.entries.counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT)
  );
  let counterevidence = $derived(counterevidenceQuery.rows);

  /* What the screen opens on, and what waits behind the control. Split here
     rather than in the markup so the walkthrough can count each half.

     Drawn as days of entries, the same drawing Calendar, Search and a day
     give an entry (release audit U9: this screen alone used the older
     card). The split is by whole days (previewWholeDays), so a day the
     pool returns two entries for never gets its date bar twice. */
  let split = $derived(previewWholeDays(entryDayGroups(counterevidence)));
  let shown = $derived(split.shown);
  let held = $derived(split.held);

  /* One visit's answer, not a remembered one. Leaving the screen and coming
     back opens it on six again, which is the whole point of the bound; a
     live re-read while somebody is reading the rest must not take them
     away, so nothing resets this but the screen itself going. */
  let expanded = $state(false);

  let snapshotsQuery = liveList((j) => j.doubtJournal.getSnapshots(HISTORY_LIMIT));
  let snapshots = $derived(snapshotsQuery.rows);

  async function saveSnapshot() {
    if (counterevidence.length === 0) return;
    const items: CounterevidenceEntry[] = counterevidence.map((e) => ({
      epochDay: e.epochDay,
      mood: e.mood,
      note: e.note
    }));
    await journal.doubtJournal.saveSnapshot(todayEpochDay(), items);
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
      <EntryDays groups={shown} />

      <!-- Under the six rather than under all twenty (ticket 15). The
           snapshot it saves is the whole pool either way; where the control
           sits is about whether a person on their worst day can reach it
           without scrolling, and that is the only thing the bound is for. -->
      <button type="button" class="btn btn-soft btn-block press" onclick={saveSnapshot}>
        <Icon name="heart" size={18} /> <span>{m.doubt_save_snapshot()}</span>
      </button>

      {#if held.length > 0 && !expanded}
        <!-- Collapses out as the rest arrive rather than vanishing under
             them: the control is the thing that moved (ADR-0078), so it
             travels instead of cutting. -->
        <div out:disclose>
          <button
            type="button"
            class="btn btn-soft btn-block press"
            data-evidence-see-all
            onclick={() => (expanded = true)}
          >
            <span>{m.safe_space_evidence_see_all({ count: counterevidence.length })}</span>
          </button>
        </div>
      {/if}

      {#if expanded}
        <div data-evidence-rest>
          <EntryDays groups={held} arrive />
        </div>
      {/if}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="sparkle"
        key="no-counterevidence"
        title={m.doubt_no_counterevidence_title()}
        text={m.doubt_no_counterevidence_body()}
        action={{ label: m.safe_space_browse_entries(), href: "/calendar", primary: true }}
      />
      <a class="btn btn-soft btn-block" href="/doubt/comfort">{m.comfort_list_title()}</a>
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

