<script lang="ts">
  /* A letter as a retrospective fact (phase 5 deepening ticket 13).

     One row for the three surfaces that resurface an unlocked letter - the
     annual wrapped's letters section, an on-this-day lookback, and Safe
     Space's own list (phase 8 features ticket 21) - so they cannot drift
     into reading the same letter differently. The card takes the letter and
     why it surfaced, and owns nothing else: the tap goes to the letter
     itself, the one place its full text is read.

     `lead` says which of the two lines the row leads with, and it is the
     one thing the three surfaces genuinely disagree about. A retrospective
     leads with the date because the date is why the letter is there at all
     ("this day, last year"). Safe Space has no candidate day and no reason
     to lead with one: it is reaching for what a person's past self said,
     and a date is the least identifying fact about a letter - so the words
     lead there and the date drops to the line under them. Same rule the
     search hit row already follows for the same reason (kit.css,
     `[data-search-hit] .kit-row-title`).

     Either way the text is `letterOpening`'s, not the letter's: the row's
     two-line clamp is CSS and cuts the paint rather than the text, so the
     whole letter would otherwise be the link's accessible name.

     Only an unlocked letter can reach here - letterRetrospective.ts answers
     the seal question before a caller has one - so the card draws no lock
     and never meets a sealed text. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import type { Letter } from '$lib/data/types';
  import {
    letterOpening,
    LETTER_OPENING_LIMIT,
    type RetrospectiveLetter
  } from '$lib/data/letterRetrospective';
  import ListRow from './kit/ListRow.svelte';

  let {
    letter,
    kind,
    lead = 'date'
  }: {
    letter: Letter;
    kind: RetrospectiveLetter['kind'];
    /** Which line the row leads with. `date` is the retrospectives';
        `text` is Safe Space's. */
    lead?: 'date' | 'text';
  } = $props();

  let label = $derived(
    kind === 'written'
      ? m.look_back_letter_written({ date: fmtDay(letter.epochDay, { day: 'numeric', month: 'short', year: 'numeric' }) })
      : m.look_back_letter_opened({ date: fmtDay(letter.unlockEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }) })
  );
  let opening = $derived(letterOpening(letter.text, LETTER_OPENING_LIMIT));
</script>

<ListRow
  key={letter.id}
  data-list-row="letter-preview"
  data-lead={lead}
  data-letter={letter.id}
  icon="book"
  title={lead === 'text' ? opening : label}
  subtitle={lead === 'text' ? label : opening}
  href={`/settings/letters/${letter.id}`}
/>
