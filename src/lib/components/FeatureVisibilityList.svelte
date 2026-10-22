<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { FEATURE_MODULE_ROWS, type HubRow } from '$lib/data/hubRows';
  import { hubRowDescription, hubRowTitle } from '$lib/data/vocabulary/hubLabels';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';

  let {
    moduleEnabled,
    onModuleChange
  }: {
    moduleEnabled: (row: HubRow) => boolean;
    onModuleChange: (row: HubRow, enabled: boolean) => void;
  } = $props();
</script>

<div class="feature-choices" data-feature-modules>
  <p class="muted small">{m.feature_modules_intro()}</p>
  <ListCard>
    {#each FEATURE_MODULE_ROWS as row (row.key)}
      <ListRow
        key={`feature-${row.key}`}
        icon={row.icon}
        title={hubRowTitle(row.key)}
        subtitle={hubRowDescription(row.key)}
        checked={moduleEnabled(row)}
        chevron={false}
        data-feature-module={row.key}
        onclick={() => onModuleChange(row, !moduleEnabled(row))}
      />
    {/each}
  </ListCard>
</div>

<style>
  .feature-choices {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
  .feature-choices p {
    margin: 0;
  }
  .feature-choices :global(.kit-row-sub) {
    overflow-wrap: anywhere;
  }
</style>
