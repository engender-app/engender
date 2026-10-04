<script lang="ts">
  import PinPad from '$lib/components/PinPad.svelte';

  let value = $state('');
  let refusals = $state(0);
  let disabled = $state(false);
</script>

<main>
  <PinPad bind:value {refusals} {disabled} onComplete={() => {}} />
  <button data-refuse onclick={() => { value = ''; refusals++; }}>Reset after refusal</button>
  <button data-disable onclick={() => (disabled = !disabled)}>Toggle disabled</button>
</main>
