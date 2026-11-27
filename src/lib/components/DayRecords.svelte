<script lang="ts">
  /* DayRecords composes the day and leaves its date, query and gate
     to the route. Entries use their timeline card. Other records share
     one list in registry order, with no markup for empty areas. The
     entries use role 0 and the list role 1.

     Keep the rows still except for a dose title whose route-batched
     drug attribution arrives after mount. Only those ListRows use
     fadeSwap. Rows link to the screens that own the records. */
  import { m } from '$lib/paraglide/messages';
  import { fmtTime } from '$lib/data/dates';
  import type { DayRecords } from '$lib/data/journal/day';
  import { entryMarks } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { entryPresentation } from '$lib/data/vocabulary/entryPresentation';
  import type { MarginNote } from '$lib/data/types';
  import type { Role } from '$lib/theme/roles';
  import PhotoThumb from './PhotoThumb.svelte';
  import Sheet from './Sheet.svelte';
  import MarginNotes from './MarginNotes.svelte';
  import DayCard from './kit/DayCard.svelte';
  import DayEntry from './kit/DayEntry.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';
  import { dayRows, type DayRow, type DoseDrugFact } from './dayRows';

  let {
    epochDay,
    records,
    entriesRole,
    alsoRole,
    marginNotesByEntry,
    doseDrugs
  }: {
    epochDay: number;
    records: DayRecords;
    /** The day card's stripe, role 0 at the call site. */
    entriesRole?: Role;
    /** The context list's stripe, role 1 at the call site. */
    alsoRole?: Role;
    /** Batched by the route, the same reason `records` itself is: one read
        for the whole screen rather than one per entry. Omitted, every entry reads as carrying none - the
        gallery probe that renders this component with no journal behind it
        (tests/browser-tier/day-gallery) has nothing to batch, and an entry
        with none still draws its own "add a note" affordance, which needs
        no read at all. */
    marginNotesByEntry?: Map<number, MarginNote[]>;
    /** One `attributeDrug` answer per logged dose, resolved by the route.
        Omitted, every dose row states the amount and
        route alone - the same gallery probe has no episodes to attribute
        with, and a row must never borrow today's regimen to fill the gap. */
    doseDrugs?: ReadonlyMap<string, DoseDrugFact>;
  } = $props();

  let entries = $derived(records.entries);
  let alsoRows = $derived(dayRows(records, doseDrugs));

  /* A day's context list is capped, and the rest is one tap away. Five is what the card
     shows: enough that a typical day - four rows - is never truncated at all, and short
     enough that a busy one stops being a wall.

     The overflow is a sheet rather than an in-place expand. The list can be three times the
     viewport height on a busy day. Reserve `disclose()` for a group that fits within the
     screen. A sheet is tier 2's own answer and it already has its motion, so nothing new is
     invented here.

     Cheap by construction: the sheet's rows are the same `alsoRows` the card sliced, so
     opening it costs no read. */
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
  <!-- The bar counts the entries and leaves the date to the screen's own header, one line
       above it (release: "1 October 2026 · 1 entry this day" under a header that already
       said 1 October). -->
  <DayCard
    key={String(epochDay)}
    role={entriesRole}
    heading={m.entries_this_day({ count: entries.length })}
    level={2}
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
      >
        {#snippet marginNotes()}
          {#if marginNotesByEntry}
            <MarginNotes entryId={e.id} notes={marginNotesByEntry.get(e.id) ?? []} />
          {/if}
        {/snippet}
      </DayEntry>
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
      fadeSwap
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
      fadeSwap
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
        title={m.and_count_more({ count: hidden })}
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

<style>
  /* A photograph standing in for a row's icon block, so it takes the
     block's shape (`.kit-row-ico`, --r-block). PhotoThumb draws a rounded
     square, which is right where photos are a grid of photos and wrong in a
     column of icon blocks. Clipped rather than restyled, so nothing changes
     for the screens that show photos as photos. */
  .row-face {
    flex: 0 0 auto;
    display: flex;
    border-radius: var(--r-block);
    overflow: hidden;
    border: var(--role-hairline);
  }
  /* How many the row stands for, at the trailing edge before the chevron.
     Tabular figures so a run of counts lines up, and the role's own ink
     rather than grey - it is a number this area owns, not a disabled one. */
  .day-count {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--role-ink);
  }
</style>
