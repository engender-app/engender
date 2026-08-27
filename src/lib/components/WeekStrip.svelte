<script lang="ts">
  /* The last seven days, as the kit's bare strip (phase 5 ticket 20's
     surface, wired to the journal here). This component is the
     journal-connected caller BareStrip.svelte names: it owns the query, the
     locale's day letters and the heat level, and the strip owns how a week
     is drawn. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { heatLevel } from '$lib/data/metricRange';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import BareStrip from './kit/BareStrip.svelte';
  import type { Role } from '$lib/theme/roles';

  let { metric, role }: { metric: string; role?: Role } = $props();

  /* Read on every recompute rather than captured once, so a session left open
     across midnight moves the strip on with the next write instead of holding
     yesterday's week. */
  let week = $derived({ first: todayEpochDay() - 6, last: todayEpochDay() });

  /* One query for the week rather than one per day: seven round trips
     through the worker to draw seven squares is the shape of read the port
     exists to avoid. Empty until it lands, so the strip draws at its full
     size with every day at level 0 and never reflows. */
  let averages = liveList((j) => j.stats.dayAverages(metric, week.first, week.last));

  let days = $derived.by(() => {
    // Native value in, swatch out: the strip and the calendar shade the
    // same day the same way whatever the metric's range is (ADR-0012).
    const range = vocabulary.rangeOf(metric);
    const byDay = new Map(averages.rows.map((point) => [point.day, point.value]));
    return Array.from({ length: 7 }, (_, idx) => {
      const day = week.first + idx;
      const level = heatLevel(byDay.get(day) ?? null, range);
      return {
        key: day,
        name: fmtDay(day, { weekday: 'narrow' }),
        level,
        isToday: day === week.last,
        label:
          level === 0
            ? m.week_cell_no_entry({ day: fmtDay(day, { weekday: 'long' }) })
            : m.week_cell_level({ day: fmtDay(day, { weekday: 'long' }), level: String(level) })
      };
    });
  });
</script>

<BareStrip {days} {role} />
