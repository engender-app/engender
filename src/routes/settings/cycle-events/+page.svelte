<script lang="ts">
  /* The cycle event log (phase 5 ticket 03, CONTEXT: "Cycle event"). Cycle
     events are their own record type, mirroring side-effects.ts exactly:
     no mood, dimension values, tags or note, and no stored regimen-episode
     reference - the list and editor below work whether or not a regimen
     episode exists. The chart is the one thing side effects has no analog
     for: it reads regimen.getEpisodes() only to draw bands behind the
     events, which is why it, and not the list or editor, is the part that
     changes shape when there is no regimen history yet.

     Purely descriptive throughout (see Clue's own guidance for trans users:
     https://helloclue.com/articles/cycle-a-z/tips-for-using-clue-when-you're-trans):
     no prediction of a next period, no fertility framing, no assumption
     that a regular cycle exists. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { cycleEventKindName } from '$lib/data/vocabulary/labels';
  import { fmtDay } from '$lib/data/dates';
  import {
    todayEpochDay,
    epochDayFromDateInputValue,
    dateInputValueFromEpochDay,
    ongoingWindowRange,
    customInclusiveRange
  } from '$lib/data/epochDay';
  import type { CycleEvent, CycleEventKind } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import CycleEventChart from '$lib/components/CycleEventChart.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const KINDS: CycleEventKind[] = ['period_occurred', 'spotting', 'nothing_this_month'];

  const today = todayEpochDay();
  const defaultRange = ongoingWindowRange(today, 365);

  let startInput = $state(dateInputValueFromEpochDay(defaultRange.start));
  let endInput = $state(dateInputValueFromEpochDay(defaultRange.end));
  let range = $derived(
    customInclusiveRange(epochDayFromDateInputValue(startInput), epochDayFromDateInputValue(endInput))
  );

  let eventsQuery = liveQuery(['cycleEvent'], (j) => j.cycleEvents.getCycleEvents());
  let events = $derived(eventsQuery.value ?? []);

  let episodesQuery = liveQuery(['regimen'], (j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.value ?? []);

  let chartEvents = $derived(
    range ? events.filter((e) => e.epochDay >= range!.start && e.epochDay <= range!.end) : []
  );
  let bands = $derived(
    range
      ? episodes
          .map((episode) => ({ startEpochDay: episode.startEpochDay, endEpochDay: episode.endEpochDay ?? today }))
          .filter((band) => band.startEpochDay <= range!.end && band.endEpochDay >= range!.start)
      : []
  );

  let editor = $state<{ id?: string; date: string; kind: CycleEventKind } | null>(null);
  let deleteTarget = $state<CycleEvent | null>(null);

  function openEditor(event: CycleEvent | null) {
    editor = event
      ? { id: event.id, date: dateInputValueFromEpochDay(event.epochDay), kind: event.kind }
      : { date: dateInputValueFromEpochDay(today), kind: 'period_occurred' };
  }

  async function saveEvent() {
    if (!editor) return;
    await journal.cycleEvents.upsertCycleEvent({
      id: editor.id,
      kind: editor.kind,
      epochDay: epochDayFromDateInputValue(editor.date) ?? today
    });
    editor = null;
  }

  function askToDelete() {
    if (!editor?.id) return;
    deleteTarget = events.find((event) => event.id === editor!.id) ?? null;
    if (deleteTarget) editor = null;
  }

  async function deleteEvent() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.cycleEvents.deleteCycleEvent(id);
  }
</script>

<div class="screen">
  <ScreenHeader title={m.cycle_events()} back="/more" subtitle={m.cycle_events_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.cycle_event_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  {#if eventsQuery.loading || episodesQuery.loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if events.length}
    <div class="screen-part">
      <!-- The chart is not in a card. It is the only thing in this area of
           the screen, and a box drawn around the one thing on a screen is
           what DIRECTION.md 2b names as making a screen read as generic -
           the same call the calendar's month grid made. The endpoints sit
           above it on the kit's filter line, because they say what the
           chart is showing rather than entering a value. -->
      <div class="kit-filter cd-endpoints">
        <div class="field">
          <label class="field-label" for="cycle-event-range-start">{m.cycle_event_range_start_label()}</label>
          <input class="input" id="cycle-event-range-start" type="date" bind:value={startInput} max={endInput || undefined} />
        </div>
        <div class="field">
          <label class="field-label" for="cycle-event-range-end">{m.cycle_event_range_end_label()}</label>
          <input class="input" id="cycle-event-range-end" type="date" bind:value={endInput} min={startInput || undefined} />
        </div>
      </div>
      {#if range === null}
        <p class="muted small">{m.cycle_event_range_required()}</p>
      {:else}
        <CycleEventChart fromEpochDay={range.start} toEpochDay={range.end} {bands} events={chartEvents} />
      {/if}

      <!-- No heading over the list. The screen is called Cycle and the
           only wording the catalogue has for this area is that same word,
           which would be two headers stacked (DIRECTION.md 3d). The chart
           sits on the page and the list sits in a card, which is what
           separates them; a name for the list is a copy ticket's to write. -->
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each [...events].reverse() as event (event.id)}
          <ListRow
            key={event.id}
            data-cycle-event={event.id}
            icon="calendar"
            title={cycleEventKindName(event.kind)}
            subtitle={fmtDay(event.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}
            chevron={false}
            onclick={() => openEditor(event)}
          />
        {/each}
      </ListCard>
    </div>
  {:else}
    <div class="screen-part">
      <Notice
        icon="calendar"
        key="cycle-events-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.cycle_event_empty_title()}
        text={m.cycle_event_empty_body()}
        action={{ label: m.cycle_event_empty_action(), primary: true, onclick: () => openEditor(null) }}
      />
    </div>
  {/if}

  <Sheet open={editor !== null} title={editor?.id ? m.cycle_event_edit_sheet() : m.cycle_event_new_sheet()} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? m.cycle_event_edit_sheet() : m.cycle_event_new_sheet()}</h3>
      <div class="field">
        <label class="field-label" for="cycle-event-date">{m.cycle_event_date_label()}</label>
        <input class="input" type="date" id="cycle-event-date" name="cycle-event-date" bind:value={editor.date} />
      </div>
      <div class="field">
        <span class="field-label">{m.cycle_event_kind_label()}</span>
        <Segmented
          name={m.cycle_event_kind_label()}
          options={KINDS.map((k) => ({ value: k, label: cycleEventKindName(k) }))}
          value={editor.kind}
          onChange={(v) => (editor!.kind = v as CycleEventKind)}
        />
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-cycle-event onclick={saveEvent}><span>{m.cycle_event_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-delete-cycle-event onclick={askToDelete}><span>{m.cycle_event_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title={m.cycle_event_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.cycle_event_delete_q({ kind: cycleEventKindName(deleteTarget.kind), date: fmtDay(deleteTarget.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.cycle_event_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-cycle-event onclick={deleteEvent}><span>{m.cycle_event_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
