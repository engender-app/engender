<script lang="ts">
  /* The bare strip: cells sitting directly on the page, no card around
     them. One of the six surfaces precisely because it is not a card - a
     screen built only from cards is what DIRECTION.md's decision 2b exists
     to prevent.

     Presentational: the caller brings the days and their levels, so the
     strip draws a week of a journal, a week of a metric, or a week of
     demo data without knowing which. WeekStrip.svelte is the app's
     journal-connected caller. Seven of them on a phone, and --strip-count
     lets a wider caller hand over more without this file caring how many
     (CARPET-02) - kit.css's desktop breakpoint shrinks the cells' own cap
     to keep a longer row inside the same column. */
  import { roleAttrs } from './role';
  import type { Role } from '$lib/theme/roles';

  export interface StripDay {
    /** The letter under the cell, already formatted for the locale. */
    name: string;
    /** 0-4 on the heat ramp, the same scale the calendar shades with. */
    level: number;
    isToday?: boolean;
    /** No hairline and no fill: the day is not one this strip's schedule
        had anything to say about (phase 10 redesign ticket 44). It still
        holds its column, so a week keeps its shape and today keeps its
        place in it. A blank cell and an empty-but-expected one differ by
        the outline alone and never by colour - nothing here grades a day
        (ADR-0012). */
    blank?: boolean;
    /** What a screen reader says for the cell - it is the only thing here
        that carries the day's meaning. */
    label: string;
    key: string | number;
  }

  /* `onPick` turns each day into a control (ticket 44): dilation and wear
     both open that day's session sheet from the strip, which is the write
     path their per-day rows used to carry. Without it the strip stays what
     it has always been, a drawing - WeekStrip passes none. The whole
     column is the target rather than the cell, so the letter under it is
     part of the tap and the target is taller than the 44px cell. */
  let {
    days,
    role,
    onPick
  }: { days: StripDay[]; role?: Role; onPick?: (key: string | number) => void } = $props();

  /* The heat ramp's own steps (palettes.css), so a cell here and a calendar
     cell shade the same value the same way - the hue is the only thing that
     differs, and it differs because this one is the flag's. */
  const LEVELS = [0, 22, 45, 70, 100];
</script>

<div
  class="kit-strip"
  data-kit-surface
  data-week-strip
  data-strip-count={days.length}
  {...roleAttrs(role)}
  style:--strip-count={days.length}
>
  <!-- Keyed by the column and not by the day. Paging a week (ticket 44)
       moves every day in the array at once, so keying on the day makes the
       whole row seven removals and seven insertions - and a cell that was
       just created has no state to transition from, which killed the fade
       kit.css declares for exactly this moment. The column is what stays
       put; `data-week-cell` still carries the day for anything reading it. -->
  {#each days as day, column (column)}
    {#if onPick}
      <button class="kit-strip-day" class:is-today={day.isToday} type="button" aria-label={day.label} onclick={() => onPick(day.key)}>
        {@render cell(day)}
      </button>
    {:else}
      <div class="kit-strip-day" class:is-today={day.isToday}>
        {@render cell(day)}
      </div>
    {/if}
  {/each}
</div>

<!-- The cell and its letter, drawn the same inside a column that can be
     tapped and one that cannot. Where the column is a button the day's
     meaning is on the button, so the cell is decoration; where it is not,
     the cell carries it, because there is nothing else here that could. -->
{#snippet cell(day: StripDay)}
  <span
    class="kit-strip-cell"
    style={`--level: ${LEVELS[Math.max(0, Math.min(4, day.level))]}`}
    data-blank={day.blank ? '' : undefined}
    role={onPick ? undefined : 'img'}
    aria-label={onPick ? undefined : day.label}
    data-week-cell={day.key}
  ></span>
  <span class="kit-strip-name" aria-hidden="true">{day.name}</span>
{/snippet}
