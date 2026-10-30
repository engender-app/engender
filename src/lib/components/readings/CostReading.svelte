<script lang="ts">
  /* What the span cost (functional audit ticket 31): the Cost reading, as
     its tile on the Look back door and as its screen at /stats/cost.

     One read, ticket 30's `getCosts()`, and every figure made by
     costReading.ts, which totals through costTotalsByCurrency. A currency is
     the outer grouping everywhere on this surface: the screen draws one card
     per currency and splits that card's total by area and by refunded or
     not, and the tile states one currency's total and names the others.
     Nothing here adds two currencies, and there is no rate to convert by
     (ADR-0097).

     Absent, never empty, like every tile on the door: a span with no amount
     in it has no tile. Its screen, reached by an address, says the span
     holds no costs inside the card, the way the other readings' cards say
     theirs has nothing to read. */
  import { m } from '$lib/paraglide/messages';
  import { intlLocale } from '$lib/data/dates';
  import { formatAmount } from '$lib/data/cost';
  import { costReading } from '$lib/data/costReading';
  import type { CostSource } from '$lib/data/journal/costs';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { readingHref } from '$lib/data/lookBackReadings';
  import type { Span } from '$lib/data/lookBackSpan';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';
  import { joinReadGroup } from '$lib/components/kit/readGroup.svelte';

  let { span, view = 'screen' }: { span: Span; view?: 'tile' | 'screen' } = $props();

  const CHART_ROLE = 0;

  let costsQuery = liveList((j) => j.costs.getCosts());
  joinReadGroup(() => !costsQuery.loading);
  let reading = $derived(costReading(costsQuery.rows, span));
  let first = $derived(reading.currencies[0]);

  const money = (amount: number, currency: string) => formatAmount(amount, currency, intlLocale());

  const AREA_NAME: Record<CostSource, () => string> = {
    hairRemoval: () => m.cost_area_hair_removal(),
    appointment: () => m.cost_area_appointment(),
    procedure: () => m.cost_area_procedure(),
    lab: () => m.cost_area_lab(),
    stock: () => m.cost_area_stock()
  };

  const currencyName = (code: string) => {
    try {
      return new Intl.DisplayNames(intlLocale(), { type: 'currency' }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  /* The tile's one line under the figure: the other currencies by code
     when there are any, since the figure is only one of them; otherwise
     how much of it was refunded. */
  let tileNote = $derived.by(() => {
    if (!first) return '';
    const others = reading.currencies.slice(1).map((c) => c.currency);
    if (others.length) return m.cost_tile_also({ codes: new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(others) });
    return first.refunded > 0 ? m.cost_tile_refunded({ amount: money(first.refunded, first.currency) }) : m.cost_tile_none_refunded();
  });
</script>

{#if view === 'tile'}
  {#if !costsQuery.loading && first}
    <ReadingTile
      key="cost"
      name={m.stats_cost()}
      href={readingHref('cost', span)}
      headline={money(first.total, first.currency)}
      note={tileNote}
    />
  {/if}
{:else if !costsQuery.loading}
  {#if reading.currencies.length}
    {#each reading.currencies as currency (currency.currency)}
      <ChartCard level={2} heading={currencyName(currency.currency)} kind="cost" role={roleAt(activeFlag.roles, CHART_ROLE)}>
        <div class="cost-reading" data-cost-currency={currency.currency}>
          <p class="cost-total">
            <span class="cost-total-figure" data-cost-total>{money(currency.total, currency.currency)}</span>
            <span class="cost-total-note">{m.cost_reading_count({ count: currency.count })}</span>
          </p>

          <h3 class="cost-sub">{m.cost_reading_by_area()}</h3>
          <ListCard role={roleAt(activeFlag.roles, CHART_ROLE)}>
            {#each currency.byArea as area, i (area.source)}
              <div class:rows-divide={i > 0}>
                <ListRow
                  static
                  data-cost-area={area.source}
                  title={AREA_NAME[area.source]()}
                  subtitle={area.refunded > 0 ? m.cost_tile_refunded({ amount: money(area.refunded, currency.currency) }) : undefined}
                >
                  {#snippet trailing()}<b class="wrapped-figure-value">{money(area.total, currency.currency)}</b>{/snippet}
                </ListRow>
              </div>
            {/each}
          </ListCard>

          <h3 class="cost-sub">{m.cost_reading_by_refund()}</h3>
          <ListCard role={roleAt(activeFlag.roles, CHART_ROLE)}>
            <ListRow static data-cost-refund="refunded" title={m.cost_refunded()}>
              {#snippet trailing()}<b class="wrapped-figure-value">{money(currency.refunded, currency.currency)}</b>{/snippet}
            </ListRow>
            <div class="rows-divide">
              <ListRow static data-cost-refund="not-refunded" title={m.cost_reading_not_refunded()}>
                {#snippet trailing()}<b class="wrapped-figure-value">{money(currency.notRefunded, currency.currency)}</b>{/snippet}
              </ListRow>
            </div>
          </ListCard>
        </div>
      </ChartCard>
    {/each}
    {#if reading.currencies.length > 1}
      <p class="reading-note" data-cost-apart>{m.cost_reading_apart()}</p>
    {/if}
  {:else}
    <ChartCard level={2} heading={m.stats_cost()} kind="cost" role={roleAt(activeFlag.roles, CHART_ROLE)}>
      <ChartEmpty>{m.cost_reading_empty()}</ChartEmpty>
    </ChartCard>
  {/if}
  {#if reading.undated}
    <p class="reading-note" data-cost-undated>{m.cost_reading_undated({ count: reading.undated })}</p>
  {/if}
{/if}

<style>
  .cost-reading {
    display: grid;
    gap: var(--space-3);
  }

  .cost-total {
    display: grid;
    gap: var(--space-1);
    margin: 0;
  }

  .cost-total-figure {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .cost-total-note {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  .cost-sub {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }
</style>
