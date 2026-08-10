<script lang="ts">
  import { icon } from './icons';

  let { name, size = 24, cls = '' }: { name: string; size?: number; cls?: string } = $props();
</script>

{@html icon(name, size, cls)}
