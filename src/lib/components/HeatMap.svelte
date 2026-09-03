<script lang="ts">
  /* The month, as a grid of shaded days, plus the legend that says what the
     shading is (phase 5 ticket 22).

     **The hue is the flag's, not the accent's.** Ticket 20's review moved
     Home's week strip off the accent and onto the active flag's stripe, and
     said why in one line: "so a cell here and a calendar cell are the same
     scale in the flag's hue". A week cell and a calendar cell are the same
     reading of the same day, and two hues for one reading is the drift this
     phase is undoing. Both now shade on the same five steps
     ($lib/theme/roles.ts, HEAT_STEPS) and differ only in size.

     **The cell carries no writing, which is new.** It used to hold the
     date, and a ramp from the page's own surface up to a saturated stripe
     crosses the band where neither --text nor its opposite clears 4.5:1, so
     the ink had to be computed per step (roles.ts, held to the floor by
     tests/kit-roles.test.ts). Since ticket 11 a cell can carry two fills at
     once and the date sits under it instead - see below - so this file
     reads the ramp's fills and never its inks. The inks are still the week
     strip's and the legend's business, and roles.ts still computes them.

     Under disguise there is no flag to shade with (activeFlag.svelte.ts
     publishes none), so the fills fall back to the accent ramp's own tokens
     - which is exactly what this screen looked like before roles existed.

     **A day that covered ground is drawn as two, not averaged into one**
     (phase 6 unprompted ticket 11). Averaging is the app quietly
     overwriting a day that held a hard morning and a good evening, and the
     day that most needed to be legible is the one it flattened. So a day of
     two readings on different steps is split down the middle, a half per
     reading and the earlier one on the left, and a day whose readings
     landed on one step stacks instead -
     there is no edge to draw between two halves of one colour. Three
     readings and up always stack: four bands at this size is a texture
     rather than four readings. The rule is ../data/statsCharts.ts's, and
     it has a test; this file only draws it.

     **On mood, the cell is the face a person chose.** Mood already owns
     five drawn faces and a colour ramp of its own (ADR-0025, MoodFace),
     and kit/MoodYear.svelte already draws a year of days as those faces -
     with the size they stay legible at settled by tests/mood-faces.test.ts
     and by Alicja twice on 2026-08-25. A calendar cell is bigger than any
     of those, so this is that same drawing on a bigger grid, and the fill
     is mood's own hex rather than the flag's stripe because those two
     quantities looking alike is the beta report ADR-0025 came out of.

     A gender dimension gets no face, and that is a rule rather than an
     omission: neither end of binary <-> nonbinary is the better one, and a
     mouth is the most direct way there is to say otherwise (ADR-0012, F15).
     So a dimension keeps the flag-hued square and its legend, and mood is
     round, faced, and has no legend at all - the faces are the picker's
     own five, and naming them under the grid is the app explaining itself
     to its reader (MoodYear's own note, Alicja, 2026-08-25).

     The form is Daylio's, which Alicja asked for by name on 2026-09-02
     against a screenshot of its month. Its calendar is the reason the date
     moved out from under the fill: a split cell has two fills under one
     number, and the computed per-step ink that keeps a date legible
     (roles.ts) can only answer to one of them. Two steps far enough apart
     leave no ink that clears 4.5:1 on both, so the number sits below the
     swatch on the page's own ground and the swatch carries no text at all.
     That is also what lets a stack peek out to the left without anything
     being written over.

     The legend lives here rather than on the screen because it names the
     same five steps: two things reading one ramp is how a legend ends up
     describing a chart it no longer matches. The mark is explained by the
     screen's hint instead, next to the sentence about the average, because
     the two are one claim about the same cell. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromLocalDate } from '$lib/data/epochDay';
  import { eraCoversDay } from '$lib/data/eras';
  import type { Era } from '$lib/data/types';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { heatLevel, moodStep } from '$lib/data/metricRange';
  import MoodFace from '$lib/components/MoodFace.svelte';
  import { dayShape, type DayShape } from '$lib/data/statsCharts';
  import { spreadNote } from '$lib/data/wrappedDisplay';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { HEAT_STEPS, type Role } from '$lib/theme/roles';

  let {
    year,
    month,
    role,
    eras = [],
    highlight
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
        reaching for `activeFlag` itself. */
    eras?: { era: Era; role: Role }[];
    /** The chosen presentation (phase 8 features ticket 17, ADR-0048) and
        its resolved role - which days it covers is this component's own
        read, bounded to the month on screen the same way the three reads
        above are. A mark beside the swatch rather than a border on it - the
        swatch's border already carries the era's own colour (`eraMark`
        below), and the metric's fill is never touched - so a day can be
        shaded, ringed as today, bordered for its era and marked for its
        mode all at once without any of the four reusing another's channel. */
    highlight?: { presentationId: string; role: Role };
  } = $props();

  const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  /** 1 to 4; level 0 is "nothing logged" and has its own end of the legend. */
  const SHADED = [...HEAT_STEPS.keys()].slice(1);

  let metricName = $derived(vocabulary.metricName);
  let legend = $derived(vocabulary.metricLegend);

  /* One lookup for a cell and for its legend swatch, so the two cannot
     disagree. `var(--heat-N)` rather than a colour because the fallback is
     the stylesheet's, hand-tuned per palette; the role's ramp is computed. */
  /* One lookup for a cell, a card, a half and a legend swatch, so none of
     them can disagree. On mood it is mood's own hex (ADR-0025); otherwise
     it is the role's computed ramp, falling back to the stylesheet's
     hand-tuned tokens where there is no flag to shade with. Step 0 is the
     empty end of both systems: a day nobody logged is not a day at the
     bottom of a scale (kit/MoodYear.svelte's own rule). */
  const fillAt = (step: number) =>
    step === 0 || !isMood
      ? (role?.heat[step].fill ?? `var(--heat-${step})`)
      : `var(--mood-${step})`;

  /* The month, as two epoch days. Both queries below read them before their
     first await, so stepping to another month re-runs them. */
  let bounds = $derived({
    first: epochDayFromLocalDate(new Date(year, month, 1)),
    last: epochDayFromLocalDate(new Date(year, month + 1, 0))
  });

  /* Three queries for the whole month rather than three per day. They ask
     different questions: the swatch comes from the metric's average, the
     mark under it from that day's two ends, while whether a day is a link
     comes from whether anything was logged at all - a day of entries
     carrying no mood is still a day with entries. */
  let averages = liveList((j) => j.stats.dayAverages(vocabulary.activeMetric, bounds.first, bounds.last));
  let counts = liveList((j) => j.stats.entryCountsByDay(bounds.first, bounds.last));
  let spreads = liveList((j) => j.stats.daySpread(vocabulary.activeMetric, bounds.first, bounds.last));
  /* The presentation chip (ticket 17, ADR-0048), bounded to the same month
     as the three reads above rather than resolved by the caller the way
     `eras` is: an era is a handful of rows for the whole journal, and a
     presentation's days are exactly the kind of per-month read this
     component already owns. */
  let presentationDays = liveList((j) =>
    highlight ? j.stats.presentationDays(highlight.presentationId, bounds.first, bounds.last) : Promise.resolve([])
  );
  let highlightedDays = $derived(new Set(presentationDays.rows));

  /* The three reads are one worker round trip, and the grid draws at its full
     size the whole time - a month is 30 cells of known shape, so there is
     nothing for a skeleton to stand in for and nothing to reflow. What does
     have to wait is the claim each cell makes: an empty `counts` result and a
     month with nothing logged look identical, so before the answer arrives
     every cell would tell a screen reader "no entries" for a day that has
     six. While it is loading a cell says the date and stops there. */
  let loading = $derived(averages.loading || counts.loading || spreads.loading);

  /** Mood is the one metric with faces and a ramp of its own (ADR-0025). */
  let isMood = $derived(vocabulary.activeMetric === 'mood');

  let cells = $derived.by(() => {
    // The day's value stays native; only the step it picks is normalized,
    // so a 0-10 dimension and mood shade comparably (ADR-0012).
    const range = vocabulary.rangeOf(vocabulary.activeMetric);
    /* What a step means on the metric on screen: one of mood's five faces,
       or one of the ramp's four levels. Both the fill and the split's own
       "same reading twice" rule read it, so there is one of them. */
    const stepOf = isMood ? moodStep : (value: number) => heatLevel(value, range);
    const valueByDay = new Map(averages.rows.map((point) => [point.day, point.value]));
    const countByDay = new Map(counts.rows.map((point) => [point.day, point.count]));
    const spreadByDay = new Map(spreads.rows.map((point) => [point.day, point]));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const startDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday-first
    const today = todayEpochDay();
    const out: {
      day: number;
      epochDay: number;
      /** The day's average as a step of whatever is on screen, or 0 for a
          day that carried none of the metric - which is the empty end of
          both systems and not a reading at the bottom of either. */
      step: number;
      count: number;
      /** Split, stacked or whole (../data/statsCharts.ts), or null for a
          day the metric was never logged on. Null while the read is in
          flight too: an unloaded month and a month of single-entry days
          look identical, and drawing every cell whole is a claim as much as
          splitting one is. */
      shape: DayShape | null;
      isToday: boolean;
      label: string;
      /** The era border a day draws, or none for a day in no era - a
          resting state rather than a gap (ADR-0049), so it draws like any
          other day. The first era covering the day, which the no-overlap
          invariant makes the only one, so a day spanning two named eras
          never happens - only a month doing so does, and each of its days
          still answers for itself. */
      eraName: string | null;
      eraMark: string | null;
      /** The chosen presentation's own colour, or none for a day it was not
          logged under - absence, not a category (ticket 17, ADR-0048). */
      highlightMark: string | null;
    }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const epochDay = bounds.first + d - 1;
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
         cell stacks rather than splits and the words still say "from 50 to
         52". The cell is what a month can carry; the words are what the day
         actually was. */
      const ends = loading ? null : spreadNote(vocabulary.activeMetric, spread);
      const covering = eras.find((e) => eraCoversDay(e.era, epochDay));
      out.push({
        day: d,
        epochDay,
        step: average === null ? 0 : stepOf(average),
        count,
        shape,
        isToday: epochDay === today,
        /* Joined here rather than as one message per case, which would
           mean a second set of plural forms in both languages for the sake
           of one comma. The comma is the separator on purpose: a screen
           reader pauses on it, and the middle dot this app joins visible
           asides with is read out as a word. */
        label: loading
          ? date
          : count
            ? `${m.heat_cell_entries({ date, count })}${ends ? `, ${ends}` : ''}`
            : m.heat_cell_none({ date }),
        eraName: covering?.era.name ?? null,
        eraMark: covering?.role.mark ?? null,
        highlightMark: highlight && highlightedDays.has(epochDay) ? highlight.role.mark : null
      });
    }
    return { startDow, days: out };
  });

  /* The eras actually in view, named once each for the strip under the
     grid - a month spanning two eras draws both, and a month in none draws
     no strip at all rather than an empty-state or "Uncategorized"
     (ADR-0049). */
  let eraLegend = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const c of cells.days) {
      if (c.eraName && c.eraMark && !seen.has(c.eraName)) seen.set(c.eraName, c.eraMark);
    }
    return [...seen.entries()].map(([name, mark]) => ({ name, mark }));
  });
</script>

<div class="cal-grid" role="grid" data-cal-grid aria-busy={loading}>
  {#each DOWS as d, i (i)}<span class="cal-dow" aria-hidden="true">{d}</span>{/each}
  {#each Array.from({ length: cells.startDow }) as _, i (i)}<span class="cal-day is-blank"></span>{/each}
  {#each cells.days as c (c.epochDay)}
    {#if c.count}
      <a
        class="cal-day has-entries press"
        class:is-today={c.isToday}
        data-hm-cell-filled
        href="/day/{c.epochDay}"
        aria-label={c.label}
      >
        {@render swatch(c)}
        <span class="cal-num">{c.day}</span>
      </a>
    {:else}
      <span class="cal-day" class:is-today={c.isToday} aria-label={c.label}>
        {@render swatch(c)}
        <span class="cal-num">{c.day}</span>
      </span>
    {/if}
  {/each}
</div>

<!-- The deck is drawn behind the swatch and peeks out to its left, which is
     the whole of what a stack says: how many readings, never how far apart
     they were. That question is answered by the split, and by the words the
     cell reads out. -->
{#snippet swatch(c: (typeof cells.days)[number])}
  <span class="cal-stack" class:is-round={isMood}>
    {#if c.shape?.kind === 'stack'}
      {#each Array.from({ length: c.shape.cards - 1 }) as _, i (i)}
        <span
          class="cal-card"
          data-hm-cell-stack
          style="background:{fillAt(c.step)};--card:{i + 1}"
        ></span>
      {/each}
    {/if}
    <span class="cal-swatch" style="background:{fillAt(c.step)};{c.eraMark ? `border-color:${c.eraMark};` : ''}">
      {#if c.shape?.kind === 'split'}
        <span class="cal-half" data-hm-cell-split style="background:{fillAt(c.shape.first)}"></span>
        <span class="cal-half is-later" style="background:{fillAt(c.shape.last)}"></span>
      {/if}
    </span>
    <!-- Over the halves rather than under them, and without discs of their
         own, so the colour underneath is what a face sits on.

         A split day draws two faces and shows half of each, cut on the same
         line the colour is (Alicja, 2026-09-02). Clipped rather than nested
         inside the halves, because the later half is a pixel proud on three
         sides and a face hung inside it would be a pixel off the one beside
         it; both of these are the whole cell, cut. -->
    {#if isMood && c.step > 0}
      {#if c.shape?.kind === 'split'}
        <span class="cal-face is-earlier" data-hm-cell-face
          ><MoodFace step={c.shape.first} size="100%" disc={false} /></span
        >
        <span class="cal-face is-later"><MoodFace step={c.shape.last} size="100%" disc={false} /></span>
      {:else}
        <span class="cal-face" data-hm-cell-face><MoodFace step={c.step} size="100%" disc={false} /></span>
      {/if}
    {/if}
    <!-- The presentation chip's mark (ticket 17, ADR-0048): a small dot of
         its own rather than a border or an outline, because the swatch's
         border already carries the era's colour and the outline already
         carries today's - a fourth channel needed a corner of its own
         rather than fighting either for the same edge. -->
    {#if c.highlightMark}
      <span class="cal-highlight" data-hm-cell-highlight style="background:{c.highlightMark}"></span>
    {/if}
  </span>
{/snippet}

<!-- The ends are the metric's own words, never "worst" and "best": neither
     end of binary <-> nonbinary is the better one, and colour that judges is
     the one thing this app cannot do (ADR-0012, F15).

     Mood has none. Its five faces are the same five a person picks a mood
     from every day, so a legend under them is the app explaining itself to
     its reader - which is the call kit/MoodYear.svelte already made, and
     Alicja's on 2026-08-25. -->
{#if !isMood}
  <div
    class="cal-legend"
    data-cal-legend
    aria-label={m.heat_legend_aria({ metric: metricName, low: legend.low, high: legend.high })}
  >
    <span class="cal-legend-scale">
      <span class="cal-legend-end">{legend.low}</span>
      {#each SHADED as level (level)}
        <span class="cal-legend-swatch" style="background:{fillAt(level)}"></span>
      {/each}
      <span class="cal-legend-end">{legend.high}</span>
    </span>
    <span class="cal-legend-none">
      <span class="cal-legend-swatch" style="background:{fillAt(0)}"></span>
      {m.legend_none()}
    </span>
  </div>
{/if}

{#if eraLegend.length}
  <!-- Which era's border a day is drawing (phase 6 ticket 03), named next
       to its colour the same way the metric legend already is. A month in
       no era draws no strip at all, rather than an empty state or
       "Uncategorized" (ADR-0049). -->
  <div class="cal-era-legend" data-cal-era-legend>
    {#each eraLegend as e (e.name)}
      <span class="cal-era-legend-item">
        <span class="cal-legend-swatch" style="border-color:{e.mark}"></span>
        {e.name}
      </span>
    {/each}
  </div>
{/if}

<style>
  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px 8px;
    /* The gutter a deck is dealt into, held on the grid so the swatch, the
       cards and the day's padding cannot drift apart. */
    --deck: 9px;
  }
  .cal-dow {
    text-align: center;
    font-size: var(--text-xs);
    color: var(--text-2);
    font-weight: var(--weight-bold);
  }
  .cal-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    text-decoration: none;
    color: inherit;
    /* Inside the box rather than outside it, so the deck has somewhere to
       go without the tap target losing the width it had. */
    padding-left: var(--deck);
  }
  .cal-day.is-blank { visibility: hidden; }

  /* Every day is dealt the same gutter whether or not it has a deck, so a
     stacked day does not sit a few pixels off the grid its neighbours
     keep. */
  .cal-stack {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    --r: var(--radius-xs);
    /* A half's own radii, which are not the cell's. A border-radius
       percentage resolves against the box it is on, so `50%` on a box half
       as wide as the cell draws an ellipse half as wide as the disc, and
       the two halves meet as a lopsided blob rather than as a circle
       (Alicja, 2026-09-02: "wrong shape for mood icons"). A true half-disc
       wants the full width of the half on its curved side and half the
       height on each corner, which is what `100% / 50%` says. A square
       cell's corner is a length and needs no such correction, so the two
       shapes cannot share one declaration. */
    --half-low: var(--radius-xs) 0 0 var(--radius-xs) / var(--radius-xs) 0 0 var(--radius-xs);
    --half-high: 0 var(--radius-xs) var(--radius-xs) 0 / 0 var(--radius-xs) var(--radius-xs) 0;
  }
  /* Mood is round, because a mood is a face and a face is a disc
     (MoodFace.svelte). A gender dimension is not and stays square. */
  .cal-stack.is-round {
    --r: 50%;
    --half-low: 100% 0 0 100% / 50% 0 0 50%;
    --half-high: 0 100% 100% 0 / 0 50% 50% 0;
  }
  .cal-card,
  .cal-swatch {
    position: absolute;
    inset: 0;
    border-radius: var(--r);
    /* The empty cells carry the same edge the shaded ones get from their
       fill, so a month reads as a grid rather than as scattered colour - and
       so a day with nothing logged is still a day. It is what separates one
       card of a deck from the next, too. */
    border: 1px solid var(--outline);
  }
  .cal-card { left: calc(var(--card) * -3px); }
  .cal-swatch { background: var(--heat-0); }

  /* A split is two pieces laid over each other rather than two halves butted
     together, which is the detail Alicja read off Daylio's month on
     2026-09-02: the upper half stands a pixel proud on each of its outer
     sides and a pixel over the middle, so the seam reads as an edge with a
     side in front of it. Butted, the two colours meet on a line and the cell
     looks like one shape someone recoloured half of.

     The earlier half wears the swatch's own border, since the swatch is
     underneath it and drawn to the same shape. The later half is outside
     that border on three sides, so it carries its own - without one it was
     the one piece of the cell with no edge at all (Alicja, same round). */
  .cal-half {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 50%;
    border-radius: var(--half-low);
  }
  .cal-half.is-later {
    left: auto;
    right: -1px;
    top: -1px;
    bottom: -1px;
    width: calc(50% + 2px);
    border-radius: var(--half-high);
    border: 1px solid var(--outline);
  }

  /* Over the halves, and the reason a face carries no disc of its own. */
  .cal-face {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }
  /* Cut on the colour's own seam, which sits a pixel left of centre because
     the later half is a pixel proud over the middle. Off by that pixel and
     a mouth would step across the join twice, once for the colour and once
     for the ink. */
  .cal-face.is-earlier { clip-path: inset(0 calc(50% + 1px) 0 0); }
  .cal-face.is-later { clip-path: inset(0 0 0 calc(50% - 1px)); }
  /* Today, marked by an outline rather than by a fill, because the fill is
     already saying something else. Above the deck, so a stacked today is
     still ringed once. */
  .cal-day.is-today .cal-swatch { outline: 2px solid var(--accent); outline-offset: 1px; }

  /* The presentation chip's mark (ticket 17, ADR-0048). A corner dot,
     never a border or an outline: this cell may already be wearing an
     era's border-colour and today's outline, and a fifth day carrying all
     three at once still has to show each of them. Positioned on
     `.cal-stack` rather than on the swatch, so it clears the swatch's own
     border instead of sitting on top of it. */
  .cal-highlight {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid var(--surface);
    z-index: 1;
  }

  /* The date sits under the swatch rather than on it: a split cell has two
     fills and one number, and no ink clears the floor on both (see the note
     at the top of this file). On the page's own ground it always does. */
  .cal-num {
    font-size: var(--text-xs);
    line-height: 1.2;
    color: var(--text-2);
    font-weight: var(--weight-medium);
  }
  .cal-day.has-entries .cal-num { color: var(--text); }

  .cal-legend {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    font-size: var(--text-xs);
    color: var(--text-2);
    margin-top: var(--space-4);
  }
  .cal-legend-scale { display: inline-flex; align-items: center; gap: 6px; }
  .cal-legend-none { display: inline-flex; align-items: center; gap: 5px; }
  .cal-legend-swatch {
    width: 16px;
    height: 16px;
    border-radius: 5px;
    display: inline-block;
    border: 1px solid var(--outline);
  }
  .cal-legend-end { max-width: 9ch; }

  .cal-era-legend {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    font-size: var(--text-xs);
    color: var(--text-2);
    margin-top: var(--space-2);
  }
  .cal-era-legend-item { display: inline-flex; align-items: center; gap: 5px; }
</style>
