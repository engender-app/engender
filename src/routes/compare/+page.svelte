<script lang="ts">
  /* Two periods side by side (phase 5 UX ticket 23's rebuild). Linked from
     the Stats hub's own list.

     Every number comes straight from the recap/day-average seam (ticket 10)
     two independent times, one per period. Nothing here computes a
     difference between the two, and that is the whole design of the screen:
     the reader compares, the app does not. A delta column would be the app
     saying which period was better, which is the one thing it never does
     (PRODUCT.md, ADR-0012).

     The two pickers stack rather than sitting in two columns. They shared
     `.compare-wrap` with the progress-photo comparison, which is a two-up
     grid built for two photographs; two date fields squeezed into half of a
     390px screen is not the same thing, and the two screens have nothing
     else in common. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import {
    customInclusiveRange,
    dateInputValueFromEpochDay,
    epochDayFromDateInputValue,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { eraRangeOrNull } from '$lib/data/eras';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import type { Journal } from '$lib/data/journal/journal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
  import Icon from '$lib/components/Icon.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  interface Period {
    start: number;
    end: number;
    label: string;
  }

  /* Phase 6 ticket 03: each side takes either a date range, as before, or
     one of the person's own eras - the two sides may be any mix, including
     one of each, since neither side knows or cares what the other is. */
  type PeriodMode = 'range' | 'era';

  let erasQuery = liveList((j) => j.eras.getEras());
  let boundsQuery = liveQuery((j) => j.eras.getJournalBounds());

  interface ComparisonSideStats {
    entryCount: number;
    averageMood: number | null;
    bestStreak: number;
    topTagLabel: string;
    dimensionAverages: { name: string; average: number | null }[];
  }

  let today = $derived(todayEpochDay());
  let todayInput = $derived(dateInputValueFromEpochDay(today));

  let aMode = $state<PeriodMode>('range');
  let bMode = $state<PeriodMode>('range');
  let aStart = $state('');
  let aEnd = $state('');
  let bStart = $state('');
  let bEnd = $state('');
  let aEraId = $state('');
  let bEraId = $state('');

  /** Which side the era-picker sheet is open for, or none. One sheet rather
      than two: only one side is ever being picked at a time. */
  let eraPickerSide = $state<'a' | 'b' | null>(null);

  function periodFromRange(start: string, end: string): Period | null {
    const range = customInclusiveRange(epochDayFromDateInputValue(start), epochDayFromDateInputValue(end));
    if (!range || range.end > today) return null;
    return {
      ...range,
      label: `${fmtDay(range.start, { day: 'numeric', month: 'short' })} to ${fmtDay(range.end, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })}`
    };
  }

  /* An era id naming nothing - never picked yet, or an era deleted after it
     was - resolves to no period, the same resting state every other
     era-adopting surface falls back to (ADR-0049). */
  function periodFromEra(eraId: string): Period | null {
    const found = erasQuery.rows.find((e) => e.id === eraId);
    if (!found) return null;
    const range = eraRangeOrNull(found, boundsQuery.value ?? null);
    return range ? { start: range.startEpochDay, end: range.endEpochDay, label: found.name } : null;
  }

  let periodA = $derived(aMode === 'era' ? periodFromEra(aEraId) : periodFromRange(aStart, aEnd));
  let periodB = $derived(bMode === 'era' ? periodFromEra(bEraId) : periodFromRange(bStart, bEnd));

  async function sideStats(j: Journal, period: Period): Promise<ComparisonSideStats> {
    const recap = await j.stats.recap(period.start, period.end);
    const dims = vocabulary.activeDimensions;
    const series = await Promise.all(dims.map((d) => j.stats.dayAverages(d.key, period.start, period.end)));
    return {
      entryCount: recap.entryCount,
      averageMood: recap.averageMood,
      bestStreak: recap.bestStreak,
      topTagLabel: recap.topTags.length
        ? recap.topTags
            .map((t) =>
              m.recap_tag_count({ label: vocabulary.tag(t.id)?.label ?? t.id, count: String(t.count) })
            )
            .join(' · ')
        : m.recap_tags_none_range(),
      dimensionAverages: dims.map((d, i) => ({
        name: d.name,
        average: series[i].length ? series[i].reduce((sum, p) => sum + p.value, 0) / series[i].length : null
      }))
    };
  }

  let queryA = liveQuery((j) =>
    periodA ? sideStats(j, periodA) : Promise.resolve(null)
  );
  let queryB = liveQuery((j) =>
    periodB ? sideStats(j, periodB) : Promise.resolve(null)
  );

  /* An empty cell says nothing rather than drawing a glyph that stands in
     for a sentence: docs/ui-copy.md has no dashes in it. */
  const fmtMood = (v: number | null) => (v == null ? '' : v.toFixed(1));
  const fmtDimension = (v: number | null) => (v == null ? '' : String(Math.round(v)));

  /* What the field shows when it has a date, and what it says when it does
     not. The value is painted by the row; the input over it is the press
     target and the thing that opens Android's own picker. */
  const shownDate = (value: string) => {
    const day = epochDayFromDateInputValue(value);
    return day === null || !Number.isFinite(day) ? null : fmtDay(day, { day: 'numeric', month: 'long', year: 'numeric' });
  };
</script>

<div class="screen">
  <ScreenHeader title={m.compare_title()} subtitle={m.compare_sub()} screen="compare" back="/stats" />

  <!-- One snippet for the four fields. A date is a row of a list here, not
       a text box: the label on the left, the date in the display face on the
       right, and the DatePicker spread invisibly over the whole row as the
       press target - its popup is what opens, and it knows the reader's
       locale and their week start. -->
  {#snippet dateRow(id: string, label: string, name: string, value: string, bind: (v: string) => void, min: string | undefined)}
    {@const shown = shownDate(value)}
    <div class="rows-divide date-row">
      <label class="date-row-label" for={id}>{label}</label>
      <span class="date-row-value">{shown ?? ''}</span>
      <span class="date-row-icon"><Icon name="calendar" size={18} /></span>
      <DatePicker {id} value={value} {min} max={todayInput} ariaLabel={name} invis onchange={(v) => bind(v)} />
    </div>
  {/snippet}

  <!-- The mode switch, one per side - a side is a date range or an era,
       never both at once, so only one of the two rows below ever shows. -->
  {#snippet modeSwitch(key: string, period: string, mode: PeriodMode, onPick: (v: PeriodMode) => void)}
    <div class="compare-mode">
      <Segmented
        key={`compare-mode-${key}`}
        name={m.compare_start_label({ period })}
        compact
        options={[
          { value: 'range', label: m.compare_mode_range() },
          { value: 'era', label: m.compare_mode_era() }
        ]}
        value={mode}
        onChange={(v) => onPick(v as PeriodMode)}
      />
    </div>
  {/snippet}

  <SectionHeading text={m.compare_period_a_label()} />
  {@render modeSwitch('a', m.compare_period_a_label(), aMode, (v) => (aMode = v))}
  {#if aMode === 'era'}
    <ListCard role={roleAt(activeFlag.roles, 0)}>
      <ListRow
        key="compare-era-row-a"
        icon="curve"
        title={erasQuery.rows.find((e) => e.id === aEraId)?.name ?? m.compare_pick_era()}
        onclick={() => (eraPickerSide = 'a')}
      />
    </ListCard>
  {:else}
    <div class="compare-picker" {...roleAttrs(roleAt(activeFlag.roles, 0))}>
      {@render dateRow(
        'compare-a-start',
        m.recap_custom_start_label(),
        m.compare_start_label({ period: m.compare_period_a_label() }),
        aStart,
        (v) => (aStart = v),
        undefined
      )}
      {@render dateRow(
        'compare-a-end',
        m.recap_custom_end_label(),
        m.compare_end_label({ period: m.compare_period_a_label() }),
        aEnd,
        (v) => (aEnd = v),
        aStart || undefined
      )}
    </div>
  {/if}

  <SectionHeading text={m.compare_period_b_label()} />
  {@render modeSwitch('b', m.compare_period_b_label(), bMode, (v) => (bMode = v))}
  {#if bMode === 'era'}
    <ListCard role={roleAt(activeFlag.roles, 1)}>
      <ListRow
        key="compare-era-row-b"
        icon="curve"
        title={erasQuery.rows.find((e) => e.id === bEraId)?.name ?? m.compare_pick_era()}
        onclick={() => (eraPickerSide = 'b')}
      />
    </ListCard>
  {:else}
    <div class="compare-picker" {...roleAttrs(roleAt(activeFlag.roles, 1))}>
      {@render dateRow(
        'compare-b-start',
        m.recap_custom_start_label(),
        m.compare_start_label({ period: m.compare_period_b_label() }),
        bStart,
        (v) => (bStart = v),
        undefined
      )}
      {@render dateRow(
        'compare-b-end',
        m.recap_custom_end_label(),
        m.compare_end_label({ period: m.compare_period_b_label() }),
        bEnd,
        (v) => (bEnd = v),
        bStart || undefined
      )}
    </div>
  {/if}

  {#if !periodA || !periodB}
    <Notice icon="info" key="compare-empty" title={m.compare_empty()} />
  {:else if queryA.loading || queryB.loading || !queryA.value || !queryB.value}
    <Skeleton variant="line" count={5} />
  {:else}
    {@const a = queryA.value}
    {@const b = queryB.value}
    <!-- A table, because that is what two columns of the same readings is.
         No third column: the difference between the two is the reader's to
         draw, and a delta would be the app naming a winner. -->
    <div class="compare-metrics" data-compare-table>
      <div class="rows-divide compare-metrics-row compare-metrics-header">
        <span></span>
        <span class="compare-period-label" data-compare-period-label>{periodA.label}</span>
        <span class="compare-period-label" data-compare-period-label>{periodB.label}</span>
      </div>
      <div class="rows-divide compare-metrics-row" data-compare-metric="entries">
        <span class="compare-metric-name">{m.compare_entries_label()}</span>
        <span>{a.entryCount}</span>
        <span>{b.entryCount}</span>
      </div>
      <div class="rows-divide compare-metrics-row" data-compare-metric="mood">
        <span class="compare-metric-name">{m.mood()}</span>
        <span>{fmtMood(a.averageMood)}</span>
        <span>{fmtMood(b.averageMood)}</span>
      </div>
      {#each vocabulary.activeDimensions as d, i (d.key)}
        <div class="rows-divide compare-metrics-row" data-compare-metric={d.key}>
          <span class="compare-metric-name">{d.name}</span>
          <span>{fmtDimension(a.dimensionAverages[i]?.average ?? null)}</span>
          <span>{fmtDimension(b.dimensionAverages[i]?.average ?? null)}</span>
        </div>
      {/each}
      <div class="rows-divide compare-metrics-row" data-compare-metric="streak">
        <span class="compare-metric-name">{m.compare_streak_label()}</span>
        <span>{m.n_days({ n: a.bestStreak })}</span>
        <span>{m.n_days({ n: b.bestStreak })}</span>
      </div>
      <div class="rows-divide compare-metrics-row compare-metrics-tags" data-compare-metric="tags">
        <span class="compare-metric-name">{m.recap_tags_title()}</span>
        <span class="compare-metric-text">{a.topTagLabel}</span>
        <span class="compare-metric-text">{b.topTagLabel}</span>
      </div>
    </div>
  {/if}
</div>

<!-- Which era a side takes, picked whole rather than as two dates - the
     same sheet Wrapped's own era picker is (phase 6 ticket 03). One sheet
     for both sides, since only one is ever open at a time. -->
<Sheet
  open={eraPickerSide !== null}
  title={m.eras_title()}
  onClose={() => (eraPickerSide = null)}
>
  {#if erasQuery.rows.length}
    <ListCard>
      {#each erasQuery.rows as era (era.id)}
        <ListRow
          key={`compare-era-${era.id}`}
          title={era.name}
          onclick={() => {
            if (eraPickerSide === 'a') aEraId = era.id;
            else if (eraPickerSide === 'b') bEraId = era.id;
            eraPickerSide = null;
          }}
        >
          {#snippet trailing()}
            {#if (eraPickerSide === 'a' && aEraId === era.id) || (eraPickerSide === 'b' && bEraId === era.id)}
              <Icon name="check" size={20} />
            {/if}
          {/snippet}
        </ListRow>
      {/each}
    </ListCard>
  {:else}
    <Notice icon="info" key="compare-eras-empty" title={m.eras_empty_title()} text={m.eras_empty_body()} />
  {/if}
</Sheet>

<style>
  /* The range/era switch above each side (phase 6 ticket 03): its own row
     rather than inside the card below, since Segmented already draws its
     own pill and a second border around it would be a card inside a card. */
  .compare-mode {
    margin-bottom: var(--space-2);
  }
</style>
