<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { smartBack } from '$lib/navigation/smart-back';
  import { sourceReturnTo } from '$lib/navigation/sourceRecord';
  import Notice from './kit/Notice.svelte';

  let { id, ready, found, onOpen }: {
    id: string | null;
    ready: boolean;
    found: boolean;
    onOpen?: () => void;
  } = $props();
  let handled = $state<string | null>(null);
  let returnTo = $derived(sourceReturnTo(page.url));

  afterNavigate(() => { handled = null; });

  function returnToSource(event: MouseEvent) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    smartBack(returnTo!);
  }

  // Each destination resolves its own record. Consume only after a successful read.
  $effect(() => {
    if (!id) { handled = null; return; }
    if (!ready || !found || handled === id) return;
    handled = id;
    untrack(() => onOpen?.());
  });
</script>

{#if id && ready && !found}
  <Notice key="source-unavailable" title={m.source_record_unavailable()} text={m.source_record_unavailable_hint()} />
{/if}
{#if returnTo}
  <a class="btn btn-soft press" data-source-return href={returnTo} onclick={returnToSource}>{m.source_record_return()}</a>
{/if}
