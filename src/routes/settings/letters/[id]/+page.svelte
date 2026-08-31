<script lang="ts">
  /* One letter, read-only (phase 5 deepening ticket 13).

     The deep link the retrospective surfaces take: a look-back card in
     wrapped or on-this-day names this route, so a letter resurfaced from
     months ago opens on its own text rather than on a list the reader has
     to find the row in. Writing and deleting stay on the letters screen -
     this page answers one question, "what did I write?", and a sealed
     letter answers it the way the letters screen already does: with the
     day it opens, and not a word of the text (spec: sealed contents are
     out of scope under any circumstance). */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { isLetterSealed } from '$lib/data/letterStatus';
  import { smartBack } from '$lib/navigation/smart-back';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';

  const id = page.params.id ?? '';
  let today = $derived(todayEpochDay());

  let letterQuery = liveQuery((j) => j.letters.getLetter(id));
  let letter = $derived(letterQuery.value);

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<div class="screen">
  <ScreenHeader title={m.letters_title()} screen="letters" back={() => smartBack('/settings/letters')} />

  {#if letterQuery.loading}
    <Skeleton variant="card" count={1} />
  {:else if !letter}
    <!-- A resurfaced letter can outlive its row: the card that linked here
         does not re-check, and the letter may have been deleted from the
         letters screen in between. Say so rather than showing nothing. -->
    <Notice
      icon="book"
      key="letters-gone"
      title={m.letters_gone_title()}
      text={m.letters_gone_body()}
      action={{ label: m.letters_title(), href: '/settings/letters' }}
      aria-live="polite"
    />
  {:else if isLetterSealed(letter, today)}
    <SectionHeading text={m.letters_sealed_title()} />
    <p class="muted">{m.letters_sealed_until({ date: dayLabel(letter.unlockEpochDay) })}</p>
  {:else}
    <SectionHeading text={dayLabel(letter.epochDay)} />
    <p class="letter-text" data-letter-text>{letter.text}</p>
  {/if}
</div>

<style>
  /* The letters screen's own prose treatment, carried over rather than
       reinvented: a letter keeps prose's measure and line height. The class
       name travels with it deliberately - app.css's user-select opt-in list
       matches `.letter-text` by name, so renaming it here would silently
       take the letter's text back out of selectable copy. */
  .letter-text {
    white-space: pre-wrap;
    line-height: var(--leading-body);
    max-width: 65ch;
  }
</style>
