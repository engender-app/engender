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

     Its rows state a count and go nowhere, which is what `<ListRow static>`
     is (phase 5 UX ticket 40): the row renders as a plain container rather
     than a link or a button, since neither is what a figure is. */
  import { m } from '$lib/paraglide/messages';
  import { liveListIn, liveQuery } from '$lib/data/live/journal.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { routeLabel } from '$lib/data/vocabulary/doseLabels';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const RANGES = [30, 90, 365];
  let range = $state(90);

  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  /* One read, three lists on it. Each section gates on its own, through the
     one answer rather than through three reads of the same counters. */
  let countersQuery = liveQuery((j) => j.exposure.getCounters(from, today));
  /* The whole answer, for the one figure on this screen that is not a list. */
  let counters = $derived(countersQuery.value);
  let doseTotals = liveListIn(countersQuery, (c) => c.doseTotals);
  let routeDays = liveListIn(countersQuery, (c) => c.routeDays);
  let regimenDays = liveListIn(countersQuery, (c) => c.regimenDays);

  /* Both route-days and regimen-days are empty for the same reason - no
     regimen episode logged in range - so they point at the same place. */
  const regimenAction = { label: m.regimen_empty_action(), href: '/settings/regimen' };
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
  <ReadGate read={doseTotals} variant="line" count={2}>
    {#snippet rows(totals)}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each totals as t (`${t.drug}-${t.route}-${t.doseUnit}`)}
            <ListRow
              static
              data-dose-total={`${t.drug}-${t.route}`}
              title={t.drug}
              subtitle={m.exposure_dose_total_sub({ route: routeLabel(t.route), total: String(t.total), unit: t.doseUnit })}
            />
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="clock"
        key="exposure-dose-totals-empty"
        text={m.exposure_dose_totals_empty()}
        action={{ label: m.doses_empty_action(), href: '/doses' }}
      />
    {/snippet}
  </ReadGate>
  {#if counters && counters.excludedDoses > 0}
    <div class="screen-part">
      <Notice icon="info" key="exposure-excluded" text={m.exposure_excluded_note({ count: String(counters.excludedDoses) })} />
    </div>
  {/if}

  <SectionHeading text={m.exposure_route_days_title()} />
  <ReadGate read={routeDays} variant="line" count={2}>
    {#snippet rows(days)}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 1)}>
          {#each days as r (r.route)}
            <!-- A regimen episode's own route is free text (types.ts), unlike a
                 dose event's closed route union - shown raw here the same way
                 settings/regimen already shows it, not run through routeLabel. -->
            <ListRow static data-route-days={r.route} title={r.route}>
              {#snippet trailing()}{m.exposure_days_count({ days: String(r.days) })}{/snippet}
            </ListRow>
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="flask"
        key="exposure-route-days-empty"
        text={m.exposure_route_days_empty()}
        action={regimenAction}
      />
    {/snippet}
  </ReadGate>

  <SectionHeading text={m.exposure_regimen_days_title()} />
  <ReadGate read={regimenDays} variant="line" count={2}>
    {#snippet rows(days)}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 2)}>
          {#each days as rd (rd.episodeId)}
            <ListRow
              static
              data-regimen-days={rd.episodeId}
              title={rd.drug}
              subtitle={m.exposure_regimen_days_sub({ dose: String(rd.dose), unit: rd.doseUnit, route: rd.route })}
            >
              {#snippet trailing()}{m.exposure_days_count({ days: String(rd.days) })}{/snippet}
            </ListRow>
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="flask"
        key="exposure-regimen-days-empty"
        text={m.exposure_regimen_days_empty()}
        action={regimenAction}
      />
    {/snippet}
  </ReadGate>
</div>
