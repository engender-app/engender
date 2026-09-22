<script lang="ts">
  /* Affirming themes: which tags the counterevidence carries most, over the
     span. It was a card on Safe space's readings screen (phase 10 redesign
     ticket 47); phase 11 ticket 07 gives it a place on the Look back door,
     where a reading over the journal belongs, and ticket 15 hands the rest
     of that screen over. Read over the span the way every reading on the
     door is, through the pool's own span parameter.

     Nothing here grades a day (ADR-0012): a count of how often a tag was
     on an entry the person themselves starred or tagged as a good one. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { EUPHORIA_TAG_KEYS } from '$lib/data/vocabulary/builtins';
  import { COUNTEREVIDENCE_LIMIT } from '$lib/data/counterevidence';
  import { affirmingThemeCounts } from '$lib/data/affirmingThemes';
  import { readingHref } from '$lib/data/lookBackReadings';
  import type { Span } from '$lib/data/lookBackSpan';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { BarRow } from '$lib/components/kit/barRow';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import BarRows from '$lib/components/kit/BarRows.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';

  let { span, view = 'screen' }: { span: Span; view?: 'tile' | 'screen' } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);
  const CHART_ROLE = 0;

  let poolQuery = liveList((j) => j.entries.counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT, { from, to }));
  let themes = $derived(affirmingThemeCounts(poolQuery.rows));
  let themeRows = $derived<BarRow[]>(
    themes.map((theme) => ({
      key: theme.id,
      name: vocabulary.tag(theme.id)?.label ?? theme.id,
      value: m.count_times({ count: String(theme.count) }),
      amount: theme.count
    }))
  );
  let top = $derived(themeRows[0]);
  let most = $derived(themes[0]?.count ?? 1);
</script>

{#if view === 'tile'}
  {#if !poolQuery.loading && top}
    <ReadingTile
      key="themes"
      name={m.safe_space_chart_themes_title()}
      href={readingHref('themes', span)}
      headline={top.name}
      note={top.value}
    >
      {#snippet drawing()}
        <span class="themes-bars">
          {#each themeRows.slice(0, 3) as row (row.key)}
            <span class="themes-bar" style={`width: ${Math.round((row.amount / most) * 100)}%`}></span>
          {/each}
        </span>
      {/snippet}
    </ReadingTile>
  {/if}
{:else}
  <ChartCard heading={m.safe_space_chart_themes_title()} kind="affirming-themes" role={roleAt(activeFlag.roles, CHART_ROLE)}>
    <ReadGate read={poolQuery} variant="line" count={3}>
      {#snippet rows()}
        {#if themes.length}
          <BarRows rows={themeRows} />
        {:else}
          <ChartEmpty>{m.safe_space_no_themes()}</ChartEmpty>
        {/if}
      {/snippet}
      {#snippet empty()}
        <ChartEmpty>{m.safe_space_no_themes()}</ChartEmpty>
      {/snippet}
    </ReadGate>
  </ChartCard>
{/if}

<style>
  .themes-bars {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 4px;
    width: 100%;
    height: 100%;
  }

  .themes-bar {
    display: block;
    flex: 0 0 8px;
    border-radius: 2px;
    background: var(--ink);
  }
</style>
