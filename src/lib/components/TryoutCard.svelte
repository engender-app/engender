<script lang="ts">
  /* A tryout that is still running, on the tryouts index (phase 10 redesign
     ticket 53, DIRECTION.md rule 16).

     It was a list row: a name, and under it the kind and a date range run
     together in secondary grey. The screen's own subtitle promises "a name,
     pronouns, a style, or anything else you're trying, and how it's felt so
     far", and the second half of that sentence was answered nowhere on the
     screen - the felt-sense readings were in the database, reachable, and
     only visible once a tryout was opened.

     So a running tryout says what is true now in the two ways rule 16's
     worked examples do. The live reading - day N of trying this - is the
     number on the card, on a block of the area's stripe at display size,
     which is rule 2's "a number on a block" and the shape
     ProcedureRecoveryCard and LetterCard already use. And how it has felt
     is the drawing under it (TryoutFeltSenseArc), with what the drawing
     holds written out beside it in words.

     An ended tryout is not this. It stays the row it was and gains its
     length, because there is no live reading left to draw: the days have
     stopped counting and the shape is complete. That density difference is
     what lets several running tryouts fit on the screen at once, which is
     the arrangement the ticket is named for.

     Nothing on it is a verdict. Day N is a fact about time, the readings
     are drawn where they were written and never reduced to one number, and
     the app does not decide whether a name suited somebody (ADR-0012, and
     the ticket's own Out of scope). */
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import TryoutFeltSenseArc from './TryoutFeltSenseArc.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { tryoutKindName } from '$lib/data/vocabulary/labels';
  import { tryoutReading } from '$lib/data/tryoutReading';
  import type { FeltSenseEntry, Tryout } from '$lib/data/types';

  let {
    tryout,
    entries = [],
    today,
    onfeel,
    ondelete,
    ...rest
  }: {
    /** A running one. The screen hands ended tryouts to a row instead. */
    tryout: Tryout;
    /** This tryout's felt-sense readings, in any order. */
    entries?: readonly FeltSenseEntry[];
    today: number;
    onfeel?: () => void;
    ondelete?: () => void;
    [key: string]: unknown;
  } = $props();

  let reading = $derived(tryoutReading(tryout, entries, today));

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  let kindLabel = $derived(tryoutKindName(tryout.kind));
  let unitLabel = $derived(m.tryout_unit_days_trying({ n: reading.dayCount }));
  let sinceLabel = $derived(m.tryout_since({ start: dayLabel(tryout.startEpochDay) }));

  /* What the drawing holds, in words, because the drawing is aria-hidden
     and a fact nobody can hear is not a fact the card has stated. Two
     readings and their last day, or the honest sentence when there are
     none - which is the one the control below answers. */
  let feltLabel = $derived(
    reading.latestEpochDay === null
      ? m.tryout_felt_none()
      : `${m.tryout_felt_count({ n: reading.marks.length })} · ${m.tryout_felt_latest({ day: dayLabel(reading.latestEpochDay) })}`
  );
</script>

<div class="tryout-card rows-divide" data-tryout-card={tryout.id} data-tryout={tryout.id} {...rest}>
  <div class="tc-top">
    <!-- A row the width of the card answers a press with a wash rather
         than a scale: 0.94 on a 330px card walks its edges 10px inward
         while the list holds still, which reads as a yank (DIRECTION.md
         tier 1). data-no-press is how that is said. -->
    <!-- No aria-label. One would replace the link's own content for a
         screen reader, and the name, the day count and the date it counts
         from are all inside it. -->
    <a class="tc-face" href="/transition/tryouts/{tryout.id}" data-no-press data-open-tryout={tryout.id}>
      <span class="tc-head">
        <span class="tc-name">{tryout.label}</span>
        <span class="kit-pill tc-kind-pill">{kindLabel}</span>
      </span>
      <!-- The number and the date it counts from, side by side: the block
           is what the card reports and the date is what it is measured
           against, which is the pairing every figure in the app keeps. -->
      <span class="tc-reading">
        <span class="tc-block" data-tryout-reading>
          <span class="tc-n">{reading.dayCount}</span>
          <span class="tc-unit">{unitLabel}</span>
        </span>
        <span class="tc-when">{sinceLabel}</span>
      </span>
    </a>
    {#if ondelete}
      <button
        type="button"
        class="tc-act"
        data-delete-tryout={tryout.id}
        aria-label={m.tryout_delete_sheet()}
        onclick={ondelete}
      >
        <Icon name="trash" size={18} />
      </button>
    {/if}
  </div>

  <TryoutFeltSenseArc {reading} />

  <p class="tc-felt" data-tryout-felt>{feltLabel}</p>

  {#if onfeel}
    <button type="button" class="btn btn-soft btn-block tc-feel" data-feel-today={tryout.id} onclick={onfeel}>
      <span>{m.tryout_feeling_today()}</span>
    </button>
  {/if}
</div>

<style>
  /* Flush, per rule 4 - what makes this read as an object is the block and
     the drawing on it, not a box. The hairline between two of them belongs
     to the list card holding the run, which is what `rows-divide` opts
     into. */
  .tryout-card {
    position: relative;
    padding: var(--space-3) 0;
  }

  .tc-top {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  /* The head and the block are the way in, and the drawing under them is
     the card's own reading with nothing on it to reach. So the link's box
     stays where its content is, for layout and for its accessible name,
     and its hit area is stretched over the arc and the sentence by a
     pseudo-element. The delete and the felt-sense control lift above it. */
  .tc-face::after {
    content: '';
    position: absolute;
    inset: 0;
    /* Above the drawing, which is painted in its own right - without this
       the pseudo-element lands under the SVG and a tap on the arc reaches
       nothing. */
    z-index: 1;
  }

  .tc-face {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    color: inherit;
    text-decoration: none;
  }

  .tc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
  }

  .tc-name {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    min-width: 0;
    overflow-wrap: anywhere;
  }

  /* No uppercase, no tracking. DIRECTION.md's own census names an
     uppercase tracked label as the craft floor's tell and declines it. */
  .tc-kind-pill {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    flex: 0 0 auto;
  }

  .tc-reading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  /* The number on the card. The block is the flag stripe undiluted and the
     words on it take the ink proven against that stripe rather than the
     role's small-text ink, which is below 4.5:1 on most bands (role.ts). */
  .tc-block {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    min-width: 92px;
    max-width: 150px;
    text-align: center;
    padding: var(--space-1) var(--space-3) var(--space-2);
    background: var(--role-draw, var(--accent));
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    color: var(--role-fill-ink);
    /* The kit's own block arrival: a block is uncovered from its own left
       edge and clips, never fades up from nothing. */
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
  }

  .tc-n {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  /* 19px rather than the 15px a secondary line takes, because this one is
     written on the stripe itself. Not large text by WCAG's measure, so it
     owes 4.5:1 and gets it: --role-fill-ink is the heat ramp's deepest
     step, held to 4.5:1 against its own fill by tests/kit-roles.test.ts. */
  .tc-unit {
    font-size: var(--text-block);
    font-weight: var(--weight-medium);
    line-height: 1.2;
  }

  .tc-when {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  /* The kit's own row action size (--touch-target, Android's 48px floor),
     and above the face's stretched hit area rather than under it. */
  .tc-act {
    position: relative;
    z-index: 2;
    flex: 0 0 auto;
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

  /* What the drawing says, in words. */
  .tc-felt {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  /* Above the stretched hit area, like the delete: this writes today's
     reading and does not open the tryout. */
  .tc-feel {
    position: relative;
    z-index: 2;
    margin-top: var(--space-3);
  }

  /* The wash a full-width row answers a press with, which is the control's
     own ground rather than a container's - and it holds here because the
     face's hit area is the card, so the card is the control rather than a
     box around one. It fades rather than cutting in. */
  .tryout-card:has(.tc-face:active) {
    background: var(--role-wash);
  }

  .tryout-card {
    transition: background var(--dur-fast) var(--ease-out);
  }

  @media (prefers-reduced-motion: reduce) {
    .tc-block { animation: none; }
    .tryout-card { transition: none; }
  }

  :global(html[data-a11y-motion='reduce']) .tc-block { animation: none; }

  :global(html[data-a11y-motion='reduce']) .tryout-card { transition: none; }
</style>
