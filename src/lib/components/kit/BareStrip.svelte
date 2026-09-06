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
    /** What a screen reader says for the cell - it is the only thing here
        that carries the day's meaning. */
    label: string;
    key: string | number;
  }

  let { days, role }: { days: StripDay[]; role?: Role } = $props();

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
  {#each days as day (day.key)}
    <div class="kit-strip-day" class:is-today={day.isToday}>
      <span
        class="kit-strip-cell"
        style={`--level: ${LEVELS[Math.max(0, Math.min(4, day.level))]}`}
        role="img"
        aria-label={day.label}
        data-week-cell={day.key}
      ></span>
      <span class="kit-strip-name" aria-hidden="true">{day.name}</span>
    </div>
  {/each}
</div>
