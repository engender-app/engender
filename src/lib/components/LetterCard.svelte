<script lang="ts">
  /* One time-capsule letter, in whichever of its three states it is in
     (phase 10 redesign ticket 45).

     The screen used to draw all three as the same list row: a lock glyph,
     the word "Sealed" and `Opens 19 Aug 2031` in secondary grey - five
     years of waiting set in the same shape and the same weights as a size
     record saying `XS - H&M`. This is the only feature in the app with a
     refusal built into it, and the row said nothing about it.

     So the states are drawn apart rather than tinted apart:

     **Sealed.** The wait is the card's own number, on blocks of the area's
     stripe at display size (rule 2's "a number on a block, 40px", rule 3's
     "every colour is a stripe, and it is a block"). One block per unit,
     which is one or two of them - `durationParts` decides which, and
     `fmtDuration` renders the same parts as a sentence elsewhere, so a card
     and a sentence about one gap can never disagree. Nothing on it is
     pressable towards the text, because there is no text to reach: the
     calendar handoff is its own control at the trailing edge, beside
     deleting, and the card itself answers no press at all. The refusal is
     the feature (spec: sealed contents are out of scope under any
     circumstance) and this is what it looks like.

     **Ready.** Unlocked and not yet read. The loud one, because it is the
     one with something to do: an ink bar saying so, which is rule 4's third
     treatment and the only card here that takes it. It does not show the
     first line - the first thing a person reads of their own letter should
     be in the letter.

     **Opened.** Read already. Its first line and the day it was written,
     which is what somebody with ten of them scans for. No block, no bar,
     no stripe: prose on the page.

     Opening is the card unfolding rather than a sheet arriving over it
     (rule 10, ADR-0078). The body is uncovered by `disclose`, which grows
     the height while pinning what is inside it, so the letter reads as a
     blind drawn down a page that was already written - one object becoming
     an open one, and never a card crossfading into a screen of text. */
  import { navigating } from '$app/state';
  import Icon from './Icon.svelte';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { calendarDuration, durationParts } from '$lib/data/epochDay';
  import type { DurationUnit } from '$lib/data/epochDay';
  import { collapse, resize } from '$lib/motion/reveal';
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
    /** Whether this letter's text has been shown before - the difference
        between the ready state and the opened one. */
    read: boolean;
    open?: boolean;
    /** Pressed the card, or its ink bar. Absent on a sealed card, which
        never opens. */
    onopen?: () => void;
    onclose?: () => void;
    /** Marking the unlock day on a real calendar - a sealed card's own
        control, since a sealed card takes no press of its own. */
    oncalendar?: () => void;
    ondelete?: () => void;
  } = $props();

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  let state = $derived(
    letter.unlockEpochDay > today ? 'sealed' : read ? 'opened' : 'ready'
  );

  let parts = $derived(durationParts(calendarDuration(today, letter.unlockEpochDay)));

  /** Whether this card folds at all. A caller that handed over neither an
      open nor a close does not have a second state to put the card in. */
  let folds = $derived(onopen !== undefined || onclose !== undefined);

  const UNIT_WORD: Record<DurationUnit, (n: number) => string> = {
    years: (n) => m.unit_years({ n }),
    months: (n) => m.unit_months({ n }),
    days: (n) => m.unit_days({ n })
  };

  /* The first line, and only the first: a letter's opening line is what
     identifies it in a list, and the rest of it is behind the card. A blank
     first line falls through to the first line that is not blank rather
     than drawing an empty card. */
  let firstLine = $derived(
    letter.text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  );

  /* Tile's panel contract, and the same reasoning: `|global` because what
     creates and destroys a card is the caller's `{#each}`, a parent block a
     local transition never sees, and `skip` so a screen leaving does not
     spend --dur-slow folding its letters up on the way out. */
  let panel = $derived({ skip: navigating.to !== null });
</script>

{#snippet face()}
  <p class="letter-eyebrow">{m.look_back_letter_written({ date: dayLabel(letter.epochDay) })}</p>
  {#if state === 'ready' && !open}
    <!-- Rule 4's ink, and the only card here that takes it: the one with
         something to do says so in the loudest treatment the direction has.
         It shows no first line - the first thing a person reads of their own
         letter should be in the letter. -->
    <span class="letter-ready" out:collapse>
      <Icon name="book" size={18} />
      <span>{m.letters_ready_title()}</span>
    </span>
  {:else}
    <!-- One element in both states, clamped to two lines when the card is
         folded and unclamped when it is open, so opening a letter is the
         letter unrolling rather than a first line being swapped for a copy
         of itself with more of it. `resize` animates the height the change
         makes ($lib/motion/reveal), which is the whole of the movement. -->
    <p class="letter-text" class:is-folded={!open} data-letter-text={open ? '' : undefined}>
      {open ? letter.text : firstLine}
    </p>
  {/if}
{/snippet}

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

<div
  class="letter-card"
  data-letter={letter.id}
  data-letter-state={state}
  transition:collapse|global={panel}
  use:resize
>
  {#if state === 'sealed'}
    <!-- No button anywhere in this branch. A sealed card is a closed object
         and the only things on it that answer a press are the two controls
         that act on the letter without opening it. -->
    <div class="letter-main">
      <p class="letter-mark">
        <Icon name="lock" size={16} />
        <span>{m.letters_sealed_title()}</span>
      </p>
      <!-- The wait and the day it ends, side by side: the blocks are the
           number and the line beside them is the date, so the card is three
           lines tall rather than four and ten of them are a scroll rather
           than a journey. -->
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
         compiler for it to check either. A card the caller gave no handler
         is not a control - the letter's own route draws one card, already
         unfolded, with nowhere to fold it to. -->
    {#if folds}
      <button
        type="button"
        class="letter-main letter-main-btn"
        data-letter-open={letter.id}
        data-no-press
        aria-expanded={open}
        onclick={() => (open ? onclose?.() : onopen?.())}
      >
        {@render face()}
      </button>
    {:else}
      <div class="letter-main">{@render face()}</div>
    {/if}
    {@render trailing()}
    {#if open && onclose}
      <div class="letter-shut" transition:collapse>
        <button type="button" class="btn btn-soft press" data-letter-close onclick={onclose}>
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

  .letter-main-btn {
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .letter-mark,
  .letter-eyebrow {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  .letter-mark {
    color: var(--role-mark);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* The wait, as blocks of the area's stripe. One per unit, so a five-year
     letter is two blocks and a twelve-day one is a single block; they are
     sized by their content rather than stretched to the card, because a
     stretched block is a bar and a bar means a proportion. */
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

  /* Rule 4's ink: --text as a ground with --bg as the ink, the inverse of
     the page. */
  .letter-ready {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    align-self: start;
    padding: var(--space-2) var(--space-3);
    background: var(--text);
    color: var(--bg);
    border-radius: var(--r-block);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
  }

  .letter-acts {
    display: flex;
    gap: var(--space-1);
  }

  .letter-act {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    background: none;
    border: 0;
    border-radius: var(--r-block);
    color: var(--text-2);
    cursor: pointer;
  }

  /* A letter is prose, so it keeps prose's measure and its own line height
     rather than inheriting a card's. The class name travels with it
     deliberately - app.css's user-select opt-in list matches `.letter-text`
     by name, so renaming it here would silently take the letter's text back
     out of selectable copy.

     Folded, it is the first two lines at a content title's weight, which is
     what a person with ten letters scans; open, it is the whole thing at
     body weight. Same element either way, so opening one is the letter
     unrolling and not a swap. */
  .letter-text {
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
    white-space: normal;
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }

  /* Both columns, so the way out sits under the letter rather than beside
     the controls it is not one of. */
  .letter-shut {
    grid-column: 1 / -1;
    margin-top: var(--space-3);
  }
</style>
