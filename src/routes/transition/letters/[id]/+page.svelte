<script lang="ts">
  /* Retrospective surfaces link directly to a read-only letter. Reuse
     LetterCard so sealed letters show the opening date and countdown without
     exposing text. Open letters start unfolded. Writing and deleting stay on
     the list.

     The Home tile links to /transition/letters?read= for the arrival on the
     list. Showing an open letter here also marks it read and clears that
     tile on the next Home visit. Leave sealed and missing letters unread. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { currentDay } from '$lib/stores/today.svelte';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { isLetterSealed, markLetterRead } from '$lib/data/letterStatus';
  import { acknowledgementStore } from '$lib/data/prefs/acknowledgementStore.svelte';
  import LetterCard from '$lib/components/LetterCard.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let id = $derived(page.params.id ?? '');
  let today = $derived(currentDay());

  let letterQuery = liveQuery((j) => j.letters.getLetter(id));
  let letter = $derived(letterQuery.value);

  $effect(() => {
    if (letter?.id === id && !isLetterSealed(letter, today)) markLetterRead(id, acknowledgementStore);
  });
</script>

<div class="screen">
  <ScreenHeader title={m.letters_title()} screen="letters" back="/transition/letters" />

  {#if letterQuery.loading}
    <div out:crossfade><Skeleton variant="card" count={1} /></div>
  {:else if !letter}
    <!-- A resurfaced letter can outlive its row: the card that linked here
         does not re-check, and the letter may have been deleted from the
         letters screen in between. Say so rather than showing nothing. -->
    <Notice
      icon="envelope"
      key="letters-gone"
      title={m.letters_gone_title()}
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
