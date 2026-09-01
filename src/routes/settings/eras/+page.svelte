<script lang="ts">
  /* Naming the person's own eras (phase 6 ticket 01, ADR-0049, CONTEXT:
     "Era"): list, add, rename, move either bound, delete. A surface under
     /more rather than a preference under Settings (ADR-0036) - an era is
     the person's own content, and the filters it feeds only appear once a
     row exists here.

     The design problem this screen has and its neighbours do not: an era's
     bounds are optional, and the era people most want to name first is the
     one before everything, which has no day that begins it. An empty date
     field says "you have not filled this in yet", so leaving one empty
     would read as a form half-finished rather than as the thing the person
     meant. Each bound is therefore a two-way choice - a date, or open -
     with the picker appearing only under the first. "No start" is
     something to pick, not a field to fail to fill.

     What the open choice actually resolves to is shown where the choice is
     being made, computed through `eraRange` against the journal's own first
     and last entry (ADR-0010: the clamp is read, never stored). It is one
     line in the sheet rather than a second line on every row: a person
     wonders what "no start" covers while they are deciding it, and not
     again every time they scroll past the era afterwards.

     The two invariants are `eras.ts`'s, read here as `eraConflict` while
     someone is still typing so a collision is a sentence under the fields
     and a disabled save rather than an error thrown after a tap. The area
     asserts the same rule on the way to the table (journal/eras.ts), which
     is the backstop and not this screen's error path. */
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { eraConflict, eraRange, type EraSpan } from '$lib/data/eras';
  import type { Era } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /** A bound in the editor: a `yyyy-mm-dd` string, or the empty string for
      the open choice. One field per bound rather than a date plus a flag -
      the empty string is already the only value a date input has for "no
      day", and a second field would let the two disagree. */
  interface EraDraft {
    id?: string;
    name: string;
    start: string;
    end: string;
  }

  const today = todayEpochDay();
  const longDay = { day: 'numeric', month: 'short', year: 'numeric' } as const;

  let erasQuery = liveList((j) => j.eras.getEras());
  let eras = $derived(erasQuery.rows);

  let boundsQuery = liveQuery((j) => j.eras.getJournalBounds());
  let bounds = $derived(boundsQuery.value ?? null);

  /** The start a "start an era here" arrival brought with it, read by
      `blank` on the one openEditor call below. A plain let and not `$state`:
      it is an argument in flight for one call, and nothing renders it. */
  let arrivingStart = '';

  const record = recordEditor<Era, EraDraft>({
    blank: () => ({ name: '', start: arrivingStart, end: '' }),
    fromRecord: (era) => ({
      id: era.id,
      name: era.name,
      start: era.startEpochDay === null ? '' : dateInputValueFromEpochDay(era.startEpochDay),
      end: era.endEpochDay === null ? '' : dateInputValueFromEpochDay(era.endEpochDay)
    }),
    async upsert(draft) {
      const candidate = spanOf(draft);
      if (candidate === null || eraConflict(eras, candidate)) return false;
      await journal.eras.upsertEra(candidate);
    },
    remove: (id) => journal.eras.deleteEra(id),
    findById: (id) => eras.find((era) => era.id === id)
  });

  /** The era a draft describes, or null while its name is still blank. The
      one place the two date strings become bounds, so the conflict shown in
      the sheet and the row that gets written are the same era. */
  function spanOf(draft: EraDraft): EraSpan | null {
    const name = draft.name.trim();
    if (!name) return null;
    return {
      id: draft.id,
      name,
      startEpochDay: epochDayFromDateInputValue(draft.start),
      endEpochDay: epochDayFromDateInputValue(draft.end)
    };
  }

  /** Why the open draft cannot be saved, in the person's words. */
  function conflictText(draft: EraDraft): string | null {
    const candidate = spanOf(draft);
    if (candidate === null) return null;
    const conflict = eraConflict(eras, candidate);
    if (conflict === null) return null;
    if (conflict.kind === 'inverted') return m.era_conflict_inverted();
    if (conflict.kind === 'openStart') return m.era_conflict_open_start({ name: conflict.with.name });
    if (conflict.kind === 'openEnd') return m.era_conflict_open_end({ name: conflict.with.name });
    return m.era_conflict_overlap({ name: conflict.with.name });
  }

  /** What an open bound comes to against the journal as it stands today.
      Null where nothing is open, where the name is still blank, or where the
      era holds no day the journal has an entry for - and null while the era
      collides with another, because saying what a span comes to underneath a
      line saying it cannot be saved states a fact about nothing. */
  function resolvedText(draft: EraDraft): string | null {
    if (draft.start !== '' && draft.end !== '') return null;
    const candidate = spanOf(draft);
    if (candidate === null || bounds === null) return null;
    if (eraConflict(eras, candidate)) return null;
    const range = eraRange(candidate, bounds);
    if (range === null) return null;
    return m.era_resolves_to({
      start: fmtDay(range.startEpochDay, longDay),
      end: fmtDay(range.endEpochDay, longDay)
    });
  }

  /** The era's own span, in its own terms - an absent bound is named as
      absent rather than shown as the day it happens to clamp to. */
  function spanText(era: Era): string {
    const start = era.startEpochDay === null ? null : fmtDay(era.startEpochDay, longDay);
    const end = era.endEpochDay === null ? null : fmtDay(era.endEpochDay, longDay);
    if (start !== null && end !== null) return m.era_span_both({ start, end });
    if (start === null && end !== null) return m.era_span_open_start({ end });
    if (start !== null && end === null) return m.era_span_open_end({ start });
    return m.era_span_open_both();
  }

  /* "Start an era here" hands the day over as a query parameter and this
     opens the editor on it. The parameter is dropped again on the way in, so
     the sheet does not reopen when someone comes back to this screen from
     the era they just wrote. */
  let requestedStart = $derived(page.url.searchParams.get('start'));
  $effect(() => {
    const day = Number(requestedStart);
    if (requestedStart === null || !Number.isInteger(day)) return;
    arrivingStart = dateInputValueFromEpochDay(day);
    record.openEditor(null);
    arrivingStart = '';
    void goto('/settings/eras', { replaceState: true, noScroll: true, keepFocus: true });
  });
</script>

<div class="screen">
  <ScreenHeader title={m.eras_title()} back="/more" subtitle={m.eras_intro()}>
    {#snippet actions()}
      <button class="icon-btn" data-add aria-label={m.eras_add()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={erasQuery} count={3}>
    {#snippet rows(list)}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each list as era (era.id)}
            <ListRow
              key={era.id}
              data-era={era.id}
              icon="columns"
              title={era.name}
              subtitle={spanText(era)}
              chevron={false}
              onclick={() => record.openEditor(era)}
            />
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="columns"
          key="eras-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.eras_empty_title()}
          text={m.eras_empty_body()}
          action={{ label: m.eras_add(), primary: true, onclick: () => record.openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <RecordSheet
    {record}
    handle="era"
    newTitle={m.era_new_sheet()}
    editTitle={m.era_edit_sheet()}
    saveLabel={m.era_save()}
    deleteLabel={m.era_delete()}
    canSave={(draft) => draft.name.trim().length > 0 && conflictText(draft) === null}
    confirm={{
      title: m.era_delete_sheet(),
      question: (era) => m.era_delete_q({ name: era.name }),
      confirmLabel: m.era_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.era_name_label()} id="era-name">
        {#snippet children(id)}
          <input
            class="input"
            {id}
            name="era-name"
            placeholder={m.era_name_placeholder()}
            bind:value={editor.name}
          />
        {/snippet}
      </Field>

      <Field label={m.era_start_label()} legend>
        {#snippet children()}
          <div class="era-bound">
            <Segmented
              key="era-start"
              name={m.era_start_label()}
              compact
              options={[
                { value: 'day', label: m.era_bound_day() },
                { value: 'open', label: m.era_bound_no_start() }
              ]}
              value={editor.start === '' ? 'open' : 'day'}
              onChange={(v) => (editor.start = v === 'open' ? '' : dateInputValueFromEpochDay(today))}
            />
            {#if editor.start !== ''}
              <DatePicker name="era-start" bind:value={editor.start} ariaLabel={m.era_start_label()} />
            {/if}
          </div>
        {/snippet}
      </Field>

      <Field label={m.era_end_label()} legend>
        {#snippet children()}
          <div class="era-bound">
            <Segmented
              key="era-end"
              name={m.era_end_label()}
              compact
              options={[
                { value: 'day', label: m.era_bound_day() },
                { value: 'open', label: m.era_bound_open_end() }
              ]}
              value={editor.end === '' ? 'open' : 'day'}
              onChange={(v) => (editor.end = v === 'open' ? '' : dateInputValueFromEpochDay(today))}
            />
            {#if editor.end !== ''}
              <DatePicker name="era-end" bind:value={editor.end} ariaLabel={m.era_end_label()} />
            {/if}
          </div>
        {/snippet}
      </Field>

      {#if resolvedText(editor)}
        <p class="muted small" data-era-resolved>{resolvedText(editor)}</p>
      {/if}
      {#if conflictText(editor)}
        <div class="notice notice-warn" role="alert" data-era-conflict>
          <Icon name="alert" size={20} />
          <div class="notice-body">{conflictText(editor)}</div>
        </div>
      {/if}
    {/snippet}
  </RecordSheet>
</div>

<style>
  /* The bound's two rows: the choice, and the picker it opens. Stacked
     rather than side by side because a compact two-segment control and a
     long date already fill a 390px sheet on their own. */
  .era-bound {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
