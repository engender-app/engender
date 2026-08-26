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
  import Icon from '$lib/components/Icon.svelte';
  import HeatMap from '$lib/components/HeatMap.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
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

  const LEAVE = () => motionDuration('--dur-fast', 150);

  function labelIn(_node: Element) {
    if (isReducedMotion()) return fadeOnly(crossfadeDuration());
    return {
      delay: LEAVE(),
      duration: motionDuration('--dur-med', 240),
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
          <span in:labelIn out:labelOut>{monthLabel}</span>
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
