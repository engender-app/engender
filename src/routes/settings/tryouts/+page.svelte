<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { liveQuery, journal } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import type { Tryout } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  let tryoutsQuery = liveQuery(['tryout'], (j) => j.tryouts.getTryouts());
  let tryouts = $derived(tryoutsQuery.value ?? []);

  const kindLabel = (kind: Tryout['kind']) => (kind === 'name' ? m.tryout_kind_name() : m.tryout_kind_pronouns());
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
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.tryout_title()}</h1>
    <div class="header-action">
      <a class="icon-btn" href="/settings/tryouts/new" aria-label={m.tryout_add()}><Icon name="plus" size={22} /></a>
    </div>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.tryout_intro()}</p>

  {#if tryouts.length === 0}
    <EmptyState title={m.tryout_none()} text={m.tryout_intro()} />
  {:else}
    <div class="list-group">
      {#each tryouts as t (t.id)}
        <div class="list-row">
          <span class="row-icon"><Icon name="tag" size={22} /></span>
          <a class="row-text" href="/settings/tryouts/{t.id}" style="text-decoration:none;color:inherit">
            <span class="row-title">{t.label}</span>
            <span class="row-subtitle">{kindLabel(t.kind)} · {rangeLabel(t)}</span>
          </a>
          <button class="icon-btn" aria-label={m.tryout_delete_sheet()} onclick={() => (deleteTarget = t)}>
            <Icon name="trash" size={18} />
          </button>
        </div>
      {/each}
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
