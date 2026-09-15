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
  import { noticedAxis, type NoticedChange, type NoticedDirection } from '$lib/data/noticedAxis';
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

  /** How tall one lane is, in pixels, and how much room the line and the
      marks standing on it need under the first lane. Both are read by the
      style block through `--lane-h`; the height is computed here because a
      drawing that knows how many lanes it has should not ask CSS to work
      out its own box. */
  const LANE_H = 18;
  const PLOT_BASE = 22;
  let plotHeight = $derived(PLOT_BASE + Math.max(axis.lanes - 1, 0) * LANE_H);

  /* One role per direction rather than one per mark: the three are the only
     distinction the drawing makes, and a colour per change would make the
     palette a field of unrelated dots. A direction is a fact about which
     way a change goes, not a judgement about it, so ADR-0012 has nothing to
     say here - the same reading MilestoneRail makes of a milestone drawn
     hollow because it has not happened yet. */
  const DIRECTION_ROLE: Record<NoticedDirection, number> = { feminizing: 0, masculinizing: 1, other: 2 };
  const roleFor = (direction: NoticedDirection) => roleAt(activeFlag.roles, DIRECTION_ROLE[direction]);

  const DIRECTION_ORDER: NoticedDirection[] = ['feminizing', 'masculinizing', 'other'];
  let directionsPresent = $derived(
    DIRECTION_ORDER.filter((direction) => axis.marks.some((mark) => mark.direction === direction))
  );
  function directionLabel(direction: NoticedDirection): string {
    if (direction === 'feminizing') return m.effects_direction_feminizing();
    if (direction === 'masculinizing') return m.effects_direction_masculinizing();
    return m.effects_direction_other();
  }

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

<div class="noticed-axis" data-noticed-axis>
  <p class="na-summary" data-noticed-summary>{summary}</p>

  <!-- One uncovering for the whole drawing, left to right, so the line and
       every mark on it arrive in the order they happened and no dot is
       painted before the line reaches it. A mark added or cleared later is
       its own object arriving or leaving (the crossfade below), which is
       the one thing this wipe cannot cover. -->
  <div class="na-plot" style:--lane-h="{LANE_H}px" style:height="{plotHeight}px" in:wipe={{ authored: true }}>
    <span class="na-line"></span>
    {#each axis.ticks as tick (tick.epochDay)}
      <span class="na-month" style:--at={tick.position}></span>
    {/each}
    <span class="na-today" style:--at={axis.todayPosition}></span>
    {#each axis.marks as mark (mark.key)}
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

  <div class="na-months">
    {#each axis.ticks as tick (tick.epochDay)}
      <span class="na-month-label" style:--at={tick.position}>{tickLabel(tick.monthsSinceOnset, tick.epochDay)}</span>
    {/each}
  </div>

  <p class="na-caption muted small">{axisCaption}</p>

  {#if directionsPresent.length > 1}
    <p class="na-legend muted small">
      {#each directionsPresent as direction (direction)}
        <span class="na-legend-item">
          <span class="na-legend-swatch" {...roleAttrs(roleFor(direction))}></span>{directionLabel(direction)}
        </span>
      {/each}
    </p>
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

  .na-month {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 1px;
    background: var(--outline);
    translate: calc(var(--na-inset) + var(--at) * (100cqw - 2 * var(--na-inset))) 0;
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

  /* A mark is a control and carries its own tap target, which is narrower
     than the app's 48px floor for the reason CurveMarkers' own targets are:
     at 48px two changes noticed a fortnight apart steal each other's taps.
     22px is wider than the dot and narrower than the gap the lanes
     guarantee (noticedAxis.ts's MARK_MIN_GAP, five per cent of the line, or
     about 26px at the narrowest width the app supports), so no two targets
     ever overlap however crowded the months are. */
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
       repainted there. */
    translate: calc(var(--na-inset) + var(--at) * (100cqw - 2 * var(--na-inset)))
      calc(var(--lane) * var(--lane-h) * -1);
    transition: translate var(--dur-med) var(--ease-out);
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
    height: max(0px, calc(var(--lane) * var(--lane-h) - var(--lane-h) / 2));
    background: var(--text-2);
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
    height: 14px;
    margin-top: var(--space-1);
  }

  .na-month-label {
    position: absolute;
    left: 0;
    top: 0;
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
