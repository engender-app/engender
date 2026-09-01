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
     the filter describing itself (recentEntries.ts). */
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { entryMarks, type EntryDayGroup } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { entryPresentation } from '$lib/data/vocabulary/entryPresentation';
  import type { Role } from '$lib/theme/roles';
  import DayCard from './kit/DayCard.svelte';
  import DayEntry from './kit/DayEntry.svelte';

  let { groups, role }: { groups: EntryDayGroup[]; role?: Role } = $props();
</script>

<div class="entry-days">
  {#each groups as group (group.epochDay)}
    <DayCard
      key={String(group.epochDay)}
      {role}
      date={fmtDay(group.epochDay, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
    >
      {#each group.entries as entry (entry.id)}
        {@const presentation = entryPresentation(entry)}
        <DayEntry
          key={String(entry.id)}
          href={`/entry/${entry.id}`}
          time={fmtTime(entry.timestamp)}
          mood={entry.mood}
          note={entry.note ?? undefined}
          tags={entryTags(entry)}
          marks={entryMarks(entry)}
          presentationName={presentation?.name}
          presentationColor={presentation?.color}
        />
      {/each}
    </DayCard>
  {/each}
</div>
