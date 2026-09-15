<script lang="ts">
  /* What you put aside for yourself: the unlocked letters and the starred
     photos (phase 10 redesign ticket 47).

     Both were sections inside Safe space, a third and a half of the way
     down a 5908px scroll that opened on a breathing exercise nobody could
     reach without passing them. Ticket 47 turned that scroll into one
     screenful and a run of ways down; this is the first of them.

     Nothing here was rebuilt. The letters keep their three-row bound and
     their handover to the letters screen, the photos keep their six and
     the starred shelf, and both keep the reasons written against those
     numbers in the screen they came from - a glance rather than a second
     gallery grafted on. What is new is that the glance is now the whole
     screen rather than a band in the middle of one, and that the screen
     says something when there is nothing to show, which a section that
     simply did not render never had to.

     Purely a read (ADR-0037). */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { safeSpaceLetters } from '$lib/data/letterRetrospective';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import LookBackLetterCard from '$lib/components/LookBackLetterCard.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /** How far back the featured letter looks - letterRetrospective.ts's own
      bound, reused rather than re-guessed (LETTER_RETROSPECTIVE_LIMIT). */
  const LETTER_LOOKBACK = 200;
  /* Unlocked letters shown before the section hands over to the letters
     screen (phase 8 features ticket 21). Three, because a letter is the
     longest thing on this screen and somebody who has written twenty of
     them should meet a glance here and not a second letters screen. The
     rest are one tap away rather than gone.

     Each row shows the day the letter was written and the opening of its
     text, clamped by the kit row's own two-line rule, and the tap opens the
     whole letter on /transition/letters/[id]. Neither half works alone: a
     date-only row asks somebody mid-crisis to gamble a navigation on a
     letter they cannot place, and no letter is reachable from here in
     truncated form only. */
  const LETTER_LIMIT = 3;
  /* Starred photos shown, most recently starred-shelf-worthy first. Bounded
     so a large starred collection stays a glance; the shelf itself
     (/search/starred) is unbounded and one tap further. Six thumbnails
     decoding and painting at once is the cost being bounded - the decrypt
     itself is ~0.02ms per thumbnail, measured. */
  const PHOTO_LIMIT = 6;

  let today = $derived(todayEpochDay());

  let lettersQuery = liveList((j) => j.letters.getLetters(LETTER_LOOKBACK));
  let unlockedLetters = $derived(safeSpaceLetters(lettersQuery.rows, today));
  let letters = $derived(unlockedLetters.slice(0, LETTER_LIMIT));

  let starredPhotosQuery = liveList((j) => j.photos.starredPhotos());
  // Most recently starred-shelf-worthy first: starredPhotos() itself reads
  // oldest first (CONTEXT: "Starred", the shelf's own order), and a crisis
  // screen's glance at them wants the newest, not the earliest.
  let recentStarredPhotos = $derived([...starredPhotosQuery.rows].reverse().slice(0, PHOTO_LIMIT));

  /* Both reads behind one gate rather than section by section: two lists
     resolving 350ms apart popped the photo grid in under the letters and
     shifted everything below it, which is the same reason the screen these
     came from held all seven of its queries together (ticket 113). */
  let loading = $derived(lettersQuery.loading || starredPhotosQuery.loading);
</script>

<div class="screen">
  <ScreenHeader title={m.safe_space_moments_title()} back="/doubt" screen="safe-space-moments" />

  {#if loading}
    <div out:crossfade><Skeleton variant="card" count={2} /></div>
  {:else if letters.length === 0 && recentStarredPhotos.length === 0}
    <Notice
      icon="bookmark"
      key="safe-space-moments-empty"
      role={roleAt(activeFlag.roles, 0)}
      title={m.safe_space_moments_empty_title()}
      text={m.safe_space_moments_empty_body()}
    />
  {:else}
    {#if letters.length}
      <p class="muted small" style="margin-bottom:var(--space-2)">{m.safe_space_letters_intro({ count: letters.length })}</p>
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        <!-- LookBackLetterCard's `kind` is normally the retrospective's own
             finding - written that day, or opened that day. There is no
             candidate day here, only the letters themselves, and Safe space
             wants one framing regardless: this is what your past self wrote
             you, deliberately, so `written` is hardcoded rather than
             derived. `lead` follows from the same thing: with no candidate
             day, the date is the least identifying fact about a letter, so
             the words lead the row and the date sits under them. -->
        {#each letters as unlocked (unlocked.id)}
          <LookBackLetterCard letter={unlocked} kind="written" lead="text" />
        {/each}
      </ListCard>
      <!-- The way out sits under the card rather than as a last row in it,
           which is where this screen's siblings put the same gesture. A row
           inside the card wore the letters' own book disc and chevron and
           read as a fourth letter. -->
      {#if unlockedLetters.length > LETTER_LIMIT}
        <a class="btn btn-soft btn-block press" data-all-letters href="/transition/letters">
          <span>{m.safe_space_letters_all({ count: unlockedLetters.length - LETTER_LIMIT })}</span>
        </a>
      {/if}
    {/if}

    {#if recentStarredPhotos.length}
      <p class="muted small" style="margin-bottom:var(--space-2)">{m.safe_space_photos_intro()}</p>
      <div class="photo-grid" data-safe-space-photos>
        {#each recentStarredPhotos as p (p.id)}
          <PhotoThumb photo={p} size={104} />
        {/each}
      </div>
    {/if}
  {/if}
</div>
