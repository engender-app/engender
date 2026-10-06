<script lang="ts">
  /* A run of days of entries, journal-connected (phase 5 ticket 22).

     The kit's `DayCard` and `DayEntry` are presentational - they take a
     formatted date, a formatted time, resolved tag labels and icon names, and
     know nothing about a journal. This is the caller that knows: it owns the
     date and time formats, the resolution of a tag id to a word, which media
     marks an entry carries and where an entry opens. `WeekStrip` stands in the
     same relation to `BareStrip`.

     It exists because search and the starred shelf were drawing the identical
     eighteen lines, down to the date format, and Home and a day are two more
     of the same shape. Those two keep their own: Home caps what it draws and
     heads each bar with how many entries the day holds, and a day heads its
     one card with a count too. What is shared here is the case with no count
     to give - a hit list can say how many entries of a day matched and not how
     many it holds, and a bar reading "3 that day" over three of five would be
     the filter describing itself (recentEntries.ts).

     Both callers redraw it under a question that changes while somebody
     types, so a day and an entry each open their own height when an answer
     brings them and give it back when the next answer drops them (ticket
     16, "rows animate in; no row painted in place before it arrives"). A
     day stays one card while the entries on it come and go. The
     transitions are local, so a list arriving as a whole rides its
     caller's own transition instead of opening every row at once. Each
     entry's wrapper is the kit's `.kit-entry-row`, which tells the rail
     where a card's first and last entry are (kit.css). */
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { crossesCalendarYear } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { disclose } from '$lib/motion/reveal';
  import { entryMarks, type EntryDayGroup } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { entryPresentation } from '$lib/data/vocabulary/entryPresentation';
  import type { MarginNote } from '$lib/data/types';
  import type { Role } from '$lib/theme/roles';
  import MarginNotes from './MarginNotes.svelte';
  import DayCard from './kit/DayCard.svelte';
  import DayEntry from './kit/DayEntry.svelte';

  let {
    groups,
    role,
    clampNotes = true,
    marginNotesByEntry,
    arrive = false
  }: {
    groups: EntryDayGroup[];
    role?: Role;
    /** Off for a saved question's run (phase 8 features ticket 06): the
        whole point of a run over a hit list is enough of each entry to
        read rather than to scan. */
    clampNotes?: boolean;
    /** Batched by the caller, one read for the whole page rather than one
        per entry (phase 8 features ticket 07, marginNotes.ts's own
        reasoning). Omitted, every entry reads as carrying none - the
        starred shelf (starred/+page.svelte) draws no margin-note
        affordance for exactly that reason: it is not one of the four
        surfaces the ticket names. */
    marginNotesByEntry?: Map<number, MarginNote[]>;
    /** Set where the whole run is disclosed at once by a control (Good
        moments' "See all", phase 14 ticket 18): each day clips open from
        its own left edge, one --stagger-step behind the one above, the
        way every block in the app arrives (rule 10, ADR-0078). Without
        it a run mounts as it stands, and only a day added later opens. */
    arrive?: boolean;
  } = $props();

  /* A day heads its card the way the day screen heads itself: weekday,
     day and month, and the year only when it is not this one. The year on
     every heading brought a comma with it in English ("Thursday, 1
     October 2026") that no other day heading in the app carries (audit
     UX-11). */
  const today = $derived(currentDay());
</script>

<div class="entry-days" class:is-arriving={arrive}>
  {#each groups as group (group.epochDay)}
    <div class="entry-days-day" transition:disclose>
    <DayCard
      key={String(group.epochDay)}
      {role}
      tight
      heading={fmtDay(group.epochDay, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        ...(crossesCalendarYear(group.epochDay, today) ? { year: 'numeric' } : {})
      })}
    >
      {#each group.entries as entry (entry.id)}
        {@const presentation = entryPresentation(entry)}
        <div class="kit-entry-row" transition:disclose>
        <DayEntry
          key={String(entry.id)}
          href={`/entry/${entry.id}`}
          time={fmtTime(entry.timestamp)}
          mood={entry.mood}
          note={entry.note ?? undefined}
          tags={entryTags(entry)}
          marks={entryMarks(entry)}
          {presentation}
          clampNote={clampNotes}
        >
          {#snippet marginNotes()}
            {#if marginNotesByEntry}
              <MarginNotes entryId={entry.id} notes={marginNotesByEntry.get(entry.id) ?? []} addable={false} />
            {/if}
          {/snippet}
        </DayEntry>
        </div>
      {/each}
    </DayCard>
    </div>
  {/each}
</div>

<style>
  /* A margin under every day rather than the grid gap this used to be: a
     gap stays at full size while a day collapses beside it and is lost in
     the frame the day is removed, where a margin travels with its box
     (reveal.ts). Under every day, the last too, because a margin between
     siblings moves to the next day when the first one goes. */
  .entry-days-day {
    margin-bottom: var(--space-3);
  }

  /* The stagger is written out and capped the way kit.css writes the tile
     grid's: a fourteenth day counting its own way up would wait most of a
     second for a turn nobody is watching for, so everything past the sixth
     arrives with the sixth. */
  .is-arriving > .entry-days-day {
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--row-index, 0) * var(--stagger-step));
  }
  .is-arriving > .entry-days-day:nth-child(2) { --row-index: 1; }
  .is-arriving > .entry-days-day:nth-child(3) { --row-index: 2; }
  .is-arriving > .entry-days-day:nth-child(4) { --row-index: 3; }
  .is-arriving > .entry-days-day:nth-child(5) { --row-index: 4; }
  .is-arriving > .entry-days-day:nth-child(n + 6) { --row-index: 5; }
</style>
