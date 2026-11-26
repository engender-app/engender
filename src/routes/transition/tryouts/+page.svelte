<script lang="ts">
  import { collapse } from '$lib/motion/reveal';
  /* Show the active tryout first with its length and felt-sense
     readings. List ended tryouts below with
     durations. Use split rows so the entry link gets a full target
     beside Delete. */
  import { undoable } from '$lib/stores/deleteUndo';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { currentDay } from '$lib/stores/today.svelte';
  import { tryoutKindName } from '$lib/data/vocabulary/labels';
  import { tryoutReading } from '$lib/data/tryoutReading';
  import type { FeltSenseEntry, Tryout } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import TryoutCard from '$lib/components/TryoutCard.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  /* Two halves of one list, so they take two of the flag's stripes in the
     order they are drawn - the same split Appointments makes. */
  const SECTION_ROLE = { running: 0, ended: 1 };

  let tryoutsQuery = liveList((j) => j.tryouts.getTryouts());
  let tryouts = $derived(tryoutsQuery.rows);

  /* One query for every running tryout's readings rather than one per card
     (feltSense.ts says why). Its own read beside the tryouts rather than
     part of them: a reading written from a card changes this and not the
     list of tryouts. */
  let feltQuery = liveQuery((j) => j.feltSense.byTryout());
  let feltByTryout = $derived(feltQuery.value ?? new Map<string, FeltSenseEntry[]>());

  /* The gate waits for both. Gated on the
     tryouts alone, a running card painted before its readings had
     answered and said "No felt sense recorded yet" about a tryout that
     had some, then swapped in the reading, the arc and the tally without
     a transition. A card says what is true or is not drawn yet; either
     read failing is the screen's failure rather than a card claiming no
     readings. */
  const tryoutsRead: typeof tryoutsQuery = {
    get rows() {
      return tryoutsQuery.rows;
    },
    get loading() {
      return tryoutsQuery.loading || feltQuery.loading;
    },
    get empty() {
      return tryoutsQuery.empty;
    },
    get failed() {
      return tryoutsQuery.failed || feltQuery.failed;
    },
    get stale() {
      return tryoutsQuery.stale || feltQuery.stale;
    },
    retry: () => {
      tryoutsQuery.retry();
      feltQuery.retry();
    }
  };

  let today = $derived(currentDay());
  let running = $derived(tryouts.filter((t) => t.endEpochDay == null));
  let ended = $derived(tryouts.filter((t) => t.endEpochDay != null));

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  /* An ended tryout's row gains the one fact the two dates only imply:
     how long it ran. The kind and the range stay where they were. */
  const endedSubtitle = (t: Tryout) =>
    `${tryoutKindName(t.kind)} · ${m.tryout_range({ start: dayLabel(t.startEpochDay), end: dayLabel(t.endEpochDay ?? t.startEpochDay) })} · ${m.tryout_ran_days({ n: tryoutReading(t, [], today).dayCount })}`;

  const record = recordEditor<Tryout>({
    remove: (id) => undoable((j) => j.tryouts.deleteTryout(id)),
    findById: (id) => tryouts.find((t) => t.id === id)
  });
</script>

<div class="screen">
  <ScreenHeader title={m.tryout_title()} back="/more">
    {#snippet actions()}
      <a class="icon-btn press" href="/transition/tryouts/new" aria-label={m.tryout_add()}><Icon name="plus" size={22} /></a>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={tryoutsRead} variant="line" count={3}>
    {#snippet rows()}
      {#if running.length}
        <SectionHeading text={m.tryout_running_heading()} />
        <div class="screen-part" data-running>
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.running)}>
            {#each running as t (t.id)}
              <div transition:collapse>
                <TryoutCard
                  tryout={t}
                  entries={feltByTryout.get(t.id) ?? []}
                  {today}
                  ondelete={() => record.askToDelete(t)}
                />
              </div>
            {/each}
          </ListCard>
        </div>
      {/if}
      {#if ended.length}
        <SectionHeading text={m.tryout_ended_heading()} />
        <div class="screen-part" data-ended>
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.ended)}>
            {#each ended as t (t.id)}
              <div transition:collapse>
                <ListRow
                  key={t.id}
                  data-tryout={t.id}
                  icon="hanger"
                  title={t.label}
                  subtitle={endedSubtitle(t)}
                  href="/transition/tryouts/{t.id}"
                  action={{ icon: 'trash', label: m.tryout_delete_sheet(), onclick: () => record.askToDelete(t) }}
                />
              </div>
            {/each}
          </ListCard>
        </div>
      {/if}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="hanger"
        key="tryouts-empty"
        role={roleAt(activeFlag.roles, SECTION_ROLE.running)}
        title={m.tryout_none()}
        action={{ label: m.tryout_add(), primary: true, href: '/transition/tryouts/new' }}
      />
    {/snippet}
  </ReadGate>

  <RecordSheet
    {record}
    handle="tryout"
    confirm={{
      title: m.tryout_delete_sheet(),
      question: () => m.tryout_delete_q(),
      hint: () => m.tryout_delete_hint(),
      confirmLabel: m.delete(),
      cancelLabel: m.keep_it()
    }}
  />
</div>
