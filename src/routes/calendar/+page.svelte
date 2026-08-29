<script lang="ts">
  /* The Calendar tab (phase 5 ticket 22), rebuilt on the kits, with ticket
     31's month transition.

     What it was: a month bar, a sentence of prose carrying an inline button
     that opened a sheet to change the metric, and the whole month inside a
     `.card` with the legend under it.

     Three things changed.

     The metric switch is the heading's own control now, the same ChartPicker
     Home's week strip carries. Both read and write one preference
     (`prefs.metricDimension`), and offering it as a sheet here and a picker
     there meant one setting with two controls - which is the shape of the
     NAV-007 complaint the sheet was itself the fix for. Ticket 31 reached the
     same conclusion from the other direction on the same day; this is the
     merge of the two, keeping the visible label tied to the select by `for`
     and the two step buttons' walkthrough handles.

     The month is not in a card. A calendar is one grid: the card around it
     was a box drawn around the only thing on the screen, which DIRECTION.md
     2b names as what makes a screen read as generic. The grid sits on the
     page and the legend sits under it.

     And the shading is the flag's, which is HeatMap.svelte's own note.

     Colour: one area, and it is the one where the stripe is the value rather
     than the decoration, so it takes role 0 - the only index guaranteed to be
     a colour on all 8 palettes (DIRECTION.md, "colour that carries a value
     takes role 0"). Home's week strip takes it for the same reason and they
     are the same reading. */
  import { m } from '$lib/paraglide/messages';
  import { fmtMonthYear } from '$lib/data/dates';
  import { getLocale } from '$lib/paraglide/runtime';
  import flatpickr from 'flatpickr';
  import 'flatpickr/dist/flatpickr.min.css';
  import { Polish as pl } from 'flatpickr/dist/l10n/pl';
  import Icon from '$lib/components/Icon.svelte';
  import HeatMap from '$lib/components/HeatMap.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import { EASE_OUT, crossfadeDuration, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  const now = new Date();
  let year = $state(now.getFullYear());
  let month = $state(now.getMonth());

  let metricName = $derived(vocabulary.metricName);
  let monthLabel = $derived(fmtMonthYear(year, month));

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
      locale: getLocale() === 'pl' ? pl : undefined,
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
    {#snippet actions()}
      <a class="icon-btn is-outlined" href="/search" aria-label={m.search()}><Icon name="search" size={22} /></a>
    {/snippet}
  </ScreenHeader>

  <!-- The month at the section-heading size, between its two steps. Not a
       SectionHeading, which puts its one control on the same line: this
       heading has two controls of its own and they belong either side of the
       thing they move.

       The live region is the <h2>, which stays put, and the slot inside it is
       what the labels are keyed in and out of. Ticket 31 keyed the heading
       itself; moving the key inward is this ticket's one change to it, for two
       reasons. A keyed <h2> puts two headings in the document outline for the
       length of the swap. And it puts the live region on the element being
       replaced, so a screen reader meets a brand-new region rather than a
       change inside a standing one, which several of them announce twice.
       Here the region stands still and only its contents change, and
       aria-relevant defaults to additions, so the outgoing month's removal
       says nothing and the incoming month is announced once. -->
  <div class="cal-monthbar">
    <button class="icon-btn" aria-label={m.prev_month()} data-cal-step="prev" onclick={() => step(-1)}>
      <Icon name="chevronLeft" size={22} />
    </button>
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
    <button class="icon-btn" aria-label={m.next_month()} data-cal-step="next" onclick={() => step(1)}>
      <Icon name="chevronRight" size={22} />
    </button>
  </div>

  <!-- The visible words and the control's accessible name are one string,
       tied by `for`, rather than the same wording written twice with nothing
       associating them. ChartPicker's select carries the id. -->
  <div class="cal-metric">
    <label class="cal-metric-label" for="calendar-metric">{m.colour_days_by()}</label>
    <ChartPicker
      key="calendar-metric"
      id="calendar-metric"
      labelledBy="calendar-metric"
      value={vocabulary.activeMetric}
      options={metricOptions}
      onPick={(value) => selectMetric(value === 'mood' ? null : value)}
    />
  </div>

  <HeatMap {year} {month} role={roleAt(activeFlag.roles, 0)} />

  <p class="cal-hint">{m.heat_hint({ metric: metricName })}</p>
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
  /* The label is the affordance, so it reads as one: underlined the way the
     app's text actions are not, but only by a hair - the chevrons either
     side already say this bar moves months, and the button only has to say
     the words are where the bigger jump lives. */
  .cal-month-btn {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--outline-strong);
    text-underline-offset: 4px;
    text-decoration-thickness: 1px;
  }

  .cal-jump-year {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .cal-jump-year strong {
    font-family: var(--font-display);
    font-size: var(--text-lg);
  }

  .cal-jump-input {
    display: none;
  }
</style>
