<script lang="ts">
  /* The running card leads with the tryout's name and kind on the role
     colour. Put the start date and elapsed time below it, away from any
     streak-like emphasis. The felt-sense drawing uses the recorded days
     and its count and latest date also appear in text.

     An ended tryout is a compact row with its length. The card's time and
     readings describe the tryout without rating it (ADR-0012). */
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import TryoutFeltSenseArc from './TryoutFeltSenseArc.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { moodName, tryoutKindName } from '$lib/data/vocabulary/labels';
  import { tryoutReading } from '$lib/data/tryoutReading';
  import type { FeltSenseEntry, Tryout } from '$lib/data/types';

  let {
    tryout,
    entries = [],
    today,
    ondelete,
    ...rest
  }: {
    /** A running one. The screen hands ended tryouts to a row instead. */
    tryout: Tryout;
    /** This tryout's felt-sense readings, in any order. */
    entries?: readonly FeltSenseEntry[];
    today: number;
    ondelete?: () => void;
    [key: string]: unknown;
  } = $props();

  let reading = $derived(tryoutReading(tryout, entries, today));

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  let kindLabel = $derived(tryoutKindName(tryout.kind));
  let spanLabel = $derived(
    m.tryout_day_since({ n: reading.dayCount, start: dayLabel(tryout.startEpochDay) })
  );

  /* The last thing the person said about it, in their own word for it and
     on the day they said it. Not a verdict and not an average (ADR-0012):
     one reading, named, with the drawing below holding all of them. Where
     there are none it is the honest sentence instead, which is the one the
     control in the foot answers. */
  let latestLabel = $derived(
    reading.latest === null
      ? m.tryout_felt_none()
      : m.tryout_felt_last({ mood: moodName(reading.latest.mood), day: dayLabel(reading.latest.epochDay) })
  );
</script>

<div class="tryout-card rows-divide" data-tryout-card={tryout.id} data-tryout={tryout.id} {...rest}>
  <div class="tc-top">
    <!-- A row the width of the card answers a press with a wash rather
         than a scale: 0.94 on a 330px card walks its edges 10px inward
         while the list holds still, which reads as a yank. data-no-press is how that is said. -->
    <!-- No aria-label. One would replace the link's own content for a
         screen reader, and the name, the kind, the last reading and how
         long it has run are all inside it. -->
    <a class="tc-face" href="/transition/tryouts/{tryout.id}" data-no-press data-open-tryout={tryout.id}>
      <!-- The plate: what this tryout is, and what kind of thing that is.
           The second line names the kind rather than a unit, because the
           thing on the block is a name and a name has no unit. -->
      <span class="tc-block" data-tryout-reading>
        <span class="tc-name">{tryout.label}</span>
        <span class="tc-kind">{kindLabel}</span>
      </span>
      <span class="tc-latest" data-tryout-latest>{latestLabel}</span>
      <span class="tc-when">{spanLabel}</span>
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

  <!-- The drawing is aria-hidden, so its count and last reading are also in text. -->
  {#if reading.marks.length}
    <div class="tc-foot">
      <p class="tc-felt" data-tryout-felt>{m.tryout_felt_count({ n: reading.marks.length })}</p>
    </div>
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

  /* The plate and the two lines under it are the way in, and the drawing
     below them is the card's own reading with nothing on it to reach. So
     the link's box
     stays where its content is, for layout and for its accessible name,
     and its hit area is stretched over the arc and the sentence by a
     pseudo-element. The delete control lifts above it. */
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

  /* The plate. The block is the flag stripe undiluted and the words on it
     take the ink proven against that stripe rather than the role's
     small-text ink, which is below 4.5:1 on most bands (role.ts).

     The whole width of the face rather than a fixed 92-150px, which is
     what it took while it held a number: a name is somebody else's text
     and any ceiling is a width some name does not fit in, so it wraps
     inside the plate instead of being squeezed beside it. */
  .tc-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: var(--space-2) var(--space-3) var(--space-3);
    background: var(--role-draw, var(--accent));
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    color: var(--role-fill-ink);
    /* The kit's own block arrival: a block is uncovered from its own left
       edge and clips, never fades up from nothing. */
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
  }

  /* The size a row-weight tile with no value gives its title
     (direction-contracts.ts holds the kit's own to the same token),
     because that is what this plate is: a block whose whole content is
     what the thing is called. Large text by WCAG's measure, so it answers
     to 3:1 on the stripe, which every band clears. */
  .tc-name {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: 1.1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  /* 19px rather than the 15px a secondary line takes, because this one is
     written on the stripe itself. Not large text by WCAG's measure, so it
     owes 4.5:1 and gets it: --role-fill-ink is the heat ramp's deepest
     step, held to 4.5:1 against its own fill by tests/kit-roles.test.ts.
     Keep the label in normal case with default letter spacing. */
  .tc-kind {
    font-size: var(--text-block);
    font-weight: var(--weight-medium);
    line-height: 1.2;
    margin-top: var(--space-1);
  }

  /* The last reading, in body size under the plate: the card's second
     fact, and the one the drawing below it is a picture of. */
  .tc-latest {
    font-size: var(--text-md);
    font-weight: var(--weight-medium);
    overflow-wrap: anywhere;
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

  .tc-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  /* What the drawing says, in words. */
  .tc-felt {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
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
