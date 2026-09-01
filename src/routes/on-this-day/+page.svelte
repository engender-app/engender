<script lang="ts">
  /* On-this-day (phase 4 features ticket 03, rebuilt by phase 5 UX ticket
     23, which closes spec 05). One screen, however many of the three
     lookbacks - a month, six months, a year - clear the good-day bar today;
     a lookback that does not clear it is left out entirely rather than shown
     with a caveat (CONTEXT: Good day is an absolute rule, not a suggestion).

     It shows what was written. `CONTEXT.md` defines on-this-day as offering
     what was logged a month, six months or a year before today, and the
     screen this replaces showed three stat tiles and a mood chart and never
     a word anyone wrote. That was not a missing feature so much as an
     implementation that drifted from the recorded domain model, which makes
     the glossary the specification.

     What went, and why each. The mood chart needed two points and had a
     one-day range, so it could never draw. The three tiles - an entry count,
     a best streak, an average mood - restated over one day that a day
     exists, and an entry count sitting above a list of that many entries is
     noise. The recap read behind all four is gone with them: `entriesForDay`
     is what a day's entries come from, and it is the read the day screen and
     Home already use.

     The photos stay, because a photo from that day is exactly the kind of
     thing worth resurfacing. They come off the entries rather than out of
     the recap's own highlight query, so what is shown is every photo from
     that day rather than a spread across a range one day wide.

     The good-day rule is untouched. This screen changed what a resurfaced
     day shows, not which days resurface. So is the `?lookback=` deep link,
     which a notification uses (ADR-0028). */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { smartBack } from '$lib/navigation/smart-back';
  import { entryMarks } from '$lib/data/recentEntries';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { entryPresentation } from '$lib/data/vocabulary/entryPresentation';
  import { onThisDayCandidates, type OnThisDayLookback } from '$lib/data/on-this-day';
  import { onThisDayLetters, LETTER_RETROSPECTIVE_LIMIT, type RetrospectiveLetter } from '$lib/data/letterRetrospective';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import type { Entry } from '$lib/data/types';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import LookBackLetterCard from '$lib/components/LookBackLetterCard.svelte';
  import DayCard from '$lib/components/kit/DayCard.svelte';
  import DayEntry from '$lib/components/kit/DayEntry.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';

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
       day (phase 5 deepening ticket 13). Sealed ones are already out:
       letterRetrospective.ts answers the seal question, not this screen. */
    letters: RetrospectiveLetter[];
  }

  /* The preference is read inside the query, before the first await, so that
     turning on-this-day off stops the reads themselves rather than just
     hiding what they returned (same rule wrapped's own route follows).

     Up to three good-day checks, up to three per-day entry reads, and the
     one letters read, where this used to run three aggregate recaps. All
     are bounded by the day or by the letters read's own limit rather than
     by the journal's length, and the entry read only happens for a day that
     already qualified. A day qualifies on its letters too: a letter's own
     anniversary is the letter's, not the day's, so a lookback with a letter
     and a bad mood still shows the letter - the good-day bar governs
     resurfacing a *day*, and this card is about the letter. */
  let daysQuery = liveList(async (j) => {
    if (!prefs.onThisDayEnabled) return [];
    const letters = await j.letters.getLetters(LETTER_RETROSPECTIVE_LIMIT);
    const results = await Promise.all(
      candidates.map(async (c): Promise<QualifyingDay | null> => {
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
    (daysQuery.rows).map((d) => ({
      ...d,
      title: LOOKBACK_TITLE[d.key](),
      date: fmtDay(d.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }),
      /* Every photo from that day, oldest entry first, rather than the
         recap's spread-across-the-range pick: over one day there is no range
         to spread across. */
      photos: d.entries.flatMap((entry) => entry.photos)
    }))
  );

  /* A wrapped/on-this-day notification (phase 4 features ticket 04) deep-links
     here with ?lookback= naming the day that triggered it, since this route
     otherwise has no way to point at one of several qualifying lookbacks.
     Scrolled to rather than the only thing shown - the other qualifying
     lookbacks stay on the page, the same as opening this route any other way. */
  $effect(() => {
    if (!days.length) return;
    const lookback = page.url.searchParams.get('lookback');
    if (!lookback) return;
    document.getElementById(`on-this-day-${lookback}`)?.scrollIntoView({ block: 'start' });
  });
</script>

<div class="screen">
  <ScreenHeader title={m.on_this_day()} screen="on-this-day" back={() => smartBack('/')} />

  {#if !prefs.onThisDayEnabled}
    <Notice
      icon="info"
      key="on-this-day-off"
      title={m.on_this_day_off_title()}
      text={m.on_this_day_off_body()}
      action={{ label: m.nav_settings(), href: '/settings' }}
      aria-live="polite"
    />
  {:else if daysQuery.loading}
    <Skeleton variant="card" count={2} />
  {:else if !days.length}
    <Notice
      icon="info"
      key="on-this-day-none"
      title={m.on_this_day_none_title()}
      text={m.on_this_day_none_body()}
    />
  {:else}
    {#each days as d, i (d.key)}
      <!-- Two headings, saying two different things: how long ago it was,
           which is what this screen is about, and which day it actually was,
           which is the day card's own bar. -->
      <section id="on-this-day-{d.key}" data-lookback={d.key}>
        <!-- The whole day, not just what this screen chose to resurface
             (deepening ticket 21). This screen shows a look-back day's
             entries and its letters; the day itself now has somewhere to be
             read whole, and the heading's own action line is where a link
             out of an area goes. -->
        <SectionHeading text={d.title}>
          {#snippet action()}
            <a class="kit-heading-action" data-lookback-open={d.key} href={`/day/${d.epochDay}`}>{m.day_open_whole()}</a>
          {/snippet}
        </SectionHeading>
        <!-- No count on the bar. Spec 05 is explicit that "an entry count
             above a list of that many entries is noise", and it is the same
             argument that took the three stat tiles off this screen - the
             entries are right there to be counted. -->
        {#if d.entries.length}
          <DayCard key={String(d.epochDay)} role={roleAt(activeFlag.roles, i)} date={d.date}>
            {#each d.entries as entry (entry.id)}
              <!-- It opens, the same way an entry opens everywhere else it is
                   drawn. A day you are being shown and cannot read back is a
                   dead end. -->
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
        {/if}

        {#if d.letters.length}
          <!-- Written that day, or unlocked that day - the card says which,
               and opens the letter itself. A section can be letters alone:
               the good-day bar governs resurfacing a day, not a letter. -->
          <ListCard role={roleAt(activeFlag.roles, i)}>
            {#each d.letters as rl (rl.letter.id)}
              <LookBackLetterCard letter={rl.letter} kind={rl.kind} />
            {/each}
          </ListCard>
        {/if}

        {#if d.photos.length}
          <div class="otd-photos" data-lookback-photos>
            {#each d.photos as photo (photo.id)}
              <PhotoThumb {photo} size={88} />
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  {/if}
</div>
