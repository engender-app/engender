<script lang="ts">
  /* procedureRail.ts places consults, surgery and today on one line. Positions
     use square-root distance from surgery, so rail lengths have no day unit.
     The recovery segment ends at today to avoid implying a recovery deadline.

     The rail is aria-hidden. Its card must state every fact encoded by the
     marks, including the surgery date, day count and number of consults. */
  import { procedureRail, type ProcedureMark } from '$lib/data/procedureRail';
  import type { Procedure } from '$lib/data/types';

  let { procedure, today }: { procedure: Procedure; today: number } = $props();

  let rail = $derived(procedureRail(procedure, today));

  /* A stable key per mark. The consults carry their own id; the date and
     today are one apiece, so their kind is their key - which is what keeps
     them the same element across a day rolling over or a date being
     edited, so they travel to the new position rather than being replaced
     at it. */
  const keyOf = (mark: ProcedureMark) => mark.id ?? mark.kind;
</script>

<div class="proc-rail" data-procedure-rail aria-hidden="true">
  <span class="proc-line"></span>
  {#if rail.gap}
    <span
      class="proc-gap"
      style={`--gap-from: ${rail.gap.from}; --gap-to: ${rail.gap.to}`}
    ></span>
  {/if}
  {#each rail.marks as mark (keyOf(mark))}
    <span
      class="proc-mark"
      data-mark={mark.kind}
      class:is-beyond={mark.beyondSpan}
      style={`--at: ${mark.position}`}
    ></span>
  {/each}
</div>

<style>
  /* The line is flush with the card's own column - its ends sit under the
     title's left edge and the pencil's right one - and the marks are inset
     from it by a mark's radius instead, so nothing hangs off the column
     into the screen's gutter. Insetting the whole rail was the first
     attempt and read as the drawing being indented from everything above
     it; letting the marks overhang was the second and put a dot outside the
     text column. The line is the thing that has to line up. */
  .proc-rail {
    position: relative;
    /* Its own inline-size container, so a mark's placement is a translate
       measured in `cqw` - a percentage would measure the 10px mark. */
    container-type: inline-size;
    height: 18px;
    margin: var(--space-2) 0 var(--space-1);
    /* Half the widest mark (the pivot, 16px). */
    --rail-inset: 8px;
    /* One uncovering for the whole drawing, left to right, so the line, the
       stretch and every mark on them arrive as one object in the order they
       happened - and no mark is ever painted at its destination before the
       line reaches it, or scaled up from nothing. The kit's own block
       arrival with the corners left square (rule 9: chart ink). */
    animation: proc-rail-in var(--dur-slow) var(--ease-out) both;
  }

  @keyframes proc-rail-in {
    from { clip-path: inset(-10px 100% -10px -10px); }
    to { clip-path: inset(-10px); }
  }

  /* The axis the marks sit on: rule 9's guide, which is 1px in --text-2 and
     never the series colour. It was a 30% dilution of the stripe at the
     stretch's own weight, which is a fourth kind of dilution the rules do
     not sanction and, at equal weight, still read as the unfilled half of a
     track. A hairline cannot read as a track. */
  .proc-line {
    position: absolute;
    left: 0;
    right: 0;
    top: 8.5px;
    height: 1px;
    background: var(--text-2);
  }

  /* The stretch between the date and today: rule 9's series, 2px in the
     stripe undiluted with square ends, over the guide.

     It was a 4px bar over a 2px track once, and that was wrong. This rail's
     right end is today on every procedure past its date, so a filled bar
     running to it drew a track full to its own end - the grammar of a
     progress bar whatever the arithmetic behind it refuses to compute, and
     the reading `recoveryDay.ts` refuses in as many words ("nothing about
     being ahead of or behind anything").

     Revealed by a clip rather than by growing a fill inside it, and any
     later change to where it ends - a day rolling over, a date edited - is
     a transition on the same clip rather than a redraw. */
  .proc-gap {
    position: absolute;
    left: 0;
    right: 0;
    top: 8px;
    height: 2px;
    background: var(--role-draw, var(--accent));
    clip-path: inset(0 calc((1 - var(--gap-to)) * 100%) 0 calc(var(--gap-from) * 100%));
    transition: clip-path var(--dur-med) var(--ease-out);
  }

  /* One box per mark, placed by a translate so a mark added or a date moved
     travels along the line. The dot is drawn by the box's own border and
     background rather than by a child, so there is nothing inside it that
     could arrive separately from it. */
  .proc-mark {
    position: absolute;
    top: 4px;
    left: 0;
    width: 10px;
    height: 10px;
    margin-left: -5px;
    border-radius: 50%;
    /* `cqw` rather than `%` so the track is measured and not the 10px mark,
       and the ends held back by --rail-inset so a mark at 0 or 1 sits on the
       line rather than half off it. */
    translate: calc(var(--rail-inset) + var(--at) * (100cqw - 2 * var(--rail-inset))) 0;
    background: var(--bg);
    box-shadow: inset 0 0 0 2px var(--role-draw, var(--accent));
    transition: translate var(--dur-med) var(--ease-out);
  }

  /* The date is the pivot, so it is the one mark drawn solid and a size up:
     the consults and today are points on the line, and this is what the
     line is about. */
  .proc-mark[data-mark='surgery'] {
    top: 1px;
    width: 16px;
    height: 16px;
    margin-left: -8px;
    background: var(--role-draw, var(--accent));
    box-shadow: 0 0 0 3px var(--bg);
  }

  /* Today is the one mark that is not part of the journey - it is where the
     reader is - so it is drawn in the text colour, the same split the
     milestone rail makes. */
  .proc-mark[data-mark='today'] {
    background: var(--text);
    box-shadow: 0 0 0 3px var(--bg);
  }

  /* A day the rail could not reach, drawn at the end it was pulled in to
     and faded so the line does not claim it happened there. */
  .proc-mark.is-beyond {
    opacity: 0.55;
  }

  /* Both spellings, the pair every other surface here keeps: the media
     query for the device setting and the attribute for the app's own. */
  @media (prefers-reduced-motion: reduce) {
    .proc-rail { animation: none; }
    .proc-gap,
    .proc-mark { transition: none; }
  }

  :global(html[data-a11y-motion='reduce']) .proc-rail { animation: none; }

  :global(html[data-a11y-motion='reduce']) .proc-gap,
  :global(html[data-a11y-motion='reduce']) .proc-mark {
    transition: none;
  }
</style>
