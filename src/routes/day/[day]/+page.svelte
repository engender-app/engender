<script lang="ts">
  /* One day (phase 5 UX ticket 22, widened by deepening ticket 21).

     What it was: the day's entries and nothing else. Everything else the app
     recorded that day - the dose, the laser session, the measurement, the lab
     draw, the wear session, the recovery photo, the felt sense, the side
     effect - was findable only by opening the screen that owns it and
     scrolling to the right date. Ticket 04 unified where a day is captured
     (ADR-0044); this is the read side of it.

     What it reads is `journal.day.getDay`, whose sections are a registry
     (day.ts) rather than a list of imports here, so a dated area added later
     reaches this screen without it being edited - and an area registered
     nowhere is a compile error there rather than a screen quietly short of
     one. The screen names no area.

     Two areas, so two roles, in reading order. The day card keeps role 0 and
     everything around it takes role 1.

     The composition is the ticket's own problem, and the answer is one list
     rather than a section per area. The entry is the day's centre and the day
     card draws it as it always did; everything else is one card of rows in
     the registry's order, so a day with one dose gains one row and a day with
     eleven kinds of record gains eleven rows instead of eleven headings. A
     section with nothing in it produces no row and therefore no DOM, the way
     ticket 04's contextual sections already do, and a day with only an entry
     renders exactly what it rendered before this ticket.

     No motion is added. Arriving here is the shared axis
     (screen-transition.ts) and a row answers a press the way every row does;
     there is no state on this screen that changes, so tier 4 is where all of
     it belongs.

     It writes nothing. Editing happens in the editor and in each area's own
     screen, and every row here is a link into one of them.

     `day` still accepts `today` or an epoch-day number, and still reads it as
     a `$derived` rather than a const: a same-route navigation between two
     days reuses this component, and a plain const would keep the first day it
     saw (see the stale-params note on /entry/[id]). */
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { smartBack } from '$lib/navigation/smart-back';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { DAY_SECTION_KEYS } from '$lib/data/journal/day';
  import { liveListIn, liveQuery } from '$lib/data/live/journal.svelte';
  import { entryMarks } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import DayCard from '$lib/components/kit/DayCard.svelte';
  import DayEntry from '$lib/components/kit/DayEntry.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { dayRows } from './dayRows';

  let epochDay = $derived(page.params.day === 'today' ? todayEpochDay() : Number(page.params.day));
  let isToday = $derived(epochDay === todayEpochDay());

  /* The query reads `epochDay` before its first await, which is what makes it
     re-run on navigation - see liveQuery's contract. One query for the whole
     screen rather than one per area: the registry reads its sections
     concurrently underneath, and seventeen subscriptions here would be
     seventeen re-runs on a write that any one of them cares about. */
  let dayRead = liveQuery((j) => j.day.getDay(epochDay));
  let day = $derived(dayRead.value);

  /* What the gate branches on: a day is empty when no section has a row,
     which is not something a single list read can say for itself. Flattening
     every section is the emptiness test and nothing else - the two halves of
     the screen render from `day` directly, because they render differently.

     Off DAY_SECTION_KEYS rather than a list written here, so a section added
     to the registry counts towards "is this day empty" without this line
     being touched. */
  let everythingLogged = liveListIn(dayRead, (records) =>
    DAY_SECTION_KEYS.flatMap((key) => records[key] as unknown[])
  );

  let entries = $derived(day?.entries ?? []);
  let alsoRows = $derived(day ? dayRows(day) : []);

  /* Role 0 for the entries, which is the only index guaranteed to be a colour
     on all 8 palettes, and role 1 for everything around them - areas in
     reading order (DIRECTION, "Colour that carries a value takes role 0"). */
  let entriesRole = $derived(roleAt(activeFlag.roles, 0));
  let alsoRole = $derived(roleAt(activeFlag.roles, 1));
</script>

<div class="screen" data-screen>
  <ScreenHeader
    title={isToday ? m.today() : fmtDay(epochDay, { weekday: 'long' })}
    screen="day"
    back={() => smartBack('/calendar')}
  />

  <ReadGate read={everythingLogged} variant="card" count={2}>
    {#snippet rows()}
      {#if entries.length > 0}
        <DayCard
          key={String(epochDay)}
          role={entriesRole}
          date={fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}
          aside={m.entries_this_day({ count: entries.length })}
        >
          {#each entries as e (e.id)}
            <DayEntry
              key={String(e.id)}
              href={`/entry/${e.id}`}
              time={fmtTime(e.timestamp)}
              mood={e.mood}
              note={e.note ?? undefined}
              tags={entryTags(e)}
              marks={entryMarks(e)}
            />
          {/each}
        </DayCard>
      {/if}

      {#if alsoRows.length > 0}
        <SectionHeading text={m.day_also_heading()} />
        <ListCard role={alsoRole}>
          {#each alsoRows as row (row.key)}
            <ListRow
              key={row.key}
              icon={row.icon}
              title={row.title}
              subtitle={row.subtitle}
              href={row.href}
              data-day-row={row.key}
            >
              {#snippet leading()}
                {#if row.photo}
                  <span class="day-face"><PhotoThumb photo={row.photo} size={36} /></span>
                {:else}
                  <span class="kit-row-ico"><Icon name={row.icon} size={22} /></span>
                {/if}
              {/snippet}
              {#snippet trailing()}
                {#if row.count !== undefined && row.count > 1}<span class="day-count">{row.count}</span>{/if}
              {/snippet}
            </ListRow>
          {/each}
        </ListCard>
      {/if}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="book"
        key="day-empty"
        role={entriesRole}
        title={m.nothing_logged()}
        text={m.day_nothing_body()}
      />
    {/snippet}
  </ReadGate>

  <div class="day-add">
    <button class="btn btn-soft" data-add onclick={() => goto(`/entry/new/${epochDay}`)}>
      <Icon name="plus" size={20} /><span>{m.add_another_entry()}</span>
    </button>
  </div>
</div>
