<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { fmtMonthYear } from '$lib/data/dates';
  import Icon from '$lib/components/Icon.svelte';
  import HeatMap from '$lib/components/HeatMap.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { EASE_OUT, crossfadeDuration, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';

  const now = new Date();
  let year = $state(now.getFullYear());
  let month = $state(now.getMonth());

  let metricName = $derived(vocabulary.metricName);
  let legend = $derived(vocabulary.metricLegend);
  let monthLabel = $derived(fmtMonthYear(year, month));
  /* NAV-007: this used to send people to Home just to reach the same picker
     Settings offers in a sheet - two destinations for one setting, on the one
     screen actually showing the colours it changes. It became a sheet of its
     own here, and it is now the kit's picker, which is what Home's week
     already uses: the same control in both places that colour days
     (Alicja, 2026-08-25). */
  let metricOptions = $derived([
    { value: 'mood', label: m.mood() },
    ...vocabulary.activeDimensions.map((d) => ({ value: d.key, label: d.name }))
  ]);

  /* Which way the months are moving, so the label leaves the way the month
     went. Tier 3, change within a screen: the mark moves and its container
     does not.

     Two walls, and the slot's own clip is both of them (Alicja, 2026-08-25):
     one whose top edge is level with the text's bottom, one whose bottom edge
     is level with the text's top. The old month slides down behind the lower
     one and the new arrives from above the upper one - which is why neither
     half touches opacity. Nothing fades here; the wall is what hides them,
     and a piece of text that dissolves while it travels reads as two effects
     rather than one object going behind something.

     Sequenced, not crossed. The incoming label waits out the outgoing one's
     whole duration, because "as soon as the old text disappears" is the point
     of the effect: two months visible at once in the same slot would read as
     a dissolve however they were moving. Svelte starts both halves of a keyed
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

  /* --ease-out on the way out as well as in (Alicja, 2026-08-25). It was
     linear on the argument that a thing going behind a wall keeps its speed
     until it is gone, which is true of the object and wrong about the screen:
     over 150px-per-second-ish of travel and a 31px slot, the constant-speed
     version reads as a jerk rather than as momentum, and the whole swap wants
     one curve rather than two. */
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
  <ScreenHeader title={m.nav_calendar()} titleHidden>
    {#snippet actions()}
      <a class="icon-btn" href="/search" aria-label={m.search()}><Icon name="search" size={22} /></a>
    {/snippet}
  </ScreenHeader>

  <div class="cal-monthbar">
    <button class="icon-btn" aria-label={m.prev_month()} onclick={() => step(-1)}><Icon name="chevronLeft" size={22} /></button>
    <span class="cal-month-slot">
      {#key monthLabel}
        <h2 class="cal-month" in:labelIn out:labelOut>{monthLabel}</h2>
      {/key}
    </span>
    <button class="icon-btn" aria-label={m.next_month()} onclick={() => step(1)}><Icon name="chevronRight" size={22} /></button>
  </div>
  <div class="cal-metric">
    <span class="muted small">{m.coloured_by()}</span>
    <ChartPicker
      key="calendar-metric"
      label={m.colour_days_by()}
      value={metricKey(prefs)}
      options={metricOptions}
      onPick={(value) => selectMetric(value === 'mood' ? null : value)}
    />
  </div>

  <div class="card">
    <HeatMap {year} {month} />
    <!-- The ends are the metric's own words, never "worst" and "best":
         neither end of binary↔nonbinary is the better one, and colour that
         judges is the one thing this app cannot do (ADR-0012, F15). -->
    <div class="heat-legend" aria-label={m.heat_legend_aria({ metric: metricName, low: legend.low, high: legend.high })}>
      <span class="legend-end">{legend.low}</span>
      {#each [1, 2, 3, 4] as i (i)}<span class="legend-swatch" style="background:var(--heat-{i})"></span>{/each}
      <span class="legend-end">{legend.high}</span>
      <span class="legend-none"><span class="legend-swatch" style="background:var(--heat-0)"></span> {m.legend_none()}</span>
    </div>
  </div>
  <p class="muted small" style="margin-top:var(--space-4)">{m.heat_hint({ metric: metricName })}</p>

</div>
