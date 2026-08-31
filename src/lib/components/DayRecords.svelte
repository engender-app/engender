<script lang="ts">
  /* What one day looks like (phase 5 deepening ticket 21): the entries, and
     everything else the app recorded that day around them.

     Separated from the route so that "how a day is read" and "what a day
     looks like" are two things. The route owns the epoch day, the live query
     and the gate; this owns the composition, which is the part of the ticket
     that needed deciding and the part that gets looked at
     (tests/browser-tier/day-gallery.svelte drives it across the three day
     shapes, all 8 palettes and both themes).

     The composition, and the reasoning it answers to:

     *The entry is the day's centre.* It keeps the day card and the timeline
     it has had since ticket 20, unchanged, so a day with an entry and nothing
     else renders exactly what it rendered before this ticket existed.

     *Everything else is one list, not a section each.* Sixteen areas can put
     a record on a day. A heading per area would turn a day with one dose into
     a screen of empty framework, so the rest of the day is one card of rows
     in the registry's order under one heading: one more record is one more
     row. A section with nothing in it produces no row and therefore no DOM.

     *Two areas, so two roles, in reading order.* The day card takes role 0 -
     the only index guaranteed to be a colour on all 8 palettes - and the list
     around it takes role 1.

     *No motion.* Arriving here is the shared axis (screen-transition.ts) and
     a row answers a press the way every row does. Nothing on this screen
     changes state, so tier 4 covers the rest of it (DIRECTION, "Tier 4,
     still").

     It writes nothing: every row is a link into the screen that owns the
     record. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import type { DayRecords } from '$lib/data/journal/day';
  import { entryMarks } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import type { Role } from '$lib/theme/roles';
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';
  import DayCard from './kit/DayCard.svelte';
  import DayEntry from './kit/DayEntry.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';
  import { dayRows } from './dayRows';

  let {
    epochDay,
    records,
    entriesRole,
    alsoRole
  }: {
    epochDay: number;
    records: DayRecords;
    /** The day card's stripe, role 0 at the call site. */
    entriesRole?: Role;
    /** The context list's stripe, role 1 at the call site. */
    alsoRole?: Role;
  } = $props();

  let entries = $derived(records.entries);
  let alsoRows = $derived(dayRows(records));
</script>

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
