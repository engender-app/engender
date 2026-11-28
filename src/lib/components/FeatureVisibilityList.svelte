<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { FEATURE_MODULE_ROWS, HUB_GROUP_KEYS, type HubGroupKey, type HubRow } from '$lib/data/hubRows';
  import { hubGroupHeading, hubRowDescription, hubRowTitle } from '$lib/data/vocabulary/hubLabels';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';

  let {
    moduleEnabled,
    onModuleChange
  }: {
    moduleEnabled: (row: HubRow) => boolean;
    onModuleChange: (row: HubRow, enabled: boolean) => void;
  } = $props();

  /* The switches sit under the hub's own group headings, in the hub's order, so this long
     list reads in the shape the app is laid out in. */
  const groupOf = (row: HubRow): HubGroupKey => row.home;
  const groups = HUB_GROUP_KEYS.map((key) => ({ key, rows: FEATURE_MODULE_ROWS.filter((row) => groupOf(row) === key) }))
    .filter((group) => group.rows.length > 0);
</script>

<div class="feature-choices" data-feature-modules>
  <p class="muted small">{m.feature_modules_intro()}</p>
  {#each groups as group (group.key)}
    <section class="feature-group" data-feature-group={group.key}>
      <h4>{hubGroupHeading(group.key)}</h4>
      <ListCard>
        {#each group.rows as row (row.key)}
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
    </section>
  {/each}
</div>

<style>
  .feature-choices {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
  .feature-choices p,
  .feature-group h4 {
    margin: 0;
  }
  .feature-group {
    display: grid;
    gap: var(--space-2);
  }
  .feature-choices :global(.kit-row-sub) {
    overflow-wrap: anywhere;
  }
</style>
