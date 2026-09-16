<script lang="ts">
  /* The Journal door: your days (phase 10 redesign ticket 10).

     What this screen was: a month bar, a metric picker and the heat map,
     and nothing else. The heat map is the better picture of a journal and
     the worse landing - somebody arriving at this door is usually looking
     for something they wrote - so the picture is folded away to a strip
     until it is asked for, and what they wrote leads.

     Recent entries came off Home in the shape Home drew them (ticket 13
     took the week strip itself off Home, and its compact copy lived under
     "Recent days" here until ticket 18 retired that duplicate - see below).
     Search stays in the header where it already was; starred moved out of
     the header entirely, ticket 18's decision that the starred shelf has
     one door now and it is search's own `?starred=1` filter.

     Ticket 18: "Recent entries" no longer stops at five days and a strip
     underneath repeating the same week. It grows five days at a tap
     ("Earlier entries", the same limit-growing control search's own
     "show N more" already used - ADR-0069), with a month heading falling
     out of the dates themselves wherever the month changes
     (recentEntries.ts's `recentDayHeadings`). The top strip stays exactly
     what it was: the affordance that opens the month, not a second reading
     of the same seven days.

     The header is ticket 23's field, and DIRECTION.md rule 7 says what this
     door puts on it: the month at the section-heading size and those two
     controls on the same line, no title. The month label is still the way
     into the jump sheet and still slides the way the month went (ticket
     31); it is in the field now rather than between two chevrons, so the
     two chevrons moved down to the strip's own control line.

     **The one new interaction: the month opens.** Collapsed, the month is a
     strip of bars - HeatMap's own drawing of the same read, see its
     `compact` prop. Expanded, it is the grid, the legend, the highlight
     chips and the hint. It is screen state and not a route: a month you
     opened is not somewhere you navigated to, and back should leave the
     door rather than close a panel. Both states carry the metric picker,
     which is the one control for a choice this screen makes twice (the
     strip and the week strip shade on it, and so does the grid) - two
     controls writing one preference is the NAV-007 complaint the picker was
     itself the fix for.

     Mobbin, on how a compact month behaves: Finch collapses a whole month
     into one line with a chevron on its label and Bevel leads its Journal
     with a strip over the entries, which is the arrangement here; timespent
     draws the same month twice, once as a grid and once as a micro-strip,
     which is what makes a strip and a grid legible as one thing. The travel
     between them is ours (motion/regroup.ts): every day flies from its bar
     to its cell and grows, because a month does not stop existing and a
     different month appear - it opens.

     Colour: the strip and the grid are one reading of one day, so both take
     role 0 - the only index guaranteed to be a colour on all 8 palettes
     (roles.ts; DIRECTION.md, "colour that carries a value takes role 0").
     Written out rather than through that table because here
     it is the rule about value-carrying colour and not this screen's turn in
     a reading order. The day cards do take their turn from the table, and
     take the one they took on Home, so an entry looks the same wherever it
     is drawn. */
  import { flushSync } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtMonthYear, fmtTime } from '$lib/data/dates';
    import flatpickr from 'flatpickr';
  import 'flatpickr/dist/flatpickr.min.css';
  import { pickerLocale } from '$lib/components/flatpickrLocale';
  import Icon from '$lib/components/Icon.svelte';
  import HeatMap from '$lib/components/HeatMap.svelte';
  import PresentationChipRow from '$lib/components/PresentationChipRow.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import DayCard from '$lib/components/kit/DayCard.svelte';
  import DayEntry from '$lib/components/kit/DayEntry.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { entryDayGroups, entryMarks, recentDayHeadings } from '$lib/data/recentEntries';
  import type { Era } from '$lib/data/types';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import {
    EASE_OUT,
    EASE_OUT_CSS,
    crossfadeDuration,
    fadeOnly,
    isReducedMotion,
    motionDuration
  } from '$lib/motion/tokens';
  import { maskHeight } from '$lib/motion/reveal';
  import { regroupSteps, type CellBox, type CellStep } from '$lib/motion/regroup';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { HOME_AREA_ROLE, roleAt, type Role } from '$lib/theme/roles';
  import { ui } from '$lib/stores/ui.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { entryTags } from '$lib/data/vocabulary/entryTags';
  import { entryPresentation, presentationRole } from '$lib/data/vocabulary/entryPresentation';

  const now = new Date();
  let year = $state(now.getFullYear());
  let month = $state(now.getMonth());

  let metricName = $derived(vocabulary.metricName);
  let monthLabel = $derived(fmtMonthYear(year, month));

  /* Whether this journal has anything in it at all, which decides whether
     the month and the week draw (phase 8 UX ticket 01, and Home's own rule):
     a strip of empty bars over an empty grid is day one's placeholder, and
     the one thing that screen owes is somewhere to start.

     Ticket 109: determine presence from cached journal state on initial mount
     so hasEntries does not flip from false/null to true after mount, snapping
     month controls and heatmap into layout. */
  const HAS_ENTRIES_KEY = 'engender-has-entries';

  function readCachedHasEntries(): boolean | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(HAS_ENTRIES_KEY);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch {}
    return null;
  }

  let entryCountQuery = liveQuery((j) => j.entries.countAll());
  let cachedHasEntries = $state<boolean | null>(readCachedHasEntries());

  $effect(() => {
    if (entryCountQuery.value != null) {
      const has = entryCountQuery.value > 0;
      cachedHasEntries = has;
      try {
        localStorage.setItem(HAS_ENTRIES_KEY, has ? '1' : '0');
      } catch {}
    }
  });

  let hasEntries = $derived(
    entryCountQuery.value != null
      ? entryCountQuery.value > 0
      : (cachedHasEntries ?? (prefs.onboarded ? true : false))
  );

  /* Five days, not five entries: every entry of each shown day draws, so a
     day with more than one holds its own timeline rather than a bare count
     over a truncated one (ux-carpet ticket 13, recentEntries.ts). Growing
     rather than fixed since ticket 18: five more days at a tap, the whole
     read regrown at the wider limit each time rather than a second page
     appended, which is what keeps the days already on screen from ever
     being asked for twice (ADR-0069's "batch" is the DOM's; this is still
     one bounded read per render). */
  const RECENT_DAYS_STEP = 5;
  let recentDaysLimit = $state(RECENT_DAYS_STEP);
  let recent = liveList((j) => j.entries.recentDays(recentDaysLimit));
  let dayGroups = $derived(entryDayGroups(recent.rows));
  let headedDayGroups = $derived(recentDayHeadings(dayGroups));

  /* How many more days exist to grow into, read off the journal's own
     count of days that hold anything rather than guessed from whether the
     last read came back full - a journal whose day count happens to land
     exactly on a limit is the one case that guess gets wrong. */
  let totalDaysQuery = liveQuery((j) => j.entries.countDistinctDays());
  let moreDaysRemaining = $derived(Math.max(0, (totalDaysQuery.value ?? 0) - dayGroups.length));

  /* Which era each month belongs to (phase 6 ticket 03): each era paired
     with the role it draws in, the same way role 0 is picked for the
     metric below - by position, since an era stores no colour of its own
     (ADR-0049). Under disguise `activeFlag.roles` is empty and `roleAt`
     answers undefined for every index, so the pairing drops every era
     rather than handing HeatMap a colour there is no flag to have drawn. */
  let erasQuery = liveList((j) => j.eras.getEras());
  let eraRoles = $derived.by(() => {
    const out: { era: Era; role: Role }[] = [];
    erasQuery.rows.forEach((era, i) => {
      const role = roleAt(activeFlag.roles, i);
      if (role) out.push({ era, role });
    });
    return out;
  });

  /* The presentation chip (ticket 17, ADR-0048): highlights, never
     filters, so the metric shading above stays exactly what it draws
     today. HeatMap resolves the day set itself, bounded to whichever
     month is on screen; this only resolves the role, the same division of
     labour the metric's own `role` prop keeps. */
  let selectedPresentation = $state<string | null>(null);
  let highlightRole = $derived(presentationRole(selectedPresentation));
  let highlight = $derived(
    selectedPresentation && highlightRole
      ? { presentationId: selectedPresentation, role: highlightRole }
      : undefined
  );

  /* Mood plus whichever scales this install shows, which is the same list
     Home offers - the vocabulary decides what a metric can be, in one place.

     NAV-007 is the history: this screen used to send people to Home just to
     reach the same picker Settings offered in a sheet, two destinations for
     one setting, on the one screen actually showing the colours it changes.
     It became a sheet of its own, and it is the kit's picker now - the same
     control in both places that colour days. */
  let metricOptions = $derived([
    { value: 'mood', label: m.mood() },
    ...vocabulary.activeDimensions.map((d) => ({ value: d.key, label: d.name }))
  ]);

  /* Which way the months are moving, so the label leaves the way the month
     went (ticket 31). Tier 3, change within a screen: the mark moves and its
     container does not.

     Two walls, and the slot's own clip is both of them: one whose top edge is
     level with the text's bottom, one whose bottom edge is level with the
     text's top. The old month slides down behind the lower one and the new
     arrives from above the upper one - which is why neither half touches
     opacity. Nothing fades here; the wall is what hides them, and a piece of
     text that dissolves while it travels reads as two effects rather than one
     object going behind something.

     Sequenced, not crossed. The incoming label waits out the outgoing one's
     whole duration, because "as soon as the old text disappears" is the point
     of the effect: two months visible at once in one slot would read as a
     dissolve however they were moving. Svelte starts both halves of a keyed
     swap together, so the delay is what makes it a queue. */
  let dir = $state(1);

  const LEAVE = () => motionDuration('--dur-fast');

  function labelIn(_node: Element) {
    if (isReducedMotion()) return fadeOnly(crossfadeDuration());
    return {
      delay: LEAVE(),
      duration: motionDuration('--dur-med'),
      easing: EASE_OUT,
      css: (_t: number, u: number) => `transform: translateY(${-dir * u * 100}%)`
    };
  }

  /* --ease-out on the way out as well as in. It was linear on the argument
     that a thing going behind a wall keeps its speed until it is gone, which
     is true of the object and wrong about the screen: over a 31px slot the
     constant-speed version reads as a jerk rather than as momentum, and the
     whole swap wants one curve rather than two. */
  function labelOut(_node: Element) {
    if (isReducedMotion()) return fadeOnly(crossfadeDuration());
    return {
      duration: LEAVE(),
      easing: EASE_OUT,
      css: (_t: number, u: number) => `transform: translateY(${dir * u * 100}%)`
    };
  }

  function step(delta: number) {
    dir = delta;
    let mo = month + delta;
    if (mo < 0) {
      mo = 11;
      year--;
    }
    if (mo > 11) {
      mo = 0;
      year++;
    }
    month = mo;
  }

  /* The month, open or folded to a strip. Folded is where the door opens,
     because the entries are what it is for.

     The travel is FLIP, the same arithmetic settleGrid uses on Home's tiles
     (motion/reveal.ts) and split the same way: the deltas are
     motion/regroup.ts's and node-tested, the measuring is here because it
     needs a DOM. Two forced layouts per tap, one before the state changes
     and one after `flushSync` has applied it.

     The panel's own height animates with the cells, so nothing under the
     month jumps to its new place while the days are still travelling, and it
     is clipped for exactly as long as that runs - a permanent clip would cut
     the focus ring off the chips and the grid's own today outline. */
  let monthOpen = $state(false);
  let monthBody = $state<HTMLElement | undefined>();

  function boxesOf(attr: string): CellBox[] {
    if (!monthBody) return [];
    return [...monthBody.querySelectorAll(`[${attr}]`)].map((cell) => {
      const box = cell.getBoundingClientRect();
      return {
        key: cell.getAttribute(attr) ?? '',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height
      };
    });
  }

  /** One element back where it was, and released. `scaled` is what tells the
      day's colour from the day's date: the swatch is a block of colour and a
      squash on the way is invisible, while a date scaled 0.17 across and 0.43
      down for a third of a second is mush. So the number travels and fades
      and never deforms - which is also why the two are measured apart. */
  function travel(box: CellStep, attr: string, duration: number, scaled: boolean) {
    const from = scaled
      ? `translate(${box.dx}px, ${box.dy}px) scale(${box.sx}, ${box.sy})`
      : `translate(${box.dx}px, ${box.dy}px)`;
    /* Origin in the keyframes rather than on the element: the cells are
       pressable and a press scales from their middle, which is not where a
       corner-anchored travel starts from. A keyframe property lasts as long
       as the animation and leaves nothing behind. */
    monthBody?.querySelector(`[${attr}="${box.key}"]`)?.animate(
      [
        { transform: from, transformOrigin: '0 0' },
        { transform: 'none', transformOrigin: '0 0' }
      ],
      { duration, easing: EASE_OUT_CSS }
    );
  }

  function toggleMonth() {
    const body = monthBody;
    if (!body || isReducedMotion()) {
      monthOpen = !monthOpen;
      return;
    }
    const swatches = boxesOf('data-cal-cell');
    const dates = boxesOf('data-cal-date');
    const from = body.getBoundingClientRect().height;
    monthOpen = !monthOpen;
    flushSync();
    const duration = motionDuration('--dur-slow');
    /* The panel gives or takes its own height while the cells travel inside
       it, so nothing under the month arrives at its new place in the frame
       of the tap. It is motion/reveal.ts's, beside disclose and resize,
       because animating a height is the performance contract's one named
       exception and every spend of it is tracked in that one file. */
    maskHeight(body, from, duration);
    for (const box of regroupSteps(swatches, boxesOf('data-cal-cell'))) {
      travel(box, 'data-cal-cell', duration, true);
    }
    for (const box of regroupSteps(dates, boxesOf('data-cal-date'))) {
      travel(box, 'data-cal-date', duration, false);
    }
  }

  /* Item 11: a year is twelve taps of the chevron away, which is the whole
     of the reason nobody lands on last August on purpose. The month label
     itself is the way in - it already says where you are, so it is the thing
     that offers to move you - and the sheet it opens is flatpickr doing the
     thing it has already solved: a month grid with its own dropdown month
     selector, slide animation and locale. The year stepper above it is the
     one jump flatpickr does not give you, and the month transition's
     direction follows whichever of the two moved, so arriving at a picked
     month still slides the way it went. */
  let jumpOpen = $state(false);
  let jumpInput = $state<HTMLInputElement | undefined>();
  let picker: flatpickr.Instance | null = null;

  function move(deltaMonths: number, close: boolean) {
    const total = year * 12 + month + deltaMonths;
    const y = Math.floor(total / 12);
    const mo = ((total % 12) + 12) % 12;
    dir = total > year * 12 + month ? 1 : -1;
    year = y;
    month = mo;
    if (close) jumpOpen = false;
  }

  function jumpTo(y: number, mo: number) {
    move(y * 12 + mo - (year * 12 + month), true);
  }

  function mountPicker(node: HTMLInputElement) {
    jumpInput = node;
    picker = flatpickr(node, {
      inline: true,
      defaultDate: new Date(year, month, 1),
      disableMobile: true,
      monthSelectorType: 'static',
      locale: pickerLocale(),
      /* Browsing inside the picker - its arrows, its month dropdown - walks
         the heat map along live, the sheet staying open for more. Committing
         is a day tap or the year stepper, which close it. */
      onMonthChange: (_dates, _str, inst) => {
        move(inst.currentYear * 12 + inst.currentMonth - (year * 12 + month), false);
      },
      onChange: (dates) => {
        if (dates[0]) jumpTo(dates[0].getFullYear(), dates[0].getMonth());
      }
    });
    return {
      destroy() {
        picker?.destroy();
        picker = null;
      }
    };
  }

  /* Reopen on the month the heat map is showing, not the one the picker was
     last left on - the label above the sheet is the promise of what it
     opens onto. */
  $effect(() => {
    if (jumpOpen && picker) picker.jumpToDate(new Date(year, month, 1), false);
  });
</script>

<div class="screen">
  <ScreenHeader title={m.nav_calendar()} titleHidden screen="calendar">
    <!-- The month on the field, at the section-heading size and in the
         field's ink (rule 7). The live region is the <h2>, which stays put,
         and the slot inside it is what the labels are keyed in and out of.
         Ticket 31 keyed the heading itself; the key moved inward for two
         reasons. A keyed <h2> puts two headings in the document outline for
         the length of the swap. And it puts the live region on the element
         being replaced, so a screen reader meets a brand-new region rather
         than a change inside a standing one, which several of them announce
         twice. Here the region stands still and only its contents change,
         and aria-relevant defaults to additions, so the outgoing month's
         removal says nothing and the incoming month is announced once. -->
    {#snippet field()}
      <div class="cal-field">
        <h2 class="cal-month" data-cal-month aria-live="polite">
          <span class="cal-month-slot">
            {#key monthLabel}
              <span in:labelIn out:labelOut>
                <button class="cal-month-btn" data-cal-month-btn onclick={() => (jumpOpen = true)}>
                  {monthLabel}
                </button>
              </span>
            {/key}
          </span>
        </h2>
        <!-- On the month's own line, not in `actions`, which is the title's
             line: rule 7 puts all three of these on one line, and the title
             this door does not show is what the line above would have been
             for. One control now (ticket 18): starred is a filter search
             offers on its own screen, not a second door this field hosts. -->
        <a class="icon-btn press" href="/search" aria-label={m.search()}><Icon name="search" size={22} /></a>
      </div>
    {/snippet}
  </ScreenHeader>

  {#if hasEntries}
    <!-- One line of controls, in both states and in the same place in both:
         the two month steps, the metric this month is coloured by, and the
         control that opens it. The picker is named by the words it used to
         print beside itself - the line has room for one label or four
         controls, and Home's own picker has been named this way since it
         went on a heading's line. -->
    <div class="cal-controls">
      <button class="icon-btn press" aria-label={m.prev_month()} data-cal-step="prev" onclick={() => step(-1)}>
        <Icon name="chevronLeft" size={22} />
      </button>
      <button class="icon-btn press" aria-label={m.next_month()} data-cal-step="next" onclick={() => step(1)}>
        <Icon name="chevronRight" size={22} />
      </button>
      <ChartPicker
        key="calendar-metric"
        id="calendar-metric"
        label={m.colour_days_by()}
        value={vocabulary.activeMetric}
        options={metricOptions}
        onPick={(value) => selectMetric(value === 'mood' ? null : value)}
      />
      <button
        class="icon-btn press cal-open"
        class:is-open={monthOpen}
        aria-expanded={monthOpen}
        aria-controls="calendar-month"
        aria-label={monthOpen ? m.cal_close_month() : m.cal_open_month()}
        data-cal-open
        onclick={toggleMonth}
      >
        <Icon name="chevronDown" size={22} />
      </button>
    </div>

    <div class="cal-month-body" id="calendar-month" data-cal-month-body bind:this={monthBody}>
      <HeatMap {year} {month} role={roleAt(activeFlag.roles, 0)} eras={eraRoles} {highlight} compact={!monthOpen} />
      {#if monthOpen}
        <PresentationChipRow value={selectedPresentation} onPick={(id) => (selectedPresentation = id)} />
        <p class="cal-hint">{m.heat_hint({ metric: metricName })}</p>
      {/if}
    </div>
  {/if}

  <!-- What somebody came here for. Uncapped, in the shape Home draws it:
       a day is its date bar and every entry logged on it.

       The heading waits for the first entry, which is Home's own rule and
       its own citation: "a row of grey cells and a heading over an empty
       list are two more of day one's four placeholders" (phase 8 UX ticket
       01). Day one gets the notice under the field and nothing else. -->
  {#if hasEntries}
    <SectionHeading text={m.recent_entries()} />
  {/if}
  <div class="cal-swap">
    <ReadGate read={recent} variant="card" count={3}>
      {#snippet rows()}
        <div class="cal-days">
          {#each headedDayGroups as group (group.epochDay)}
            {#if group.monthHeading}
              <!-- Falls out of the dates themselves (recentDayHeadings), not
                   inserted per screen: reads "August" the first time an
                   August day appears scrolling down from today. -->
              <SectionHeading text={fmtMonthYear(group.monthHeading.year, group.monthHeading.month)} />
            {/if}
            <DayCard
              key={String(group.epochDay)}
              role={roleAt(activeFlag.roles, HOME_AREA_ROLE.days)}
              date={fmtDay(group.epochDay, { weekday: 'long', day: 'numeric', month: 'long' })}
            >
              {#each group.entries as entry (entry.id)}
                {@const presentation = entryPresentation(entry)}
                <DayEntry
                  key={String(entry.id)}
                  href={`/entry/${entry.id}`}
                  time={fmtTime(entry.timestamp)}
                  mood={entry.mood}
                  note={entry.note ?? undefined}
                  tags={entryTags(entry)}
                  marks={entryMarks(entry)}
                  {presentation}
                />
              {/each}
            </DayCard>
          {/each}
          {#if moreDaysRemaining > 0}
            <button class="btn btn-soft" data-recent-days-more onclick={() => (recentDaysLimit += RECENT_DAYS_STEP)}>
              <span>{m.list_more_days({ count: Math.min(RECENT_DAYS_STEP, moreDaysRemaining) })}</span>
            </button>
          {/if}
        </div>
      {/snippet}
      {#snippet empty()}
        <!-- Wrapped because a transition goes on an element, not a component,
             and the empty state is the branch a first-run journal lands on -
             it owes the same crossfade the day cards get. -->
        <div>
          <Notice
            icon="book"
            key="no-entries"
            role={roleAt(activeFlag.roles, HOME_AREA_ROLE.days)}
            title={m.empty_home_title()}
            text={m.empty_home_body()}
            action={{ label: m.new_entry(), primary: true, onclick: () => (ui.chooserOpen = true) }}
          />
        </div>
      {/snippet}
    </ReadGate>
  </div>
</div>

<Sheet bind:open={jumpOpen} title={m.cal_jump_month()}>
  <div class="cal-jump">
    <div class="cal-jump-year">
      <button class="icon-btn" aria-label={m.prev_year()} onclick={() => move(-12, false)}>
        <Icon name="chevronLeft" size={22} />
      </button>
      <strong>{year}</strong>
      <button class="icon-btn" aria-label={m.next_year()} onclick={() => move(12, false)}>
        <Icon name="chevronRight" size={22} />
      </button>
    </div>
    <!-- The visible input flatpickr dresses up is not here: inline mode
         draws the whole calendar, and its own container carries it. -->
    <input class="cal-jump-input" type="text" use:mountPicker />
  </div>
</Sheet>

<style>
  /* The calendar's own classes, in the calendar's own file: every one of
     them has exactly this screen for a consumer, which is the rule
     scripts/check-screens-classes.mjs holds screens.css to. They were in
     that sheet from before it had a ratchet and rode its baseline; this
     ticket rewrites all of them, so it takes them with it.

     ---------- The month, on the field ---------- */

  /* The field's one line: the month, then the two controls at its end. */
  .cal-field {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .cal-field .cal-month { flex: 1; }

  /* The section-heading size (rule 2), which is what rule 7 gives this door
     in place of a title: it names the month the strip under it is drawing,
     and a door shows a title at 48 or shows none. Left-aligned, because the
     chevrons that used to sit either side of it are on the control line
     now, and in the field's own ink. */
  .cal-month {
    margin: 0;
    min-width: 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: var(--leading-display);
  }

  /* The slot the month name changes inside (ticket 31). One grid cell
     holding both labels, so the outgoing and the incoming month occupy the
     same place rather than pushing each other, and `overflow: hidden` is the
     pair of walls the effect is built on: one whose top is level with the
     text's bottom, one whose bottom is level with the text's top. The clip is
     what hides a label, which is why neither half of the transition touches
     opacity - a piece of text that dissolves while it travels reads as two
     effects rather than as one object going behind something.

     It sits inside the <h2> rather than around it, which is ticket 22's one
     change to ticket 31's markup - see the note in the markup. */
  .cal-month-slot {
    display: grid;
    overflow: hidden;
    min-width: 0;
  }
  .cal-month-slot > * { grid-area: 1 / 1; }

  /* The label is the affordance, so it reads as one: underlined the way the
     app's text actions are not, but only by a hair - the chevron on the
     control line already says this screen moves months, and the button only
     has to say the words are where the bigger jump lives. */
  .cal-month-btn {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    /* The one way into the jump sheet, so it answers to the app's own touch
       floor rather than to the height of 28px of ink - 29px of line box was
       what it had, and it is a control on a door. The room comes out of the
       field, which rule 7 sizes to its content; the slot's two walls move
       with it, so the label travels 48px instead of 29 on the way in and
       out. */
    display: flex;
    align-items: center;
    min-height: var(--touch-target);
    text-decoration: underline;
    /* A hair of the ink rather than the ink: at 28px in the display face,
       a full-strength rule under the words reads as a second line of the
       design rather than as an affordance, and on two lines at 320px it
       reads as three. */
    text-decoration-color: color-mix(in srgb, var(--field-ink) 50%, transparent);
    /* Inside the line box, because the slot around it is clipped to that box
       - those two walls are what the month's slide is built on (see the
       markup), and at a line-height of 1.05 an underline 5px under the
       baseline is drawn outside them and never seen. */
    text-underline-offset: 2px;
    text-decoration-thickness: 2px;
  }

  /* The chevron turns over rather than being swapped for a second glyph:
     one mark that changes state, which is what the state actually did. */
  .cal-open :global(.icon) {
    transition: transform var(--dur-med) var(--ease-out);
  }
  .cal-open.is-open :global(.icon) {
    transform: rotate(180deg);
  }

  /* ---------- The month's controls, and the month ---------- */

  /* One line, and the same line in both states: the two month steps, the
     metric, and the control that opens the month. 12 under the field rather
     than 20, because it is the field's own line of controls and not the next
     block down (rule 1). */
  .cal-controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-3) 0;
  }
  /* The picker takes the room the two labels it stands in for used to, so
     the control that opens the month lands on the screen's right edge where
     a disclosure belongs - and it is the one thing on the line that gives
     room back. The three controls are 48px targets and a flex row would
     shrink them under the floor to fit "Dysphoria <-> euphoria" at 320px;
     the picker truncates its own label instead, which it already does. */
  .cal-controls > .icon-btn { flex: none; }
  .cal-controls :global(.kit-chart-pick) { margin-right: auto; min-width: 0; }

  /* The strip or the grid, and everything the grid brings with it. Its
     height is animated on the way between the two (see toggleMonth) and
     clipped only while that runs; at rest it holds nothing back, so a focus
     ring on a chip and the grid's own outline on today are not cut. */
  .cal-month-body {
    display: grid;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  .cal-hint {
    color: var(--text-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    margin: 0;
  }

  /* ---------- The days ---------- */

  /* The gate's two branches in one cell, so the skeleton fading out does not
     push the days it was standing in for down the screen - Home's own
     treatment of the same gate. */
  .cal-swap { display: grid; }
  .cal-swap > * { grid-area: 1 / 1; }
  .cal-days { display: grid; gap: var(--space-3); align-content: start; }

  .cal-jump-year {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .cal-jump-year strong {
    font-family: var(--font-display);
    font-weight: var(--weight-display);
    font-size: var(--text-lg);
  }

  .cal-jump-input {
    display: none;
  }
</style>
