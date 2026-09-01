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
  import { entryPresentation } from '$lib/data/vocabulary/entryPresentation';
  import type { Role } from '$lib/theme/roles';
  import PhotoThumb from './PhotoThumb.svelte';
  import Sheet from './Sheet.svelte';
  import DayCard from './kit/DayCard.svelte';
  import DayEntry from './kit/DayEntry.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';
  import { dayRows, type DayRow } from './dayRows';

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

  /* A day's context list is capped, and the rest is one tap away (Alicja,
     2026-08-31, against the maximal day's twenty-one rows). Five is what the
     card shows: enough that a typical day - four rows - is never truncated
     at all, and short enough that a busy one stops being a wall.

     The overflow is a sheet rather than an in-place expand. The list can be
     three times the height of the screen on a maximal day, and DIRECTION
     caps `disclose()` at "a group rather than a screen - a disclosure that
     opens half the document is a navigation and belongs to tier 2". A sheet
     is tier 2's own answer and it already has its motion, so nothing new is
     invented here.

     Cheap by construction: the sheet's rows are the same `alsoRows` the card
     sliced, so opening it costs no read. */
  const SHOWN = 5;
  let shown = $derived(alsoRows.length > SHOWN ? alsoRows.slice(0, SHOWN) : alsoRows);
  let hidden = $derived(alsoRows.length - shown.length);
  let allOpen = $state(false);
</script>

<!-- How many records the row stands for, where it stands for more than
     one. One is not a count worth drawing. -->
{#snippet count(n: number | undefined)}
  {#if n !== undefined && n > 1}<span class="day-count">{n}</span>{/if}
{/snippet}

{#if entries.length > 0}
  <DayCard
    key={String(epochDay)}
    role={entriesRole}
    date={fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}
    aside={m.entries_this_day({ count: entries.length })}
  >
    {#each entries as e (e.id)}
      {@const presentation = entryPresentation(e)}
      <DayEntry
        key={String(e.id)}
        href={`/entry/${e.id}`}
        time={fmtTime(e.timestamp)}
        mood={e.mood}
        note={e.note ?? undefined}
        tags={entryTags(e)}
        marks={entryMarks(e)}
        {presentation}
      />
    {/each}
  </DayCard>
{/if}

{#snippet listRow(row: DayRow)}
  <!-- Two spellings of one row rather than a `leading` snippet that re-draws
       the kit's own icon disc in its else branch: `leading` replaces the disc
       outright, so a row with no photograph has to not pass one at all. -->
  {#if row.photo}
    <ListRow
      key={row.key}
      icon={row.icon}
      title={row.title}
      subtitle={row.subtitle}
      href={row.href}
      data-day-row={row.key}
    >
      {#snippet leading()}
        <!-- `row.photo!` because the {#if} above guards it and a snippet
             boundary drops the narrowing - svelte-check catches this and no
             test does. -->
        <span class="row-face"><PhotoThumb photo={row.photo!} size={36} /></span>
      {/snippet}
      {#snippet trailing()}{@render count(row.count)}{/snippet}
    </ListRow>
  {:else}
    <ListRow
      key={row.key}
      icon={row.icon}
      title={row.title}
      subtitle={row.subtitle}
      href={row.href}
      data-day-row={row.key}
    >
      {#snippet trailing()}{@render count(row.count)}{/snippet}
    </ListRow>
  {/if}
{/snippet}

{#if alsoRows.length > 0}
  <SectionHeading text={m.day_also_heading()} />
  <ListCard role={alsoRole}>
    {#each shown as row (row.key)}{@render listRow(row)}{/each}
    {#if hidden > 0}
      <!-- A row of the same list rather than a control under it: what it
           opens is more of this list, so it belongs inside the card the list
           is in. It acts rather than navigating, so it is a button - which is
           what passing `onclick` instead of `href` makes it. -->
      <ListRow
        key="also-more"
        icon="dots"
        title={m.day_also_more({ count: hidden })}
        onclick={() => (allOpen = true)}
        data-day-more
      />
    {/if}
  </ListCard>
{/if}

<!-- The same heading the card carries, because this is that list rather than
     a second thing: `Sheet`'s own `title` is its aria-label and nothing more,
     so the visible one is the caller's to draw. -->
<Sheet bind:open={allOpen} title={m.day_also_heading()}>
  <SectionHeading text={m.day_also_heading()} />
  <ListCard role={alsoRole}>
    {#each alsoRows as row (row.key)}{@render listRow(row)}{/each}
  </ListCard>
</Sheet>
