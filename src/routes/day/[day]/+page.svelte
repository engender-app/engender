<script lang="ts">
  /* One day (phase 5 ticket 22), rebuilt on the kit.

     What it was: a screen title, the full date on a line of its own, a
     `.card` holding nothing but the entry count, and then the entries as
     `.day-entry-row` - a hand-built time gutter beside an `EntryCard`,
     which is the shape ticket 20 turned into the day card's timeline.

     It is one day card now, so the date and the count are the bar's two
     halves rather than three separate lines above the list, and the entries
     are the same timeline they are on Home. The header keeps the weekday,
     which is what the bar does not repeat.

     `day` still accepts `today` or an epoch-day number, and still reads it
     as a `$derived` rather than a const: a same-route navigation between two
     days reuses this component, and a plain const would keep the first day
     it saw (see the stale-params note on /entry/[id]). */
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { smartBack } from '$lib/navigation/smart-back';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { entryMarks } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import DayCard from '$lib/components/kit/DayCard.svelte';
  import DayEntry from '$lib/components/kit/DayEntry.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';

  let epochDay = $derived(page.params.day === 'today' ? todayEpochDay() : Number(page.params.day));
  let isToday = $derived(epochDay === todayEpochDay());

  /* The query reads `epochDay` before its first await, which is what makes it
     re-run on navigation - see liveQuery's contract. */
  let dayEntries = liveQuery((j) => j.entries.entriesForDay(epochDay));
  let entries = $derived(dayEntries.value ?? []);

  /* One area, so one role, and role 0 - the only index guaranteed to be a
     colour on all 8 palettes. A screen with a single coloured area has no
     reading order to follow. */
  let role = $derived(roleAt(activeFlag.roles, 0));
</script>

<div class="screen" data-screen>
  <ScreenHeader
    title={isToday ? m.today() : fmtDay(epochDay, { weekday: 'long' })}
    screen="day"
    back={() => smartBack('/calendar')}
  />

  {#if dayEntries.loading}
    <Skeleton variant="card" count={2} />
  {:else if entries.length}
    <DayCard
      key={String(epochDay)}
      {role}
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
  {:else}
    <Notice
      icon="book"
      key="day-empty"
      {role}
      title={m.nothing_logged()}
      text={m.nothing_logged_body()}
    />
  {/if}

  <div class="day-add">
    <button class="btn btn-soft" data-add onclick={() => goto(`/entry/new/${epochDay}`)}>
      <Icon name="plus" size={20} /><span>{m.add_another_entry()}</span>
    </button>
  </div>
</div>
