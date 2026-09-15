<script lang="ts">
  /* One procedure's phases on one line (phase 10 redesign ticket 52,
     DIRECTION.md rule 16): the consults behind it, the surgery date as the
     pivot, the stretch to today ahead of it, and today's own mark.

     Its own component rather than markup on the card for the reason
     MilestoneRail gives: the arithmetic lives in $lib/data/procedureRail
     with its own tests, and the markup and classes that turn those
     positions into a line are one thing. The card that carries it is about
     a name, a number and a photo strip.

     Decorative to a screen reader, and that is deliberate rather than
     lazy. Every fact on this line is already written in text on the card
     beside it - the date, the day count, how many consults there are - so
     announcing the rail would read the same journey out twice with no dates
     attached to the second telling.

     Nothing here is a scale. The positions are square roots of distance
     from the date (procedureRail.ts says why), so a length along this line
     is not a number of days and the card writes every date out. There is no
     axis, no ticks between the marks, and no horizon: the stretch drawn
     ahead of the date stops at today, because a band running on to a
     90-day cutoff with today somewhere along it is a progress bar through
     somebody's recovery (ADR-0012, and ticket 52 out of scope). */
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
    <!-- The stretch between the date and today. Revealed by a clip rather
         than by growing a fill inside it: a fill that scales leaves the
         mark at full width from the first frame with colour crawling
         across it, and the rule the app already keeps for a bar is that
         the clipping element animates. -->
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
  /* The marks are placed against the track and not against the rail, so a
     mark at either end hangs into the rail's own padding instead of being
     clipped in half - the care rail's arrangement, same reason. */
  .proc-rail {
    position: relative;
    /* Its own inline-size container, so a mark's placement is a translate
       measured in `cqw` - a percentage would measure the 10px mark. */
    container-type: inline-size;
    height: 18px;
    margin: var(--space-2) 8px var(--space-1);
  }

  .proc-line {
    position: absolute;
    left: 0;
    right: 0;
    top: 8px;
    height: 2px;
    border-radius: 1px;
    background: color-mix(in oklab, var(--role-draw, var(--accent)) 34%, var(--bg));
  }

  /* The travelled stretch, in the flag itself. It arrives from the date's
     side - the end it grew from in life - over --dur-slow, and any later
     change to where it ends (a day rolling over, a date edited) is a
     transition on the same clip rather than a redraw. */
  .proc-gap {
    position: absolute;
    left: 0;
    right: 0;
    top: 7px;
    height: 4px;
    border-radius: 2px;
    background: var(--role-draw, var(--accent));
    clip-path: inset(0 calc((1 - var(--gap-to)) * 100%) 0 calc(var(--gap-from) * 100%) round 2px);
    transition: clip-path var(--dur-med) var(--ease-out);
    animation: proc-gap-in var(--dur-slow) var(--ease-out) both;
  }

  @keyframes proc-gap-in {
    from {
      clip-path: inset(0 calc((1 - var(--gap-from)) * 100%) 0 calc(var(--gap-from) * 100%) round 2px);
    }
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
    translate: calc(var(--at) * 100cqw) 0;
    background: var(--bg);
    box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--role-draw, var(--accent)) 70%, var(--bg));
    transition: translate var(--dur-med) var(--ease-out);
    animation: proc-mark-in var(--dur-slow) var(--ease-out) both;
  }

  /* A mark grows into place rather than appearing at full size in one
     frame. It scales about its own centre, which is already on the line, so
     no frame has it anywhere but where it belongs. */
  @keyframes proc-mark-in {
    from { scale: 0; }
    to { scale: 1; }
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
     and hollowed so the line does not claim it happened there. */
  .proc-mark.is-beyond {
    opacity: 0.55;
  }

  /* Both spellings, the pair every other surface here keeps: the media
     query for the device setting and the attribute for the app's own. */
  @media (prefers-reduced-motion: reduce) {
    .proc-gap,
    .proc-mark {
      animation: none;
      transition: none;
    }
  }

  :global(html[data-a11y-motion='reduce']) .proc-gap,
  :global(html[data-a11y-motion='reduce']) .proc-mark {
    animation: none;
    transition: none;
  }
</style>
