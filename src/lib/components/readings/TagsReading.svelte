<script lang="ts">
  /* Tags, and how a scale moved: the merged tag card (redesign ticket 05),
     a reading of its own since phase 11 ticket 07. One ranking spanning
     every scale and the dose day (correlationCards.ts), drawn as paired
     dots - each row reads against its own track, which is what lets mixed
     scales into one set with no arithmetic of their own. A tag row opens
     the entries carrying that tag, over the span.

     The tile's figure is the top row's tag, with its shift and the scale
     it moved on under it. The picker still writes the screen's stored
     metric, the same mirrored control the day-by-day chart keeps in step
     with; it is not what filters this card's rows. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { selectMetric } from '$lib/data/prefs/store.svelte';
  import { nativeValue, signedValue } from '$lib/data/wrappedDisplay';
  import { readingHref } from '$lib/data/lookBackReadings';
  import { metricChoices, shownMetric } from '$lib/data/metricChoices';
  import type { Span } from '$lib/data/lookBackSpan';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { CorrelationCard } from '$lib/data/correlationCards';
  import type { PairedRow } from '$lib/components/kit/pairedRow';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import PairedDots from '$lib/components/kit/PairedDots.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';

  let {
    span,
    spanLabel = '',
    view = 'screen'
  }: {
    span: Span;
    /** The span written out, for the sheet's own line. */
    spanLabel?: string;
    view?: 'tile' | 'screen';
  } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);
  const CHART_ROLE = 0;

  /** How many entries the sheet behind a tag row lists. */
  const INSIGHT_ENTRIES = 20;

  let metrics = $derived(metricChoices());
  let metricOptions = $derived(metrics.map((mt) => ({ value: mt.key, label: mt.name })));
  let shown = $derived(shownMetric(metrics));

  let correlationCardsQuery = liveList((j) => j.correlationCards.getCards(from, to));
  let correlationCards = $derived(correlationCardsQuery.rows);

  const occurrenceLabel = (card: CorrelationCard) =>
    card.occurrence.kind === 'doseDay'
      ? m.correlation_card_dose_day()
      : (vocabulary.tag(card.occurrence.id)?.label ?? card.occurrence.id);

  const metricBounds = (key: string) => {
    const dimension = vocabulary.metricDimension(key);
    return dimension ? { min: dimension.min, max: dimension.max } : { min: 1, max: 5 };
  };

  /* A row's key rather than the bare tag id: the same tag can rank under
     two different metrics. */
  const correlationKey = (card: CorrelationCard) =>
    `${card.occurrence.kind}-${card.occurrence.kind === 'tag' ? card.occurrence.id : 'dose'}-${card.metric}`;

  let correlationRows = $derived<PairedRow[]>(
    correlationCards.map((card) => {
      const bounds = metricBounds(card.metric);
      return {
        key: correlationKey(card),
        name: occurrenceLabel(card),
        with: card.withAvg,
        without: card.withoutAvg,
        ...bounds,
        gap: signedValue(card.withAvg - card.withoutAvg, (v) => nativeValue(card.metric, v)),
        note: `${vocabulary.metricNameOf(card.metric)} · ${m.insight_row_sub({
          count: String(card.count),
          with: nativeValue(card.metric, card.withAvg),
          without: nativeValue(card.metric, card.withoutAvg)
        })}`
      };
    })
  );
  let topRow = $derived(correlationRows[0]);
  let topCard = $derived(correlationCards[0]);

  let insightSheet = $state<{ label: string; id: string } | null>(null);

  /* Only a tag row opens the sheet: a dose day has no tag id to look one
     up by. */
  const pickCorrelationRow = (key: string) => {
    const card = correlationCards.find((c) => correlationKey(c) === key);
    if (card?.occurrence.kind === 'tag') {
      insightSheet = { id: card.occurrence.id, label: vocabulary.tag(card.occurrence.id)?.label ?? card.occurrence.id };
    }
  };

  /* Ranged to the span (carpet ticket 19), fetched one past the cap so a
     full page can say it is one. */
  let insightEntriesQuery = liveList((j) => {
    const sheet = insightSheet;
    if (!sheet) return Promise.resolve([]);
    return j.entries.entriesWithTag(sheet.id, from, to, INSIGHT_ENTRIES + 1);
  });
  let insightEntriesCapped = $derived(insightEntriesQuery.rows.length > INSIGHT_ENTRIES);
  let insightEntries = $derived(insightEntriesQuery.rows.slice(0, INSIGHT_ENTRIES));
</script>

{#if view === 'tile'}
  {#if !correlationCardsQuery.loading && topRow && topCard}
    <ReadingTile
      key="tags"
      name={m.stats_tags_moved()}
      href={readingHref('tags', span)}
      headline={topRow.name}
      note={`${topRow.gap} ${vocabulary.metricNameOf(topCard.metric)}`}
    />
  {/if}
{:else}
  <ChartCard heading={m.stats_tags_moved()} kind="tags-moved" role={roleAt(activeFlag.roles, CHART_ROLE)}>
    {#snippet control()}
      <ChartPicker
        key="stats-insight-metric"
        label={m.stats_tags_moved()}
        value={shown.key}
        options={metricOptions}
        onPick={(value) => selectMetric(value === 'mood' ? null : value)}
      />
    {/snippet}
    <ReadGate read={correlationCardsQuery} variant="line" count={3}>
      {#snippet rows()}
        <PairedDots rows={correlationRows} onPick={pickCorrelationRow} />
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.correlation_cards_empty()}</ChartEmpty>
      {/snippet}
    </ReadGate>
    <!-- Inside the card, under the rows it qualifies: the app saying which
         tags were left out is the app declining to interpret. -->
    {#if correlationRows.length}
      <p class="reading-note">{m.insights_note()}</p>
    {/if}
  </ChartCard>

  <Sheet open={insightSheet !== null} title={insightSheet?.label ?? ''} onClose={() => (insightSheet = null)}>
    {#if insightSheet}
      <h3>{insightSheet.label}</h3>
      <p class="reading-note" data-insight-sheet-range>{spanLabel}</p>
      {#if insightEntriesCapped}
        <p class="reading-note" data-insight-sheet-capped>
          {m.insight_sheet_capped({ shown: String(INSIGHT_ENTRIES) })}
        </p>
      {/if}
      <div class="stack-3">
        {#each insightEntries as e (e.id)}
          <EntryCard entry={e} />
        {/each}
      </div>
      <button class="btn btn-ghost" onclick={() => (insightSheet = null)}>
        <span>{m.done()}</span>
      </button>
    {/if}
  </Sheet>
{/if}

<style>
  .reading-note {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }
</style>
