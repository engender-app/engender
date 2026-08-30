<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import { markLetterRead } from '$lib/data/letterStatus';

  $effect(() => {
    const id = page.params.id;
    if (id) {
      markLetterRead(id);
      goto(`/settings/letters?read=${encodeURIComponent(id)}`, { replaceState: true });
    }
  });
</script>

<div class="screen">
  <ScreenHeader title={m.letters_title()} back="/settings/letters" />
</div>
