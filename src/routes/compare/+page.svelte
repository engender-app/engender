<script lang="ts">
  /* Two periods, A and B, and what changed between them (pre-release-human
     ticket 21, which reworked phase 5 UX ticket 23's table).

     The screen computes a change now: signed, in each scale's own units,
     and never coloured. Which way a scale moved is not better or worse
     (ADR-0012, F15), so the sign is the whole of what says which way, the
     same as Wrapped's "scale that moved furthest". Judging is what the
     product rules out; arithmetic is not judging.

     It opens on a result. Side A is the span the Look back door handed
     over, or the last 30 days; side B is the period before A. Each side is
     one row at the top that opens one sheet (PeriodSheet): presets, the
     person's eras, a custom range. The old shortcut notice that offered
     this default is gone, since the default now is what it offered
     (item 48: it also left in one frame).

     The figures stay one object across a change of period: the dots on
     each scale travel, the tag bars resize, the numbers roll, rows that
     come and go grow in and collapse, and a re-sorted list moves its rows
     rather than redrawing them. Under reduced motion the whole result
     fades out and back in around the swap, inside --dur-crossfade. */
  import { untrack } from 'svelte';
  import { replaceRoute } from '$lib/navigation/smart-back';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, intlLocale } from '$lib/data/dates';
  import { precedingWindow, type EpochRange } from '$lib/data/compareStretch';
  import { customInclusiveRange, epochDayFromDateInputValue } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { eraRangeOrNull } from '$lib/data/eras';
  import { liveList, liveListIn, liveQuery } from '$lib/data/live/journal.svelte';
  import { readSide, type SideReading } from '$lib/data/compareSides';
  import {
    biggestChange,
    chronological,
    defaultSideA,
    orderScales,
    tagPairs,
    yearEarlier,
    type ScaleSides
  } from '$lib/data/periodComparison';
  import { moodDistribution } from '$lib/data/statsCharts';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { MOOD_RANGE } from '$lib/data/metricRange';
  import { nativeAmount, nativeValue, signedValue } from '$lib/data/wrappedDisplay';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
  import { EASE_OUT, isReducedMotion, motionDuration, crossfadeDuration, NIL_OPACITY } from '$lib/motion/tokens';
  import { fade, slide } from 'svelte/transition';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import PairedDots from '$lib/components/kit/PairedDots.svelte';
  import OrderedStrip from '$lib/components/kit/OrderedStrip.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import type { PairedRow } from '$lib/components/kit/pairedRow';
  import PeriodSheet, { type PeriodChoice, type PresetOption } from '$lib/components/compare/PeriodSheet.svelte';
  import RollingNumber from '$lib/components/compare/RollingNumber.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let today = $derived(currentDay());
  let erasQuery = liveList((j) => j.eras.getEras());
  let boundsQuery = liveQuery((j) => j.eras.getJournalBounds());

  /* The span Look back handed over (`from`, `to`), or null on a visit
     without one. */
  let originSpan = $derived.by(() => {
    const fromParam = page.url.searchParams.get('from');
    const toParam = page.url.searchParams.get('to');
    if (!fromParam || !toParam) return null;
    const start = epochDayFromDateInputValue(fromParam);
    const end = epochDayFromDateInputValue(toParam);
    if (start === null || end === null || start > end || end > today) return null;
    return { start, end };
  });

  const arrivalA = (span: EpochRange | null): PeriodChoice =>
    span ? { kind: 'range', start: span.start, end: span.end, origin: 'span' } : { kind: 'last30' };

  let aChoice = $state<PeriodChoice>(untrack(() => arrivalA(originSpan)));
  let bChoice = $state<PeriodChoice>({ kind: 'preceding' });

  /* A new span on the same mounted screen (SvelteKit reuses the component
     across query strings) starts over from it. */
  let arrivedWith = untrack(() => (originSpan ? `${originSpan.start}:${originSpan.end}` : ''));
  $effect.pre(() => {
    const key = originSpan ? `${originSpan.start}:${originSpan.end}` : '';
    if (key === arrivedWith) return;
    arrivedWith = key;
    aChoice = arrivalA(originSpan);
    bChoice = { kind: 'preceding' };
  });

  /* A tryout or a procedure's "compare this stretch" link hands both sides
     over as query parameters (compareStretchQuery). Consumed once on
     arrival and then stripped from the URL, so navigating back into this
     screen later does not reopen the same two sides every time. */
  $effect(() => {
    const params = page.url.searchParams;
    const a = customInclusiveRange(epochDayFromDateInputValue(params.get('aStart') ?? ''), epochDayFromDateInputValue(params.get('aEnd') ?? ''));
    const b = customInclusiveRange(epochDayFromDateInputValue(params.get('bStart') ?? ''), epochDayFromDateInputValue(params.get('bEnd') ?? ''));
    if (!a || !b) return;
    aChoice = { kind: 'range', start: a.start, end: a.end, origin: 'custom' };
    bChoice = { kind: 'range', start: b.start, end: b.end, origin: 'custom' };
    void replaceRoute('/compare', { noScroll: true, keepFocus: true });
  });

  /* An era as two dates: an open bound takes the journal's edge (ADR-0049),
     and an era holding no day of the journal has no range at all. */
  const eraRanges = $derived(
    erasQuery.rows
      .map((era) => {
        const range = eraRangeOrNull(era, boundsQuery.value ?? null);
        return range ? { id: era.id, name: era.name, range: { start: range.startEpochDay, end: range.endEpochDay } } : null;
      })
      .filter((era) => era !== null)
  );

  function resolve(choice: PeriodChoice, other: EpochRange | null): EpochRange | null {
    switch (choice.kind) {
      case 'range':
        return { start: choice.start, end: choice.end };
      case 'last30':
        return defaultSideA(today);
      case 'preceding':
        return other ? precedingWindow(other) : null;
      case 'year':
        return other ? yearEarlier(other) : null;
      case 'era':
        return eraRanges.find((era) => era.id === choice.id)?.range ?? null;
    }
  }

  /* A side pointing at an era that has since been deleted falls back to
     its default, the resting state every era-adopting surface gives a stale
     reference (ADR-0049). Waits on the read, since its rows are empty both
     before it lands and after a real deletion. */
  $effect(() => {
    if (erasQuery.loading || boundsQuery.loading) return;
    if (aChoice.kind === 'era' && !resolve(aChoice, null)) aChoice = arrivalA(originSpan);
    if (bChoice.kind === 'era' && !resolve(bChoice, null)) bChoice = { kind: 'preceding' };
  });

  let rangeA = $derived(resolve(aChoice, null));
  let rangeB = $derived(resolve(bChoice, rangeA));

  const rangeLabel = (range: EpochRange) =>
    m.range_from_to({
      from: fmtDay(range.start, { day: 'numeric', month: 'short' }),
      to: fmtDay(range.end, { day: 'numeric', month: 'short', year: 'numeric' })
    });

  function choiceLabel(choice: PeriodChoice, range: EpochRange | null): string {
    switch (choice.kind) {
      case 'range':
        return range ? rangeLabel(range) : '';
      case 'last30':
        return m.doses_window({ days: '30' });
      case 'preceding':
        return m.compare_preset_preceding();
      case 'year':
        return m.compare_preset_year();
      case 'era':
        return eraRanges.find((era) => era.id === choice.id)?.name ?? '';
    }
  }

  let pickingSide = $state<'a' | 'b' | null>(null);

  let presets = $derived.by<PresetOption[]>(() => {
    if (pickingSide === 'a') return [{ choice: { kind: 'last30' }, label: choiceLabel({ kind: 'last30' }, null), range: defaultSideA(today) }];
    if (!rangeA) return [];
    return [
      { choice: { kind: 'preceding' }, label: m.compare_preset_preceding(), range: precedingWindow(rangeA) },
      { choice: { kind: 'year' }, label: m.compare_preset_year(), range: yearEarlier(rangeA) }
    ];
  });

  let journalSpan = $derived(
    boundsQuery.value ? { start: boundsQuery.value.firstEpochDay, end: Math.max(boundsQuery.value.lastEpochDay, today) } : null
  );

  function pick(choice: PeriodChoice) {
    if (pickingSide === 'a') aChoice = choice;
    else if (pickingSide === 'b') bChoice = choice;
    pickingSide = null;
  }

  /* Both sides in one read, so the two land in the same frame and every
     figure moves once. Every journal call starts before readSide's first
     await (compareSides.ts), so the query settles in one run. */
  interface Comparison {
    a: SideReading;
    b: SideReading;
    ranges: { a: EpochRange; b: EpochRange };
  }
  let comparisonQuery = liveQuery((j): Promise<Comparison | null> => {
    const a = rangeA;
    const b = rangeB;
    const keys = vocabulary.activeDimensions.map((d) => d.key);
    if (!a || !b) return Promise.resolve(null);
    return Promise.all([readSide(j, a, keys), readSide(j, b, keys)]).then(([sideA, sideB]) => ({
      a: sideA,
      b: sideB,
      ranges: { a, b }
    }));
  });
  let comparisonRead = liveListIn(comparisonQuery, (answer) => (answer ? [answer] : []));

  /* What the figures draw. Follows the read directly, so a change of
     period moves the figures the frame the answer lands. Under reduced
     motion it holds the old answer while the result fades out, then takes
     the new one and fades back in. */
  let held = $state<Comparison | null>(null);
  let shown = $derived(held ?? comparisonQuery.value ?? null);
  let resultEl = $state<HTMLElement>();
  let lastAnswer: Comparison | null | undefined;
  $effect.pre(() => {
    const answer = comparisonQuery.value;
    const before = lastAnswer;
    lastAnswer = answer;
    if (!before || !answer || before === answer || !isReducedMotion() || !resultEl) return;
    const node = resultEl;
    held = before;
    const half = crossfadeDuration() / 2;
    const out = node.animate([{ opacity: 1 }, { opacity: NIL_OPACITY }], { duration: half, fill: 'forwards' });
    void out.finished.then(() => {
      held = null;
      const back = node.animate([{ opacity: NIL_OPACITY }, { opacity: 1 }], { duration: half, fill: 'forwards' });
      void back.finished.then(() => {
        out.cancel();
        back.cancel();
      });
    }, () => (held = null));
  });

  const dimensionOf = (key: string) => vocabulary.activeDimensions.find((d) => d.key === key);
  const scaleName = (key: string) => (key === 'mood' ? m.mood() : (dimensionOf(key)?.name ?? key));

  let model = $derived.by(() => {
    if (!shown) return null;
    const { a, b, ranges } = shown;
    /* Rounded to the precision they are written at (nativeAmount), so the
       change beside two printed values is the difference of those values
       and the ranking agrees with what the reader sees. */
    const at = (key: string, value: number | null | undefined) => (value == null ? null : nativeAmount(key, value));
    const scales: (ScaleSides & { name: string })[] = [
      { key: 'mood', name: m.mood(), min: MOOD_RANGE.min, max: MOOD_RANGE.max, a: at('mood', a.scales.mood), b: at('mood', b.scales.mood) },
      ...vocabulary.activeDimensions.map((d) => ({
        key: d.key,
        name: d.name,
        min: d.min,
        max: d.max,
        a: at(d.key, a.scales[d.key]),
        b: at(d.key, b.scales[d.key])
      }))
    ];
    const order = chronological(ranges.a, ranges.b);
    /* Alphabetical rather than by count, so a change of period never
       reorders the rows that stay: a re-sort would need a flip, and a flip
       beside rows that leave pulls the leaving ones out of flow in one
       frame. Rows only come and go, each opening or closing its height. */
    const collator = new Intl.Collator(intlLocale());
    const tags = tagPairs(a.tags, b.tags).sort((x, y) => collator.compare(tagLabel(x.id), tagLabel(y.id)));
    return {
      a,
      b,
      order,
      scales: orderScales(scales),
      headline: biggestChange(scales),
      tags,
      tagMax: Math.max(1, ...tags.map((t) => Math.max(t.a, t.b))),
      stripA: moodDistribution(a.moodDays).map((s) => ({ ...s, name: moodName(s.step) })),
      stripB: moodDistribution(b.moodDays).map((s) => ({ ...s, name: moodName(s.step) })),
      anyMoodDays: a.moodDays.length + b.moodDays.length > 0
    };
  });

  /* The headline reads earlier period to later, whichever side is which. */
  const sideValue = (side: 'a' | 'b', values: { a: number; b: number }) => values[side];

  let headline = $derived.by(() => {
    if (!model) return null;
    const { order, headline: scale } = model;
    if (scale && scale.a !== null && scale.b !== null) {
      const values = { a: scale.a, b: scale.b };
      return {
        key: scale.key,
        label: m.wrapped_scale_arc(),
        name: scale.name,
        metric: scale.key,
        from: sideValue(order.first, values),
        to: sideValue(order.second, values)
      };
    }
    const counts = { a: model.a.entryCount, b: model.b.entryCount };
    return {
      key: 'entries',
      label: m.compare_entries_label(),
      name: null,
      metric: 'entries',
      from: sideValue(order.first, counts),
      to: sideValue(order.second, counts)
    };
  });

  const fmtMetric = (metric: string) => (n: number) =>
    metric === 'entries' ? String(Math.round(n)) : nativeValue(metric, n);
  const fmtChange = (metric: string) => (n: number) => signedValue(n, fmtMetric(metric));

  let scaleRows = $derived<PairedRow[]>(
    (model?.scales ?? []).map((scale) => ({
      key: scale.key,
      name: scale.name,
      with: scale.a,
      without: scale.b,
      min: scale.min,
      max: scale.max,
      gap: '',
      note:
        scale.a === null && scale.b === null
          ? m.compare_scale_missing({ period: `${m.compare_period_a_label()}, ${m.compare_period_b_label()}` })
          : scale.a === null
            ? m.compare_scale_missing({ period: m.compare_period_a_label() })
            : scale.b === null
              ? m.compare_scale_missing({ period: m.compare_period_b_label() })
              : m.compare_scale_values({ a: nativeValue(scale.key, scale.a), b: nativeValue(scale.key, scale.b) })
    }))
  );

  /* A scale's change, later minus earlier, for the figure beside its name. */
  const scaleChange = (row: PairedRow) => {
    if (row.with === null || row.without === null || !model) return null;
    const values = { a: row.with, b: row.without };
    return sideValue(model.order.second, values) - sideValue(model.order.first, values);
  };


  /* A tag row joining or leaving the union opens or closes its height and
     fades with it, so the rows under it move with the height rather than
     jumping when a row is inserted or taken out of flow. Under
     reduced motion the duration is 0 and the result's own fade covers the
     swap. */
  function rowFold(node: Element) {
    const base = slide(node, { duration: motionDuration('--dur-slow'), easing: EASE_OUT });
    return { ...base, css: (t: number, u: number) => `${base.css?.(t, u) ?? ''};opacity: ${t}` };
  }
  const tagLabel = (id: string) => vocabulary.tag(id)?.label ?? id;
  const role = $derived(roleAt(activeFlag.roles, 0));
</script>

<div class="screen">
  <ScreenHeader title={m.compare_title()} screen="compare" back="/stats" />

  <!-- The two sides, and the key to every figure below: A is the filled
       mark, B the ring, on every chart on this screen. -->
  <ListCard {role}>
    {#each [{ side: 'a' as const, choice: aChoice, range: rangeA, period: m.compare_period_a_label() }, { side: 'b' as const, choice: bChoice, range: rangeB, period: m.compare_period_b_label() }] as row (row.side)}
      <ListRow
        key={`compare-pick-${row.side}`}
        data-compare-pick={row.side}
        title={m.compare_side_row({ period: row.period, choice: choiceLabel(row.choice, row.range) })}
        subtitle={row.choice.kind !== 'range' && row.range ? rangeLabel(row.range) : null}
        fadeSwap
        onclick={() => (pickingSide = row.side)}
      >
        {#snippet leading()}
          <span class="compare-mark-disc"><span class="compare-mark" class:is-b={row.side === 'b'}></span></span>
        {/snippet}
      </ListRow>
    {/each}
  </ListCard>

  <ReadGate read={comparisonRead} variant="card" count={2}>
    {#snippet rows()}
      {#if model && headline}
        <div class="compare-result" bind:this={resultEl} data-compare-result>
          <!-- The answer first: the scale that moved furthest for its range,
               earlier period to later. -->
          <section class="compare-headline" data-compare-headline>
            {#key headline.key}
              <div class="compare-headline-body" in:fade={{ duration: motionDuration('--dur-med') }} out:fade={{ duration: motionDuration('--dur-med') }}>
                <p class="compare-headline-label">{headline.label}</p>
                {#if headline.name}<p class="compare-headline-name">{headline.name}</p>{/if}
                <p class="compare-headline-figure">
                  <span aria-hidden="true">
                    <RollingNumber value={headline.from} format={fmtMetric(headline.metric)} />
                    <span class="compare-headline-arrow">→</span>
                    <RollingNumber value={headline.to} format={fmtMetric(headline.metric)} />
                  </span>
                  <span class="compare-headline-change" aria-hidden="true">
                    <RollingNumber value={headline.to - headline.from} format={fmtChange(headline.metric)} />
                  </span>
                  <span class="visually-hidden">
                    {m.wrapped_scale_arc_body({
                      name: headline.name ?? headline.label,
                      from: fmtMetric(headline.metric)(headline.from),
                      to: fmtMetric(headline.metric)(headline.to)
                    })}
                  </span>
                </p>
              </div>
            {/key}
          </section>

          <ChartCard level={2} heading={m.compare_scales_heading()} kind="compare-scales" {role}>
            <div data-compare-figure="scales">
              <PairedDots rows={scaleRows}>
                {#snippet figure(row)}
                  {@const change = scaleChange(row)}
                  <span class="compare-scale-change" class:is-none={change === null} data-compare-scale={row.key}>
                    <RollingNumber value={change ?? 0} format={fmtChange(row.key)} />
                  </span>
                {/snippet}
              </PairedDots>
            </div>
          </ChartCard>

          <ChartCard level={2} heading={m.recap_tags_title()} kind="compare-tags" {role}>
            {#if model.tags.length}
              <div class="compare-tags" data-compare-figure="tags">
                {#each model.tags as tag (tag.id)}
                  <div class="compare-tag" data-compare-tag={tag.id} transition:rowFold>
                    <span class="compare-tag-name">{tagLabel(tag.id)}</span>
                    {#each [{ side: 'a', count: tag.a }, { side: 'b', count: tag.b }] as bar (bar.side)}
                      <span class="compare-tag-track" aria-hidden="true">
                        <span class="compare-tag-bar" class:is-b={bar.side === 'b'} style={`--share: ${bar.count / model.tagMax}`}></span>
                      </span>
                      <span class="compare-tag-count"><RollingNumber value={bar.count} format={(n) => String(Math.round(n))} /></span>
                    {/each}
                    <span class="visually-hidden">{m.compare_scale_values({ a: String(tag.a), b: String(tag.b) })}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <ChartEmpty>{m.recap_tags_none_range()}</ChartEmpty>
            {/if}
          </ChartCard>

          {#if model.anyMoodDays}
            <ChartCard level={2} heading={m.stats_mood_days()} kind="compare-mood-days">
              <div class="compare-strips" data-compare-figure="mood-days">
                {#each [{ side: 'a', steps: model.stripA, label: m.compare_period_a_label() }, { side: 'b', steps: model.stripB, label: m.compare_period_b_label() }] as strip (strip.side)}
                  <div class="compare-strip" data-compare-strip={strip.side}>
                    <span class="compare-strip-label" {...roleAttrs(role)}>
                      <span class="compare-mark" class:is-b={strip.side === 'b'}></span>{strip.label}
                    </span>
                    <OrderedStrip
                      steps={strip.steps}
                      countShort={(n) => m.strip_days_short({ n })}
                      countFull={(n) => m.n_days({ n })}
                    />
                  </div>
                {/each}
              </div>
            </ChartCard>
          {/if}

          <div class="compare-entries" data-compare-entries {...roleAttrs(role)}>
            <span class="compare-entries-name">{m.compare_entries_label()}</span>
            <span class="compare-entries-values">
              <span class="compare-mark"></span><RollingNumber value={model.a.entryCount} format={(n) => String(Math.round(n))} />
              <span aria-hidden="true">·</span>
              <span class="compare-mark is-b"></span><RollingNumber value={model.b.entryCount} format={(n) => String(Math.round(n))} />
            </span>
          </div>
        </div>
      {/if}
    {/snippet}
    {#snippet empty()}
      <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
    {/snippet}
  </ReadGate>
</div>

<PeriodSheet
  side={pickingSide}
  title={pickingSide === 'b' ? m.compare_period_b_label() : m.compare_period_a_label()}
  current={pickingSide === 'a' ? aChoice : pickingSide === 'b' ? bChoice : null}
  currentRange={pickingSide === 'a' ? rangeA : pickingSide === 'b' ? rangeB : null}
  {presets}
  eras={eraRanges}
  journal={journalSpan}
  {today}
  onPick={pick}
  onClose={() => (pickingSide = null)}
/>

<style>
  /* The A/B marks: filled for A, a ring for B, in the role's own ink. The
     same pair PairedDots draws, so the key and the figures agree. */
  .compare-mark {
    display: inline-block;
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--role-draw, var(--text));
  }
  .compare-mark.is-b {
    background: var(--surface);
    border: 2px solid var(--role-draw, var(--text));
  }
  .compare-mark-disc {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
  }

  .compare-result {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .compare-headline {
    display: grid;
    padding: var(--space-2) 0;
  }
  .compare-headline-body {
    grid-area: 1 / 1;
  }
  .compare-headline-label {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }
  .compare-headline-name {
    margin: var(--space-1) 0 0;
    font-size: var(--text-md);
    font-weight: var(--weight-bold);
  }
  .compare-headline-figure {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-3);
    margin: var(--space-1) 0 0;
    font-family: var(--font-display);
    font-weight: var(--weight-display);
    font-size: var(--text-xl);
    font-variant-numeric: tabular-nums;
  }
  .compare-headline-arrow {
    color: var(--text-2);
  }
  .compare-headline-change {
    font-size: var(--text-md);
    color: var(--text-2);
  }

  .compare-scale-change {
    transition: opacity var(--dur-slow) var(--ease-out);
  }
  .compare-scale-change.is-none {
    opacity: 0;
  }

  /* Paired bars per tag: A filled, B a ring, each with its count. Every bar
     is the track's full width moved left out of a clipping track, so a new
     count is a transform and the bar's rounded end stays drawn. */
  .compare-tags {
    display: grid;
    gap: var(--space-3);
  }
  .compare-tag {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--space-2);
    row-gap: 4px;
  }
  .compare-tag-name {
    grid-column: 1 / -1;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .compare-tag-track {
    position: relative;
    height: 10px;
    overflow: hidden;
    border-radius: 5px;
  }
  .compare-tag-bar {
    position: absolute;
    inset: 0;
    border-radius: 5px;
    background: var(--role-draw);
    transform: translateX(calc((var(--share) - 1) * 100%));
    transition: transform var(--dur-slow) var(--ease-out);
  }
  .compare-tag-bar.is-b {
    background: var(--surface);
    border: 2px solid var(--role-draw);
  }
  .compare-tag-count {
    min-width: 2ch;
    font-size: var(--text-xs);
    color: var(--text-2);
    text-align: right;
  }

  .compare-strips {
    display: grid;
    gap: var(--space-2);
  }
  .compare-strip-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-2);
  }
  /* The strip keeps clearance above itself for its own tooltip; the label
     sits in it rather than above it, so A and B stay close. */
  .compare-strip :global(.kit-ordered) {
    margin-top: var(--space-2);
  }

  .compare-entries {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    background: var(--surface);
  }
  .compare-entries-name {
    font-size: var(--text-sm);
  }
  .compare-entries-values {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: var(--weight-bold);
    font-variant-numeric: tabular-nums;
  }
</style>
