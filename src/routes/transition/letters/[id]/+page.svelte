<script lang="ts">
  /* One letter, read-only (phase 5 deepening ticket 13; the read-tracking
     effect below is ticket 01's ready-letter tile).

     The deep link the retrospective surfaces take: a look-back card in
     wrapped or on-this-day names this route, so a letter resurfaced from
     months ago opens on its own text rather than on a list the reader has
     to find the row in. Writing and deleting stay on the letters screen -
     this page answers one question, "what did I write?", and a sealed
     letter answers it the way the letters screen already does: with the
     day it opens, and not a word of the text (spec: sealed contents are
     out of scope under any circumstance).

     Ticket 45: "the way the letters screen already does" is now a card
     rather than a heading and a grey line, so this route draws the same
     `LetterCard` rather than a second version of it. A sealed letter
     reached by deep link then looks as sealed as one in the list - the
     countdown on blocks, the day it opens, and nothing pressable towards
     the text - and an unlocked one arrives already unfolded, because a
     route that exists to show one letter has nothing to unfold from.

     What this route does not take is the arrival. The arrival is a moment
     on the letters screen and the only surfaces that link here name one
     specific older letter on purpose - Safe Space, wrapped, on-this-day -
     which is somebody choosing a letter rather than being met by one. The
     ready-letter tile, the one path where a letter's own day is the reason
     for the visit, goes to `/transition/letters?read=`, where the arrival
     lives.

     Opening this route is also how that tile resolves (ticket 01): once the
     letter's actual text has been shown - never for the sealed or gone
     branches, which never showed it - it is marked read, which clears the
     tile on the next Home visit. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { isLetterSealed, markLetterRead } from '$lib/data/letterStatus';
  import LetterCard from '$lib/components/LetterCard.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const id = page.params.id ?? '';
  let today = $derived(todayEpochDay());

  let letterQuery = liveQuery((j) => j.letters.getLetter(id));
  let letter = $derived(letterQuery.value);

  $effect(() => {
    if (letter && !isLetterSealed(letter, today)) markLetterRead(id);
  });
</script>

<div class="screen">
  <ScreenHeader title={m.letters_title()} screen="letters" back="/transition/letters" />

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
      action={{ label: m.letters_title(), href: '/transition/letters' }}
      aria-live="polite"
    />
  {:else}
    <div class="screen-part letter-one" {...roleAttrs(roleAt(activeFlag.roles, 0))}>
      <LetterCard {letter} {today} read open={!isLetterSealed(letter, today)} />
    </div>
  {/if}
</div>

<style>
  /* The list's own flush treatment with one card in it, so a letter reached
     by deep link sits between the same two hairlines it would in the list. */
  .letter-one {
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
  }
</style>
