<script lang="ts">
  /* On this day, as a block (phase 11 ticket 07): however many of the three
     lookbacks - a month, six months, a year - clear the good-day bar today,
     each as its heading, the whole day one tap away, the day's entries, its
     letters and its photos. It was the whole of `/on-this-day`; it draws in
     two places now - opened in place under the Look back door's tile, and
     on that route, which stays because a notification deep-links to it
     with `?lookback=` (ADR-0028).

     A lookback that does not clear the bar is left out entirely rather than
     shown with a caveat (CONTEXT: Good day is an absolute rule, not a
     suggestion). It shows what was written: the screen this grew out of
     used to show three stat tiles and a mood chart and never a word anyone
     wrote. The photos come off the entries, so what is shown is every photo
     from that day.

     The preference is read inside the query, before the first await, so
     that turning on-this-day off stops the reads themselves. Up to three
     good-day checks, up to three per-day entry reads, and the one letters
     read, all bounded by the day or by the letters read's own limit. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { entryMarks } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { entryPresentation } from '$lib/data/vocabulary/entryPresentation';
  import { onThisDayCandidates, type OnThisDayLookback } from '$lib/data/on-this-day';
  import { onThisDayLetters, LETTER_RETROSPECTIVE_LIMIT, type RetrospectiveLetter } from '$lib/data/letterRetrospective';
  import { touchesMutedEra } from '$lib/data/resurfacingConsent';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import type { Entry } from '$lib/data/types';
  import { crossfade } from '$lib/motion/reveal';
  import Skeleton from './Skeleton.svelte';
  import ResurfacedPhoto from './ResurfacedPhoto.svelte';
  import LookBackLetterCard from './LookBackLetterCard.svelte';
  import DayCard from './kit/DayCard.svelte';
  import DayEntry from './kit/DayEntry.svelte';
  import ListCard from './kit/ListCard.svelte';
  import Notice from './kit/Notice.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';

  let {
    scrollTo = null
  }: {
    /** The lookback a notification named (`?lookback=`), scrolled to once
        the days have landed. Scrolled to rather than the only thing shown:
        the other qualifying lookbacks stay on the page. */
    scrollTo?: string | null;
  } = $props();

  const today = todayEpochDay();
  const candidates = onThisDayCandidates(today);

  const LOOKBACK_TITLE: Record<OnThisDayLookback, () => string> = {
    year: () => m.on_this_day_year_title(),
    sixMonths: () => m.on_this_day_six_months_title(),
    month: () => m.on_this_day_month_title()
  };

  interface QualifyingDay {
    key: OnThisDayLookback;
    epochDay: number;
    entries: Entry[];
    /* Letters this lookback resurfaces - written that day, or unlocked that
       day (phase 5 deepening ticket 13). Sealed ones are already out. */
    letters: RetrospectiveLetter[];
  }

  let daysQuery = liveList(async (j) => {
    if (!prefs.onThisDayEnabled) return [];
    const [letters, eras, mutedEraUuids] = await Promise.all([
      j.letters.getLetters(LETTER_RETROSPECTIVE_LIMIT),
      j.eras.getEras(),
      j.eraMutes.getMutedEraUuids()
    ]);
    const results = await Promise.all(
      candidates.map(async (c): Promise<QualifyingDay | null> => {
        // A muted era's day resurfaces nothing at all - not the entries,
        // not the letters - so this is checked before either read.
        if (touchesMutedEra(eras, mutedEraUuids, c.epochDay, c.epochDay)) return null;
        const dayLetters = onThisDayLetters(letters, c.epochDay, today);
        const good = await j.stats.isGoodDay(c.epochDay);
        if (!good && dayLetters.length === 0) return null;
        return {
          key: c.key,
          epochDay: c.epochDay,
          entries: good ? await j.entries.entriesForDay(c.epochDay) : [],
          letters: dayLetters
        };
      })
    );
    return results.filter((d): d is QualifyingDay => d !== null);
  });

  let days = $derived(
    daysQuery.rows.map((d) => ({
      ...d,
      title: LOOKBACK_TITLE[d.key](),
      date: fmtDay(d.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }),
      photos: d.entries.flatMap((entry) => entry.photos)
    }))
  );

  $effect(() => {
    if (!days.length || !scrollTo) return;
    document.getElementById(`on-this-day-${scrollTo}`)?.scrollIntoView({ block: 'start' });
  });
</script>

{#if daysQuery.loading}
  <div out:crossfade><Skeleton variant="card" count={2} /></div>
{:else if !days.length}
  <Notice icon="info" key="on-this-day-none" title={m.on_this_day_none_title()} text={m.on_this_day_none_body()} />
{:else}
  {#each days as d, i (d.key)}
    <!-- Two headings, saying two different things: how long ago it was,
         and which day it actually was, which is the day card's own bar. -->
    <section id="on-this-day-{d.key}" data-lookback={d.key}>
      <SectionHeading text={d.title}>
        {#snippet action()}
          <a class="kit-heading-action" data-lookback-open={d.key} href={`/day/${d.epochDay}`}>{m.day_open_whole()}</a>
        {/snippet}
      </SectionHeading>
      <!-- No count on the bar: an entry count above a list of that many
           entries is noise (spec 05). -->
      {#if d.entries.length}
        <DayCard key={String(d.epochDay)} role={roleAt(activeFlag.roles, i)} date={d.date}>
          {#each d.entries as entry (entry.id)}
            {@const presentation = entryPresentation(entry)}
            <DayEntry
              key={String(entry.id)}
              href={`/entry/${entry.id}`}
              time={fmtTime(entry.timestamp)}
              mood={entry.mood}
              note={entry.note ?? undefined}
              tags={entryTags(entry)}
              marks={entryMarks(entry)}
              {presentation}
            />
          {/each}
        </DayCard>
      {/if}

      {#if d.letters.length}
        <!-- Written that day, or unlocked that day - the card says which. -->
        <ListCard role={roleAt(activeFlag.roles, i)}>
          {#each d.letters as rl (rl.letter.id)}
            <LookBackLetterCard letter={rl.letter} kind={rl.kind} />
          {/each}
        </ListCard>
      {/if}

      {#if d.photos.length}
        <div class="otd-photos" data-lookback-photos>
          {#each d.photos as photo (photo.id)}
            <ResurfacedPhoto {photo} size={88} />
          {/each}
        </div>
      {/if}
    </section>
  {/each}
{/if}
