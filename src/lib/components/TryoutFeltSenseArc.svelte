<script lang="ts">
  /* One tryout's felt-sense readings as the shape they make (phase 10
     redesign ticket 53, DIRECTION.md rule 16, ADR-0012).

     Its own component rather than markup on the card, for the reason
     ProcedurePhaseRail gives: the arithmetic lives in
     `$lib/data/tryoutReading` with its own tests, and the marks and the
     stroke that turn those positions into a line are one thing. The card
     beside it is a name, a number and a sentence.

     ## What the line may mean, and what it may not

     Each mark is one reading, at the day it was written and the step that
     was chosen. That much is the record. The stroke joining consecutive
     marks is the shape the ticket asks for and nothing more: it is drawn
     between two readings that exist, in the order they were written, and
     it is not a fit, not a smoothing and not a claim about the days in
     between. The marks are drawn heavier than it for exactly that reason -
     what is recorded is solid and what merely connects it is thin.

     Two readings a fortnight apart therefore draw one straight segment,
     which says "it went from here to here" and not "it passed through
     these fourteen days at these heights". The reference sweep for this
     ticket found the alternative in the wild - two mood journals run a
     smoothed curve through a fortnight of check-ins, which paints a height
     onto every day nobody wrote on - and this refuses it.

     Nothing is averaged and no end is the good end (ADR-0012): the guide
     sits on the middle step of the scale rather than at its foot, so the
     drawing has a middle to be above or below rather than a floor to be
     measured up from, and the marks are one colour whatever step they are
     on. A tryout the app thinks went well is not a thing this can draw.

     Decorative to a screen reader, and that holds only while the card
     beside it still writes every fact on this line down in text: how many
     readings there are and when the last one was (TryoutCard). Anything
     added here owes the card a line of text.

     ## Why an SVG rather than positioned boxes

     The rail next door places its marks as absolutely positioned boxes,
     which works because they all sit on one line. These have a height as
     well, and joining them needs a stroke between two arbitrary points,
     which CSS has no way to draw. So the box is a non-uniformly scaled
     viewBox - x spans the tryout, y spans the scale - and every stroke in
     it carries `vector-effect="non-scaling-stroke"`, so the scale never
     reaches the ink: the stroke is 2px and the marks are round however
     wide the card is. A mark is a zero-length line with a round cap rather
     than a `<circle>`, because a circle in a stretched viewBox is an
     ellipse. */
  import type { TryoutReading } from '$lib/data/tryoutReading';

  let { reading }: { reading: TryoutReading } = $props();

  /** The drawing's own box. x is 0 to 100 across the tryout's span; y runs
      top to bottom, so the highest step of the scale is y 0. The height is
      in the same units as the CSS height below, which keeps the guide on a
      whole pixel. */
  const BOX = { width: 100, height: 34 } as const;

  /** How far in from each end the first and last marks sit, in the box's own
      x units - so about 7px on a phone's card. The guide runs the full width
      and the marks are held off its ends instead, which is the split the
      phase rail makes and for its reason: the line is the thing that has to
      line up with the column, and a mark centred on the column's own edge is
      half outside the card. */
  const MARK_INSET = 2;

  const xOf = (position: number) => MARK_INSET + position * (BOX.width - 2 * MARK_INSET);
  const yOf = (level: number) => (1 - level) * BOX.height;

  let marks = $derived(reading.marks);
  let guideY = $derived(yOf(reading.neutralLevel));
  /* A polyline needs two points; one reading is a mark on its own and no
     stroke, which is what "a single mark" means. */
  let path = $derived(
    marks.length < 2 ? null : marks.map((mark) => `${xOf(mark.position)},${yOf(mark.level)}`).join(' ')
  );
</script>

<!-- Nothing at all where nothing has been recorded. A guide with no marks on
     it is a scale drawn over an empty span, which claims a reading was
     taken and says it was neutral; the card's own sentence says there are
     none instead, and the control under it is the answer to that. -->
{#if marks.length}
<div class="felt-arc" data-felt-arc aria-hidden="true">
  <svg class="felt-svg" viewBox="0 0 {BOX.width} {BOX.height}" preserveAspectRatio="none" focusable="false">
    <!-- The middle of the scale, as rule 9's guide: 1px in --text-2, never
         the series colour, and never an axis with ticks on it. -->
    <line
      class="felt-guide"
      x1="0"
      y1={guideY}
      x2={BOX.width}
      y2={guideY}
      vector-effect="non-scaling-stroke"
      shape-rendering="crispEdges"
    />
    {#if path}
      <polyline class="felt-line" points={path} vector-effect="non-scaling-stroke" />
    {/if}
    {#each marks as mark (mark.id)}
      <line
        class="felt-mark"
        class:is-beyond={mark.beyondSpan}
        data-felt-mark={mark.mood}
        x1={xOf(mark.position)}
        y1={yOf(mark.level)}
        x2={xOf(mark.position)}
        y2={yOf(mark.level)}
        vector-effect="non-scaling-stroke"
      />
    {/each}
  </svg>
</div>
{/if}

<style>
  /* Flush with the card's own column, like the phase rail: the drawing's
     ends sit under the title's left edge and the delete's right one. The
     3px of padding is half a mark, so a reading on the first or the last
     day overhangs into it rather than being cut in half by the box.

     One uncovering left to right for the whole drawing, so the guide, the
     stroke and every mark on them arrive as one object in the order the
     days happened - no mark is painted at its height before the line
     reaches it, and nothing scales up from nothing. The kit's own block
     arrival with the corners left square (rule 9: chart ink). */
  .felt-arc {
    padding: 3px;
    margin: var(--space-2) 0 var(--space-1);
    animation: felt-arc-in var(--dur-slow) var(--ease-out) both;
  }

  @keyframes felt-arc-in {
    from { clip-path: inset(-6px 100% -6px -6px); }
    to { clip-path: inset(-6px); }
  }

  .felt-svg {
    display: block;
    width: 100%;
    height: 34px;
    /* So a mark on the first or last day, and one at either end of the
       scale, can overhang into the padding rather than being clipped. */
    overflow: visible;
  }

  .felt-guide {
    stroke: var(--text-2);
    stroke-width: 1;
  }

  /* Rule 9's series: 2px in the area's stripe, undiluted. Thinner than the
     marks on purpose - see the header. */
  .felt-line {
    fill: none;
    stroke: var(--role-draw, var(--accent));
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  /* A reading: a 7px round dot, drawn as a zero-length stroke so the
       viewBox's own stretch cannot turn it into an ellipse. The ring of
       background around it is what keeps two readings a day apart from
       merging into one blob. */
  .felt-mark {
    stroke: var(--role-draw, var(--accent));
    stroke-width: 7;
    stroke-linecap: round;
    paint-order: stroke;
  }

  /* A day the span does not reach, drawn at the end it was pulled in to
     and hollowed so the line does not claim it happened there. The same
     treatment the phase rail gives a consult beyond its own reach. */
  .felt-mark.is-beyond {
    opacity: 0.55;
  }

  /* Both spellings, the pair every other surface here keeps: the media
     query for the device setting and the attribute for the app's own. */
  @media (prefers-reduced-motion: reduce) {
    .felt-arc { animation: none; }
  }

  :global(html[data-a11y-motion='reduce']) .felt-arc { animation: none; }
</style>
