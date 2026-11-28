<script lang="ts">
  /* A sealed letter shows its wait in 40px role-coloured blocks. The blocks
     and the written duration share durationParts. The card exposes calendar
     handoff and deletion. Its contents stay inaccessible until opening day.

     An unread open letter shows a marker beside the date. Once read, the
     folded card clamps the same paragraph to two lines. Opening removes the
     clamp and reveals the paragraph downward, keeping its typography and
     starting height.

     Measure the folded height before changing layout and pass it to
     maskHeight. ResizeObserver would start after the expanded box had
     already painted, which let a 149px frame appear before the motion
     from 105px. */
  import { tick, untrack } from 'svelte';
  import { navigating } from '$app/state';
  import Icon from './Icon.svelte';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { calendarDuration, durationParts } from '$lib/data/epochDay';
  import type { DurationUnit } from '$lib/data/epochDay';
  import { collapse, crossfade, maskHeight } from '$lib/motion/reveal';
  import { isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import type { Letter } from '$lib/data/types';

  let {
    letter,
    today,
    read,
    open = false,
    onopen,
    onclose,
    oncalendar,
    ondelete
  }: {
    letter: Letter;
    today: number;
    /** Whether this letter's text has been shown before. It changes the mark
        beside the date and nothing else about the drawing. */
    read: boolean;
    open?: boolean;
    /** Pressed the card. Absent on a sealed card, which never opens. */
    onopen?: () => void;
    onclose?: () => void;
    /** Marking the unlock day on a real calendar - a sealed card's own
        control, since a sealed card takes no press of its own. */
    oncalendar?: () => void;
    ondelete?: () => void;
  } = $props();

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  let sealed = $derived(letter.unlockEpochDay > today);
  let parts = $derived(durationParts(calendarDuration(today, letter.unlockEpochDay)));

  const UNIT_WORD: Record<DurationUnit, (n: number) => string> = {
    years: (n) => m.unit_years({ n }),
    months: (n) => m.unit_months({ n }),
    days: (n) => m.unit_days({ n })
  };

  /** Whether this card folds at all. A caller that handed over neither an
      open nor a close does not have a second state to put the card in - the
      letter's own route draws one card, already unfolded. */
  let folds = $derived(onopen !== undefined || onclose !== undefined);

  let card: HTMLElement | null = $state(null);

  /* Measure, flip, then mask from what was measured. The measurement has to
     happen before the state changes and the mask has to be started before
     the browser paints the new layout, which is what `tick()` buys: it
     resolves once Svelte has written the DOM and before the frame ends.

     Keyed on `open` itself rather than on this card's own press, because
     the arrival opens the card from a button of its own: that path flipped
     the prop with no mask and the whole letter landed in one frame (after-
     release 26, which also took the folded lines away and so made the
     jump 116px). `$effect.pre` runs before this card's DOM is written, so
     the height it reads is still the old one. */
  let maskedOpen = untrack(() => open);
  $effect.pre(() => {
    const next = open;
    if (next === maskedOpen) return;
    maskedOpen = next;
    if (!folds || isReducedMotion() || !card) return;
    const from = card.getBoundingClientRect().height;
    void tick().then(() => {
      if (card) maskHeight(card, from, motionDuration('--dur-med'));
    });
  });

  function toggle() {
    if (open) onclose?.();
    else onopen?.();
  }

  /* Tile's panel contract, and the same reasoning: `|global` because what creates and
     destroys a card is the caller's `{#each}`, a parent block a local transition never
     sees, and `skip` so a screen leaving does not spend --dur-slow folding its letters up
     on the way out.

     A function called as the transition starts, not a `$derived`: Svelte reads the params
     again when the outro starts, and a derived read from a card that is already being
     destroyed hands back its value from mount - `skip: false` - and warns
     (`derived_inert`), once per card on every navigation off a screen of letters. The cards
     still did not fold, but only because the screen's arrival window also stands `collapse`
     down (screenArrival.ts). */
  const panel = () => ({ skip: navigating.to !== null });
</script>

{#snippet trailing()}
  <div class="letter-acts">
    {#if oncalendar}
      <button
        type="button"
        class="letter-act press"
        data-letter-calendar={letter.id}
        aria-label={m.calendar_handoff_button()}
        onclick={oncalendar}
      >
        <Icon name="calendar" size={18} />
      </button>
    {/if}
    {#if ondelete}
      <button
        type="button"
        class="letter-act press"
        data-row-action={letter.id}
        aria-label={m.letters_delete_sheet()}
        onclick={ondelete}
      >
        <Icon name="trash" size={18} />
      </button>
    {/if}
  </div>
{/snippet}

{#snippet face()}
  <!-- Spans, not paragraphs: this is the content of a button wherever the
       card folds, and a button takes phrasing content only. -->
  <span class="letter-mark">
    <span class="letter-when">{m.look_back_letter_written({ date: dayLabel(letter.epochDay) })}</span>
    <!-- Opening the letter is what marks it read, so this mark goes in the
         same frame the card opens - on a line the mask leaves visible. It
         leaves by giving its width back (`collapse` reads which axis from
         the layout) rather than by being gone. -->
    {#if !read}
      <span class="letter-ready" out:collapse>
        <Icon name="envelope" size={14} />
        <span>{m.letters_ready_title()}</span>
      </span>
    {/if}
  </span>
  <!-- The whole letter, clamped to two lines while the card is folded, once it has been
       read. Until then nothing of it is on the card, folded or on the arrival: the first
       lines are the letter, and a letter nobody has opened yet should not be read off its
       envelope. Opening it puts the text under the mask below the folded edge, so it is
       uncovered by the same travel. -->
  {#if open || read}
    <!-- The first line sits above the folded edge, so the mask uncovers only what is under
         it: without a fade of its own that line was painted whole in the frame the letter
         opened. -->
    <span class="letter-text" class:is-folded={!open} data-letter-text={open ? '' : undefined} in:crossfade>{letter.text}</span>
  {/if}
{/snippet}

<div
  class="letter-card"
  data-letter={letter.id}
  data-letter-state={sealed ? 'sealed' : open ? 'reading' : read ? 'opened' : 'ready'}
  bind:this={card}
  transition:collapse|global={panel()}
>
  {#if sealed}
    <!-- No button anywhere in this branch. A sealed card is a closed object
         and the only things on it that answer a press are the two controls
         that act on the letter without opening it. -->
    <div class="letter-main">
      <p class="letter-mark">
        <Icon name="lock" size={16} />
        <span>{m.letters_sealed_title()}</span>
      </p>
      <div class="letter-wait">
        <div class="letter-count">
          {#each parts as part (part.unit)}
            <div class="letter-block">
              <span class="letter-n">{part.n}</span>
              <span class="letter-unit">{UNIT_WORD[part.unit](part.n)}</span>
            </div>
          {/each}
        </div>
        <p class="letter-day">{m.letters_sealed_until({ date: dayLabel(letter.unlockEpochDay) })}</p>
      </div>
    </div>
    {@render trailing()}
  {:else}
    <!-- Written out as the two tags rather than resolved through
         <svelte:element>, which is ListRow's rule and its reason: a button
         and a plain container carry different keyboard behaviour and
         different announcements, and the tag has to be legible to the
         compiler for it to check either. -->
    {#if folds}
      <button
        type="button"
        class="letter-main letter-main-btn"
        data-letter-open={letter.id}
        data-no-press
        aria-expanded={open}
        onclick={toggle}
      >
        {@render face()}
      </button>
    {:else}
      <div class="letter-main">{@render face()}</div>
    {/if}
    {@render trailing()}
    <!-- Under the mask rather than under a transition of its own: at the
         first frame of an opening the box is still its folded height and
         this sits below that edge, so it is uncovered by the same travel
         that uncovers the rest of the letter. -->
    {#if open && onclose}
      <div class="letter-shut">
        <button type="button" class="btn btn-soft press" data-letter-close onclick={toggle}>
          <span>{m.letters_close()}</span>
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  /* Flush, per rule 4: the card is what is on it, between the hairlines the
     list draws, with no ground of its own and no box. What makes a sealed
     letter read as an object is the blocks, not an outline.

     The hairline between two cards belongs to whatever is holding the run of
     them, the way ListCard owns its rows' separators - a card cannot see its
     own sibling, and a lone card on the letter's own route has none. */
  .letter-card {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
    column-gap: var(--space-3);
    padding: var(--space-4) 0;
  }

  .letter-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    text-align: start;
  }

  /* The press reaches into the card's own padding, above and below, so an unread letter's
     one line ("Written 15 May 2026 - Ready", 23px) is still a 48px target. The negative
     margin hands the padding straight back, so the drawing does not move. Below, it takes
     only --space-3: that is the gap above the close button on an open letter, and two
     controls must not share a strip of screen. */
  .letter-main-btn {
    background: none;
    border: 0;
    padding: var(--space-4) 0 var(--space-3);
    margin-block: calc(-1 * var(--space-4)) calc(-1 * var(--space-3));
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .letter-mark {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  /* The state marks - Sealed, and Ready while a letter is unlocked and unread. The words
     take the role's ink, held to 4.5:1 as small text; the glyphs keep its mark colour,
     which only owes a glyph's 3:1. The words in --role-mark measured 3.53:1 on trans light. */
  .letter-mark > span:not(.letter-when),
  .letter-ready {
    color: var(--role-ink);
  }
  .letter-mark > :global(svg),
  .letter-ready > :global(svg) {
    color: var(--role-mark);
  }

  .letter-ready {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  /* Blocks, then the day under them. Beside them fits a one-block card and
     not a two-block one at 390px, and a list whose short cards read one way
     and whose long ones read another is two drawings. */
  .letter-wait {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .letter-count {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .letter-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    min-width: 68px;
    padding: var(--space-1) var(--space-2) var(--space-2);
    background: var(--role-draw);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    color: var(--role-fill-ink);
    /* The kit's own block arrival (kit.css, kit-block-in): a block slides
       into view from its own left edge and clips, never fades up. Two
       blocks take it in turn, so the years land before the months. */
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
  }

  .letter-block:nth-child(2) {
    animation-delay: var(--stagger-step);
  }

  .letter-n {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  /* 15px on a stripe would owe 4.5:1, which no band can carry, so the unit
     word steps up to the 19px a title written on a block is allowed
     (--text-block, rule 2) and answers to 3:1 with the number above it. */
  .letter-unit {
    font-size: var(--text-block);
    font-weight: var(--weight-medium);
    line-height: 1.2;
  }

  .letter-day {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    color: var(--text);
  }

  /* A letter is prose, so it keeps prose's measure and its own line height
     rather than inheriting a card's. The class name travels with it
     deliberately - app.css's user-select opt-in list matches `.letter-text`
     by name, so renaming it here would silently take the letter's text back
     out of selectable copy.

     Folded and open differ by the clamp and by nothing else. Any difference
     in size, weight or colour between the two would reflow the first two
     lines in the frame the card opened, which is the one frame that has to
     be identical to the one before it. */
  .letter-text {
    display: block;
    margin: 0;
    white-space: pre-wrap;
    line-height: var(--leading-body);
    max-width: 65ch;
    color: var(--text);
  }

  .letter-text.is-folded {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  /* The two actions are the touch floor square (they were 36px). The negative margin hands
     the extra height back to the card's own vertical padding, so the first line of the
     letter keeps its place beside them. */
  .letter-acts {
    display: flex;
    gap: var(--space-1);
    margin-block: -6px;
  }

  .letter-act {
    display: grid;
    place-items: center;
    width: var(--touch-target);
    height: var(--touch-target);
    background: none;
    border: 0;
    border-radius: var(--r-block);
    color: var(--text-2);
    cursor: pointer;
  }

  /* Both columns, so the way out sits under the letter rather than beside
     the controls it is not one of. */
  .letter-shut {
    grid-column: 1 / -1;
    margin-top: var(--space-3);
  }
</style>
