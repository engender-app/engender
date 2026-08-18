<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { severityName } from '$lib/data/vocabulary/labels';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { SideEffect } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const SEVERITIES = [1, 2, 3, 4, 5];

  let effectsQuery = liveQuery(['sideEffect'], (j) => j.sideEffects.getSideEffects());
  let effects = $derived(effectsQuery.value ?? []);

  let editor = $state<{ id?: string; date: string; name: string; severity: string } | null>(null);
  let deleteTarget = $state<SideEffect | null>(null);

  function openEditor(effect: SideEffect | null) {
    editor = effect
      ? { id: effect.id, date: dateInputValueFromEpochDay(effect.epochDay), name: effect.name, severity: String(effect.severity) }
      : { date: dateInputValueFromEpochDay(todayEpochDay()), name: '', severity: '3' };
  }

  async function saveEffect() {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) return;

    await journal.sideEffects.upsertSideEffect({
      id: editor.id,
      name,
      severity: Number(editor.severity),
      epochDay: epochDayFromDateInputValue(editor.date) ?? todayEpochDay()
    });
    editor = null;
  }

  function askToDelete() {
    if (!editor?.id) return;
    deleteTarget = effects.find((effect) => effect.id === editor!.id) ?? null;
    if (deleteTarget) editor = null;
  }

  async function deleteEffect() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.sideEffects.deleteSideEffect(id);
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.side_effects()}</h1>
    <div class="header-action">
      <button class="icon-btn" data-add aria-label={m.side_effect_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>

  {#if effectsQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if effects.length}
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.side_effects_intro()}</p>
    <div class="list-group">
      {#each [...effects].reverse() as effect (effect.id)}
        <button
          class="list-row"
          data-side-effect={effect.id}
          aria-label={m.side_effect_row_aria({ name: effect.name, date: fmtDay(effect.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          onclick={() => openEditor(effect)}
        >
          <span class="row-text">
            <span class="row-title">{effect.name}</span>
            <span class="row-subtitle">
              {fmtDay(effect.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })} · {severityName(effect.severity)}
            </span>
          </span>
          <Icon name="pencil" size={18} />
        </button>
      {/each}
    </div>
  {:else}
    <EmptyState title={m.side_effect_empty_title()} text={m.side_effect_empty_body()}>
      {#snippet action()}
        <button class="btn btn-soft" onclick={() => openEditor(null)}><span>{m.side_effect_empty_action()}</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet open={editor !== null} title={editor?.id ? m.side_effect_edit_sheet() : m.side_effect_new_sheet()} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? m.side_effect_edit_sheet() : m.side_effect_new_sheet()}</h3>
      <div class="field">
        <label class="field-label" for="side-effect-name">{m.side_effect_name_label()}</label>
        <input class="input" id="side-effect-name" name="side-effect-name" placeholder={m.side_effect_name_placeholder()} bind:value={editor.name} />
      </div>
      <div class="field">
        <label class="field-label" for="side-effect-date">{m.side_effect_date_label()}</label>
        <input class="input" type="date" id="side-effect-date" name="side-effect-date" bind:value={editor.date} />
      </div>
      <div class="field">
        <span class="field-label">{m.side_effect_severity_label()}</span>
        <Segmented
          name={m.side_effect_severity_label()}
          options={SEVERITIES.map((v) => ({ value: String(v), label: severityName(v) }))}
          value={editor.severity}
          onChange={(v) => (editor!.severity = v)}
        />
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-side-effect onclick={saveEffect}><span>{m.side_effect_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-side-effect onclick={askToDelete}><span>{m.side_effect_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title={m.side_effect_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.side_effect_delete_q({ name: deleteTarget.name })}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.side_effect_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-side-effect onclick={deleteEffect}><span>{m.side_effect_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
