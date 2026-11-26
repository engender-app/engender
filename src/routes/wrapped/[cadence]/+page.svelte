<script lang="ts">
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtDuration, fmtMonthName } from '$lib/data/dates';
  import { calendarDuration } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { readWrappedPeriod } from '$lib/data/wrappedReads';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { surfaceOn } from '$lib/unprompted/registry';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { nameTagInsights, recapDimChange, recapTopTags } from '$lib/data/recapDisplay';
  import { resurfacing } from '$lib/unprompted/resurfacing';
  import { WRAPPED_CADENCES, WRAPPED_ENTRY_FLOOR, completedWrappedPeriod, type WrappedCadence } from '$lib/data/wrapped';
  import { crossfade } from '$lib/motion/reveal';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import WrappedCompact from '$lib/components/WrappedCompact.svelte';
  import WrappedYear from '$lib/components/WrappedYear.svelte';

  const today = $derived(currentDay());
  const cadence = $derived(page.params.cadence as WrappedCadence);
  const period = $derived(completedWrappedPeriod(cadence, today));
  const consentQuery = liveQuery((j) => resurfacing('wrapped', j));
  const allowed = $derived(consentQuery.value?.mayResurface(period) ?? false);
  const muted = $derived(!!consentQuery.value && !allowed);
  const on = $derived(surfaceOn(prefs.surfaceOverrides, 'wrapped'));
  const periodQuery = liveQuery((j) =>
    on && allowed
      ? readWrappedPeriod(j, { ...period, today, metric: metricKey(prefs), year: cadence === 'year' })
      : Promise.resolve(null)
  );
  const recap = $derived(periodQuery.value?.recap ?? null);
  const moodTrend = $derived(periodQuery.value?.moodTrend ?? []);
  const scaleTrend = $derived(periodQuery.value?.scaleTrend ?? []);
  const insights = $derived(nameTagInsights(periodQuery.value?.insights ?? []));
  const yearLetters = $derived(periodQuery.value?.letters ?? []);
  const dimChange = $derived(recap ? recapDimChange(recap) : null);
  const topTags = $derived(recap ? recapTopTags(recap) : []);
  const anchor = $derived(vocabulary.journeyAnchor);
  const anchorDuration = $derived(anchor ? { name: anchor.name, duration: fmtDuration(calendarDuration(anchor.epochDay, today)) } : null);
  const title = $derived(cadence === 'week' ? m.wrapped_week_title() : cadence === 'month'
    ? m.wrapped_month_title({ month: fmtMonthName(period.year, period.month ?? 0) })
    : m.wrapped_year_title({ year: String(period.year) }));
  const subtitle = $derived(cadence === 'week'
    ? m.range_from_to({ from: fmtDay(period.start, { day: 'numeric', month: 'short' }), to: fmtDay(period.end, { day: 'numeric', month: 'short' }) })
    : cadence === 'month' ? '' : m.wrapped_year_intro());
  const loading = $derived(consentQuery.loading || periodQuery.loading);
  const tabs = [
    { key: 'week', label: () => m.wrapped_cadence_week() },
    { key: 'month', label: () => m.wrapped_cadence_month() },
    { key: 'year', label: () => m.wrapped_cadence_year() }
  ];
</script>

<div class="screen">
  <ScreenHeader title={m.wrapped()} screen="wrapped" back="/" />
  {#if on}
    <Segmented key="wrapped-cadences" name={m.wrapped_cadence_group()}
      options={tabs.map((tab) => ({ value: tab.key, label: tab.label(), href: `/wrapped/${tab.key}` }))}
      value={cadence} />
  {/if}
  {#if !on}
    <Notice icon="info" key="wrapped-off" title={m.wrapped_off_title()} text={m.wrapped_off_body()}
      action={{ label: m.notif_title(), href: '/settings/notifications' }} aria-live="polite" />
  {:else if loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if muted}
    <Notice icon="eyeOff" key="wrapped-muted" title={m.wrapped_muted_title()}
      text={m.wrapped_muted_body()} action={{ label: m.eras_title(), href: '/settings/eras' }} aria-live="polite" />
  {:else if !recap || recap.entryCount < WRAPPED_ENTRY_FLOOR}
    <div class="wrapped-thin" data-wrapped-thin>
      <h2 class="wrapped-title" data-wrapped-title>{m.wrapped_thin_title()}</h2>
      <p class="muted">{m.wrapped_thin_body({ count: recap?.entryCount ?? 0, floor: String(WRAPPED_ENTRY_FLOOR) })}</p>
    </div>
  {:else if cadence === 'year'}
    <WrappedYear year={period.year} intro={subtitle} {recap} {scaleTrend} {dimChange} {topTags}
      {anchorDuration} {insights} letters={yearLetters} />
  {:else}
    <WrappedCompact {title} {subtitle} {recap} {moodTrend} {dimChange} {topTags}
      {anchorDuration} {insights} />
  {/if}
</div>
