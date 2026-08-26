<script lang="ts">
  /* Tryouts, on the surface kit (phase 5 UX ticket 25).

     The row was three controls wearing one row's clothes: a `.list-row`
     div, a bare anchor inside it holding the text with its own inline
     `text-decoration:none;color:inherit`, and a delete button beside it -
     so the tappable area was the words rather than the row. It is the
     kit's split row now, which is the same two controls with the row's own
     padding and press behind the first of them. */
  import { m } from '$lib/paraglide/messages';
  import { liveQuery, journal } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { tryoutKindName } from '$lib/data/vocabulary/labels';
  import type { Tryout } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let tryoutsQuery = liveQuery(['tryout'], (j) => j.tryouts.getTryouts());
  let tryouts = $derived(tryoutsQuery.value ?? []);

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });
  const rangeLabel = (t: Tryout) =>
    t.endEpochDay == null
      ? m.tryout_since({ start: dayLabel(t.startEpochDay) })
      : m.tryout_range({ start: dayLabel(t.startEpochDay), end: dayLabel(t.endEpochDay) });

  let deleteTarget = $state<Tryout | null>(null);
  async function deleteTryout() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.tryouts.deleteTryout(id);
  }
</script>

<div class="screen">
  <ScreenHeader title={m.tryout_title()} back="/more" subtitle={m.tryout_intro()}>
    {#snippet actions()}
      <a class="icon-btn press" href="/settings/tryouts/new" aria-label={m.tryout_add()}><Icon name="plus" size={22} /></a>
    {/snippet}
  </ScreenHeader>

  {#if tryoutsQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={3} /></div>
  {:else if tryouts.length}
    <div>
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each tryouts as t (t.id)}
          <ListRow
            key={t.id}
            data-tryout={t.id}
            icon="tag"
            title={t.label}
            subtitle={`${tryoutKindName(t.kind)} · ${rangeLabel(t)}`}
            href="/settings/tryouts/{t.id}"
            action={{ icon: 'trash', label: m.tryout_delete_sheet(), onclick: () => (deleteTarget = t) }}
          />
        {/each}
      </ListCard>
    </div>
  {:else}
    <div>
      <Notice
        icon="tag"
        key="tryouts-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.tryout_none()}
        text={m.tryout_intro()}
        action={{ label: m.tryout_add(), primary: true, href: '/settings/tryouts/new' }}
      />
    </div>
  {/if}

  <Sheet open={deleteTarget !== null} title={m.tryout_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.tryout_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.tryout_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-tryout onclick={deleteTryout}><span>{m.tryout_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
