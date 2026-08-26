<script lang="ts">
  /* What you are noticing, on the surface kit (phase 5 UX ticket 25).

     One list, so one role and no section heading: a heading above the only
     area of a screen names nothing the screen title has not already said
     (DIRECTION.md 3c is about a screen reading as several named areas).

     The intro line moved above the list from below the header, because it
     was only rendered when there was something to introduce - a first-run
     journal got the empty state and never saw it. It is the notice's own
     text there instead. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { severityName } from '$lib/data/vocabulary/labels';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { toast } from '$lib/stores/toasts.svelte';
  import type { SideEffect } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

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

  /* Ticket 11's second entry point into the appointment prep list: a
     one-tap add, seeded from what is already on screen, rather than a
     detour through that list's own editor. */
  async function addToAppointmentPrep() {
    if (!editor) return;
    await journal.checklists.addToStandaloneChecklist(m.appointment_prep_from_effect_item({ name: editor.name }));
    toast(m.appointment_prep_added_toast());
  }
</script>

<div class="screen">
  <ScreenHeader title={m.side_effects()} back="/more" subtitle={m.side_effects_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.side_effect_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  {#if effectsQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={3} /></div>
  {:else if effects.length}
    <div>
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each [...effects].reverse() as effect (effect.id)}
          <ListRow
            key={effect.id}
            data-side-effect={effect.id}
            icon="zap"
            title={effect.name}
            subtitle={`${fmtDay(effect.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })} · ${severityName(effect.severity)}`}
            chevron={false}
            onclick={() => openEditor(effect)}
          />
        {/each}
      </ListCard>
    </div>
  {:else}
    <div>
      <Notice
        icon="zap"
        key="side-effects-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.side_effect_empty_title()}
        text={m.side_effect_empty_body()}
        action={{ label: m.side_effect_empty_action(), primary: true, onclick: () => openEditor(null) }}
      />
    </div>
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
          <button class="btn btn-soft" data-add-to-appointment-prep onclick={addToAppointmentPrep}><span>{m.appointment_prep_add_button()}</span></button>
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
