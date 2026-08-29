<script lang="ts">
  /* Search (phase 5 ticket 22), rebuilt on the kit.

     Three things were wrong with it as a screen, none of them about what it
     could find.

     **The filters pushed the results off the phone.** They were a `.card`
     that opened above the hits and held a whole tag picker, five mood chips,
     two date fields and two toggles - taller than a 390px screen on its own,
     so turning a filter on scrolled away the thing it was filtering. They
     are a sheet now, which is what the app uses for a chooser everywhere
     else, and the active-filter chips stay on the screen as the visible
     record of what is on.

     **Thirty hits were the end of the list.** SCREENS.md says paginated
     thirty at a time and the screen asked for thirty and stopped: a query
     matching fifty said "50 entries" and showed thirty, with nothing to tap.
     There is a page size and a control that asks for another page. Not
     infinite scroll, which SCREENS.md rules out and which a journal is a bad
     fit for anyway - a person searching their own history is looking for one
     day, not grazing.

     The limit grows rather than an offset moving, so the hits already read
     stay where they are and nothing is re-paginated under a finger. It is
     still one bounded read per render (ADR-0004); it is just a larger bound
     each time somebody asks.

     **A hit had no date on it.** The results were a flat run of entry cards
     and the date lived inside each one, so ten hits repeated the same date
     ten times or changed it silently halfway down. They are day cards now,
     the same as Home and the same as a day, which puts the date in the bar
     and the timeline back under it.

     One thing deliberately *not* changed: the day bars carry no count.
     Everywhere else a bar can say how many entries a day holds; here it
     could only say how many matched, and "3 that day" over three of five
     would be the filter describing itself (recentEntries.ts). */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { smartBack } from '$lib/navigation/smart-back';
  import { dateInputValueFromEpochDay, dayRangeEndMin, dayRangeStartMax, epochDayFromDateInputValue, todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import type { EntrySearchFilters } from '$lib/data/journal/entries';
  import { entryDayGroups } from '$lib/data/recentEntries';
  import { tagIdsMatching } from '$lib/data/searchQuery';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import TagPicker from '$lib/components/TagPicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import EntryDays from '$lib/components/EntryDays.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';

  /** One page of hits, and what the "show more" control asks for again. */
  const PAGE = 30;
  const MOOD_VALUES = [1, 2, 3, 4, 5] as const;

  let query = $state('');
  let filtersOpen = $state(false);
  let selectedTagIds = $state<string[]>([]);
  let selectedMoods = $state<number[]>([]);
  let startDate = $state('');
  let endDate = $state('');
  let hasNote = $state(false);
  let hasPhoto = $state(false);
  /* How many pages have been asked for. Reset by anything that changes what
     is being searched for, because page four of one query is not page four
     of the next one and leaving it where it was would silently read 120 rows
     to draw the first screen of a fresh search. */
  let pages = $state(1);

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

  /* Back to the first page whenever the question changes. An effect rather
     than a line in each of the eight setters: every one of them would owe
     the same reset, and the one that forgot would read a hundred rows for a
     one-word query. Depending on the serialized criteria rather than on the
     objects, so re-deriving `filters` into an equal object is not a change. */
  let criteria = $derived(JSON.stringify([query.trim(), filters]));
  $effect(() => {
    criteria;
    pages = 1;
  });

  /* Tag labels are matched here and note text in FTS5, which is ADR-0005's
     split: a built-in tag stores a key, so the words it was shown under only
     exist above the journal, over the mirrored vocabulary. Both halves and
     the query itself are read before the first await, so typing re-runs it.

     The count comes back separately from the page, because the screen states
     how many entries matched and shows a page of them: taking the count from
     the page would have it report thirty for a query with fifty. */
  /* One default for the whole answer rather than one per field. The page and
     its count come back together or not at all, and defaulting them
     separately was two chances for a screen to report a total over hits that
     were not from the same read. */
  const NOTHING_ASKED = { hits: [], total: 0 };

  let search = liveQuery((j) => {
    const typed = query.trim();
    const limit = PAGE * pages;
    if (!typed && !hasStructuredCriteria) return Promise.resolve(NOTHING_ASKED);
    const tagIds = tagIdsMatching(typed, vocabulary.tags);
    return Promise.all([
      j.entries.searchEntries(typed, tagIds, filters, limit),
      j.entries.countSearchMatches(typed, tagIds, filters)
    ]).then(([hits, total]) => ({ hits, total }));
  });
  let results = $derived(search.value ?? NOTHING_ASKED);
  let hits = $derived(results.hits);
  let total = $derived(results.total);
  let groups = $derived(entryDayGroups(hits));
  /* What is left, and therefore whether there is anything to ask for. Read
     off the count rather than off "the page came back full", which cannot
     tell a last page that happens to be exactly thirty from a full one. */
  let remaining = $derived(Math.max(0, total - hits.length));

  /* One area of colour on this screen, and it is the days. Role 0, the only
     index guaranteed to be a colour on all 8 palettes, since a screen with a
     single coloured area has no reading order to follow. */
  let role = $derived(roleAt(activeFlag.roles, 0));

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

<div class="screen" data-screen>
  <ScreenHeader title={m.search()} screen="search" back={() => smartBack('/calendar')}>
    {#snippet actions()}
      <a class="icon-btn" href="/search/starred" aria-label={m.starred_shelf_open()}>
        <Icon name="star" />
      </a>
      <button
        class="icon-btn"
        aria-label={m.search_filters()}
        data-filter-toggle
        aria-pressed={filtersOpen}
        onclick={() => (filtersOpen = !filtersOpen)}
      >
        <Icon name="tag" />
      </button>
    {/snippet}
  </ScreenHeader>

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

  {#if activeFilterChips.length}
    <!-- The one thing that has to stay on the screen once the filters left
         it: with the panel in a sheet, these chips are the only place the
         state of the query is visible. -->
    <div class="search-chips">
      {#each activeFilterChips as chip (chip.key)}
        <button class="tag-chip is-selected press" data-active-filter-chip onclick={chip.remove}>
          <Icon name="x" size={14} />
          {chip.label}
        </button>
      {/each}
      <button class="tag-chip press" data-filter-clear onclick={clearAllFilters}>{m.search_filters_clear_all()}</button>
    </div>
  {/if}

  <div aria-live="polite">
    {#if !hasCriteria}
      <!-- Nothing typed yet, so the screen says what it can find rather than
           drawing an empty result area. -->
      <Notice icon="search" key="search-idle" text={m.search_try()} />
      <p class="search-hint">{m.search_hint()}</p>
    {:else if search.loading}
      <Skeleton variant="card" count={3} />
    {:else if hits.length}
      <p class="search-count" data-search-count>{m.results_count({ count: total })}</p>
      <EntryDays {groups} {role} />
      {#if remaining > 0}
        <button class="btn btn-soft search-more" data-search-more onclick={() => (pages += 1)}>
          <span>{m.search_more({ count: Math.min(PAGE, remaining) })}</span>
        </button>
      {/if}
    {:else}
      <Notice
        icon="search"
        key="search-none"
        title={m.no_results()}
        text={query.trim() ? m.no_results_body({ query }) : m.search_no_results_filtered()}
      />
    {/if}
  </div>

  <Sheet bind:open={filtersOpen} title={m.search_filters()}>
    <SectionHeading text={m.search_filters()} />

    <!-- The count the screen behind the sheet is showing, repeated here
         because the sheet covers it. Filtering against a number you cannot
         see is guessing, and this is the screen's own wording rather than a
         new line of copy. -->
    {#if hasCriteria && !search.loading}
      <p class="search-count" data-filter-count>{m.results_count({ count: total })}</p>
    {/if}

    <p class="search-filter-label">{m.search_filter_tags_label()}</p>
    <TagPicker groups={vocabulary.tagGroups} selected={selectedTagIds} onToggle={toggleTag} />

    <p class="search-filter-label">{m.mood()}</p>
    <div class="tag-row" role="group" aria-label={m.search_filter_moods_aria()}>
      {#each MOOD_VALUES as value (value)}
        <button
          class="tag-chip press"
          class:is-selected={selectedMoods.includes(value)}
          aria-pressed={selectedMoods.includes(value)}
          data-filter-mood={value}
          onclick={() => toggleMood(value)}
        >
          {moodName(value)}
        </button>
      {/each}
    </div>

    <div class="search-filter-dates">
      <label for="search-filter-start">{m.search_filter_start_label()}</label>
      <DatePicker id="search-filter-start" max={dayRangeStartMax(endDate)} bind:value={startDate} ariaLabel={m.search_filter_start_label()} data-filter-start />
      <label for="search-filter-end">{m.search_filter_end_label()}</label>
      <DatePicker id="search-filter-end" min={dayRangeEndMin(startDate)} max={todayInput} bind:value={endDate} ariaLabel={m.search_filter_end_label()} data-filter-end />
    </div>

    <div class="tag-row" role="group" aria-label={m.search_filters()}>
      <button
        class="tag-chip press"
        class:is-selected={hasNote}
        aria-pressed={hasNote}
        data-filter-has-note
        onclick={() => (hasNote = !hasNote)}
      >
        {m.search_filter_has_note()}
      </button>
      <button
        class="tag-chip press"
        class:is-selected={hasPhoto}
        aria-pressed={hasPhoto}
        data-filter-has-photo
        onclick={() => (hasPhoto = !hasPhoto)}
      >
        {m.search_filter_has_photo()}
      </button>
    </div>
  </Sheet>
</div>
