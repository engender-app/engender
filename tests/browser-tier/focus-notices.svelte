<script lang="ts">
  import Notice from '$lib/components/kit/Notice.svelte';
  let first = $state(true);
  let second = $state(true);
</script>
<div class="screen">
  <h1>Notices</h1>
  {#if first}<Notice key="first" title="First notice" dismiss={{ label: 'Dismiss first', onclick: () => { first = false; } }} />{/if}
  {#if second}<Notice key="second" title="Second notice" dismiss={{ label: 'Dismiss second', onclick: () => { second = false; } }} />{/if}
</div>
