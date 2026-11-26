<script lang="ts" module>
  import type { EpochRange } from '$lib/data/compareStretch';

  /** What a side of /compare is set to. `preceding` and `year` are read
      against the other side, so they move with it. */
  export type PeriodChoice =
    | { kind: 'range'; start: number; end: number; origin: 'span' | 'custom' }
    | { kind: 'last30' }
    | { kind: 'preceding' }
    | { kind: 'year' }
    | { kind: 'era'; id: string };

  export interface PresetOption {
    choice: PeriodChoice;
    label: string;
    range: EpochRange;
  }

  export interface EraOption {
    id: string;
    name: string;
    range: EpochRange;
  }
</script>

<script lang="ts">
  /* One side's period, picked in one sheet (pre-release-human ticket 21):
     the presets first, each with the dates it resolves to, then the
     person's eras with their dates and where each sits on the journal,
     then two date fields for anything else. Starling's date range sheet and
     Klarna's filter sheet are the references: a preset says its own dates,
     and the custom range sits under the presets rather than behind a
     switch, which is what the old range/era toggle was. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import {
    customInclusiveRange,
    dateInputValueFromEpochDay,
    epochDayFromDateInputValue
  } from '$lib/data/epochDay';
  import Icon from '$lib/components/Icon.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import FieldGroupHeading from '$lib/components/kit/FieldGroupHeading.svelte';

  let {
    side,
    title,
    current,
    currentRange,
    presets,
    eras,
    journal,
    today,
    onPick,
    onClose
  }: {
    /** Which side is being picked, or null for a closed sheet. */
    side: 'a' | 'b' | null;
    title: string;
    current: PeriodChoice | null;
    /** What that side resolves to now, which the custom fields start from. */
    currentRange: EpochRange | null;
    presets: PresetOption[];
    eras: EraOption[];
    /** The journal's first day through today: what an era's bar is drawn
        on, widened to cover every era. */
    journal: EpochRange | null;
    today: number;
    onPick: (choice: PeriodChoice) => void;
    onClose: () => void;
  } = $props();

  const rangeLabel = (range: EpochRange) =>
    m.range_from_to({
      from: fmtDay(range.start, { day: 'numeric', month: 'short' }),
      to: fmtDay(range.end, { day: 'numeric', month: 'short', year: 'numeric' })
    });

  const same = (a: PeriodChoice | null, b: PeriodChoice) => {
    if (!a || a.kind !== b.kind) return false;
    if (a.kind === 'era' && b.kind === 'era') return a.id === b.id;
    if (a.kind === 'range' && b.kind === 'range') return a.origin === 'custom' && b.origin === 'custom' && a.start === b.start && a.end === b.end;
    return true;
  };

  /* The custom fields start from the side's own range each time the sheet
     opens, so the two dates already there are the ones being changed. */
  let customStart = $state('');
  let customEnd = $state('');
  let openedFor: 'a' | 'b' | null = null;
  /* The side the sheet was last opened for, which it keeps naming while it
     leaves: `side` is already null by then. */
  let shownSide = $state<'a' | 'b'>('a');
  $effect.pre(() => {
    if (side !== openedFor) {
      openedFor = side;
      if (side) shownSide = side;
      if (side && currentRange) {
        customStart = dateInputValueFromEpochDay(currentRange.start);
        customEnd = dateInputValueFromEpochDay(currentRange.end);
      }
    }
  });
  let customRange = $derived.by(() => {
    const range = customInclusiveRange(epochDayFromDateInputValue(customStart), epochDayFromDateInputValue(customEnd));
    return range && range.end <= today ? range : null;
  });

  /* The whole stretch the bars are drawn on: the journal through today,
     widened to any era dated before the first entry, so an era that
     started before the journal still has its true length. */
  let whole = $derived.by(() => {
    if (!journal) return null;
    const start = Math.min(journal.start, ...eras.map((era) => era.range.start));
    const end = Math.max(journal.end, ...eras.map((era) => era.range.end));
    return { start, end };
  });

  /* Where an era sits on that stretch, as two fractions of it. */
  const place = (range: EpochRange) => {
    if (!whole) return { from: 0, width: 1 };
    const total = Math.max(whole.end - whole.start + 1, 1);
    const from = Math.min(1, Math.max(0, (range.start - whole.start) / total));
    const to = Math.min(1, Math.max(0, (range.end - whole.start + 1) / total));
    return { from, width: Math.max(to - from, 0) };
  };

  const shownDate = (value: string) => {
    const day = epochDayFromDateInputValue(value);
    return day === null ? '' : fmtDay(day, { day: 'numeric', month: 'long', year: 'numeric' });
  };
  let todayInput = $derived(dateInputValueFromEpochDay(today));
</script>

<Sheet open={side !== null} {title} {onClose}>
  <div class="compare-sheet" data-compare-sheet={shownSide} data-compare-whole={whole ? `${whole.start}:${whole.end}` : undefined}>
    <ListCard>
      {#each presets as preset (preset.choice.kind)}
        <ListRow
          key={`compare-preset-${preset.choice.kind}`}
          data-compare-preset={preset.choice.kind}
          title={preset.label}
          subtitle={rangeLabel(preset.range)}
          chevron={false}
          onclick={() => onPick(preset.choice)}
        >
          {#snippet trailing()}
            {#if same(current, preset.choice)}<Icon name="check" size={20} />{/if}
          {/snippet}
        </ListRow>
      {/each}
    </ListCard>

    {#if eras.length}
      <FieldGroupHeading legend={m.eras_title()} />
      <ListCard>
        {#each eras as era (era.id)}
          {@const at = place(era.range)}
          <ListRow
            key={`compare-era-${era.id}`}
            data-compare-era={era.id}
            data-compare-era-range={`${era.range.start}:${era.range.end}`}
            title={era.name}
            subtitle={rangeLabel(era.range)}
            chevron={false}
            onclick={() => onPick({ kind: 'era', id: era.id })}
          >
            {#snippet trailing()}
              <span class="compare-era-trail">
                <!-- Where the era sits on the journal, first day to today:
                     the same reading the Look back rail gives, at a size
                     that fits beside a name. -->
                <span class="compare-era-span" aria-hidden="true" data-compare-era-span>
                  <span
                    class="compare-era-mark"
                    data-compare-era-mark
                    style={`--from: ${at.from}; --width: ${at.width}`}
                  ></span>
                </span>
                <span class="compare-era-check">
                  {#if same(current, { kind: 'era', id: era.id })}<Icon name="check" size={20} />{/if}
                </span>
              </span>
            {/snippet}
          </ListRow>
        {/each}
      </ListCard>
    {/if}

    <FieldGroupHeading legend={m.compare_custom_range()} />
    <div class="compare-picker">
      <div class="rows-divide date-row">
        <label class="date-row-label" for={`compare-${shownSide}-start`}>{m.start_date_label()}</label>
        <span class="date-row-value">{shownDate(customStart)}</span>
        <span class="date-row-icon"><Icon name="calendar" size={18} /></span>
        <DatePicker
          id={`compare-${shownSide}-start`}
          value={customStart}
          max={todayInput}
          ariaLabel={m.start_date_label()}
          invis
          onchange={(v) => (customStart = v)}
        />
      </div>
      <div class="rows-divide date-row">
        <label class="date-row-label" for={`compare-${shownSide}-end`}>{m.end_date_label()}</label>
        <span class="date-row-value">{shownDate(customEnd)}</span>
        <span class="date-row-icon"><Icon name="calendar" size={18} /></span>
        <DatePicker
          id={`compare-${shownSide}-end`}
          value={customEnd}
          min={customStart || undefined}
          max={todayInput}
          ariaLabel={m.end_date_label()}
          invis
          onchange={(v) => (customEnd = v)}
        />
      </div>
    </div>
    <button
      type="button"
      class="btn btn-primary btn-block compare-sheet-apply"
      data-compare-custom-apply
      disabled={!customRange}
      onclick={() => customRange && onPick({ kind: 'range', start: customRange.start, end: customRange.end, origin: 'custom' })}
    >
      {m.done()}
    </button>
  </div>
</Sheet>

<style>
  .compare-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .compare-era-trail {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  /* The journal's whole span as a hairline, and the era as the stretch of
     it that is drawn solid. */
  .compare-era-span {
    position: relative;
    width: 72px;
    height: 6px;
    border-radius: 3px;
    background: var(--hairline);
    overflow: hidden;
  }

  .compare-era-mark {
    position: absolute;
    inset: 0 auto 0 0;
    left: calc(var(--from) * 100%);
    width: max(calc(var(--width) * 100%), 3px);
    border-radius: 3px;
    background: var(--role-draw, var(--text-2));
  }

  .compare-era-check {
    display: flex;
    width: 20px;
  }

  .compare-sheet-apply {
    margin-top: var(--space-1);
  }
</style>
