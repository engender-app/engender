<script lang="ts">
  /* On this day draws qualifying days, letters and photos on Look back and
     its own route. Journal bounds limit annual checks; resurfacing consent
     removes muted days before any good-day or entry read. */
  import { scrollBehavior } from '$lib/motion/tokens';
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import { fmtDayBar, fmtTime } from '$lib/data/dates';
  import { currentDay } from '$lib/stores/today.svelte';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { tablesReadBy } from '$lib/data/live/writes';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { surfaceOn } from '$lib/unprompted/registry';
  import { entryMarks } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { entryPresentation } from '$lib/data/vocabulary/entryPresentation';
  import { onThisDayCandidates, onThisDayQualifies, type OnThisDayLookback } from '$lib/data/on-this-day';
  import { onThisDayLetters, LETTER_RETROSPECTIVE_LIMIT, type RetrospectiveLetter } from '$lib/data/letterRetrospective';
  import { resurfacing } from '$lib/unprompted/resurfacing';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import type { Entry } from '$lib/data/types';
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
    /** Optional section named by a pinned launch route. */
    scrollTo?: string | null;
  } = $props();

  const today = $derived(currentDay());
  const LOOKBACK_TITLE: Record<'year' | 'sixMonths' | 'month', () => string> = {
    year: () => m.on_this_day_year_title(),
    sixMonths: () => m.on_this_day_six_months_title(),
    month: () => m.on_this_day_month_title()
  };

  interface QualifyingDay {
    key: OnThisDayLookback;
    epochDay: number;
    /** Whole years back, set on the annual anniversaries past the first. */
    years?: number;
    entries: Entry[];
    /* Letters this lookback resurfaces - written that day, or unlocked that
       day. Sealed ones are already out. */
    letters: RetrospectiveLetter[];
  }

  /* Seed reads made after the first await to avoid a duplicate query. */
  let daysQuery = liveList(async (j) => {
    if (!surfaceOn(prefs.surfaceOverrides, 'on-this-day')) return [];
    // Read before the first await, so the query re-runs when the day changes.
    const asOf = today;
    const [letters, consent, bounds] = await Promise.all([
      j.letters.getLetters(LETTER_RETROSPECTIVE_LIMIT),
      resurfacing('on-this-day', j),
      j.eras.getJournalBounds()
    ]);
    const earliest = Math.min(bounds?.firstEpochDay ?? asOf, ...letters.map((letter) => letter.epochDay));
    const lookbacks = onThisDayCandidates(asOf, earliest);
    const results = await Promise.all(
      consent.allowedDays(lookbacks).map(async (c): Promise<QualifyingDay | null> => {
        const dayLetters = onThisDayLetters(letters, c.epochDay, asOf);
        const good = await j.stats.isGoodDay(c.epochDay);
        if (!onThisDayQualifies(good, dayLetters)) return null;
        return {
          key: c.key,
          epochDay: c.epochDay,
          years: c.years,
          entries: good ? await j.entries.entriesForDay(c.epochDay) : [],
          letters: dayLetters
        };
      })
    );
    return results.filter((d): d is QualifyingDay => d !== null);
  }, [...tablesReadBy('stats', 'isGoodDay'), ...tablesReadBy('entries', 'entriesForDay')]);

  let days = $derived(
    daysQuery.rows.map((d) => ({
      ...d,
      title: d.years !== undefined ? m.on_this_day_years_title({ years: m.n_years({ n: d.years }) }) : LOOKBACK_TITLE[d.key as 'year' | 'sixMonths' | 'month'](),
      date: fmtDayBar(d.epochDay, today),
      photos: d.entries.flatMap((entry) => entry.photos)
    }))
  );

  /* Once per target: `days` is replaced on every refresh of the query, and
     scrolling again each time would pull the page back from wherever the
     reader had moved on to. */
  let scrolledTo: string | null = null;
  $effect(() => {
    if (!days.length || !scrollTo || scrolledTo === scrollTo) return;
    scrolledTo = scrollTo;
    document.getElementById(`on-this-day-${scrollTo}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  });

  /* Latched: a reserve must not put its placeholder back. */
  let onThisDayRevealed = $state(false);
  $effect.pre(() => {
    if (!onThisDayRevealed && (!daysQuery.loading)) onThisDayRevealed = true;
  });
  const onThisDayEstimate = readReserve('on-this-day');
  const onThisDayRemember = (px: number) => rememberReserve('on-this-day', px);
</script>

<!-- Held at last visit's height until the look-back has answered, then faded in: the days cut in at full opacity over the skeleton. -->
<ReadReserve ready={onThisDayRevealed} estimate={onThisDayEstimate} onrest={onThisDayRemember}>
  {#if !days.length}
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
          <DayCard key={String(d.epochDay)} role={roleAt(activeFlag.roles, i)} heading={d.date}>
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
</ReadReserve>
