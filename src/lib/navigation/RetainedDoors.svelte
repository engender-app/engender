<script module lang="ts">
  export type { DoorPath } from './RetainedDoor.svelte';
</script>

<script lang="ts">
  import RetainedDoor, { type DoorPath } from './RetainedDoor.svelte';
  import { premountDoors } from './premountDoors';

  let {
    path,
    premount = false,
    current = null
  }: {
    path: DoorPath | null;
    /** Mount the doors not yet visited, hidden, while the app is still (premountDoors.ts). */
    premount?: boolean;
    /** The route on show, which is never mounted a second time behind itself. */
    current?: string | null;
  } = $props();
  let visited = $state<DoorPath[]>([]);

  // Visit first; hidden doors keep their component instances afterwards.
  $effect.pre(() => {
    if (path && !visited.includes(path)) visited.push(path);
  });
  let doors = $derived(path ? [path, ...visited.filter((door) => door !== path)] : visited);

  /* The Journal first: it is the largest door to mount. */
  const PREMOUNT_ORDER: DoorPath[] = ['/calendar', '/stats', '/more', '/'];
  $effect(() => {
    if (!premount) return;
    const controller = new AbortController();
    premountDoors(
      controller.signal,
      () => PREMOUNT_ORDER.find((door) => !visited.includes(door) && door !== path && door !== current) ?? null,
      (door) => {
        if (!visited.includes(door as DoorPath)) visited.push(door as DoorPath);
      }
    );
    return () => controller.abort();
  });
</script>

{#each doors as door (door)}
  <RetainedDoor path={door} active={door === path} />
{/each}
