<script lang="ts">
  /* Name and document changes, per institution (functional audit ticket
     35). After the ruling every office is updated on its own, so each one
     is a row that says where it stands - not started, submitted on a day,
     waiting since a day, done on a day - and opens a sheet holding its
     dated changes, the paper filed against it, and a form to record the
     next change.

     The rows are ListRow rather than the hand-rolled tick rows above them:
     an institution is not ticked in place, since a change needs a day,
     so the whole row opens the sheet and the line under the name is the
     reading. `fadeSwap` crossfades that line when a change lands and
     travels the row's height with it.

     The page owns the reads, so its reserve waits for these rows too and
     nothing arrives after the screen has been revealed. All of it sits
     behind the "Polish legal steps" switch with the court steps. */
  import { journalTextAutocomplete } from '$lib/platform';
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValue, epochDayFromLocalDate } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { deleter, rowWriter, writer } from '$lib/stores/attempt.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import {
    INSTITUTIONS_REVIEWED_ON,
    institutionList,
    institutionState,
    institutionsLeft,
    isBuiltInInstitution
  } from '$lib/data/roadmap';
  import { INSTITUTION_STATUSES } from '$lib/data/rowValues';
  import {
    institutionStateLine,
    institutionStatusWord,
    roadmapInstitutionName,
    roadmapInstitutionNote
  } from '$lib/data/vocabulary/roadmapLabels';
  import type { InstitutionChange, RoadmapInstitution } from '$lib/data/types';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import LinkedDocuments from '$lib/components/LinkedDocuments.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ChoiceChips from '$lib/components/kit/ChoiceChips.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import FieldGroupHeading from '$lib/components/kit/FieldGroupHeading.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { collapse, disclose, resize } from '$lib/motion/reveal';
  import { crossfadeDuration, fadeOnly, motionDuration } from '$lib/motion/tokens';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let {
    shown,
    own,
    changes,
    hiddenGoals,
    packKey,
    part,
    onOpen
  }: {
    /** The list sits inside the court steps' section so the switch moves
        one block; the institution's sheet is mounted beside the screen so a
        document's link can open it whatever the switch says. Two
        instances, one per part, and the list's rows ask the sheet's
        instance to open through `onOpen`. */
    part: 'list' | 'sheet';
    onOpen?: (id: string) => void;
    shown: boolean;
    own: readonly RoadmapInstitution[];
    changes: readonly InstitutionChange[];
    hiddenGoals: readonly string[];
    packKey: string;
  } = $props();

  const today = $derived(currentDay());
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
  const fadeCount = (_node: Element) => fadeOnly(Math.max(motionDuration('--dur-fast'), crossfadeDuration()));

  let list = $derived(institutionList(shown, own, hiddenGoals));
  let left = $derived(institutionsLeft(list, changes));
  let changesOf = $derived.by(() => {
    const by = new Map<string, InstitutionChange[]>();
    for (const change of changes) by.set(change.institution, [...(by.get(change.institution) ?? []), change]);
    return by;
  });
  const stateOf = (id: string) => institutionState(changesOf.get(id) ?? []);

  /* The reviewed-on day, said under the list like the court steps' own. */
  const [year, month, day] = INSTITUTIONS_REVIEWED_ON.split('-').map(Number);
  const reviewedLabel = fmtDay(epochDayFromLocalDate(new Date(year, month - 1, day)), {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  /* Identity only, like the goal sheet: everything shown in it is read
     live, so a change recorded inside it moves the sheet with it. */
  let selectedId = $state<string | null>(null);
  let selectedBuiltIn = $derived(selectedId !== null && isBuiltInInstitution(selectedId) ? selectedId : null);
  let selectedOwn = $derived(own.find((one) => one.id === selectedId) ?? null);
  let selectedName = $derived(
    selectedBuiltIn ? roadmapInstitutionName(selectedBuiltIn) : (selectedOwn?.name ?? '')
  );
  let selectedChanges = $derived(selectedId ? [...(changesOf.get(selectedId) ?? [])].reverse() : []);
  let selectedHidden = $derived(selectedBuiltIn !== null && hiddenGoals.includes(selectedBuiltIn));

  /* The form opens on the step after where the institution stands, since
     that is what somebody coming back to record usually has to say. */
  const nextStatus = (status: string | null): string =>
    status === null ? 'submitted' : status === 'submitted' ? 'waiting' : 'done';
  let draftStatus = $state('submitted');
  let draftDay = $state('');
  let draftNote = $state('');
  let nameDraft = $state('');

  /** Opens one institution's sheet: from its row, from the hidden list,
      or from a document's link (`?goal=`). */
  export function open(id: string) {
    selectedId = id;
    draftStatus = nextStatus(stateOf(id).status);
    draftDay = dateInputValueFromEpochDay(today);
    draftNote = '';
    nameDraft = own.find((one) => one.id === id)?.name ?? '';
  }

  const close = () => (selectedId = null);

  const statusOptions = INSTITUTION_STATUSES.map((value) => ({ value, label: institutionStatusWord(value) }));

  const recordWrite = writer();
  async function record() {
    const id = selectedId;
    if (id === null) return;
    const epochDay = epochDayFromDateInputValue(draftDay) ?? today;
    const input = { institution: id, status: draftStatus, epochDay, note: draftNote.trim() || null };
    if (!(await recordWrite.run(() => journal.roadmap.addInstitutionChange(input), m.write_failed()))) return;
    draftStatus = nextStatus(draftStatus);
    draftNote = '';
    toast(m.saved(), { kind: 'record-saved' });
  }

  const changeDelete = rowWriter();
  const deleteChange = (change: InstitutionChange) =>
    changeDelete(change.id, () => journal.roadmap.deleteInstitutionChange(change.id), m.write_failed());

  const visibilityWrite = writer();
  async function toggleHidden() {
    if (selectedBuiltIn === null) return;
    const key = selectedBuiltIn;
    if (await visibilityWrite.run(() => journal.roadmap.setGoalHidden(packKey, key, !selectedHidden), m.write_failed())) close();
  }

  let canSaveName = $derived(selectedOwn !== null && nameDraft.trim() !== '' && nameDraft.trim() !== selectedOwn.name);
  const nameWrite = writer();
  async function saveName() {
    if (!canSaveName) return;
    const id = selectedOwn!.id;
    const name = nameDraft.trim();
    if (await nameWrite.run(() => journal.roadmap.renameInstitution(id, name), m.write_failed())) {
      toast(m.saved(), { kind: 'record-saved' });
    }
  }

  let confirmingDelete = $state(false);
  const removing = deleter();
  async function remove() {
    const id = selectedOwn?.id;
    if (!id) return;
    if (!(await removing.run(() => journal.roadmap.deleteInstitution(id)))) return;
    confirmingDelete = false;
    close();
    toast(m.record_deleted(), { kind: 'record-deleted' });
  }

  let adding = $state(false);
  let newName = $state('');
  const addWrite = writer();
  async function add() {
    const name = newName.trim();
    if (!name) return;
    if (!(await addWrite.run(() => journal.roadmap.addInstitution(name), m.write_failed()))) return;
    adding = false;
    toast(m.saved(), { kind: 'record-saved' });
  }
</script>

<!-- Where an institution stands, as a disc: three glyphs stacked and crossed
     on opacity and scale, the way the court steps' box crosses its tick, so
     a change never swaps a glyph in one frame. -->
{#snippet stateDisc(status: string | null)}
  <span class="inst-disc" class:inst-done={status === 'done'} class:inst-open={status !== null && status !== 'done'} aria-hidden="true">
    <span class="inst-glyph" class:inst-glyph-shown={status === 'submitted'}><Icon name="upload" size={16} /></span>
    <span class="inst-glyph" class:inst-glyph-shown={status !== null && status !== 'submitted' && status !== 'done'}><Icon name="clock" size={16} /></span>
    <span class="inst-glyph" class:inst-glyph-shown={status === 'done'}><Icon name="check" size={18} /></span>
  </span>
{/snippet}

<!-- Each row in a wrapper of its own inside the each block, so the
     disclosure belongs to the block that adds and removes it (a transition
     inside a snippet is not that block's). -->
{#snippet row(id: string, name: string)}
  {@const state = stateOf(id)}
    <ListRow
      key={`institution-${id}`}
      data-institution={id}
      data-institution-status={state.status ?? 'none'}
      title={name}
      subtitle={institutionStateLine(state, dayLabel)}
      fadeSwap
      onclick={() => onOpen?.(id)}
    >
      {#snippet leading()}{@render stateDisc(state.status)}{/snippet}
    </ListRow>
{/snippet}

{#if part === 'list' && shown}
  <section class="roadmap-group inst-group" data-roadmap-institutions transition:disclose>
    <SectionHeading text={m.roadmap_institutions_title()}>
      {#snippet action()}
        <span class="inst-left" data-institutions-left>
          {#key left}
            <span transition:fadeCount>{m.roadmap_institutions_left({ n: left })}</span>
          {/key}
        </span>
      {/snippet}
    </SectionHeading>
    <ListCard role={roleAt(activeFlag.roles, 1)}>
      {#each list.builtIns as one (one.key)}
        <div class="rows-divide" transition:disclose>{@render row(one.key, roadmapInstitutionName(one.key))}</div>
      {/each}
      {#each list.own as one (one.id)}
        <div class="rows-divide" transition:disclose>{@render row(one.id, one.name)}</div>
      {/each}
      <button class="kit-row" data-add-institution onclick={() => { adding = true; newName = ''; }}>
        <span class="inst-disc inst-add" aria-hidden="true"><Icon name="plus" size={18} /></span>
        <span class="kit-row-text"><span class="kit-row-title muted">{m.roadmap_institution_new()}</span></span>
      </button>
    </ListCard>
    <p class="inst-reviewed muted small" data-institutions-reviewed>
      {m.roadmap_reviewed_on({ date: reviewedLabel })}
    </p>
  </section>
{/if}

{#if part === 'sheet'}
<Sheet busy={recordWrite.busy || nameWrite.busy || visibilityWrite.busy} open={selectedId !== null} title={selectedName} onClose={close}>
  {#if selectedId !== null}
    {@const id = selectedId}
    <h3 class="inst-fade" use:resize>
      {#key selectedName}<span transition:fadeCount>{selectedName}</span>{/key}
    </h3>
    {#if selectedBuiltIn}
      <p class="small inst-note">{roadmapInstitutionNote(selectedBuiltIn)}</p>
    {/if}
    {#if selectedChanges.length}
      <div transition:collapse>
        <FieldGroupHeading legend={m.roadmap_institution_changes()} />
        <ListCard>
          {#each selectedChanges as change (change.id)}
            <div transition:collapse>
              <ListRow
                key={`institution-change-${change.id}`}
                data-institution-change={change.id}
                static
                title={institutionStatusWord(change.status)}
                subtitle={[dayLabel(change.epochDay), change.note]}
                action={{
                  icon: 'trash',
                  label: m.roadmap_institution_change_delete_aria({ date: dayLabel(change.epochDay) }),
                  onclick: () => deleteChange(change),
                  attrs: { 'data-delete-institution-change': change.id }
                }}
              />
            </div>
          {/each}
        </ListCard>
      </div>
    {/if}

    <FieldGroupHeading legend={m.roadmap_institution_record()} />
    <div class="inst-form">
      <ChoiceChips
        name={m.roadmap_institution_record_status()}
        key="institution-status"
        options={statusOptions}
        value={draftStatus}
        onChange={(next) => (draftStatus = next)}
      />
      <Field label={m.roadmap_institution_record_day()} id="institution-day">
        {#snippet children(fieldId)}
          <DatePicker name="institution-day" bind:value={draftDay} id={fieldId} />
        {/snippet}
      </Field>
      <Field label={m.roadmap_institution_record_note()} id="institution-note">
        {#snippet children(fieldId)}
          <input autocomplete={journalTextAutocomplete()}
            class="input"
            id={fieldId}
            name="institution-note"
            placeholder={m.roadmap_institution_record_note_placeholder()}
            bind:value={draftNote}
          />
        {/snippet}
      </Field>
      <button class="btn btn-primary press" data-record-institution-change disabled={recordWrite.busy} onclick={record}>
        <span>{m.roadmap_institution_record_save()}</span>
      </button>
    </div>

    <LinkedDocuments kind="goal" {id} />

    {#if selectedBuiltIn}
      <div class="inst-edit">
        <p class="small">{selectedHidden ? m.roadmap_institution_hidden_hint() : m.roadmap_institution_hide_hint()}</p>
        <button class="btn btn-ghost press" data-institution-visibility={id} data-hidden={selectedHidden} disabled={visibilityWrite.busy} onclick={toggleHidden}>
          <span>{selectedHidden ? m.roadmap_institution_restore() : m.roadmap_institution_hide()}</span>
        </button>
      </div>
    {:else if selectedOwn}
      <div class="inst-edit">
        <Field label={m.roadmap_institution_name_label()} id="institution-name">
          {#snippet children(fieldId)}
            <input autocomplete={journalTextAutocomplete()} class="input" id={fieldId} name="institution-name" bind:value={nameDraft} />
          {/snippet}
        </Field>
        <button class="btn btn-primary press" data-save-institution disabled={!canSaveName || nameWrite.busy} onclick={saveName}>
          <span>{m.roadmap_institution_save_name()}</span>
        </button>
        <button class="btn btn-ghost press" data-delete-institution onclick={() => (confirmingDelete = true)}>
          <Icon name="trash" size={18} />
          <span>{m.roadmap_institution_delete()}</span>
        </button>
      </div>
    {/if}
  {/if}
</Sheet>

<ConfirmDeleteSheet
  open={confirmingDelete}
  title={m.roadmap_institution_delete()}
  question={m.roadmap_institution_delete_q({ name: selectedName })}
  hint={m.roadmap_institution_delete_detail({ count: selectedChanges.length })}
  confirmLabel={m.roadmap_institution_delete()}
  cancelLabel={m.keep_it()}
  confirmAttrs={{ 'data-confirm-delete-institution': '' }}
  onConfirm={remove}
  onCancel={() => { confirmingDelete = false; removing.dismiss(); }}
  busy={removing.busy}
  failed={removing.failed}
/>
{/if}

{#if part === 'list'}
<Sheet busy={addWrite.busy} open={adding} title={m.roadmap_institution_new()} onClose={() => (adding = false)}>
  {#if adding}
    <h3>{m.roadmap_institution_new()}</h3>
    <Field label={m.roadmap_institution_name_label()} id="new-institution" hidden>
      {#snippet children(fieldId)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          id={fieldId}
          name="new-institution"
          placeholder={m.roadmap_institution_name_placeholder()}
          bind:value={newName}
        />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-save-new-institution disabled={!newName.trim() || addWrite.busy} onclick={add}>
      <span>{m.roadmap_institution_add()}</span>
    </button>
  {/if}
</Sheet>
{/if}

<style>
  .inst-group {
    margin-top: var(--space-6);
  }

  .inst-reviewed {
    margin: var(--space-3) 0 0;
  }

  .inst-left {
    margin-left: auto;
    display: grid;
    color: var(--text-2);
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  .inst-left > span,
  .inst-fade > :global(span) {
    grid-area: 1 / 1;
  }

  .inst-fade {
    display: grid;
  }

  .inst-note {
    margin: 0 0 var(--space-3);
  }

  .inst-form,
  .inst-edit {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .inst-edit {
    margin-top: var(--space-5);
  }

  /* The disc: an outline until something is recorded, the secondary ink
     while a request is open, the role's mark when it is done. Border and
     colour cross on --dur-fast, the glyphs on opacity and scale. */
  .inst-disc {
    position: relative;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border: 2px solid var(--outline);
    border-radius: 50%;
    color: var(--text-2);
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      border-color var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out);
  }

  .inst-open {
    border-color: var(--text-2);
  }

  .inst-done {
    border-color: var(--role-mark);
    color: var(--role-mark);
  }

  .inst-add {
    border-style: dashed;
  }

  .inst-glyph {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: scale(0.4);
    transition:
      opacity var(--dur-fast) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }

  .inst-glyph-shown {
    opacity: 1;
    transform: scale(1);
  }
</style>
