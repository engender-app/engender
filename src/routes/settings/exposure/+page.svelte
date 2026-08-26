<script lang="ts">
  /* Cumulative exposure counters (phase 4 ticket 05), on the surface kit
     (phase 5 UX ticket 25): plain aggregates over the dose log and regimen
     episode history, recomputed for whatever range is picked - nothing here
     is stored (journal/exposure.ts). No target range, no threshold, no
     comparison: every figure below is shown exactly as
     journal.exposure.getCounters returns it.

     The range control was a hand-written copy of `.segmented` - the same
     markup with the same class names, missing the pill that slides and the
     press every control in the app owes (ticket 30). It is the real
     Segmented now, which is also the one that knows what a radiogroup has
     to announce.

     Its rows state a count and go nowhere, so they are `.kit-row.is-static`
     written out rather than ListRows, the same call WrappedCompact and
     WrappedYear make: a ListRow renders as a link or a button, and neither
     is what a figure is. */
  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { routeLabel } from '$lib/data/vocabulary/doseLabels';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const RANGES = [30, 90, 365];
  let range = $state(90);

  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  let countersQuery = liveQuery(['regimen', 'dose'], (j) => j.exposure.getCounters(from, today));
  let counters = $derived(countersQuery.value);
</script>

<div class="screen">
  <ScreenHeader title={m.exposure_title()} back="/settings/regimen" subtitle={m.exposure_intro()} />

  <Segmented
    name={m.exposure_range_group()}
    options={RANGES.map((r) => ({ value: String(r), label: m.range_days({ days: String(r) }) }))}
    value={String(range)}
    onChange={(v) => (range = Number(v))}
    compact
    key="exposure-range"
  />

  <SectionHeading text={m.exposure_dose_totals_title()} />
  {#if countersQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={2} /></div>
  {:else if counters && counters.doseTotals.length}
    <div>
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each counters.doseTotals as t (`${t.drug}-${t.route}-${t.doseUnit}`)}
          <div class="kit-row is-static" data-dose-total={`${t.drug}-${t.route}`}>
            <span class="kit-row-text">
              <span class="kit-row-title">{t.drug}</span>
              <span class="kit-row-sub">
                {m.exposure_dose_total_sub({ route: routeLabel(t.route), total: String(t.total), unit: t.doseUnit })}
              </span>
            </span>
          </div>
        {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small">{m.exposure_dose_totals_empty()}</p>
  {/if}
  {#if counters && counters.excludedDoses > 0}
    <div style="margin-top:var(--space-3)">
      <Notice icon="info" key="exposure-excluded" text={m.exposure_excluded_note({ count: String(counters.excludedDoses) })} />
    </div>
  {/if}

  <SectionHeading text={m.exposure_route_days_title()} />
  {#if countersQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={2} /></div>
  {:else if counters && counters.routeDays.length}
    <div>
      <ListCard role={roleAt(activeFlag.roles, 1)}>
        {#each counters.routeDays as r (r.route)}
          <div class="kit-row is-static" data-route-days={r.route}>
            <span class="kit-row-text">
              <!-- A regimen episode's own route is free text (types.ts), unlike
                   a dose event's closed route union - shown raw here the same
                   way settings/regimen already shows it, not run through
                   routeLabel. -->
              <span class="kit-row-title">{r.route}</span>
            </span>
            <span class="kit-row-trail">{m.exposure_days_count({ days: String(r.days) })}</span>
          </div>
        {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small">{m.exposure_route_days_empty()}</p>
  {/if}

  <SectionHeading text={m.exposure_regimen_days_title()} />
  {#if countersQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={2} /></div>
  {:else if counters && counters.regimenDays.length}
    <div>
      <ListCard role={roleAt(activeFlag.roles, 2)}>
        {#each counters.regimenDays as rd (rd.episodeId)}
          <div class="kit-row is-static" data-regimen-days={rd.episodeId}>
            <span class="kit-row-text">
              <span class="kit-row-title">{rd.drug}</span>
              <span class="kit-row-sub">{m.exposure_regimen_days_sub({ dose: String(rd.dose), unit: rd.doseUnit, route: rd.route })}</span>
            </span>
            <span class="kit-row-trail">{m.exposure_days_count({ days: String(rd.days) })}</span>
          </div>
        {/each}
      </ListCard>
    </div>
  {:else}
    <p class="muted small">{m.exposure_regimen_days_empty()}</p>
  {/if}
</div>
