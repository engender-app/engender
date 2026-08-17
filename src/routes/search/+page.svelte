<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { smartBack } from '$lib/navigation/smart-back';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValue, todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import type { EntrySearchFilters } from '$lib/data/journal/entries';
  import { tagIdsMatching } from '$lib/data/searchQuery';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import TagPicker from '$lib/components/TagPicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  /* One page of hits. The screen showed thirty before and paginates no
     further, so thirty is what it asks for rather than what it discards
     (ADR-0004: no unbounded read to render a screen). */
  const PAGE = 30;
  const MOOD_VALUES = [1, 2, 3, 4, 5] as const;

  let query = $state('');
  let showFilters = $state(false);
  let selectedTagIds = $state<string[]>([]);
  let selectedMoods = $state<number[]>([]);
  let startDate = $state('');
  let endDate = $state('');
  let hasNote = $state(false);
  let hasPhoto = $state(false);

  const toggleTag = (id: string) => {
    selectedTagIds = selectedTagIds.includes(id)
      ? selectedTagIds.filter((t) => t !== id)
      : [...selectedTagIds, id];
  };
  const toggleMood = (value: number) => {
    selectedMoods = selectedMoods.includes(value)
      ? selectedMoods.filter((m) => m !== value)
      : [...selectedMoods, value];
  };
  const clearAllFilters = () => {
    selectedTagIds = [];
    selectedMoods = [];
    startDate = '';
    endDate = '';
    hasNote = false;
    hasPhoto = false;
  };

  let filters = $derived.by<EntrySearchFilters>(() => {
    const out: EntrySearchFilters = {};
    if (selectedTagIds.length) out.tagIds = selectedTagIds;
    if (selectedMoods.length) out.moods = selectedMoods;
    const startEpochDay = epochDayFromDateInputValue(startDate);
    const endEpochDay = epochDayFromDateInputValue(endDate);
    if (startEpochDay != null) out.startEpochDay = startEpochDay;
    if (endEpochDay != null) out.endEpochDay = endEpochDay;
    if (hasNote) out.hasNote = true;
    if (hasPhoto) out.hasPhoto = true;
    return out;
  });
  let hasStructuredCriteria = $derived(
    selectedTagIds.length > 0 ||
      selectedMoods.length > 0 ||
      !!startDate ||
      !!endDate ||
      hasNote ||
      hasPhoto
  );
  let hasCriteria = $derived(!!query.trim() || hasStructuredCriteria);

  /* Tag labels are matched here and note text in FTS5, which is ADR-0005's
     split: a built-in tag stores a key, so the words it was shown under only
     exist above the journal, over the mirrored vocabulary. Both halves and
     the query itself are read before the first await, so typing re-runs it.

     The count comes back separately from the page, because the screen states
     how many entries matched and shows the first thirty of them: taking the
     count from the page would have it report thirty for a query with fifty. */
  let search = liveQuery(['entry', 'tag'], (j) => {
    const typed = query.trim();
    if (!typed && !hasStructuredCriteria) return Promise.resolve({ hits: [], total: 0 });
    const tagIds = tagIdsMatching(typed, vocabulary.tags);
    return Promise.all([
      j.entries.searchEntries(typed, tagIds, filters, PAGE),
      j.entries.countSearchMatches(typed, tagIds, filters)
    ]).then(([hits, total]) => ({ hits, total }));
  });
  let hits = $derived(search.value?.hits ?? []);
  let total = $derived(search.value?.total ?? 0);

  let activeFilterChips = $derived.by(() => {
    const chips: { key: string; label: string; remove: () => void }[] = [];
    for (const id of selectedTagIds) {
      const label = vocabulary.tags.find((t) => t.id === id)?.label;
      if (label) chips.push({ key: `tag-${id}`, label, remove: () => toggleTag(id) });
    }
    for (const value of selectedMoods) {
      chips.push({
        key: `mood-${value}`,
        label: m.search_filter_mood_chip({ mood: moodName(value) }),
        remove: () => toggleMood(value)
      });
    }
    if (startDate) {
      chips.push({
        key: 'start',
        label: m.search_filter_start_chip({ date: startDate }),
        remove: () => (startDate = '')
      });
    }
    if (endDate) {
      chips.push({
        key: 'end',
        label: m.search_filter_end_chip({ date: endDate }),
        remove: () => (endDate = '')
      });
    }
    if (hasNote) chips.push({ key: 'has-note', label: m.search_filter_has_note(), remove: () => (hasNote = false) });
    if (hasPhoto) chips.push({ key: 'has-photo', label: m.search_filter_has_photo(), remove: () => (hasPhoto = false) });
    return chips;
  });
  let todayInput = $derived(dateInputValueFromEpochDay(todayEpochDay()));
</script>

<div class="screen">
  <header class="screen-header">
    <button class="icon-btn" aria-label={m.back()} onclick={() => smartBack('/calendar')}><Icon name="arrowLeft" /></button>
    <h1 class="screen-title">{m.search()}</h1>
    <button
      class="icon-btn"
      aria-label={m.search_filters()}
      data-filter-toggle
      aria-pressed={showFilters}
      onclick={() => (showFilters = !showFilters)}
    >
      <Icon name="tag" />
    </button>
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

  {#if showFilters}
    <div class="card" style="margin-bottom:var(--space-4)">
      <p class="muted small" style="margin-bottom:var(--space-3)">{m.search_filters()}</p>

      <details open>
        <summary class="muted small" style="margin-bottom:var(--space-2)">{m.search_filter_tags_label()}</summary>
        <TagPicker groups={vocabulary.tagGroups} selected={selectedTagIds} onToggle={toggleTag} />
      </details>

      <p class="muted small" style="margin:var(--space-3) 0 var(--space-2)">{m.mood()}</p>
      <div class="tag-row" role="group" aria-label={m.search_filter_moods_aria()}>
        {#each MOOD_VALUES as value (value)}
          <button
            class="tag-chip"
            class:is-selected={selectedMoods.includes(value)}
            aria-pressed={selectedMoods.includes(value)}
            data-filter-mood={value}
            onclick={() => toggleMood(value)}
          >
            {moodName(value)}
          </button>
        {/each}
      </div>

      <div class="recap-custom-grid" style="margin-top:var(--space-3)">
        <label for="search-filter-start">{m.search_filter_start_label()}</label>
        <input
          class="input"
          id="search-filter-start"
          data-filter-start
          type="date"
          bind:value={startDate}
          max={endDate || undefined}
          aria-label={m.search_filter_start_label()}
        />
        <label for="search-filter-end">{m.search_filter_end_label()}</label>
        <input
          class="input"
          id="search-filter-end"
          data-filter-end
          type="date"
          bind:value={endDate}
          min={startDate || undefined}
          max={todayInput}
          aria-label={m.search_filter_end_label()}
        />
      </div>

      <div class="tag-row" style="margin-top:var(--space-3)" role="group" aria-label={m.search_filters()}>
        <button
          class="tag-chip"
          class:is-selected={hasNote}
          aria-pressed={hasNote}
          data-filter-has-note
          onclick={() => (hasNote = !hasNote)}
        >
          {m.search_filter_has_note()}
        </button>
        <button
          class="tag-chip"
          class:is-selected={hasPhoto}
          aria-pressed={hasPhoto}
          data-filter-has-photo
          onclick={() => (hasPhoto = !hasPhoto)}
        >
          {m.search_filter_has_photo()}
        </button>
      </div>
    </div>
  {/if}

  {#if activeFilterChips.length}
    <div class="tag-row" style="margin-bottom:var(--space-3)">
      {#each activeFilterChips as chip (chip.key)}
        <button class="tag-chip is-selected" data-active-filter-chip onclick={chip.remove}>
          <Icon name="x" size={14} />
          {chip.label}
        </button>
      {/each}
      <button class="tag-chip" data-filter-clear onclick={clearAllFilters}>{m.search_filters_clear_all()}</button>
    </div>
  {/if}

  <div aria-live="polite">
    {#if !hasCriteria}
      <p class="muted small" style="text-align:center;padding:var(--space-7) 0">{m.search_try()}</p>
    {:else if search.loading}
      <Skeleton variant="card" count={3} />
    {:else if hits.length}
      <p class="muted small" style="margin-bottom:var(--space-3)">{m.results_count({ count: total })}</p>
      {#each hits as e (e.id)}
        <EntryCard entry={e} />
      {/each}
    {:else}
      <EmptyState
        title={m.no_results()}
        text={query.trim() ? m.no_results_body({ query }) : m.search_no_results_filtered()}
      />
    {/if}
  </div>
</div>
