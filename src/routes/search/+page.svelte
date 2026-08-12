<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { tagIdsMatching } from '$lib/data/searchQuery';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  /* One page of hits. The screen showed thirty before and paginates no
     further, so thirty is what it asks for rather than what it discards
     (ADR-0004: no unbounded read to render a screen). */
  const PAGE = 30;

  let query = $state('');

  /* Tag labels are matched here and note text in FTS5, which is ADR-0005's
     split: a built-in tag stores a key, so the words it was shown under only
     exist above the journal, over the mirrored vocabulary. Both halves and
     the query itself are read before the first await, so typing re-runs it.

     The count comes back separately from the page, because the screen states
     how many entries matched and shows the first thirty of them: taking the
     count from the page would have it report thirty for a query with fifty. */
  let search = liveQuery(['entry', 'tag'], (j) => {
    const typed = query.trim();
    if (!typed) return Promise.resolve({ hits: [], total: 0 });
    const tagIds = tagIdsMatching(typed, vocabulary.tags);
    return Promise.all([
      j.entries.searchEntries(typed, tagIds, PAGE),
      j.entries.countSearchMatches(typed, tagIds)
    ]).then(([hits, total]) => ({ hits, total }));
  });
  let hits = $derived(search.value?.hits ?? []);
  let total = $derived(search.value?.total ?? 0);
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
    {:else if search.loading}
      <Skeleton variant="card" count={3} />
    {:else if hits.length}
      <p class="muted small" style="margin-bottom:var(--space-3)">{m.results_count({ count: String(total) })}</p>
      {#each hits as e (e.id)}
        <EntryCard entry={e} />
      {/each}
    {:else}
      <EmptyState
        riveLabel={m.rive_no_results()}
        title={m.no_results()}
        text={m.no_results_body({ query })}
      />
    {/if}
  </div>
</div>
