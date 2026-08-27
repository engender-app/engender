<script lang="ts">
  /* Tryouts, on the surface kit (phase 5 UX ticket 25).

     The row was three controls wearing one row's clothes: a `.list-row`
     div, a bare anchor inside it holding the text with its own inline
     `text-decoration:none;color:inherit`, and a delete button beside it -
     so the tappable area was the words rather than the row. It is the
     kit's split row now, which is the same two controls with the row's own
     padding and press behind the first of them. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { tryoutKindName } from '$lib/data/vocabulary/labels';
  import type { Tryout } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  let tryoutsQuery = liveList((j) => j.tryouts.getTryouts());
  let tryouts = $derived(tryoutsQuery.rows);

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });
  const rangeLabel = (t: Tryout) =>
    t.endEpochDay == null
      ? m.tryout_since({ start: dayLabel(t.startEpochDay) })
      : m.tryout_range({ start: dayLabel(t.startEpochDay), end: dayLabel(t.endEpochDay) });

  const record = recordEditor<Tryout>({
    remove: (id) => journal.tryouts.deleteTryout(id),
    findById: (id) => tryouts.find((t) => t.id === id)
  });
</script>

<div class="screen">
  <ScreenHeader title={m.tryout_title()} back="/more" subtitle={m.tryout_intro()}>
    {#snippet actions()}
      <a class="icon-btn press" href="/settings/tryouts/new" aria-label={m.tryout_add()}><Icon name="plus" size={22} /></a>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={tryoutsQuery} variant="line" count={3}>
    {#snippet rows()}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each tryouts as t (t.id)}
            <ListRow
              key={t.id}
              data-tryout={t.id}
              icon="tag"
              title={t.label}
              subtitle={`${tryoutKindName(t.kind)} · ${rangeLabel(t)}`}
              href="/settings/tryouts/{t.id}"
              action={{ icon: 'trash', label: m.tryout_delete_sheet(), onclick: () => record.askToDelete(t) }}
            />
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="tag"
          key="tryouts-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.tryout_none()}
          text={m.tryout_intro()}
          action={{ label: m.tryout_add(), primary: true, href: '/settings/tryouts/new' }}
        />
      </div>
    {/snippet}
  </ReadGate>

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
