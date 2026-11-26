<script lang="ts">
  /* Search and Starred use this list to format dates and times, resolve tags
     and media marks, and link to entries. Their filtered results cannot give
     the total entries for a day. Home and Day keep their own count-bearing
     DayCard wrappers.

     Local height transitions let days and entries appear or disappear as
     the query changes while the caller animates the whole list's arrival.
     Keep kit-entry-row wrappers for the rail's first and last marks. */
  import { fmtDayBar, fmtTime } from '$lib/data/dates';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { HOME_AREA_ROLE, roleAt } from '$lib/theme/roles';
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
    role: givenRole,
    marginNotesByEntry,
    arrive = false,
    level
  }: {
    groups: EntryDayGroup[];
    role?: Role;
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
    /** Each day's heading level, handed to DayCard: the placing screen's
        to say. */
    level?: 2 | 3;
  } = $props();

  /* A day heads its card the way the day screen heads itself: weekday,
     day and month, and the year only when it is not this one. The year on
     every heading brought a comma with it in English ("Thursday, 1
     October 2026") that no other day heading in the app carries (audit
     UX-11). */
  const today = $derived(currentDay());

  /* Entries take the days' stripe unless the screen names another, the
     same stripe Calendar gives its days. Good moments named none, so its
     tags fell back to the accent and read magenta beside every other
     screen's cyan (after-release 28, audit UI-08). */
  const role = $derived(givenRole ?? roleAt(activeFlag.roles, HOME_AREA_ROLE.days));
</script>

<div class="entry-days" class:is-arriving={arrive}>
  {#each groups as group (group.epochDay)}
    <div class="entry-days-day" transition:disclose>
    <DayCard
      key={String(group.epochDay)}
      {role}
      tight
      {level}
      heading={fmtDayBar(group.epochDay, today)}
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
