<script lang="ts">
  import RetainedDoors, { type DoorPath } from '../../src/lib/navigation/RetainedDoors.svelte';

  let path = $state<DoorPath | null>('/');
  export function visit(next: DoorPath | null): void {
    path = next;
  }
</script>

<RetainedDoors {path} />
