<script lang="ts">
  /* The month, as a grid of shaded days, plus the key that says what the
     shading is (phase 5 ticket 22).

     **The hue is the flag's, not the accent's.** Ticket 20's review moved
     Home's week strip off the accent and onto the active flag's stripe, and
     said why in one line: "so a cell here and a calendar cell are the same
     scale in the flag's hue". A week cell and a calendar cell are the same
     reading of the same day, and two hues for one reading is the drift this
     phase is undoing. Both now shade on the same five steps
     ($lib/theme/roles.ts, HEAT_STEPS) and differ only in size.

     **The cell carries no writing.** It used to hold the date, and a ramp
     from the page's own surface up to a saturated stripe crosses the band
     where neither --text nor its opposite clears 4.5:1, so the ink had to be
     computed per step (roles.ts, held to the floor by tests/kit-roles.test.ts).
     Since ticket 11 a cell can carry two fills at once and the date sits
     under it instead - see below - so this file reads the ramp's fills and
     never its inks.

     Under disguise there is no flag to shade with (activeFlag.svelte.ts
     publishes none), so the fills fall back to the accent ramp's own tokens
     - which is exactly what this screen looked like before roles existed.

     **A day that covered ground is drawn as two, not averaged into one**
     (phase 6 unprompted ticket 11). Averaging is the app quietly
     overwriting a day that held a hard morning and a good evening, and the
     day that most needed to be legible is the one it flattened. So a day
     whose first and last readings landed on different steps is split down
     the middle, first on the left, and anything else stays whole. How many
     readings a day held is a pip under the date (ticket 280, which retired
     the stack that used to peek out to the left). The rule is
     ../data/statsCharts.ts's, and it has a test; this file only draws it.

     **Only a day with readings gets a surface** (ticket 280). No cell has an
     outline: an empty past day is its numeral and nothing else, a future day
     is its numeral in --text-2, and today keeps its ring. A grid of outlined
     boxes read as a form to fill in; a month of bare numbers with the logged
     days standing out of it reads as a month.

     **On mood, the cell is the face a person chose.** Mood already owns
     five drawn faces and a colour ramp of its own (ADR-0025, MoodFace),
     and kit/YearRows.svelte drew a year of days as those faces -
     with the size they stay legible at settled by tests/mood-faces.test.ts
     and by Alicja twice on 2026-08-25. A calendar cell is bigger than any
     of those, so this is that same drawing on a bigger grid, and the fill
     is mood's own hex rather than the flag's stripe because those two
     quantities looking alike is the beta report ADR-0025 came out of.

     A gender dimension gets no face, and that is a rule rather than an
     omission: neither end of binary <-> nonbinary is the better one, and a
     mouth is the most direct way there is to say otherwise (ADR-0012, F15).
     So a dimension keeps the flag-hued square and its legend, and mood is
     round, faced, and has no scale legend at all - the faces are the
     picker's own five, and naming them under the grid is the app explaining
     itself to its reader (the year grid's own note, Alicja, 2026-08-25).

     The form is Daylio's, which Alicja asked for by name on 2026-09-02
     against a screenshot of its month. Its calendar is the reason the date
     moved out from under the fill: a split cell has two fills under one
     number, and the computed per-step ink that keeps a date legible
     (roles.ts) can only answer to one of them. Two steps far enough apart
     leave no ink that clears 4.5:1 on both, so the number sits below the
     swatch on the page's own ground and the swatch carries no text at all.

     **The grid is one object, and a month is content on it** (ticket 280).
     A month change does not slide the grid or rebuild it in one frame: each
     month is its own block, and the block leaving fades out cell by cell
     while the one arriving fades in over the same slots, in a diagonal wave
     that runs the way the month went. A metric switch is the same month, so
     it is the same elements, and every cell changes at once on one curve.
     See `waveIn`/`waveOut` below and the transitions in the stylesheet.

     The key under the grid lives here rather than on the screen because it
     names the same cells: two things reading one grid is how a key ends up
     describing a picture it no longer matches. */
  import { m } from '$lib/paraglide/messages';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromLocalDate } from '$lib/data/epochDay';
  import { eraCoversDay } from '$lib/data/eras';
  import type { Era } from '$lib/data/types';
  import { heatLevel, moodStep } from '$lib/data/metricRange';
  import MoodFace from '$lib/components/MoodFace.svelte';
  import { dayShape, type DayShape } from '$lib/data/statsCharts';
  import { spreadNote } from '$lib/data/wrappedDisplay';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { HEAT_STEPS, type Role } from '$lib/theme/roles';
  import { EASE_OUT_CSS, crossfadeDuration, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import { disclose, maskHeight } from '$lib/motion/reveal';

  let {
    year,
    month,
    role,
    eras = [],
    highlight,
    compact = false,
    direction = 1
  }: {
    year: number;
    month: number /* 0-based */;
    /** The flag stripe the shading is drawn in. Omitted - under disguise,
        or before the flag has landed - the accent ramp's own tokens stand
        in. */
    role?: Role;
    /** Which era each day belongs to (phase 6 ticket 03), each already
        carrying the role it draws in. Resolved by the caller, the same
        division of labour `role` above keeps: an era stores no colour of
        its own (ADR-0049), and under disguise there is no flag to draw one
        from - the caller hands over nothing rather than this component
        reaching for `activeFlag` itself. Named in the key under the grid,
        never on a cell (ticket 280: a cell has no outline to carry it). */
    eras?: { era: Era; role: Role }[];
    /** The chosen presentation (phase 8 features ticket 17, ADR-0048) and
        its resolved role - which days it covers is this component's own
        read, bounded to the month on screen the same way the reads below
        are. A dot in the cell's corner rather than anything on its fill, so
        a day can be shaded, ringed as today and marked for its mode all at
        once without any of the three reusing another's channel. */
    highlight?: { presentationId: string; role: Role };
    /** The month as one row of bars instead of a grid of days (phase 10
        redesign ticket 10). The Journal door opens on it: somebody arriving
        is looking for something they wrote, so the month is the shape of the
        month until they ask for the days. Same read, same ramp, same order,
        and the same elements - a bar is a cell laid out in a row with
        everything it has no room for at opacity 0, which is what lets each
        day be animated across the change rather than swapped. Whether it is
        compact is the screen's state and not this component's; the cells
        carry `data-cal-cell` for the screen to measure (motion/regroup.ts). */
    compact?: boolean;
    /** Which way the last month change went, 1 forward and -1 back, which
        is the way the wave runs across the grid (ticket 280). */
    direction?: number;
  } = $props();

  const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  /** 1 to 4; level 0 is "nothing logged" and has no swatch of its own. */
  const SHADED = [...HEAT_STEPS.keys()].slice(1);
  /** The pip stops counting here, and three dots also means "three or
      more": past it a row of dots is a texture rather than a number, and the
      exact count is read out on the cell. */
  const PIP_MAX = 3;

  let metricName = $derived(vocabulary.metricName);
  let legend = $derived(vocabulary.metricLegend);

  /* The month, as two epoch days. The reads below take them before their
     first await, so stepping to another month re-runs them. */
  let bounds = $derived({
    first: epochDayFromLocalDate(new Date(year, month, 1)),
    last: epochDayFromLocalDate(new Date(year, month + 1, 0))
  });

  /* Four reads for the whole month rather than four per day. They ask
     different questions: the fill comes from the metric's average, the
     split from that day's two ends, whether a day is a link from whether
     anything was logged at all - a day of entries carrying no mood is still
     a day with entries - and the coming-up dot from dayAhead.

     Each answer carries the month and metric it was asked about. A re-run
     keeps showing its previous answer until the new one lands (LiveQuery),
     so right after a month change or a metric switch every read still holds
     the last month's or the last metric's rows. Drawn as they stand, that is
     a grid of blanks for a round trip, or mood's values shaded on a
     dimension's ramp - one wrong frame each, and both are yanks. So the
     grid goes on showing the picture it has until all four have answered
     the new question, and only then changes (`view` below). */
  const tagged = <T,>(metric: string, rows: Promise<T[]>) =>
    rows.then((list) => ({ first: bounds.first, metric, rows: list }));
  let averages = liveQuery((j) => {
    const { first, last } = bounds;
    const metric = vocabulary.activeMetric;
    return tagged(metric, j.stats.dayAverages(metric, first, last));
  });
  let counts = liveQuery((j) => tagged('', j.stats.entryCountsByDay(bounds.first, bounds.last)));
  let spreads = liveQuery((j) => {
    const { first, last } = bounds;
    const metric = vocabulary.activeMetric;
    return tagged(metric, j.stats.daySpread(metric, first, last));
  });
  /* What is coming up this month (phase 8 features ticket 61, ADR-0067): an
     appointment, a surgery date, a milestone still ahead, a letter's unlock
     day, or a dose slot only where the schedule is not daily. A read of its
     own rather than folded into the three above - it asks a different
     question entirely, through a different registry, and a day can carry at
     most one of "logged" or "coming up" (a future day cannot yet have
     entries), so the two never have to be reconciled. Only the day matters
     here; which kind it is is the day view's own business - the grid caps
     what it draws at one mark regardless of how many kinds land on a day. */
  let dayAheadQuery = liveQuery((j) =>
    tagged('', j.dayAhead.getDayAhead(bounds.first, bounds.last, todayEpochDay()))
  );
  /* The presentation chip (ticket 17, ADR-0048), bounded to the same month
     as the reads above rather than resolved by the caller the way `eras`
     is: an era is a handful of rows for the whole journal, and a
     presentation's days are exactly the kind of per-month read this
     component already owns. Not held back with the other four: it only
     places a dot, and the dot fades in on its own. */
  let presentationDays = liveList((j) =>
    highlight ? j.stats.presentationDays(highlight.presentationId, bounds.first, bounds.last) : Promise.resolve([])
  );
  let highlightedDays = $derived(new Set(presentationDays.rows));

  /** Whether a read has answered this month and this metric - or failed,
      which is an answer too: a grid that waited on a read that will never
      land would never change month at all. */
  const answered = (
    read: { value: { first: number; metric: string } | undefined; failed: boolean },
    metric: string
  ) => read.failed || (read.value?.first === bounds.first && read.value.metric === metric);

  let ready = $derived(
    answered(averages, vocabulary.activeMetric) &&
      answered(spreads, vocabulary.activeMetric) &&
      answered(counts, '') &&
      answered(dayAheadQuery, '')
  );

  type Cell = {
    day: number;
    epochDay: number;
    /** Which diagonal of the grid the day sits on (row plus column), for
        the order the month-change wave reaches it in. */
    diagonal: number;
    /** The day's average as a step of whatever is on screen, or 0 for a
        day that carried none of the metric - which is the empty end of
        both systems and not a reading at the bottom of either. */
    step: number;
    count: number;
    /** 0, or 2 to PIP_MAX: how many dots the pip under the date draws. A
        day of one entry draws none. */
    pip: number;
    /** Split or whole (../data/statsCharts.ts), or null for a day the
        metric was never logged on. Null while the first read is in flight
        too: an unloaded month and a month of single-entry days look
        identical, and drawing every cell whole is a claim as much as
        splitting one is. */
    shape: DayShape | null;
    isToday: boolean;
    label: string;
    /** The chosen presentation's own colour, or none for a day it was not
        logged under - absence, not a category (ticket 17, ADR-0048). */
    highlightMark: string | null;
    /** Something is coming up on this day (phase 8 features ticket 61,
        ADR-0067) - always false for today or earlier, since heat already
        owns those and the two may never collide. */
    hasMark: boolean;
    /** Whether an empty cell opens a new entry for the day (ticket 99 item
        13): true for today and every day behind it, never for a day still
        ahead, since there is nothing yet to log there. */
    isPastOrToday: boolean;
  };

  type MonthView = {
    key: string;
    metric: string;
    isMood: boolean;
    startDow: number;
    loading: boolean;
    days: Cell[];
  };

  function build(loading: boolean): MonthView {
    const metric = vocabulary.activeMetric;
    /** Mood is the one metric with faces and a ramp of its own (ADR-0025). */
    const isMood = metric === 'mood';
    // The day's value stays native; only the step it picks is normalized,
    // so a 0-10 dimension and mood shade comparably (ADR-0012).
    const range = vocabulary.rangeOf(metric);
    /* What a step means on the metric on screen: one of mood's five faces,
       or one of the ramp's four levels. Both the fill and the split's own
       "same reading twice" rule read it, so there is one of them. */
    const stepOf = isMood ? moodStep : (value: number) => heatLevel(value, range);
    const rowsOf = <T,>(read: { value: { rows: T[] } | undefined }) => (loading ? [] : (read.value?.rows ?? []));
    const valueByDay = new Map(rowsOf(averages).map((point) => [point.day, point.value]));
    const countByDay = new Map(rowsOf(counts).map((point) => [point.day, point.count]));
    const spreadByDay = new Map(rowsOf(spreads).map((point) => [point.day, point]));
    const markedDays = new Set(rowsOf(dayAheadQuery).map((mark) => mark.epochDay));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const startDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday-first
    const today = todayEpochDay();
    const days: Cell[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const epochDay = bounds.first + d - 1;
      const slot = startDow + d - 1;
      const count = countByDay.get(epochDay) ?? 0;
      const average = valueByDay.get(epochDay) ?? null;
      const spread = spreadByDay.get(epochDay);
      const date = fmtDay(epochDay, { day: 'numeric', month: 'long' });
      const shape = loading ? null : dayShape(spread, stepOf);
      /* The same words the values sheet on /stats writes for the same day,
         in native units (ADR-0012). Only the drawing is normalized, and
         nothing normalized is ever read out.

         Read off the values rather than off `shape`, which is why the two
         can disagree: two readings two points apart share a step, so the
         cell stays whole and the words still say "from 50 to 52". The cell
         is what a month can carry; the words are what the day actually
         was. */
      const ends = loading ? null : spreadNote(metric, spread);
      const hasMark = !loading && epochDay > today && markedDays.has(epochDay);
      days.push({
        day: d,
        epochDay,
        diagonal: Math.floor(slot / 7) + (slot % 7),
        step: average === null ? 0 : stepOf(average),
        count,
        pip: count > 1 ? Math.min(count, PIP_MAX) : 0,
        shape,
        isToday: epochDay === today,
        /* Joined here rather than as one message per case, which would
           mean a second set of plural forms in both languages for the sake
           of one comma. The comma is the separator on purpose: a screen
           reader pauses on it, and the middle dot this app joins visible
           asides with is read out as a word. The count in these words is
           what the pip draws, so the pip needs no words of its own. */
        label: loading
          ? date
          : count
            ? `${m.heat_cell_entries({ date, count })}${ends ? `, ${ends}` : ''}`
            : hasMark
              ? m.heat_cell_coming_up({ date })
              : m.heat_cell_none({ date }),
        highlightMark: highlight && highlightedDays.has(epochDay) ? highlight.role.mark : null,
        hasMark,
        isPastOrToday: epochDay <= today
      });
    }
    return { key: `${year}-${month}`, metric, isMood, startDow, loading, days };
  }

  /* The picture on screen: rebuilt whenever every read has answered the
     question being asked, and otherwise the last picture there was - see
     the note on the reads above. The very first one has nothing before it,
     so it is the month at full size saying only its dates, which is what
     `loading` draws (the claims wait; the grid does not). */
  let held: MonthView | undefined;
  let view = $derived.by(() => {
    if (ready && !ui.tabMoving) held = build(false);
    else held ??= build(true);
    return held;
  });

  /* One lookup for a cell, a half and a legend swatch, so none of them can
     disagree. On mood it is mood's own hex (ADR-0025); otherwise it is the
     role's computed ramp, falling back to the stylesheet's hand-tuned tokens
     where there is no flag to shade with. */
  const fillAt = (step: number, isMood: boolean) =>
    isMood ? `var(--mood-${step})` : (role?.heat[step].fill ?? `var(--heat-${step})`);

  /* The eras actually in view, named once each in the key under the grid
     - a month spanning two eras names both, and a month in none names none
     rather than an empty state or "Uncategorized" (ADR-0049). */
  let eraLegend = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const c of view.days) {
      const covering = eras.find((e) => eraCoversDay(e.era, c.epochDay));
      if (covering && !seen.has(covering.era.name)) seen.set(covering.era.name, covering.role.mark);
    }
    return [...seen.entries()].map(([name, mark]) => ({ name, mark }));
  });

  /* ---------- The month change ----------

     Each cell takes --dur-fast and the whole wave fits inside --dur-med, so
     the last cell starts the difference between the two later, spread
     evenly over the grid's diagonals (the strip's single row over its
     days).
     Forward, the wave starts at the first of the month and runs to the
     last; back, it starts at the last. Both halves read the direction when
     they start, so the leaving month and the arriving one run the same way.

     Reduced motion is a substitute, not a deletion: one crossfade of the
     whole block over --dur-crossfade, no wave. These are Web Animations
     rather than CSS, so base.css's reduced-motion clamp does not flatten
     that crossfade into a cut. */
  function waveCells(node: HTMLElement, arriving: boolean) {
    // The tab already carries the incoming month as one moving block.
    if (arriving && ui.tabMoving) return 0;
    const cells = [...node.querySelectorAll<HTMLElement>('[data-cal-wave]')];
    if (isReducedMotion()) {
      node.animate([{ opacity: arriving ? 0 : 1 }, { opacity: arriving ? 1 : 0 }], {
        duration: crossfadeDuration(),
        easing: 'linear',
        fill: arriving ? 'backwards' : 'forwards'
      });
      return crossfadeDuration();
    }
    const each = motionDuration('--dur-fast');
    const spread = Math.max(0, motionDuration('--dur-med') - each);
    const orders = cells.map((cell) => Number(compact ? cell.dataset.calDay : cell.dataset.calWave));
    const last = Math.max(1, ...orders);
    cells.forEach((cell, i) => {
      const order = direction >= 0 ? orders[i] : last - orders[i];
      /* From wherever the cell is now, not from 1: a second tap while the
         first wave is still arriving turns a half-faded cell round rather
         than snapping it back to full. */
      const from = arriving ? 0 : Number(getComputedStyle(cell).opacity);
      for (const running of cell.getAnimations()) running.cancel();
      cell.animate([{ opacity: from }, { opacity: arriving ? 1 : 0 }], {
        duration: each,
        delay: (order / last) * spread,
        easing: EASE_OUT_CSS,
        fill: arriving ? 'backwards' : 'forwards'
      });
    });
    return each + spread;
  }

  function waveIn(node: HTMLElement) {
    return { duration: waveCells(node, true) };
  }

  /* The leaving month is taken out of flow as it starts, so it and the
     arriving month hold the same slots rather than stacking one under the
     other, and inert, so nobody tabs into a month that is on its way out. */
  function waveOut(node: HTMLElement) {
    node.style.position = 'absolute';
    node.style.inset = '0 0 auto 0';
    node.inert = true;
    node.setAttribute('aria-hidden', 'true');
    return { duration: waveCells(node, false) };
  }

  /* A sixth row arriving or going changes the grid's height, and the month
     body under it (the key, the chips) would jump in the frame the new month
     lands. So the block's own box eases between the two heights over the
     wave - maskHeight is motion/reveal.ts's, where every spend of a height
     animation is tracked. Measured before the swap and compared after. */
  let months = $state<HTMLElement | undefined>();
  let heightBefore = 0;
  $effect.pre(() => {
    void view.key;
    heightBefore = months?.getBoundingClientRect().height ?? 0;
  });
  $effect(() => {
    void view.key;
    if (!months || !heightBefore || isReducedMotion()) return;
    const now = months.getBoundingClientRect().height;
    if (Math.abs(now - heightBefore) > 0.5) maskHeight(months, heightBefore, motionDuration('--dur-med'));
  });

  /* A metric switch under reduced motion. The corner is movement and goes
     at once, but a fill changing colour moves nothing, and the ticket keeps
     its crossfade - which base.css's clamp would flatten into a cut, since
     it takes every CSS transition to 1ms. So the fills, halves and faces
     are read just before the switch lands, and each is animated from what
     it was with a single keyframe at offset 0: Web Animations run on to the
     underlying value by themselves, and the clamp does not reach them. */
  let shownMetric: string | undefined;
  let before = new Map<HTMLElement, { backgroundColor: string; opacity: string }>();
  $effect.pre(() => {
    const metric = view.metric;
    const switched = shownMetric !== undefined && shownMetric !== metric;
    shownMetric = metric;
    if (!switched || !months || !isReducedMotion()) return;
    before = new Map(
      [...months.querySelectorAll<HTMLElement>('.cal-fill, .cal-half, .cal-face')].map((node) => {
        const style = getComputedStyle(node);
        return [node, { backgroundColor: style.backgroundColor, opacity: style.opacity }];
      })
    );
  });
  $effect(() => {
    void view.metric;
    if (!before.size) return;
    for (const [node, was] of before) {
      // offset 0: a lone keyframe is otherwise the end one, and this is where it starts.
      if (node.isConnected) node.animate([{ ...was, offset: 0 }], { duration: crossfadeDuration(), easing: 'linear' });
    }
    before = new Map();
  });

  /* Opening the month, the faces and the dots sit the travel out (see the
     stylesheet), and only then: a metric switch fades them at once. So the
     wait is a class held for exactly the length of the travel. $effect.pre
     so that it lands in the same update that takes `is-compact` off. */
  let opening = $state(false);
  let wasCompact: boolean | undefined;
  $effect.pre(() => {
    const opened = wasCompact === true && !compact;
    wasCompact = compact;
    if (!opened) return;
    opening = true;
    const timer = setTimeout(() => (opening = false), motionDuration('--dur-slow') + motionDuration('--dur-fast'));
    return () => {
      clearTimeout(timer);
      opening = false;
    };
  });
</script>

<!-- The days are one set of elements in two layouts, and never two sets
     (phase 10 ticket 10). Compact, the grid is one row: a bar per day in the
     order they run, on the same five steps, and everything a bar has no room
     for - the date, the pip, the split, the face, the mark - fades out
     where it stands rather than being swapped away. That is the whole reason
     this is a class on the grid and not a second block of markup: an element
     that survives the change can be animated across it, and one that is
     replaced can only cut. The travel itself is the screen's
     (motion/regroup.ts).

     Compact, none of it is reachable either: 7px of width is not a tap
     target and thirty of them are not a reading. The strip is hidden from a
     screen reader, its cells are out of the tab order, and the control that
     opens the grid carries the name; every day's own words are in the grid
     one tap away.

     The day-of-week header is the one thing that cannot be laid out both
     ways - seven letters cannot align to thirty-one columns - so it is a
     block of its own - and compact it goes out of flow and fades where it
     stands rather than being switched off, so the cells' own travel is
     measured against a layout that has already given the row back. -->
<div class="cal-dows" class:is-compact={compact} aria-hidden="true">
  {#each DOWS as d, i (i)}<span class="cal-dow">{d}</span>{/each}
</div>
<!-- One block per month, keyed, so a month change is one block leaving and
     another arriving over the same slots (waveIn/waveOut). A keyed #each
     rather than #key because an each item keeps its last value once it is
     gone: the leaving block goes on drawing its own month for as long as it
     is fading, where a #key block would redraw itself as the new one. -->
<div class="cal-months" bind:this={months}>
  {#each [view] as v (v.key)}
    <div
      class="cal-grid"
      class:is-compact={compact}
      class:is-round={v.isMood}
      class:is-opening={opening}
      role="grid"
      data-cal-grid
      data-cal-month-state={compact ? 'strip' : 'grid'}
      aria-busy={v.loading}
      aria-hidden={compact ? 'true' : undefined}
      style:--days={v.days.length}
      style:--lead={v.startDow + 1}
      in:waveIn
      out:waveOut
    >
      {#each v.days as c (c.epochDay)}
        {#if c.count}
          <a class="cal-day has-entries press" class:is-today={c.isToday} class:is-split={c.shape?.kind === 'split'}
            tabindex={compact ? -1 : undefined} data-cal-wave={c.diagonal} data-cal-day={c.day - 1}
            data-hm-cell-filled href="/day/{c.epochDay}" aria-label={c.label}>
            {@render cell(c, v.isMood)}
          </a>
        {:else if c.hasMark}
          <!-- A future day with something coming up (ADR-0067): a link, the
               same as a logged day, to the same route - `/day/[day]` reads
               `dayAhead` for what to show there (ticket 62); this cell only
               says that there is something. -->
          <a class="cal-day has-mark press" tabindex={compact ? -1 : undefined}
            data-cal-wave={c.diagonal} data-cal-day={c.day - 1}
            data-hm-cell-mark href="/day/{c.epochDay}" aria-label={c.label}>
            {@render cell(c, v.isMood)}
          </a>
        {:else if c.isPastOrToday}
          <!-- A past or today cell with nothing on it opens a new entry for
               that day (ticket 99 item 13) - the same route the "+" affordances
               elsewhere in the app seed a day for, rather than leaving an empty
               cell with nothing to tap. -->
          <a class="cal-day press" class:is-today={c.isToday} tabindex={compact ? -1 : undefined}
            data-cal-wave={c.diagonal} data-cal-day={c.day - 1}
            data-hm-cell-empty href="/entry/new/{c.epochDay}" aria-label={c.label}>
            {@render cell(c, v.isMood)}
          </a>
        {:else}
          <span class="cal-day is-ahead" class:is-today={c.isToday}
            data-cal-wave={c.diagonal} data-cal-day={c.day - 1} aria-label={c.label}>
            {@render cell(c, v.isMood)}
          </span>
        {/if}
      {/each}
    </div>
  {/each}
</div>

{#if !compact}
  <!-- The ends are the metric's own words, never "worst" and "best": neither
       end of binary <-> nonbinary is the better one, and colour that judges is
       the one thing this app cannot do (ADR-0012, F15).

       Mood has none. Its five faces are the same five a person picks a mood
       from every day, so a scale under them is the app explaining itself to
       its reader - which is the call the year grid already made, and
       Alicja's on 2026-08-25. No "no entry" swatch either, since ticket 280:
       a day with nothing logged has no box to show a swatch of.

       Disclosed rather than inserted, because it is the one thing a metric
       switch adds to or takes from the height of the screen: mounted in one
       frame, the key and the chips under it jumped a row. -->
  {#if !view.isMood}
    <div
      class="cal-legend"
      data-cal-legend
      data-cal-sits-out
      transition:disclose
      aria-label={m.heat_legend_aria({ metric: metricName, low: legend.low, high: legend.high })}
    >
      <span class="cal-legend-end">{legend.low}</span>
      {#each SHADED as level (level)}
        <span class="cal-legend-swatch" style="background:{fillAt(level, false)}"></span>
      {/each}
      <span class="cal-legend-end">{legend.high}</span>
    </div>
  {/if}

  <!-- One line of caption under the grid: which era the month sits in, and
       what a split and the dots mean (ticket 280). The same words on every
       metric: what deeper colour means is the scale's to say above, and on
       mood the faces say it, so a sentence naming the metric only made the
       line rewrap, and the chips under it jump, on every switch. The eras were a hollow
       swatch that read as a checkbox, over a border on every cell; the cells
       have no border now, so an era is named here and only here - a dot in
       its colour, the same mark the highlight chip puts on a day. -->
  <p class="cal-key" data-cal-key data-cal-sits-out>
    {#each eraLegend as e (e.name)}
      <span class="cal-key-era" data-cal-era-legend>
        <span class="cal-key-dot" style="background:{e.mark}"></span>{e.name}
      </span>
    {/each}
    <span>{m.heat_hint()}</span>
  </p>
{/if}

<!-- One cell: the surface, which is the part that travels between the strip
     and the grid and scales on the way, and the date with its pip, which
     travels too and never deforms - so the two are measured apart
     (`data-cal-cell`, `data-cal-date`). -->
{#snippet cell(c: Cell, isMood: boolean)}
  {@const split = c.shape?.kind === 'split' ? c.shape : null}
  <span class="cal-cell" data-cal-cell={c.epochDay}>
    <!-- Every layer is the whole cell, and a half is that whole cell cut: a
         clip rather than a box half as wide, so a half keeps the cell's own
         corner whatever the radius is doing, and the 2px gutter between the
         two halves is the page's own ground showing through. -->
    <span class="cal-fill" class:is-empty={c.step === 0} style={c.step ? `background:${fillAt(c.step, isMood)}` : undefined}></span>
    <span class="cal-half is-earlier" data-hm-cell-split={split ? '' : undefined}
      style={split ? `background:${fillAt(split.first, isMood)}` : undefined}></span>
    <span class="cal-half is-later" style={split ? `background:${fillAt(split.last, isMood)}` : undefined}></span>
    <!-- Over the fills, with no disc of their own, so the colour underneath is
         what a face sits on. Mounted on every metric and every day, and
         faded rather than inserted: the face a late read resolves, a metric
         switch to mood, and the face a split hands over to a whole one all
         need an element that was already there to fade in from (ticket 99
         item 7, "the faces... should fade in, not appear in 1 frame").
         Mood only, which is a rule (ADR-0012, F15): `is-on` is where it is
         kept, and it is never on for a gender dimension. -->
    <span class="cal-face" class:is-on={isMood && !split && c.step > 0} data-hm-cell-face data-cal-sits-out
      ><MoodFace step={c.step || 1} size="100%" disc={false} /></span
    >
    <span class="cal-face is-earlier" class:is-on={isMood && !!split} data-cal-sits-out
      ><MoodFace step={split?.first ?? (c.step || 1)} size="100%" disc={false} /></span
    >
    <span class="cal-face is-later" class:is-on={isMood && !!split} data-cal-sits-out
      ><MoodFace step={split?.last ?? (c.step || 1)} size="100%" disc={false} /></span
    >
    <!-- Centred: a future cell carries no fill or face for a corner mark to
         sit clear of, and the centre is the one place on this cell nothing
         else ever draws (ADR-0067: heat and a mark are mutually exclusive by
         construction). -->
    <span class="cal-mark" class:is-on={c.hasMark} data-cal-sits-out data-hm-cell-mark-dot={c.hasMark ? '' : undefined}></span>
    <!-- The presentation chip's mark (ticket 17, ADR-0048): a corner dot of
         its own, because the outline already carries today. -->
    <span class="cal-highlight" class:is-on={!!c.highlightMark} data-cal-sits-out data-hm-cell-highlight={c.highlightMark ? '' : undefined}
      style={c.highlightMark ? `background:${c.highlightMark}` : undefined}></span>
  </span>
  <span class="cal-date" data-cal-date={c.epochDay}>
    <span class="cal-num">{c.day}</span>
    <!-- Dots rather than a numeral, which would read as a second date. Two
         are always drawn so a day gaining its second entry fades them in
         rather than inserting them; the count they stand for is in the
         cell's own words. -->
    <span class="cal-pip" class:is-on={c.pip > 0} aria-hidden="true">
      {#each Array.from({ length: Math.max(c.pip, 2) }) as _, i (i)}<span class="cal-pip-dot"></span>{/each}
    </span>
  </span>
{/snippet}

<style>
  .cal-dows {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0 8px;
    transition: opacity var(--dur-med) var(--ease-out);
  }
  .cal-dow {
    text-align: center;
    font-size: var(--text-xs);
    color: var(--text-2);
    font-weight: var(--weight-bold);
  }
  /* Out of flow before it fades, so the row it held is given back in the
     frame of the tap - which is the layout the cells' travel is measured
     against. Left where it was: an absolutely positioned box with every
     offset auto keeps its static position. */
  .cal-dows.is-compact {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  /* Where the leaving month is pinned while the arriving one takes its
     slots (waveOut). */
  .cal-months { position: relative; }

  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    /* The row gap is the space between one day and the next; the gap inside
       a day, between its surface and its date, is 2px (.cal-day). Wide here
       and tight there is what makes a surface and its number read as one
       unit rather than as a date belonging to the cell underneath it. */
    gap: 10px 8px;
    --r: var(--r-block);
  }
  /* Mood is the same rounded square every other mood face in the app draws
     (ticket 99 item 7), not a circle - 26.7% is moodFace.ts's MOOD_BLOCK,
     the same fraction `.mood-btn .mood-face` and `.kit-mood .mood-face`
     use. Every layer of a cell is the whole cell, so the one fraction is
     right on all of them, halves included. A gender dimension takes no
     share of a face's shape and stays var(--r-block). */
  .cal-grid.is-round { --r: 26.7%; }
  /* No lead-in element: the first of the month starts in its own column. */
  .cal-grid > :first-child { grid-column-start: var(--lead); }

  /* The same days as one row (phase 10 ticket 10). A bar rather than a small
     square because the row holds 31 of them inside 280px at the narrowest -
     7px of width is all a day gets, and 7px tall as well would be a speck.
     Tall and thin it reads as a month the way a barcode reads as a barcode.
     Unlike the grid, every day in the strip is a bar, logged or not - the
     empty end of the ramp - so a quiet month is still thirty days and not a
     blank line. 2px corners, which is what DIRECTION.md rule 9 gives a
     bar's ends (`.kit-bar-mark`).

     Everything a bar has no room for goes to opacity 0 rather than out of
     the markup - the date, the pip, the split's two halves, the face, the
     mark, the highlight dot. They are the same elements in both layouts, so
     each of them fades as its cell travels instead of being gone in the
     frame the tap landed. */
  .cal-grid.is-compact {
    grid-template-columns: repeat(var(--days), minmax(0, 1fr));
    gap: 2px;
    --r: 2px;
    /* Room under the bars for today's mark, which is drawn below rather than
       around. */
    padding-bottom: 6px;
  }
  .cal-grid.is-compact > :first-child { grid-column-start: auto; }
  .cal-grid.is-compact .cal-day {
    gap: 0;
    /* 7px is not a tap target and thirty of them are not a reading: the
       strip is the screen's control to open, and only that. */
    pointer-events: none;
  }
  .cal-grid.is-compact .cal-cell {
    aspect-ratio: auto;
    height: 24px;
  }
  .cal-grid.is-compact .cal-date { position: absolute; opacity: 0; }
  .cal-grid.is-compact .cal-fill,
  .cal-grid.is-compact .is-split .cal-fill { opacity: 1; }
  .cal-grid.is-compact .cal-fill.is-empty { background: var(--heat-0); }
  .cal-grid.is-compact .cal-half,
  .cal-grid.is-compact .cal-face,
  .cal-grid.is-compact .cal-mark,
  .cal-grid.is-compact .cal-highlight { opacity: 0; }

  .cal-day {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-decoration: none;
    color: inherit;
  }

  .cal-cell {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--r);
    transition:
      border-radius var(--dur-med) var(--ease-out),
      outline-color var(--dur-med) var(--ease-out);
  }
  .cal-fill,
  .cal-half {
    position: absolute;
    inset: 0;
    border-radius: var(--r);
    background: transparent;
    /* The metric switch is one curve for every cell (ticket 280): the
       corner, the fill and the face all change together over --dur-med.
       The fill and the halves carry the only thing that differs between two
       metrics over the same month - the grid, the dates and the marks all
       stay - so the change restates rather than reveals. The same
       transitions are what fade a late read's colour in. */
    transition:
      background-color var(--dur-med) var(--ease-out),
      border-radius var(--dur-med) var(--ease-out),
      opacity var(--dur-med) var(--ease-out);
  }
  /* A split day's surface is its two halves alone, with the page's ground
     between them rather than the average showing through the gutter. The
     strip has no room for halves, so it shows the average instead (above). */
  .is-split .cal-fill { opacity: 0; }
  .cal-half { opacity: 0; }
  .is-split .cal-half { opacity: 1; }
  /* 2px of gutter, centred: each half stops a pixel short of the middle. */
  .cal-half.is-earlier,
  .cal-face.is-earlier { clip-path: inset(0 calc(50% + 1px) 0 0); }
  .cal-half.is-later,
  .cal-face.is-later { clip-path: inset(0 0 0 calc(50% + 1px)); }

  /* Over the fills, and the reason a face carries no disc of its own. Off
     is faded and a little smaller, which is the metric switch's own
     gesture: a face going to 0.8 as it fades reads as it receding into the
     fill, rather than as a sticker being peeled off. */
  .cal-face {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transform: scale(0.8);
    transition:
      opacity var(--dur-med) var(--ease-out),
      transform var(--dur-med) var(--ease-out);
  }
  .cal-face.is-on {
    opacity: 1;
    transform: none;
  }
  /* A disc cannot be stretched, and the travel between strip and grid
     scales a cell 0.17 across and 0.6 down, which on the recording turned
     every face into an egg and every dot into an ellipse. So opening the
     month, they sit the travel out: gone in the frame of the tap, and back
     over a beat once the cells have landed (ticket 99 item 7 round 2 - a
     shorter delay rode the tail of the travel and read as a pop). Closing,
     the screen fades them where they stand before the days fold
     (`data-cal-sits-out`, the calendar's toggleMonth), so by the time the
     strip's layout squashes them there is nothing left to see. */
  .cal-grid.is-opening .cal-face,
  .cal-grid.is-opening .cal-mark,
  .cal-grid.is-opening .cal-highlight {
    transition:
      opacity var(--dur-fast) var(--ease-out) var(--dur-slow),
      transform 0s;
  }
  .cal-grid.is-compact .cal-face,
  .cal-grid.is-compact .cal-mark,
  .cal-grid.is-compact .cal-highlight {
    transition: opacity 0s;
  }

  /* Today, marked by a ring rather than by a fill, because the fill is
     already saying something else - and the ring is on the cell's box, so
     an empty today is ringed too.

     Compact it is marked under the bar instead: a 2px ring around a 7px bar
     2px from its neighbours crosses both of them. The two marks cross-fade,
     so today is never unmarked mid-travel and never marked twice. */
  .cal-day.is-today .cal-cell { outline: 2px solid var(--accent); outline-offset: 1px; }
  .cal-day.is-today::after {
    content: '';
    position: absolute;
    inset: auto 0 -5px;
    height: 2px;
    background: var(--accent);
    opacity: 0;
    /* Off at once, on over a beat. A transition is read off the state being
       moved to, so this is the pair: closing the month, the mark arrives
       under the bar as the bar settles; opening it, the mark is gone in the
       frame of the tap rather than hanging 2px of accent under a cell the
       days have not reached yet. */
    transition: opacity 0s;
  }
  .cal-grid.is-compact .cal-day.is-today .cal-cell { outline-color: transparent; }
  .cal-grid.is-compact .cal-day.is-today::after {
    opacity: 1;
    transition: opacity var(--dur-med) var(--ease-out);
  }

  /* The presentation chip's mark (ticket 17, ADR-0048), in the cell's
     corner, rimmed in the page's ground so it cuts cleanly out of a fill. */
  .cal-highlight {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid var(--bg);
    z-index: 2;
  }

  /* What is coming up (phase 8 features ticket 61, ADR-0067): drawn in the
     accent, the colour the app already uses to say "this is where you are,
     or where you are headed" (today's own ring above), and never a count or
     a shape: a mark is a day and a kind, never a verdict. */
  .cal-mark {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
  .cal-mark,
  .cal-highlight {
    opacity: 0;
    transition: opacity var(--dur-med) var(--ease-out);
  }
  .cal-mark.is-on,
  .cal-highlight.is-on { opacity: 1; }

  /* The date sits under the surface rather than on it: a split cell has two
     fills and one number, and no ink clears the floor on both (see the note
     at the top of this file). On the page's own ground it always does.
     Bold, so it holds its own under a filled surface; --text for every day
     that has happened and --text-2 for the ones still ahead. */
  .cal-date {
    display: grid;
    justify-items: center;
    gap: 2px;
    transition: opacity var(--dur-med) var(--ease-out);
  }
  .cal-num {
    font-size: var(--text-xs);
    line-height: 1;
    color: var(--text);
    font-weight: var(--weight-bold);
  }
  .cal-day.is-ahead .cal-num,
  .cal-day.has-mark .cal-num { color: var(--text-2); }

  /* The pip. Its row is held on every day, so a day gaining a second entry
     changes nothing around it. */
  .cal-pip {
    display: flex;
    gap: 2px;
    height: 3px;
    opacity: 0;
    transition: opacity var(--dur-med) var(--ease-out);
  }
  .cal-pip.is-on { opacity: 1; }
  .cal-pip-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--text-2);
  }

  .cal-legend {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    color: var(--text-2);
  }
  .cal-legend-swatch {
    width: 16px;
    height: 16px;
    border-radius: var(--r-block);
  }
  .cal-legend-end { max-width: 9ch; }

  /* Caption size in --text-2, which is what a key is: it answers a
     question somebody looking at the grid might have, and does not ask to be
     read first. */
  .cal-key {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    line-height: 1.4;
    color: var(--text-2);
  }
  .cal-key-era {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text);
    font-weight: var(--weight-medium);
  }
  .cal-key-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
