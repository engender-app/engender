<script lang="ts">
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  let loaded = $state(new URLSearchParams(location.search).has('grow'));
</script>
<div style="width:390px; max-width:100%; padding:24px; position:relative">
  <button data-load onclick={() => loaded = !loaded}>Replace summary</button>
  <ListCard>
    <ListRow key="care" title="Care" href="/care" fadeSwap subtitle={loaded ? '2 mg estradiol · oral · last dose today' : 'Your medication, doses, labs and changes over time, with your running regimen and stock in one place'} />
    <ListRow key="surgery" title="Surgery journey" href="/health/surgery" subtitle="Next consultation in 16 days" />
  </ListCard>
</div>
