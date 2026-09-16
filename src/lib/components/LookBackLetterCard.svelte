<script lang="ts">
  /* A letter as a retrospective fact (phase 5 deepening ticket 13).

     One row for the three surfaces that resurface an unlocked letter - the
     annual wrapped's letters section, an on-this-day lookback, and Safe
     Space's own list (phase 8 features ticket 21) - so they cannot drift
     into reading the same letter differently. The card takes the letter and
     why it surfaced, and owns nothing else: the tap goes to the letter
     itself, the one place its full text is read.

     The row leads with the date, because on both surfaces left the date is
     why the letter is there at all ("this day, last year"). It carried a
     `lead` prop for Safe Space's third surface, which led with the words
     instead - Safe Space had no candidate day and no reason to lead with
     one. Phase 11 ticket 15 folded that surface into the letters screen,
     which draws its own `LetterCard`, so the choice has no caller and the
     prop is gone rather than left as an option nobody takes.

     The text is `letterOpening`'s, not the letter's: the row's
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
    kind
  }: {
    letter: Letter;
    kind: RetrospectiveLetter['kind'];
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
  data-letter={letter.id}
  icon="book"
  title={label}
  subtitle={opening}
  href={`/transition/letters/${letter.id}`}
/>
