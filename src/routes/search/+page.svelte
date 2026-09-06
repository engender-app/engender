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
     would be the filter describing itself (recentEntries.ts).

     **What it searches (phase 5 deepening ticket 24).** Entries, and every
     other area of the journal that holds text: letters, milestone names,
     procedure notes, appointment questions, felt-sense reflections, custom
     roadmap goals, affirmations, lab notes, fit notes, wear notes, provider
     names, drug names, reminder titles. Which those are is textSearch.ts's
     registry, not a list here - this screen names no area, and an area
     registered there reaches this screen without it being edited.

     Two reads rather than one, and they are different questions. Entries go
     through the FTS index with the filters and the paging they have always
     had (entries.ts); everything else is one scan across the registry
     (textSearch.ts). Keeping them apart is what lets the entries keep their
     day cards - a hit in a letter is a line of text, and an entry is a day
     with a mood and tags on it.

     A hit outside entries is a row in one list rather than a section per
     area: it carries the area's name as its subtitle, and the list keeps the
     order the read returned, which is newest first across every area. The
     first build grouped by area and it was wrong - eighteen areas can answer
     a query, and a display-size heading over a card holding one row makes
     three hits look like a screen of scaffolding (searchHitRows.ts).

     Three rules the screen holds to, and the sheet says the third out loud
     because it is the one somebody could otherwise be surprised by:

     *Nothing outside entries is searched without a word.* Those areas have
     no criteria of their own to be listed by - a date range alone would
     print every letter in the range, which is the archive's job.

     *The date range narrows everything it can reach.* An area whose records
     carry a day is narrowed by it; a roadmap goal and an affirmation belong
     to no day and are not.

     *Tags, moods, has-note and has-photo are entry-only.* They are entry
     fields, and no other area has them. The filter sheet states it rather
     than leaving somebody to infer it from a letter that ignored the mood
     they picked. */
  import { m } from '$lib/paraglide/messages';
  import { goto } from '$app/navigation';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { smartBack } from '$lib/navigation/smart-back';
  import { dateInputValueFromEpochDay, dayRangeEndMin, dayRangeStartMax, epochDayFromDateInputValue, todayEpochDay } from '$lib/data/epochDay';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import type { EntrySearchFilters } from '$lib/data/journal/entries';
  import { entryDayGroups } from '$lib/data/recentEntries';
  import { drawRandomEntry } from '$lib/data/randomDraw';
  import { savedQuestionInputOf } from '$lib/data/savedQuestionQuery';
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
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { searchHitRows } from '$lib/components/searchHitRows';

  /** One page of hits, and what the "show more" control asks for again. */
  const PAGE = 30;
  const MOOD_VALUES = [1, 2, 3, 4, 5] as const;

  let query = $state('');
  /** How long the search waits after the last keystroke before it asks
      (phase 8 audit ticket 15) - long enough that typing at speed never
      fires a run per key, short enough that a pause reads as instant. */
  const SEARCH_DEBOUNCE_MS = 250;
  let filtersOpen = $state(false);
  let selectedTagIds = $state<string[]>([]);
  let selectedMoods = $state<number[]>([]);
  let startDate = $state('');
  let endDate = $state('');
  let hasNote = $state(false);
  let hasPhoto = $state(false);
  /* Saving a question keeps the query and every filter that is on, never
     today's results (ticket 06's own acceptance criterion: a saved
     question is read the same way an ad hoc search is, not frozen). */
  let savingOpen = $state(false);
  let savingName = $state('');

  async function saveQuestion() {
    const name = savingName.trim();
    if (!name) return;
    await journal.savedQuestions.upsertSavedQuestion(savedQuestionInputOf(name, query.trim(), filters));
    savingOpen = false;
    savingName = '';
  }
  /* How many pages have been asked for, one counter per read. Reset by
     anything that changes what is being searched for, because page four of
     one query is not page four of the next one and leaving it where it was
     would silently read 120 rows to draw the first screen of a fresh search.

     Two counters rather than one shared: the two reads are paged by their
     own controls, each under the results it grows, so a person asking for
     more letters does not also pay for another thirty entries. */
  let pages = $state(1);
  let hitPages = $state(1);

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
  /* The typed query, waited out (phase 8 audit ticket 15). The two
     liveQuery closures below read `debouncedQuery`, never `query` itself:
     `query` changes once a keystroke, and the reactivity contract
     (journal.svelte.ts: a closure's dependency is whatever it reads before
     its first await) means a closure reading it re-runs once a keystroke
     too - every one of the entry half's seven statements and the elsewhere
     union's two, per character typed. Clearing the field is the one case
     that is not waited out: an empty query drops the pending timer and
     lands on `debouncedQuery` at once, so clearing clears the results
     without the wait (the ticket's own acceptance criterion). */
  let debouncedQuery = $state('');
  $effect(() => {
    const typed = query.trim();
    if (!typed) {
      debouncedQuery = '';
      return;
    }
    const timer = setTimeout(() => {
      debouncedQuery = typed;
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  /* Off the debounced query, not the box: what this gates - the idle/results
     switch below, and the save-question button - all describe an answer, and
     the box can hold a character or two nothing has answered for yet
     (ticket 15). The lag this adds before the save button appears is the
     debounce interval, not a wait anyone types through. */
  let hasCriteria = $derived(!!debouncedQuery || hasStructuredCriteria);

  /* Back to the first page whenever the question changes. An effect rather
     than a line in each of the eight setters: every one of them would owe
     the same reset, and the one that forgot would read a hundred rows for a
     one-word query. Depending on the serialized criteria rather than on the
     objects, so re-deriving `filters` into an equal object is not a change. */
  let criteria = $derived(JSON.stringify([query.trim(), filters]));
  $effect(() => {
    criteria;
    pages = 1;
    hitPages = 1;
    drawnIds = new Set();
  });

  /* Random, scoped to the question currently being asked rather than its own
     control (phase 8 features ticket 08, spec.md: "Random, scoped"). The
     small "which ones have come up already" piece of state the ticket calls
     for and says is not a stored one - reset above whenever the question
     changes, and by drawRandomEntry itself once every loaded hit has come
     up. Draws from `hits`, the run currently on screen, not from `total`:
     the ticket's own "the result set currently on screen". */
  let drawnIds = $state<Set<number>>(new Set());
  function drawRandom() {
    const draw = drawRandomEntry(hits, drawnIds);
    if (!draw) return;
    drawnIds = draw.drawnIds;
    void goto(`/entry/${draw.entry.id}`);
  }

  /* Tag labels are matched here and note text in FTS5, which is ADR-0005's
     split: a built-in tag stores a key, so the words it was shown under only
     exist above the journal, over the mirrored vocabulary. Both halves and
     the debounced query itself are read before the first await, so a run
     lands once the typist pauses rather than once a key.

     The count comes back separately from the page, because the screen states
     how many entries matched and shows a page of them: taking the count from
     the page would have it report thirty for a query with fifty. */
  /* One default for the whole answer rather than one per field. The page and
     its count come back together or not at all, and defaulting them
     separately was two chances for a screen to report a total over hits that
     were not from the same read. */
  const NOTHING_ASKED = { hits: [], total: 0 };

  let search = liveQuery((j) => {
    const typed = debouncedQuery;
    const limit = PAGE * pages;
    if (!typed && !hasStructuredCriteria) return Promise.resolve(NOTHING_ASKED);
    const tagIds = tagIdsMatching(typed, vocabulary.tags);
    return Promise.all([
      j.entries.searchEntries(typed, tagIds, filters, limit),
      j.entries.countSearchMatches(typed, tagIds, filters)
    ]).then(([hits, total]) => ({ hits, total }));
  });
  /* Everything the journal holds that is not an entry, in one scan across
     the registry (textSearch.ts). Reads the debounced query, the range and
     the page count before its first await, the same as the entry read
     above, so a run lands once per pause rather than once a key.

     `today` because a sealed letter is not searchable and the seal is a
     comparison against today, which no read below the journal seam makes
     for itself (ADR-0001). */
  const NOTHING_ELSEWHERE = { hits: [], total: 0 };
  let elsewhere = liveQuery((j) => {
    const typed = debouncedQuery;
    const limit = PAGE * hitPages;
    const startEpochDay = filters.startEpochDay ?? null;
    const endEpochDay = filters.endEpochDay ?? null;
    if (!typed) return Promise.resolve(NOTHING_ELSEWHERE);
    return j.textSearch.search({ query: typed, today: todayEpochDay(), startEpochDay, endEpochDay, limit });
  });

  let results = $derived(search.value ?? NOTHING_ASKED);
  let hits = $derived(results.hits);
  let total = $derived(results.total);
  let groups = $derived(entryDayGroups(hits));

  /* Batched over every entry the page currently shows, the one read
     marginNotes.ts's own reasoning asks for rather than one per row (phase
     8 features ticket 07). Reads `hits` before its first await, the same
     reactivity contract every liveQuery here follows, so paging in more
     results re-runs it. */
  let entryIds = $derived(hits.map((entry) => entry.id));
  let marginNotesRead = liveQuery((j) => j.marginNotes.forEntries(entryIds));
  let marginNotesByEntry = $derived(marginNotesRead.value ?? new Map());

  /* What is left, and therefore whether there is anything to ask for. Read
     off the count rather than off "the page came back full", which cannot
     tell a last page that happens to be exactly thirty from a full one. */
  let remaining = $derived(Math.max(0, total - hits.length));

  let elsewhereResults = $derived(elsewhere.value ?? NOTHING_ELSEWHERE);
  /* One list, newest first across every area, each row saying what kind of
     thing it is. Not a section per area: eighteen areas can answer a query
     and a heading over a card of one row is framework rather than structure
     (searchHitRows.ts carries the reasoning, and DayRecords.svelte made the
     same call about a day's sixteen). */
  let hitRows = $derived(searchHitRows(elsewhereResults.hits, debouncedQuery));
  let hitsRemaining = $derived(Math.max(0, elsewhereResults.total - elsewhereResults.hits.length));

  /* One count over both reads. Stating the entries' total alone while five
     letters sat underneath it would be the screen describing half of what it
     found. */
  let foundTotal = $derived(total + elsewhereResults.total);
  let loading = $derived(search.loading || elsewhere.loading);
  let foundNothing = $derived(hits.length === 0 && hitRows.length === 0);

  /* One area of colour on this screen, and it is the days. Role 0, the only
     index guaranteed to be a colour on all 8 palettes, since a screen with a
     single coloured area has no reading order to follow. */
  let role = $derived(roleAt(activeFlag.roles, 0));
  /* Two areas now, so two roles in reading order (the day screen's rule):
     role 0 stays with the entries, role 1 takes everything else that was
     found. */
  let hitsRole = $derived(roleAt(activeFlag.roles, 1));

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
      <a class="icon-btn" href="/search/questions" aria-label={m.saved_questions_open()}>
        <Icon name="bookmark" />
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

  {#if hasCriteria}
    <!-- Offered once a query has actually run, never for a blank box - a
         question nobody has asked yet is not worth naming (the ticket's
         own line). -->
    <button class="btn btn-soft" data-search-save onclick={() => (savingOpen = true)}>
      <Icon name="bookmark" size={20} /><span>{m.saved_question_save()}</span>
    </button>
  {/if}

  {#if hits.length > 0}
    <!-- A draw from the question currently being asked, not a mode of its
         own (spec.md's own line) - absent with nothing asked, which
         `hits.length` already says without a second `hasCriteria` check. -->
    <button class="btn btn-soft search-random" data-search-random onclick={drawRandom}>
      <Icon name="shuffle" size={20} /><span>{m.random_draw_label()}</span>
    </button>
  {/if}

  <div aria-live="polite">
    {#if !hasCriteria}
      <!-- Nothing typed yet, so the screen says what it can find rather than
           drawing an empty result area. -->
      <Notice icon="search" key="search-idle" text={m.search_try()} />
      <p class="search-hint">{m.search_hint()}</p>
    {:else if loading}
      <Skeleton variant="card" count={3} />
    {:else if !foundNothing}
      <p class="search-count" data-search-count>{m.results_count({ count: foundTotal })}</p>

      {#if hits.length}
        <!-- The heading appears only when something else was found too. Over
             a screen of nothing but day cards it would be a name for the
             only thing there is, which is the framework DayRecords.svelte
             refuses for the same reason. -->
        {#if hitRows.length}
          <SectionHeading text={m.search_entries_heading()} />
        {/if}
        <EntryDays {groups} {role} {marginNotesByEntry} />
        {#if remaining > 0}
          <button class="btn btn-soft search-more" data-search-more onclick={() => (pages += 1)}>
            <span>{m.list_more({ count: Math.min(PAGE, remaining) })}</span>
          </button>
        {/if}
      {/if}

      {#if hitRows.length}
        <SectionHeading text={m.search_elsewhere_heading()} />
        <ListCard role={hitsRole}>
          {#each hitRows as row (row.key)}
            <ListRow
              key={row.key}
              icon={row.icon}
              title={row.excerpt}
              subtitle={row.label}
              href={row.href}
              data-search-hit={row.area}
            >
              {#snippet trailing()}
                {#if row.date}<span class="search-hit-date">{row.date}</span>{/if}
              {/snippet}
            </ListRow>
          {/each}
        </ListCard>
      {/if}
      {#if hitsRemaining > 0}
        <button class="btn btn-soft search-more" data-search-hits-more onclick={() => (hitPages += 1)}>
          <span>{m.list_more({ count: Math.min(PAGE, hitsRemaining) })}</span>
        </button>
      {/if}
    {:else}
      <Notice
        icon="search"
        key="search-none"
        title={m.no_results()}
        text={debouncedQuery ? m.no_results_body({ query: debouncedQuery }) : m.search_no_results_filtered()}
      />
    {/if}
  </div>

  <Sheet bind:open={filtersOpen} title={m.search_filters()}>
    <SectionHeading text={m.search_filters()} />

    <!-- The count the screen behind the sheet is showing, repeated here
         because the sheet covers it. Filtering against a number you cannot
         see is guessing, and this is the screen's own wording rather than a
         new line of copy. -->
    {#if hasCriteria && !loading}
      <p class="search-count" data-filter-count>{m.results_count({ count: foundTotal })}</p>
    {/if}

    <!-- Said here rather than left to be inferred: these four are entry
         fields, so a letter or a consult question ignores them. -->
    <p class="search-hint">{m.search_filters_entries_only()}</p>

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

  <Sheet bind:open={savingOpen} title={m.saved_question_save_sheet()} onClose={() => (savingName = '')}>
    <h3>{m.saved_question_save_sheet()}</h3>
    <Field label={m.saved_question_name_label()} id="saved-question-name">
      {#snippet children(id)}
        <input
          class="input"
          {id}
          name="saved-question-name"
          placeholder={m.saved_question_name_placeholder()}
          bind:value={savingName}
        />
      {/snippet}
    </Field>
    <p class="search-hint">{m.saved_question_save_hint()}</p>
    <div class="stack-3">
      <button
        class="btn btn-primary"
        data-saved-question-save-confirm
        disabled={!savingName.trim()}
        onclick={saveQuestion}
      >
        <span>{m.saved_question_save_confirm()}</span>
      </button>
    </div>
  </Sheet>
</div>
