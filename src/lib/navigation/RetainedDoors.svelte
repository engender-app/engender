<script module lang="ts">
  export type { DoorPath } from './RetainedDoor.svelte';
</script>

<script lang="ts">
  import RetainedDoor, { type DoorPath } from './RetainedDoor.svelte';

  let { path }: { path: DoorPath | null } = $props();
  let visited = $state<DoorPath[]>([]);

  // Visit first; hidden doors keep their component instances afterwards.
  $effect.pre(() => {
    if (path && !visited.includes(path)) visited.push(path);
  });
  let doors = $derived(path ? [path, ...visited.filter((door) => door !== path)] : visited);
</script>

{#each doors as door (door)}
  <RetainedDoor path={door} active={door === path} />
{/each}
