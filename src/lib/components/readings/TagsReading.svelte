<script lang="ts">
  /* Group tag and dose-day bars by scale. The zero line separates lower
     and higher averages, and each section measures gaps against its own
     largest gap. Tag rows open their matching entries. The tile names the
     top tag and reports both averages in the scale's units.

     The tag-share card switches between all days and good days. Use the
     same good-day SQL as On this day. Dose-day rows stay in their scale
     sections. */
  import { m } from '$lib/paraglide/messages';
  import { liveList, liveListIn, liveQuery } from '$lib/data/live/journal.svelte';
  import { nativeValue } from '$lib/data/wrappedDisplay';
  import { readingHref } from '$lib/data/lookBackReadings';
  import type { Span } from '$lib/data/lookBackSpan';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { CorrelationCard } from '$lib/data/correlationCards';
  import { cardKey, groupCardsByScale } from '$lib/data/tagScaleGroups';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import EntryDays from '$lib/components/EntryDays.svelte';
  import { entryDayGroups } from '$lib/data/recentEntries';
  import Sheet from '$lib/components/Sheet.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import DivergingBars from '$lib/components/kit/DivergingBars.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import Donut from '$lib/components/kit/Donut.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import type { Part } from '$lib/charts/parts';
  import { crossfade, resize } from '$lib/motion/reveal';
  import { crossfadeDuration, fadeOnly, isReducedMotion } from '$lib/motion/tokens';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';
  import { joinReadGroup } from '$lib/components/kit/readGroup.svelte';

  let {
    span,
    spanLabel = '',
    view = 'screen',
    enoughEntries = true
  }: {
    span: Span;
    /** The span written out, for the sheet's own line. */
    spanLabel?: string;
    view?: 'tile' | 'screen';
    /** The door's floor (WRAPPED_ENTRY_FLOOR), read once by the route. */
    enoughEntries?: boolean;
  } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);
  const CHART_ROLE = 0;

  /** How many entries the sheet behind a tag row lists. */
  const INSIGHT_ENTRIES = 20;

  /* The answer carries the span it was read for, so the figure swaps on
     the answer and never draws the old span's rows under the new span's
     name (the share ring below does the same with its days). The gate's
     list is that one answer: a span with nothing to compare empties the
     figure inside the swap rather than cutting the card to its empty line
     in a frame. */
  let correlationAnswer = liveQuery(async (j) => {
    const [start, end] = [from, to];
    return { start, end, cards: await j.correlationCards.getCards(start, end) };
  });
  let correlationCardsQuery = liveListIn(correlationAnswer, (answer) => [answer]);
  /* Whether there is a tile is settled once this answers (ReadGroup). */
  joinReadGroup(() => !correlationCardsQuery.loading);
  let correlationCards = $derived(correlationAnswer.value?.cards ?? []);

  const occurrenceLabel = (card: CorrelationCard) =>
    card.occurrence.kind === 'doseDay'
      ? m.correlation_card_dose_day()
      : (vocabulary.tag(card.occurrence.id)?.label ?? card.occurrence.id);

  const metricBounds = (key: string) => {
    const dimension = vocabulary.metricDimension(key);
    return dimension ? { min: dimension.min, max: dimension.max } : { min: 1, max: 5 };
  };

  const groups = $derived(
    groupCardsByScale(correlationCards, metricBounds).map((group) => {
      const { min, max } = metricBounds(group.metric);
      return {
      ...group,
      heading: m.reading_tag_group({ scale: vocabulary.metricNameOf(group.metric), min: String(min), max: String(max) }),
      rows: group.rows.map((row) => ({
        key: row.key,
        name: occurrenceLabel(row.card),
        share: row.share,
        note: m.reading_tag_row_sub({
          count: row.card.count,
          with: nativeValue(row.card.metric, row.card.withAvg),
          without: nativeValue(row.card.metric, row.card.withoutAvg)
        })
      }))
      };
    })
  );
  /* The first row of the first group: the largest gap on the scale that
     moved most. */
  let topCard = $derived(groups.length ? correlationCards.find((c) => cardKey(c) === groups[0].rows[0].key) : undefined);
  /* The figure for one span fades out over the next one fading in, and the
     card travels the difference in height (the gate's resize). */
  const figureIn = (_node: Element) => fadeOnly(crossfadeDuration());
  /* The old figure leaves as `crossfade` does, but under reduced motion it
     fades over the same crossfadeDuration the new one arrives on: the
     stock out is an instant cut there, which left the card blank while the
     new figure faded in from nothing. */
  const figureOut = (node: Element) => {
    const leaving = crossfade(node, undefined, { direction: 'out' });
    return isReducedMotion() ? { ...leaving, duration: crossfadeDuration() } : leaving;
  };

  let insightSheet = $state<{ label: string; id: string } | null>(null);

  /* Only a tag row opens the sheet: a dose day has no tag id to look one
     up by. */
  const pickCorrelationRow = (key: string) => {
    const card = correlationCards.find((c) => cardKey(c) === key);
    if (card?.occurrence.kind === 'tag') {
      insightSheet = { id: card.occurrence.id, label: vocabulary.tag(card.occurrence.id)?.label ?? card.occurrence.id };
    }
  };

  /* Ranged to the span, fetched one past the cap so a
     full page can say it is one. */
  let insightEntriesQuery = liveList((j) => {
    const sheet = insightSheet;
    if (!sheet) return Promise.resolve([]);
    return j.entries.entriesWithTag(sheet.id, from, to, INSIGHT_ENTRIES + 1);
  });
  let insightEntriesCapped = $derived(insightEntriesQuery.rows.length > INSIGHT_ENTRIES);
  let insightEntries = $derived(insightEntriesQuery.rows.slice(0, INSIGHT_ENTRIES));

  /* Share by tag (ADR-0058). `tagShare` and not the recap's `topTags`: a
     parts-of-a-whole form computes each share against the sum of what it
     is handed, and a LIMIT 3 read drew three tags as a full circle. The
     answer carries which days it counted, so the ring swaps on the answer
     and never draws the old days' parts under the new filter's name. */
  type ShareDays = 'all' | 'good';
  let shareDays = $state<ShareDays>('all');
  let shareQuery = liveQuery(async (j) => {
    if (view === 'tile') return null;
    const days = shareDays;
    return { days, rows: await j.stats.tagShare(from, to, { goodDays: days === 'good' }) };
  });
  joinReadGroup(() => view === 'tile' || !shareQuery.loading);
  let shared = $derived(shareQuery.value ?? null);
  let shareParts = $derived<Part[]>(
    (shared?.rows ?? []).map((tag) => ({
      key: tag.id,
      name: vocabulary.tag(tag.id)?.label ?? tag.id,
      amount: tag.count
    }))
  );
  /* The whole the ring is a ring of: tag uses, not entries. */
  let tagUses = $derived(shareParts.reduce((sum, part) => sum + part.amount, 0));
  const shareOptions = () => [
    { value: 'all', label: m.stats_tag_share_days_all() },
    { value: 'good', label: m.stats_tag_share_days_good() }
  ];
  /* The ring for one set of days fades out over the next one fading in,
     and the card travels the difference in height (resize). */
</script>

{#if view === 'tile'}
  {#if !correlationCardsQuery.loading && topCard}
    <ReadingTile
      key="tags"
      name={m.stats_tags_moved()}
      href={readingHref('tags', span)}
      headline={occurrenceLabel(topCard)}
      note={m.reading_tag_tile_note({
        metric: vocabulary.metricNameOf(topCard.metric),
        with: nativeValue(topCard.metric, topCard.withAvg),
        without: nativeValue(topCard.metric, topCard.withoutAvg)
      })}
    />
  {/if}
{:else}
  <ChartCard level={2} heading={m.stats_tags_moved()} kind="tags-moved" role={roleAt(activeFlag.roles, CHART_ROLE)}>
    <ReadGate read={correlationCardsQuery} variant="line" count={3}>
      {#snippet rows(answered)}
        <!-- The figure's own box travels the difference in height when a span
             swaps it (the share ring's wrapper does the same); the gate's
             resize does not see a swap inside a branch that stays 'rows'. -->
        <div use:resize>
        {#key `${answered[0].start}-${answered[0].end}`}
          <div in:figureIn out:figureOut data-tag-scales>
            {#if groups.length}
              <p class="reading-note" data-tag-key>{m.reading_tag_key()}</p>
              {#each groups as group, g (group.metric)}
                <section class="tag-scale" data-tag-scale={group.metric}>
                  <h3 class="tag-scale-heading">{group.heading}</h3>
                  <DivergingBars
                    rows={group.rows}
                    onPick={pickCorrelationRow}
                    offset={groups.slice(0, g).reduce((n, earlier) => n + earlier.rows.length, 0)}
                  />
                </section>
              {/each}
              <!-- Inside the card, under the rows it qualifies: the app saying
                   which tags were left out is the app declining to interpret. -->
              <p class="reading-note">{m.insights_note()}</p>
            {:else}
              <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
            {/if}
          </div>
        {/key}
        </div>
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
      {/snippet}
    </ReadGate>
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
      <!-- Days of entries, the drawing every list of entries uses (release
           audit U9). -->
      <EntryDays groups={entryDayGroups(insightEntries)} />
      <button class="btn btn-ghost" onclick={() => (insightSheet = null)}>
        <span>{m.done()}</span>
      </button>
    {/if}
  </Sheet>

  <ChartCard level={2} heading={m.stats_tag_share()} kind="tag-share" role={roleAt(activeFlag.roles, CHART_ROLE)}>
    {#snippet control()}
      {#if enoughEntries}
        <ChartPicker
          key="tag-share-days"
          label={m.stats_tag_share_days()}
          value={shareDays}
          options={shareOptions()}
          onPick={(value) => (shareDays = value === 'good' ? 'good' : 'all')}
        />
      {/if}
    {/snippet}
    <div use:resize>
    {#if !shared}
      <div out:crossfade><Skeleton variant="block" count={1} /></div>
    {:else}
      {#key shared.days}
      <div in:figureIn out:crossfade data-tag-share-days={shared.days}>
        {#if enoughEntries && shareParts.length}
          <Donut parts={shareParts} restName={m.stats_tag_share_rest()} total={String(tagUses)} note={m.stats_tag_share_note()} />
        {:else if enoughEntries && shared.days === 'good'}
          <ChartEmpty>{m.stats_tag_share_good_empty()}</ChartEmpty>
        {:else}
          <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
        {/if}
      </div>
      {/key}
    {/if}
    </div>
  </ChartCard>
{/if}

<style>
  .tag-scale {
    margin-top: var(--space-6);
  }

  /* One step above a row's own name (text-sm), so the scale reads as the
     thing the rows beneath it sit on. */
  .tag-scale-heading {
    margin: 0 0 var(--space-3);
    font-family: var(--font-body);
    font-size: var(--text-md);
    font-weight: var(--weight-bold);
  }
</style>
