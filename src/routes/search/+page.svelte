<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { searchEntries } from '$lib/data/repositories/entries';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  let query = $state('');
  let hits = $derived(searchEntries(query, (id) => vocabulary.tag(id)?.label ?? ''));
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/calendar" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.search()}</h1>
    <div class="header-action"></div>
  </header>

  <div class="search-box">
    <Icon name="search" size={20} />
    <!-- svelte-ignore a11y_autofocus — a search screen's single purpose is this field -->
    <input
      class="search-input"
      id="q"
      name="q"
      type="search"
      placeholder={m.search_placeholder()}
      aria-label={m.search()}
      autocomplete="off"
      autofocus
      bind:value={query}
    />
  </div>
  <p class="muted small" style="margin:var(--space-2) 0 var(--space-4)">{m.search_hint()}</p>

  <div aria-live="polite">
    {#if !query.trim()}
      <p class="muted small" style="text-align:center;padding:var(--space-7) 0">{m.search_try()}</p>
    {:else if hits.length}
      <p class="muted small" style="margin-bottom:var(--space-3)">{m.results_count({ count: String(hits.length) })}</p>
      {#each hits.slice(0, 30) as e (e.id)}
        <EntryCard entry={e} />
      {/each}
    {:else}
      <EmptyState
        riveLabel="No results: a magnifying glass over gentle waves"
        title={m.no_results()}
        text={m.no_results_body({ query })}
      />
    {/if}
  </div>
</div>
