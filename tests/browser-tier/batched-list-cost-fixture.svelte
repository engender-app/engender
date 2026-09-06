<script lang="ts">
  /* The on-device cost probe's own mount point (phase 8 features ticket 68).
     A tiny wrapper rather than mounting `BatchedList` straight from the
     probe's .ts file, because a snippet prop only exists as `{#snippet}`
     markup - the same reason `batched-list-fixture.svelte` exists for
     ticket 66's own probe.

     Two lines and an icon per row, matching what the wear log actually
     renders (practice/wear/+page.svelte) rather than the cheapest shape:
     the question is what a real batch costs, not what an empty one does. */
  import BatchedList from '$lib/components/kit/BatchedList.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';

  let { items }: { items: { id: string; title: string; subtitle: string }[] } = $props();
</script>

<main class="region" data-app-scroll-region>
  <BatchedList {items} key="cost-probe">
    {#snippet rows(shown)}
      {#each shown as item (item.id)}
        <ListRow
          key={item.id}
          data-probe-row={item.id}
          icon="clock"
          title={item.title}
          subtitle={item.subtitle}
          chevron={false}
        />
      {/each}
    {/snippet}
  </BatchedList>
</main>

<style>
  .region {
    height: 100dvh;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
  }
</style>
