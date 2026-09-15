<script lang="ts">
  /* When each change was first noticed, on one line (phase 10 redesign
     ticket 57, DIRECTION.md rule 16).

     The screen under this used to be a grouped list where a first-noticed
     day was a date in grey in a row's subtitle - the most re-read number in
     an HRT journal, rendered as the least of the things on its row. The
     dates are a shape, and this is that shape: months along the line, one
     mark per change at the day it was noticed, the whole set readable
     before a single group is opened.

     Its own component rather than markup on the screen, for the reason
     MilestoneRail and ProcedurePhaseRail give: the arithmetic is in
     $lib/data/noticedAxis with its own tests, the markup and classes that
     turn positions into a line are one thing, and the screen that carries
     it is already four hundred lines of groups, sheets and a catalogue
     editor.

     What this does not draw, deliberately: the literature's onset and
     completion windows. Those are EffectsTimeline's, inside each group,
     where a band sits against the one change it belongs to. Drawn behind
     these marks they would turn a record of what somebody noticed into a
     comparison against when they might have, which ticket 57 rules out in
     as many words and ADR-0012 refuses generally.

     The lanes are a collision answer and nothing else. Two changes noticed
     in the same month are two dots at the same place, so the later one
     stands above the earlier one on a stem; the height is how many marks
     were crowded there, never how large or how welcome any of them was.
     Reference for the form: Oura's Symptom Radar recent-days line, where
     marks stand off a date axis on stems, and Clue's cycle history, where
     one axis carries every symptom at once.

     Marks are controls, the way CurveMarkers' are and unlike
     ProcedurePhaseRail's: each one stands for a record with an editor, so a
     tap opens that change's sheet - the same sheet its row in the list
     opens. Which makes the accessible name the whole of what a screen
     reader gets from here, since the drawing itself is decoration; the list
     under it writes every one of these dates out in text. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import {
    EFFECT_DIRECTIONS,
    effectDirectionLabel,
    type EffectDirection
  } from '$lib/data/effectDirections';
  import { noticedAxis, type NoticedChange } from '$lib/data/noticedAxis';
  import { crossfade, wipe } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from './kit/role';

  let {
    changes,
    anchorEpochDay,
    todayEpochDay,
    onOpen
  }: {
    /** Only the changes that carry a marker, already joined to their
        catalogue entry by the screen: an axis of what somebody noticed has
        nothing to say about what they have not. */
    changes: NoticedChange[];
    /** The day the earliest regimen episode began, or null where there is
        none - which the axis draws rather than refuses. */
    anchorEpochDay: number | null;
    todayEpochDay: number;
    onOpen: (key: string) => void;
  } = $props();

  let axis = $derived(noticedAxis(changes, anchorEpochDay, todayEpochDay));

  /* Drawn in a fixed order rather than in the axis's own left-to-right one,
     which is the difference between a mark travelling to its new month and
     teleporting there. `noticedAxis` sorts by day, so re-dating a change
     moves it in that list; Svelte then moves the node in the DOM to match,
     and a node taken out and put back loses the transition that was about
     to run on it. Measured: a mark re-dated from July to the May before it
     went 235px between two frames with the list in day order, and travels
     over --dur-med in key order (tests/noticed-axis-motion.mjs, scene
     mark-travel). Nothing on screen depends on the paint order - every mark
     is absolutely positioned and the lanes keep them from overlapping. */
  let drawn = $derived([...axis.marks].sort((a, b) => (a.key < b.key ? -1 : 1)));

  /** How tall one lane is, in pixels, and how much room the line and the
      marks standing on it need under the first lane. Both are read by the
      style block through `--lane-h`; the height is computed here because a
      drawing that knows how many lanes it has should not ask CSS to work
      out its own box.

      This height steps rather than travels when a marker added in the
      deepest month takes the stack one lane further, and the paragraphs
      under the axis step down with it. It stays a step because animating it
      is animating `height`, which the performance contract admits only with
      an entry in motion-system.test.ts's LAYOUT_EXEMPT and a benchmark
      behind it (materials.css) - 18px once, under the sheet that is closing
      over it, is not what that budget is for. */
  const LANE_H = 18;
  const PLOT_BASE = 22;
  let plotHeight = $derived(PLOT_BASE + Math.max(axis.lanes - 1, 0) * LANE_H);

  /* One role per direction rather than one per mark: the three are the only
     distinction the drawing makes, and a colour per change would make the
     palette a field of unrelated dots. A direction is a fact about which
     way a change goes, not a judgement about it, so ADR-0012 has nothing to
     say here - the same reading MilestoneRail makes of a milestone drawn
     hollow because it has not happened yet. */
  const DIRECTION_ROLE: Record<EffectDirection, number> = { feminizing: 0, masculinizing: 1, other: 2 };
  const roleFor = (direction: EffectDirection) => roleAt(activeFlag.roles, DIRECTION_ROLE[direction]);

  let directionsPresent = $derived(
    EFFECT_DIRECTIONS.filter((direction) => axis.marks.some((mark) => mark.direction === direction))
  );

  const longDay = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* The reading the screen opens on (rule 16): how many changes are on the
     line and when the last of them was noticed. Not a rate, not a run, and
     nothing about the gaps - the count and the latest day are both facts
     already written down in the list, said once at the top. */
  let summary = $derived(
    axis.marks.length === 0
      ? m.effects_axis_empty()
      : m.effects_axis_summary({
          count: axis.marks.length,
          date: longDay(axis.marks[axis.marks.length - 1].firstNoticedEpochDay)
        })
  );

  /** What the axis is measured in, said in words, because the tick numbers
      alone do not say what they count. */
  let axisCaption = $derived(
    axis.mode === 'onset'
      ? m.effects_axis_onset({ date: longDay(anchorEpochDay as number) })
      : m.effects_axis_calendar()
  );

  /* Hoisted out of the markup the way CurveMarkers hoists its own: a
     message call with an object argument inside `{...}` is the shape
     kit-surfaces.test.ts's copy regex misreads, and it is worth staying out
     of that trap everywhere. */
  const markLabel = (mark: { label: string; firstNoticedEpochDay: number }) =>
    m.effects_axis_mark_aria({ name: mark.label, date: longDay(mark.firstNoticedEpochDay) });
  const open = (key: string) => () => onOpen(key);

  const tickLabel = (monthsSinceOnset: number | null, epochDay: number) =>
    monthsSinceOnset === null ? fmtDay(epochDay, { month: 'short' }) : String(monthsSinceOnset);
</script>

<!-- One uncovering for the whole block, not for the drawing alone: the
     sentence, the line, its months and its caption are one surface arriving
     when the journal's markers land, and a screen where the drawing wipes in
     under text that was already painted has the text arriving in a single
     frame - a yank by the standing rule, and two arrivals for one thing. -->
<div class="noticed-axis" data-noticed-axis in:wipe={{ authored: true }}>
  <p class="na-summary">{summary}</p>

  <!-- The uncovering above runs left to right across this too, so the line
       and every mark on it arrive in the order they happened and no dot is
       painted before the line reaches it. A mark added or cleared later is
       its own object arriving or leaving (the crossfade below), which is
       the one thing that wipe cannot cover. -->
  <div class="na-plot" style:--lane-h="{LANE_H}px" style:height="{plotHeight}px">
    <span class="na-line"></span>
    <span class="na-today" style:--at={axis.todayPosition}></span>
    {#each drawn as mark (mark.key)}
      <button
        class="na-mark"
        data-noticed-mark={mark.key}
        style:--at={mark.position}
        style:--lane={mark.lane}
        aria-label={markLabel(mark)}
        onclick={open(mark.key)}
        transition:crossfade|global
        {...roleAttrs(roleFor(mark.direction))}
      ></button>
    {/each}
  </div>

  <!-- The months are ticked under the line rather than ruled through the
       drawing. Full-height gridlines put a second vertical stroke beside
       every stem in a stack, which read as taller stems; a mark high in a
       stack is placed by its own stem reaching the line, so the grid was
       carrying nothing the drawing did not already say.

       Decoration, the way ProcedurePhaseRail's whole rail is: a reader
       announced "0 3 6 9 12 15" has been read the axis furniture and not
       the axis. The sentence is above, and every mark carries its own name
       and date. -->
  <div class="na-months" aria-hidden="true">
    {#each axis.ticks as tick (tick.epochDay)}
      <span class="na-month" style:--at={tick.position}></span>
      <span class="na-month-label" style:--at={tick.position}>{tickLabel(tick.monthsSinceOnset, tick.epochDay)}</span>
    {/each}
  </div>

  <p class="na-caption muted small">{axisCaption}</p>

  {#if directionsPresent.length > 1}
    <div class="na-legend muted small">
      {#each directionsPresent as direction (direction)}
        <span class="na-legend-item">
          <span class="na-legend-swatch" {...roleAttrs(roleFor(direction))}></span>{effectDirectionLabel(direction)}
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* The line runs the width of whatever carries it and the marks are inset
     from its ends by their own half-width, so a change noticed on the first
     day sits on the line rather than half off it - ProcedurePhaseRail's
     --rail-inset, same arithmetic. */
  .noticed-axis {
    --na-inset: 11px;
  }

  .na-summary {
    margin: 0 0 var(--space-2);
  }

  .na-plot {
    position: relative;
    /* Its own inline-size container, so a mark's placement is a translate
       measured in `cqw` - a percentage would measure the 22px mark. */
    container-type: inline-size;
  }

  /* Rule 9's guide: 1px in --text-2, never a series colour, and never a
     track - there is no quantity being filled along this line. */
  .na-line {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: var(--text-2);
  }

  .na-today {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 1px;
    background: repeating-linear-gradient(to bottom, var(--text-2) 0 2px, transparent 2px 5px);
    translate: calc(var(--na-inset) + var(--at) * (100cqw - 2 * var(--na-inset))) 0;
  }

  /* A mark is a control and carries its own tap target, which is smaller
     than the app's 48px floor for the reason CurveMarkers' own targets are:
     at 48px two changes noticed a fortnight apart steal each other's taps,
     and the row for this record is on the same screen at full size.

     22 by 18, and both halves are the same rule - a target reaches halfway
     to its neighbour and no further. Across, the lanes guarantee
     MARK_MIN_GAP of the line between two marks in one lane, which is 24px
     at 320px, the narrowest width the app supports; up and down, a lane is
     18px, so half of it each way is the whole box. Measured at 320 and 390:
     no two targets overlap on the demo's own crowded month. */
  /* A bare custom property animates as a string - it swaps at the halfway
     point and the mark cuts from the old month to the new one. Registered,
     both are numbers the browser can walk (kit.css's `--level` is the same
     move). Below Chrome 85 there is no `@property` and the snap comes back,
     which is the right way to degrade. */
  @property --at {
    syntax: '<number>';
    inherits: false;
    initial-value: 0;
  }

  @property --lane {
    syntax: '<number>';
    inherits: false;
    initial-value: 0;
  }

  .na-mark {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 22px;
    height: var(--lane-h);
    margin: 0 0 calc(var(--lane-h) / -2) -11px;
    padding: 0;
    border: 0;
    background: none;
    /* `cqw` rather than `%` so the line is measured and not the mark, and a
       date edited in the sheet travels to its new day rather than being
       repainted there.

       The transition is on the two variables and not on `translate`, which
       is the only spelling that runs: `translate` reads `var(--at)`, and an
       unregistered custom property substitutes at computed-value time, so
       the specified value is the same token either side of the edit and no
       transition is ever set up. Measured, not reasoned about - the first
       spelling moved a re-dated mark 235px between two frames
       (tests/noticed-axis-motion.mjs, scene mark-travel). The stem under a
       stacked mark grows with `--lane` for the same reason. */
    translate: calc(var(--na-inset) + var(--at) * (100cqw - 2 * var(--na-inset)))
      calc(var(--lane) * var(--lane-h) * -1);
    transition:
      --at var(--dur-med) var(--ease-out),
      --lane var(--dur-med) var(--ease-out);
  }

  .na-mark::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 50%;
    background: var(--role-draw, var(--accent));
  }

  /* The stem back down to the line, so a mark three lanes up is still read
     against the month it happened in. Rule 9's guide again, and it draws
     nothing at all in the lane that stands on the line itself. */
  .na-mark::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 1px;
    margin-left: -0.5px;
    height: calc(var(--lane) * var(--lane-h));
    background: var(--text-2);
  }

  /* Both spellings, the pair every other surface here keeps: the media query
     for the device setting and the attribute for the app's own. The mark's
     own arrival needs neither - `wipe` reads the same two settings itself
     and cuts instead. */
  @media (prefers-reduced-motion: reduce) {
    .na-mark { transition: none; }
  }
  :global(html[data-a11y-motion='reduce']) .na-mark {
    transition: none;
  }

  /* Its own container for the same reason the plot is one: the labels are
     placed off the same `cqw` arithmetic, and a container only measures its
     own descendants. */
  .na-months {
    position: relative;
    container-type: inline-size;
    height: 18px;
    /* A mark on the line hangs half its height below the plot's box, and
       this row is the next sibling, so it paints over that half and took
       the tap there - eleven of the mark's twenty-two pixels. Nothing in
       here is a control, so it takes no pointer at all. */
    pointer-events: none;
  }

  .na-month {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 4px;
    background: var(--text-2);
    translate: calc(var(--na-inset) + var(--at) * (100cqw - 2 * var(--na-inset))) 0;
  }

  .na-month-label {
    position: absolute;
    left: 0;
    top: 6px;
    width: 32px;
    margin-left: -16px;
    text-align: center;
    font-size: var(--text-xs);
    line-height: 1.2;
    color: var(--text-2);
    translate: calc(var(--na-inset) + var(--at) * (100cqw - 2 * var(--na-inset))) 0;
  }

  .na-caption {
    margin: var(--space-2) 0 0;
  }

  .na-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin: var(--space-2) 0 0;
  }

  .na-legend-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .na-legend-swatch {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
    background: var(--role-draw, var(--accent));
  }
</style>
