<script lang="ts">
  /* Cumulative exposure counters (phase 4 ticket 05): plain aggregates over
     the dose log and regimen episode history, recomputed for whatever
     range is picked - nothing here is stored (journal/exposure.ts). No
     target range, no threshold, no comparison: every figure below is
     shown exactly as journal.exposure.getCounters returns it. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { routeLabel } from '$lib/data/vocabulary/doseLabels';
  import Icon from '$lib/components/Icon.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const RANGES = [30, 90, 365];
  let range = $state(90);

  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  let countersQuery = liveQuery(['regimen', 'dose'], (j) => j.exposure.getCounters(from, today));
  let counters = $derived(countersQuery.value);
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings/regimen" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.exposure_title()}</h1>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.exposure_intro()}</p>

  <div class="segmented" role="radiogroup" aria-label={m.exposure_range_group()} style="margin-bottom:var(--space-4)">
    {#each RANGES as r (r)}
      <button
        class="segment"
        class:is-active={r === range}
        role="radio"
        aria-checked={r === range}
        data-range={r}
        onclick={() => (range = r)}>{m.range_days({ days: String(r) })}</button
      >
    {/each}
  </div>

  <SectionTitle text={m.exposure_dose_totals_title()} />
  {#if countersQuery.loading}
    <Skeleton variant="line" count={2} />
  {:else if counters && counters.doseTotals.length}
    <div class="list-group" style="margin-bottom:var(--space-4)">
      {#each counters.doseTotals as t (`${t.drug}-${t.route}-${t.doseUnit}`)}
        <div class="list-row">
          <span class="row-text">
            <span class="row-title">{t.drug}</span>
            <span class="row-subtitle">
              {m.exposure_dose_total_sub({ route: routeLabel(t.route), total: String(t.total), unit: t.doseUnit })}
            </span>
          </span>
        </div>
      {/each}
    </div>
  {:else}
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.exposure_dose_totals_empty()}</p>
  {/if}

  <SectionTitle text={m.exposure_route_days_title()} />
  {#if countersQuery.loading}
    <Skeleton variant="line" count={2} />
  {:else if counters && counters.routeDays.length}
    <div class="list-group" style="margin-bottom:var(--space-4)">
      {#each counters.routeDays as r (r.route)}
        <div class="list-row">
          <span class="row-text">
            <span class="row-title">{r.route}</span>
          </span>
          <span class="muted small">{m.exposure_days_count({ days: String(r.days) })}</span>
        </div>
      {/each}
    </div>
  {:else}
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.exposure_route_days_empty()}</p>
  {/if}

  <SectionTitle text={m.exposure_regimen_days_title()} />
  {#if countersQuery.loading}
    <Skeleton variant="line" count={2} />
  {:else if counters && counters.regimenDays.length}
    <div class="list-group">
      {#each counters.regimenDays as rd (rd.episodeId)}
        <div class="list-row">
          <span class="row-text">
            <span class="row-title">{rd.drug}</span>
            <span class="row-subtitle">{m.exposure_regimen_days_sub({ dose: String(rd.dose), unit: rd.doseUnit, route: rd.route })}</span>
          </span>
          <span class="muted small">{m.exposure_days_count({ days: String(rd.days) })}</span>
        </div>
      {/each}
    </div>
  {:else}
    <p class="muted small">{m.exposure_regimen_days_empty()}</p>
  {/if}
</div>
