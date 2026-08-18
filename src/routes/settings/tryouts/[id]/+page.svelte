<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery, onFirstResult } from '$lib/data/live/journal.svelte';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import type { FeltSenseEntry, Tryout, TryoutKind } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  const KINDS = [
    { value: 'name', label: m.tryout_kind_name() },
    { value: 'pronouns', label: m.tryout_kind_pronouns() }
  ];

  const isNew = page.params.id === 'new';
  const tryoutId = page.params.id as string;
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  let stored = liveQuery([], (j) => (isNew ? Promise.resolve([]) : j.tryouts.getTryouts()));
  let existing = $derived(stored.value?.find((t) => t.id === page.params.id));

  let draft = $state({ kind: 'name' as TryoutKind, label: '', start: dateInputValueFromEpochDay(todayEpochDay()), end: '' });

  onFirstResult(stored, (tryouts) => {
    const found = tryouts?.find((t) => t.id === page.params.id);
    if (found) {
      draft = {
        kind: found.kind,
        label: found.label,
        start: dateInputValueFromEpochDay(found.startEpochDay),
        end: found.endEpochDay == null ? '' : dateInputValueFromEpochDay(found.endEpochDay)
      };
    }
  });

  async function saveTryout() {
    const id = await journal.tryouts.upsertTryout({
      id: existing?.id,
      kind: draft.kind,
      label: draft.label,
      startEpochDay: epochDayFromDateInputValue(draft.start) ?? todayEpochDay(),
      endEpochDay: draft.end ? epochDayFromDateInputValue(draft.end) : null
    });
    if (isNew) await goto(`/settings/tryouts/${id}`);
  }

  const HISTORY_LIMIT = 50;
  let feelingQuery = liveQuery(['tryout'], (j) => (isNew ? Promise.resolve([]) : j.tryouts.getFeltSenseEntries(tryoutId)));
  let feeling = $derived(feelingQuery.value ?? []);

  let entriesQuery = liveQuery(['entry'], (j) =>
    isNew || !existing
      ? Promise.resolve([])
      : j.entries.searchEntries('', [], { startEpochDay: existing.startEpochDay, endEpochDay: existing.endEpochDay })
  );
  let entriesInRange = $derived(entriesQuery.value ?? []);

  let feelingMood = $state<number | null>(null);
  let feelingNote = $state('');
  async function addFeeling() {
    if (feelingMood == null) return;
    await journal.tryouts.addFeltSenseEntry({
      tryoutId,
      epochDay: todayEpochDay(),
      mood: feelingMood,
      note: feelingNote.trim() || null
    });
    feelingMood = null;
    feelingNote = '';
  }

  let feelingDeleteTarget = $state<FeltSenseEntry | null>(null);
  async function deleteFeeling() {
    if (!feelingDeleteTarget) return;
    const id = feelingDeleteTarget.id;
    feelingDeleteTarget = null;
    await journal.tryouts.deleteFeltSenseEntry(id);
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings/tryouts" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{isNew ? m.tryout_new_title() : m.tryout_edit_title()}</h1>
    <div class="header-action"></div>
  </header>

  <div class="card editor-section">
    <div class="field">
      <span class="field-label">{m.tryout_kind_label()}</span>
      <Segmented name={m.tryout_kind_label()} options={KINDS} value={draft.kind} onChange={(v) => (draft.kind = v as TryoutKind)} />
    </div>
    <div class="field">
      <label class="field-label" for="tr-label">{m.tryout_label_label()}</label>
      <input
        class="input"
        id="tr-label"
        name="tr-label"
        placeholder={draft.kind === 'name' ? m.tryout_label_placeholder_name() : m.tryout_label_placeholder_pronouns()}
        bind:value={draft.label}
      />
    </div>
    <div class="field">
      <label class="field-label" for="tr-start">{m.tryout_start_label()}</label>
      <input class="input" type="date" id="tr-start" name="tr-start" bind:value={draft.start} />
    </div>
    <div class="field">
      <label class="field-label" for="tr-end">{m.tryout_end_label()} <span class="muted">{m.tryout_end_hint()}</span></label>
      <input class="input" type="date" id="tr-end" name="tr-end" bind:value={draft.end} />
    </div>
    <button class="btn btn-primary" data-save-tryout disabled={draft.label.trim().length === 0} onclick={saveTryout}>
      <span>{isNew ? m.tryout_save() : m.tryout_save_changes()}</span>
    </button>
  </div>

  {#if !isNew}
    <SectionTitle text={m.tryout_feeling_title()} />
    <div class="card">
      <MoodPicker value={feelingMood} onPick={(v) => (feelingMood = v)} compact />
      <textarea
        class="input"
        rows="2"
        style="margin-top:var(--space-3)"
        placeholder={m.tryout_feeling_note_placeholder()}
        bind:value={feelingNote}
      ></textarea>
      <button
        class="btn btn-soft btn-block"
        style="margin-top:var(--space-3)"
        disabled={feelingMood == null}
        data-add-feeling
        onclick={addFeeling}
      >
        <span>{m.tryout_feeling_save()}</span>
      </button>
    </div>
    {#if feeling.length}
      <div class="list-group" style="margin-top:var(--space-3)">
        {#each feeling.slice(0, HISTORY_LIMIT) as f (f.id)}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">{dayLabel(f.epochDay)}</span>
              {#if f.note}<span class="row-subtitle">{f.note}</span>{/if}
            </span>
            <button class="icon-btn" aria-label={m.tryout_feeling_delete_sheet()} onclick={() => (feelingDeleteTarget = f)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="muted small" style="padding:var(--space-4)">{m.tryout_feeling_none()}</p>
    {/if}

    <SectionTitle text={m.tryout_entries_title()} />
    {#if entriesInRange.length}
      {#each entriesInRange as e (e.id)}
        <EntryCard entry={e} />
      {/each}
    {:else}
      <EmptyState title={m.tryout_entries_none()} text={m.tryout_entries_none_body()} />
    {/if}
  {/if}

  <Sheet open={feelingDeleteTarget !== null} title={m.tryout_feeling_delete_sheet()} onClose={() => (feelingDeleteTarget = null)}>
    {#if feelingDeleteTarget}
      <h3>{m.tryout_feeling_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.tryout_feeling_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-feeling onclick={deleteFeeling}><span>{m.tryout_feeling_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (feelingDeleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
