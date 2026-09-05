<script lang="ts">
  /* A batched list inside a scroll region the size of a small screen
     (phase 8 features ticket 66). The region carries the app's own
     `data-app-scroll-region`, because that is what the component roots its
     observer at - a fixture that left it off would be testing the viewport
     fallback rather than the thing the app runs. */
  import BatchedList from '$lib/components/kit/BatchedList.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';

  let { items }: { items: { id: string; title: string }[] } = $props();
</script>

<div class="region" data-app-scroll-region>
  <BatchedList {items} key="probe">
    {#snippet rows(shown)}
      {#each shown as item (item.id)}
        <ListRow key={item.id} data-probe-row={item.id} title={item.title} static={true} />
      {/each}
    {/snippet}
  </BatchedList>
</div>

<style>
  .region {
    height: 400px;
    overflow-y: auto;
  }
</style>
