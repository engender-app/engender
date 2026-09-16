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
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { cycleEventKindName } from '$lib/data/vocabulary/labels';
  import { fmtDay } from '$lib/data/dates';
  import {
    todayEpochDay,
    epochDayFromDateInputValue,
    epochDayFromDateInputValueOrToday,
    dateInputValueFromEpochDay,
    dayRangeEndMin,
    dayRangeStartMax,
    ongoingWindowRange,
    customInclusiveRange
  } from '$lib/data/epochDay';
  import type { CycleEvent, CycleEventKind } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import CycleEventChart from '$lib/components/CycleEventChart.svelte';
  import DayStrip from '$lib/components/DayStrip.svelte';
  import { stripWindow, type DayMark } from '$lib/components/dayStrip';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const KINDS: CycleEventKind[] = ['period_occurred', 'spotting', 'nothing_this_month'];

  /* The strip's fill takes role 0 (ticket 56, following ticket 44's rule for
     dilation and wear): index 0 is the only role guaranteed chromatic on all
     8 palettes, and a logged day filled in a palette's achromatic band is a
     day drawn as nothing. The chart draws its own line colour
     (CycleEventChart.svelte) and takes no role here. */
  const SECTION_ROLE = { strip: 0, sessions: 1 };

  const today = todayEpochDay();
  const defaultRange = ongoingWindowRange(today, 365);

  let startInput = $state(dateInputValueFromEpochDay(defaultRange.start));
  let endInput = $state(dateInputValueFromEpochDay(defaultRange.end));
  let range = $derived(
    customInclusiveRange(epochDayFromDateInputValue(startInput), epochDayFromDateInputValue(endInput))
  );

  let eventsQuery = liveList((j) => j.cycleEvents.getCycleEvents());
  let events = $derived(eventsQuery.rows);

  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.rows);

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

  /* The log is a week at a time now (phase 10 redesign ticket 56, reusing
     ticket 44's DayStrip/dayStrip.ts). A day here is `logged` or nothing -
     there is no `expected`, the same restraint wear's own strip applies:
     nothing schedules a cycle event, and this screen has always refused to
     predict one. */
  let eventsByDay = $derived.by(() => {
    const byDay = new Map<number, CycleEvent[]>();
    for (const event of events) {
      byDay.set(event.epochDay, [...(byDay.get(event.epochDay) ?? []), event]);
    }
    return byDay;
  });
  let markOf = $derived((epochDay: number): DayMark => (eventsByDay.has(epochDay) ? 'logged' : 'off'));
  let earliest = $derived(events.length === 0 ? null : Math.min(...events.map((event) => event.epochDay)));

  /** What a cell, or the day row under the strip, says: the kinds logged
      that day, joined the way a day can hold more than one event. */
  const dayKindsLabel = (epochDay: number): string | null => {
    const onDay = eventsByDay.get(epochDay);
    return onDay && onDay.length ? onDay.map((event) => cycleEventKindName(event.kind)).join(' · ') : null;
  };

  let weeksBack = $state(0);
  let shownWeek = $derived(stripWindow(today, weeksBack));
  let weekEvents = $derived(
    [...events]
      .filter((event) => event.epochDay >= shownWeek.first && event.epochDay <= shownWeek.last)
      .sort((a, b) => b.epochDay - a.epochDay)
  );

  /** A tap on a strip day: its first event if it has one, or a blank draft
      anchored to that day if it has none - the same two ways the add
      control already offers, pointed at one day. */
  function openEventFor(epochDay: number) {
    const existing = eventsByDay.get(epochDay)?.[0];
    if (existing) {
      record.openEditor(existing);
      return;
    }
    record.editor = { date: dateInputValueFromEpochDay(epochDay), kind: 'period_occurred' };
  }

  const record = recordEditor<CycleEvent, { id?: string; date: string; kind: CycleEventKind }>({
    blank: () => ({ date: dateInputValueFromEpochDay(today), kind: 'period_occurred' }),
    fromRecord: (event) => ({ id: event.id, date: dateInputValueFromEpochDay(event.epochDay), kind: event.kind }),
    async upsert(draft) {
      await journal.cycleEvents.upsertCycleEvent({
        id: draft.id,
        kind: draft.kind,
        epochDay: epochDayFromDateInputValueOrToday(draft.date)
      });
    },
    remove: (id) => journal.cycleEvents.deleteCycleEvent(id),
    findById: (id) => events.find((event) => event.id === id)
  });
</script>

<div class="screen">
  <ScreenHeader title={m.cycle_events()} back="/practice/personal-effects" subtitle={m.cycle_events_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.cycle_event_add_aria()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <!-- Not ReadGate's shape, for the reason the starred screen is not
       (phase 5 audit ticket 04): the gate branches on one read, and the rows
       here need the regimen episodes as well as the events, so drawing them
       the moment the events land would draw the chart without its bands. -->
  {#if eventsQuery.loading || episodesQuery.loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if events.length}
    <div class="screen-part">
      <!-- What is true now, before what was true before (rule 16): the
           week as a strip, and today under it at full size with the way to
           log it on the row. Guarded on `earliest` the same way hair
           removal's own strip is, even though this branch only runs once
           `events.length` has already guaranteed it - one fewer thing to
           re-derive if that guarantee ever moves. -->
      {#if earliest !== null}
        <DayStrip
          {today}
          markOf={(day) => markOf(day)}
          labelOf={(day, mark) =>
            m.strip_day_state({
              day: fmtDay(day, { day: 'numeric', month: 'long', year: 'numeric' }),
              state: dayKindsLabel(day) ?? m.adherence_nothing_logged()
            })}
          {earliest}
          onPick={openEventFor}
          role={roleAt(activeFlag.roles, SECTION_ROLE.strip)}
          bind:weeksBack
        />
      {/if}
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
        <ListRow
          key="cycle-events-today"
          data-cycle-events-today
          icon="calendar"
          title={m.today()}
          subtitle={fmtDay(today, { day: 'numeric', month: 'long', year: 'numeric' })}
          onclick={() => openEventFor(today)}
        >
          {#snippet trailing()}
            {dayKindsLabel(today) ?? m.adherence_nothing_logged()}
          {/snippet}
        </ListRow>
      </ListCard>
    </div>

    <div class="screen-part">
      {#if weekEvents.length === 0}
        <!-- Its own words rather than a day's answer stretched over seven,
             the same line dilation's and wear's empty week carry. -->
        <p class="muted small" data-strip-week-empty>{m.strip_week_nothing()}</p>
      {:else}
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
          {#each weekEvents as event (event.id)}
            <ListRow
              key={event.id}
              data-cycle-event={event.id}
              icon="calendar"
              title={cycleEventKindName(event.kind)}
              subtitle={fmtDay(event.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}
              chevron={false}
              onclick={() => record.openEditor(event)}
            />
          {/each}
        </ListCard>
      {/if}
    </div>

    <div class="screen-part">
      <!-- The chart is not in a card. It is the only thing in this area of
           the screen, and a box drawn around the one thing on a screen is
           what DIRECTION.md 2b names as making a screen read as generic -
           the same call the calendar's month grid made. The endpoints sit
           above it on the kit's filter line, because they say what the
           chart is showing rather than entering a value. Moved under the
           reading and the strip (ticket 56, rule 16: what is true now comes
           first, and a chart against a chosen range is a record of before,
           not now) - the same move ticket 44 made for wear's own trend. -->
      <div class="kit-filter cd-endpoints">
        <Field label={m.cycle_event_range_start_label()} id="cycle-event-range-start">
          {#snippet children(id)}
            <DatePicker max={dayRangeStartMax(endInput)} bind:value={startInput} {id} />
          {/snippet}
        </Field>
        <Field label={m.cycle_event_range_end_label()} id="cycle-event-range-end">
          {#snippet children(id)}
            <DatePicker min={dayRangeEndMin(startInput)} bind:value={endInput} {id} />
          {/snippet}
        </Field>
      </div>
      {#if range === null}
        <p class="muted small">{m.cycle_event_range_required()}</p>
      {:else}
        <CycleEventChart fromEpochDay={range.start} toEpochDay={range.end} {bands} events={chartEvents} />
      {/if}
    </div>
  {:else}
    <div class="screen-part">
      <Notice
        icon="calendar"
        key="cycle-events-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.cycle_event_empty_title()}
        text={m.cycle_event_empty_body()}
        action={{ label: m.cycle_event_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
      />
    </div>
  {/if}

  <RecordSheet
    {record}
    handle="cycle-event"
    newTitle={m.cycle_event_new_sheet()}
    editTitle={m.cycle_event_edit_sheet()}
    saveLabel={m.cycle_event_save()}
    deleteLabel={m.cycle_event_delete()}
    confirm={{
      title: m.cycle_event_delete_sheet(),
      question: (e) =>
        m.cycle_event_delete_q({
          kind: cycleEventKindName(e.kind),
          date: fmtDay(e.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })
        }),
      hint: () => m.cycle_event_delete_hint(),
      confirmLabel: m.cycle_event_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.cycle_event_date_label()} id="cycle-event-date">
        {#snippet children(id)}
          <DatePicker name="cycle-event-date" bind:value={editor.date} {id} />
        {/snippet}
      </Field>
      <Field label={m.cycle_event_kind_label()} legend>
        {#snippet children()}
          <Segmented
            name={m.cycle_event_kind_label()}
            options={KINDS.map((k) => ({ value: k, label: cycleEventKindName(k) }))}
            value={editor.kind}
            onChange={(v) => (editor.kind = v as CycleEventKind)}
          />
        {/snippet}
      </Field>
    {/snippet}
  </RecordSheet>
</div>
