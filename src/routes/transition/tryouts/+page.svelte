<script lang="ts">
  /* Tryouts, on the surface kit (phase 5 UX ticket 25), rebuilt by phase 10
     redesign ticket 53.

     The row was three controls wearing one row's clothes: a `.list-row`
     div, a bare anchor inside it holding the text with its own inline
     `text-decoration:none;color:inherit`, and a delete button beside it -
     so the tappable area was the words rather than the row. It is the
     kit's split row now, which is the same two controls with the row's own
     padding and press behind the first of them.

     What ticket 53 changed is which records get that row. The screen is
     entirely about tryouts and said nothing about which of them is
     happening now, while Home has had an `active-tryout-tile` since phase
     8 - and the felt-sense readings that answer the second half of this
     screen's own subtitle were reachable from the database and drawn
     nowhere on it. So the screen opens on what is true now (DIRECTION.md
     rule 16): a running tryout is a card with its length and the shape its
     readings make, and the ended ones are the log under it, still rows,
     each gaining how long it ran.

     Appointments is the worked example this follows - the same records
     split by the one fact that changes which of them you want, with a
     heading over each half. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { tryoutKindName } from '$lib/data/vocabulary/labels';
  import { tryoutReading } from '$lib/data/tryoutReading';
  import type { FeltSenseEntry, Tryout } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import TryoutCard from '$lib/components/TryoutCard.svelte';
  import FeltSenseOfferSheet from '$lib/components/FeltSenseOfferSheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade } from '$lib/motion/reveal';
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

  let today = $derived(todayEpochDay());
  let running = $derived(tryouts.filter((t) => t.endEpochDay == null));
  let ended = $derived(tryouts.filter((t) => t.endEpochDay != null));

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  /* An ended tryout's row gains the one fact the two dates only imply:
     how long it ran. The kind and the range stay where they were. */
  const endedSubtitle = (t: Tryout) =>
    `${tryoutKindName(t.kind)} · ${m.tryout_range({ start: dayLabel(t.startEpochDay), end: dayLabel(t.endEpochDay ?? t.startEpochDay) })} · ${m.tryout_ran_days({ n: tryoutReading(t, [], today).dayCount })}`;

  const record = recordEditor<Tryout>({
    remove: (id) => journal.tryouts.deleteTryout(id),
    findById: (id) => tryouts.find((t) => t.id === id)
  });

  /* Recording how a tryout felt today, from its own card. The same sheet
     a milestone's felt-sense offer uses and the same write the detail
     screen makes - what is new here is only that the running card is a
     place to reach it from, which is what the Home tile has always linked
     to the detail screen for. */
  let feelingFor = $state<Tryout | null>(null);
  const FEELING_COPY = {
    title: m.tryout_feeling_today_title,
    confirm: m.tryout_feeling_save,
    decline: m.not_now
  };

  async function saveFeeling(input: { mood: number; note: string | null }) {
    const tryout = feelingFor;
    if (!tryout) return;
    feelingFor = null;
    await journal.feltSense.add({ tryoutId: tryout.id }, { epochDay: today, mood: input.mood, note: input.note });
  }
</script>

<div class="screen">
  <ScreenHeader title={m.tryout_title()} back="/more" subtitle={m.tryout_intro()}>
    {#snippet actions()}
      <a class="icon-btn press" href="/transition/tryouts/new" aria-label={m.tryout_add()}><Icon name="plus" size={22} /></a>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={tryoutsQuery} variant="line" count={3}>
    {#snippet rows()}
      {#if running.length}
        <SectionHeading text={m.tryout_running_heading()} />
        <div class="screen-part" data-running>
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.running)}>
            {#each running as t (t.id)}
              <TryoutCard
                tryout={t}
                entries={feltByTryout.get(t.id) ?? []}
                {today}
                onfeel={() => (feelingFor = t)}
                ondelete={() => record.askToDelete(t)}
              />
            {/each}
          </ListCard>
        </div>
      {/if}
      {#if ended.length}
        <SectionHeading text={m.tryout_ended_heading()} />
        <div class="screen-part" data-ended>
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.ended)}>
            {#each ended as t (t.id)}
              <ListRow
                key={t.id}
                data-tryout={t.id}
                icon="tag"
                title={t.label}
                subtitle={endedSubtitle(t)}
                href="/transition/tryouts/{t.id}"
                action={{ icon: 'trash', label: m.tryout_delete_sheet(), onclick: () => record.askToDelete(t) }}
              />
            {/each}
          </ListCard>
        </div>
      {/if}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="tag"
        key="tryouts-empty"
        role={roleAt(activeFlag.roles, SECTION_ROLE.running)}
        title={m.tryout_none()}
        text={m.tryout_intro()}
        action={{ label: m.tryout_add(), primary: true, href: '/transition/tryouts/new' }}
      />
    {/snippet}
  </ReadGate>

  <FeltSenseOfferSheet
    open={feelingFor !== null}
    copy={FEELING_COPY}
    onSave={saveFeeling}
    onSkip={() => (feelingFor = null)}
  />

  <RecordSheet
    {record}
    handle="tryout"
    confirm={{
      title: m.tryout_delete_sheet(),
      question: () => m.tryout_delete_q(),
      hint: () => m.tryout_delete_hint(),
      confirmLabel: m.tryout_delete(),
      cancelLabel: m.keep_it()
    }}
  />
</div>
