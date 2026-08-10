<script lang="ts">
  import { page } from '$app/state';
  import EntryEditor from '$lib/components/EntryEditor.svelte';
</script>

{#key page.params.id}
  <EntryEditor entryId={Number(page.params.id)} />
{/key}
