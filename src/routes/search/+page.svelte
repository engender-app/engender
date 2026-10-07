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
     they picked.

     **Ticket 18: one front door, and something before a keystroke.** The
     starred shelf and the saved-questions list were their own routes,
     `/search/starred` and `/search/questions`, each reachable from its own
     icon in this screen's own header - two doors to shelves this screen
     already had the read for. Starred is a filter now (`EntrySearchFilters`
     already carried it, "reached from search"), so it is a toggle in the
     sheet below rather than a screen elsewhere, and the starred photo grid
     that page also drew moves in beside it, shown whenever the toggle is on.
     The two old routes redirect here with the filter already applied
     (`?starred=1`, `?questions=1`) so a bookmark still lands somewhere real.

     Saved questions keep their own run (`/search/questions/[id]`, unmoved -
     rename and delete live there, on the one question being looked at) but
     lose their list screen: a chip row on this screen's opening state links
     straight to a run instead, the same discovery a person reaching for
     "what did I search before" actually wants.

     And that opening state is the other half: before this ticket, an empty
     box and two sentences was what a 268-entry journal offered before a
     single character. The tag registry and this device's own recent
     searches were already there to offer instead - `searchQuery.ts`'s tag
     matching and `journal.stats.tagShare` for what "most-used" means, and
     `recentSearches.ts` for what "recent" means, since a search's own
     history is a device's memory of its own typing, not the journal's. */
  import { m } from '$lib/paraglide/messages';
  import { writer } from '$lib/stores/attempt.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { EMPTY_SEARCH, holdSearch, takeHandedQuery, takeHeldSearch, type SearchSnapshot } from '$lib/navigation/searchReturn';
  import { page } from '$app/state';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { dateInputValueFromEpochDay, dayRangeEndMin, dayRangeStartMax, epochDayFromDateInputValue, FIRST_EPOCH_DAY, todayEpochDay } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import type { EntrySearchFilters } from '$lib/data/journal/entries';
  import { entryDayGroups } from '$lib/data/recentEntries';
  import { drawRandomEntry } from '$lib/data/randomDraw';
  import { listRecentSearches, recordRecentSearch } from '$lib/data/recentSearches';
  import { answerTotal, savedQuestionInputOf, starredPhotosAsked } from '$lib/data/savedQuestionQuery';
  import { tagIdsMatching } from '$lib/data/searchQuery';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import TagPicker from '$lib/components/TagPicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import SearchActions from '$lib/components/SearchActions.svelte';
  import StarredPhotoGrid from '$lib/components/StarredPhotoGrid.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import EntryDays from '$lib/components/EntryDays.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { searchHitRows } from '$lib/components/searchHitRows';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { whileStaying } from '$lib/motion/whileStaying';
  import { fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';

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
  /* On by default when the address itself asks for it - ticket 18's
     `/search/starred` redirect stub, so a stale bookmark still lands on
     the shelf it pointed at rather than on a bare, unfiltered screen. */
  let starredOnly = $state(page.url.searchParams.has('starred'));
  /* What the address asks for, which is also what a stale held search
     falls back to: `?starred=1` above, and `?q=` from the Transition door's
     "finish this search" row, which linked here with the query and landed
     on an empty box (ticket 16). */
  /* More's search hands its query over in memory rather than in the
     address, so what was typed stays out of the browser's history
     (after-release ticket 10). `?q=` still works for an address typed or
     bookmarked by hand. */
  const handedQuery = takeHandedQuery();
  const asked = (): SearchSnapshot => ({
    ...EMPTY_SEARCH,
    query: handedQuery ?? page.url.searchParams.get('q') ?? '',
    starredOnly: page.url.searchParams.has('starred')
  });
  /* Saving a question keeps the query and every filter that is on, never
     today's results (ticket 06's own acceptance criterion: a saved
     question is read the same way an ad hoc search is, not frozen). */
  let savingOpen = $state(false);
  let savingName = $state('');

  const questionWrite = writer();
  async function saveQuestion() {
    const name = savingName.trim();
    if (!name) return;
    const input = savedQuestionInputOf(name, query.trim(), filters);
    if (!(await questionWrite.run(() => journal.savedQuestions.upsertSavedQuestion(input), m.write_failed()))) return;
    savingOpen = false;
    savingName = '';
    toast(m.saved(), { kind: 'record-saved' });
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
    starredOnly = false;
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
    if (starredOnly) out.starred = true;
    return out;
  });
  let hasStructuredCriteria = $derived(
    selectedTagIds.length > 0 ||
      selectedMoods.length > 0 ||
      !!startDate ||
      !!endDate ||
      hasNote ||
      hasPhoto ||
      starredOnly
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
      recordRecentSearch(typed);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  /* Back from an entry opened out of these results: the same search, with
     the same filters (searchReturn.ts). Arriving any other way, the held
     snapshot was stale and the search starts empty. */
  const current = (): SearchSnapshot => ({
    query, selectedTagIds, selectedMoods, startDate, endDate, hasNote, hasPhoto, starredOnly
  });
  const restore = (s: SearchSnapshot) => {
    ({ query, selectedTagIds, selectedMoods, startDate, endDate, hasNote, hasPhoto, starredOnly } = s);
    debouncedQuery = s.query.trim();
  };
  const held = takeHeldSearch();
  restore(held ?? asked());
  beforeNavigate(({ to }) => {
    if (to?.url.pathname.startsWith('/entry/')) holdSearch(current());
  });
  afterNavigate(({ from }) => {
    if (held && !from?.url.pathname.startsWith('/entry/')) restore(asked());
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
  const NOTHING_ASKED = { key: '', hits: [], total: 0 };

  /* Each answer carries the question it answers (ticket 16). A read keeps
     its last value while the next run is out, so between a pause in the
     typing and the answer the screen still holds the previous answer - or,
     for the first question after an empty box, nothing at all - and drawing
     "nothing found" off that painted a notice for one or two frames on
     every first search, then cut it for the rows. `settled` below is the
     two keys agreeing with what is being asked. */
  const entriesKeyOf = (typed: string, f: EntrySearchFilters) => JSON.stringify([typed, f]);
  const elsewhereKeyOf = (typed: string, start: number | null, end: number | null) => JSON.stringify([typed, start, end]);

  let search = liveQuery((j) => {
    const typed = debouncedQuery;
    const limit = PAGE * pages;
    const key = entriesKeyOf(typed, filters);
    if (!typed && !hasStructuredCriteria) return Promise.resolve({ ...NOTHING_ASKED, key });
    const tagIds = tagIdsMatching(typed, vocabulary.tags);
    return Promise.all([
      j.entries.searchEntries(typed, tagIds, filters, limit),
      j.entries.countSearchMatches(typed, tagIds, filters)
    ]).then(([hits, total]) => ({ key, hits, total }));
  });
  /* Everything the journal holds that is not an entry, in one scan across
     the registry (textSearch.ts). Reads the debounced query, the range and
     the page count before its first await, the same as the entry read
     above, so a run lands once per pause rather than once a key.

     `today` because a sealed letter is not searchable and the seal is a
     comparison against today, which no read below the journal seam makes
     for itself (ADR-0001). */
  const NOTHING_ELSEWHERE = { key: '', hits: [], total: 0 };
  let elsewhere = liveQuery((j) => {
    const typed = debouncedQuery;
    const limit = PAGE * hitPages;
    const startEpochDay = filters.startEpochDay ?? null;
    const endEpochDay = filters.endEpochDay ?? null;
    const key = elsewhereKeyOf(typed, startEpochDay, endEpochDay);
    if (!typed) return Promise.resolve({ ...NOTHING_ELSEWHERE, key });
    return j.textSearch
      .search({ query: typed, today: currentDay(), startEpochDay, endEpochDay, limit })
      .then((answer) => ({ ...answer, key }));
  });

  /* The answer on screen: both reads' values, taken together once they
     agree on the question (`settled`, below). The two reads land a frame or
     more apart, and drawing each as it landed showed a records-only answer
     for a frame, then opened the entries above it - half an answer moving
     under the other half (ticket 16). A later page of the same question
     keeps the keys, so "show more" still lands at once. */
  let shown = $state<{ entries: NonNullable<typeof search.value>; elsewhere: NonNullable<typeof elsewhere.value> }>({
    entries: NOTHING_ASKED,
    elsewhere: NOTHING_ELSEWHERE
  });
  let results = $derived(shown.entries);
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

  let elsewhereResults = $derived(shown.elsewhere);
  /* One list, newest first across every area, each row saying what kind of
     thing it is. Not a section per area: eighteen areas can answer a query
     and a heading over a card of one row is framework rather than structure
     (searchHitRows.ts carries the reasoning, and DayRecords.svelte made the
     same call about a day's sixteen). */
  let hitRows = $derived(searchHitRows(elsewhereResults.hits, debouncedQuery));
  let hitsRemaining = $derived(Math.max(0, elsewhereResults.total - elsewhereResults.hits.length));

  /* The starred shelf's photo half (ticket 18: `/search/starred` folded
     in). Gated on the toggle rather than always read - a search screen
     nobody asked the starred question of has no business paying for this
     query every render. Unbounded, the same as the old shelf's own read:
     self-limiting by how much a person actually stars, not by how large
     the journal is (ADR-0004's concern is a per-render bound, not a floor
     under every read). */
  let starredPhotosQuery = liveList((j) => starredPhotosAsked(j.photoLibrary, { starred: starredOnly }));
  let starredPhotos = $derived(starredPhotosQuery.rows);

  /* One count over both reads, and the starred photo grid when that filter
     is on - stating the entries' total alone while five letters or a row of
     photos sat underneath it would be the screen describing part of what it
     found. */
  let foundTotal = $derived(answerTotal(total, elsewhereResults.total, starredOnly ? starredPhotos.length : 0));
  let loading = $derived(search.loading || elsewhere.loading);
  let foundNothing = $derived(
    hits.length === 0 && hitRows.length === 0 && (!starredOnly || starredPhotos.length === 0)
  );
  let settled = $derived(
    search.value?.key === entriesKeyOf(debouncedQuery, filters) &&
      elsewhere.value?.key === elsewhereKeyOf(debouncedQuery, filters.startEpochDay ?? null, filters.endEpochDay ?? null) &&
      (!starredOnly || !starredPhotosQuery.loading)
  );
  /* Whether this question has had an answer drawn yet. The opening state
     stays up until it has, so the box empties into results rather than into
     a gap or a notice; after that, a refined question keeps the rows it has
     until the next answer replaces them row by row. */
  let answered = $state(false);
  $effect.pre(() => {
    if (settled && search.value && elsewhere.value) shown = { entries: search.value, elsewhere: elsewhere.value };
    if (!hasCriteria) answered = false;
    else if (settled) answered = true;
  });
  /* Nothing to save when nothing matched (ticket 16, audit U7). */
  let canSave = $derived(answered && settled && !foundNothing);
  /* Headings name a list only where there is one above it to tell it
     apart from, the Transition door's call for the same two lists: the
     entries lead, so they are named only under starred photos, and the
     records from elsewhere only under entries or photos. A heading over the
     first list pushed the first result below the first third of a phone. */
  let photosShown = $derived(starredOnly && starredPhotos.length > 0);
  /* What arrives where something else is leaving by `crossfade`: it fades
     up in flow while the leaver fades off out of flow. And what comes back
     before its own leave finished - typing then clearing inside one fade -
     is the same node resumed, still wearing the positioning crossfade wrote
     on it (absolute, behind the screen, no pointer events), which left the
     opening state's rows untappable under the screen. So the arrival takes
     those writes off first. */
  const fadeUp = (node: Element) => {
    const el = node as HTMLElement;
    for (const property of ['position', 'width', 'z-index', 'pointer-events']) el.style.removeProperty(property);
    delete el.dataset.leaving;
    return isReducedMotion() ? { duration: 0 } : fadeOnly(motionDuration('--dur-fast'));
  };

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
    if (starredOnly) chips.push({ key: 'starred', label: m.search_filter_starred(), remove: () => (starredOnly = false) });
    return chips;
  });
  let todayInput = $derived(dateInputValueFromEpochDay(currentDay()));

  /* What the opening state offers before a character is typed (ticket 18):
     the eight most-used tags, the saved questions that exist, and this
     device's own last five searches. All three are read regardless of
     `hasCriteria` - cheap, bounded reads a person is about to want the
     moment they clear the field again. */
  const POPULAR_TAG_COUNT = 8;
  let tagShareQuery = liveList((j) => j.stats.tagShare(FIRST_EPOCH_DAY, currentDay()));
  let popularTags = $derived(
    tagShareQuery.rows
      .map((t) => vocabulary.tag(t.id))
      .filter((t) => t != null)
      .slice(0, POPULAR_TAG_COUNT)
  );

  let savedQuestionsQuery = liveList((j) => j.savedQuestions.getSavedQuestions());
  let savedQuestions = $derived(savedQuestionsQuery.rows);

  let recentSearchList = $state<string[]>(listRecentSearches());
  /* Read again when the opening state comes back rather than the moment a
     search is recorded: the opening state is still up then, waiting on the
     answer, and the new row grew it 96px in one frame (ticket 16). */
  $effect.pre(() => {
    if (!hasCriteria) recentSearchList = listRecentSearches();
  });

  function runRecentSearch(term: string) {
    query = term;
    debouncedQuery = term;
  }
</script>

<div class="screen" data-screen>
  <!-- The actions snippet is always passed, so the header's layout never
       changes as its buttons come and go (SearchActions.svelte). -->
  <ScreenHeader title={m.search()} screen="search" back="/calendar">
    {#snippet actions()}
      <SearchActions
        save={canSave ? () => (savingOpen = true) : undefined}
        draw={answered && hits.length > 0 ? drawRandom : undefined}
      />
    {/snippet}
  </ScreenHeader>

  <div class="search-controls">
    <div class="search-box">
      <Icon name="search" size={20} />
      <input
        class="search-input"
        id="q"
        name="q"
        type="search"
        placeholder={m.search_placeholder()}
        aria-label={m.search()}
        autocomplete="off"
        bind:value={query}
      />
    </div>

    <button
      class="btn btn-soft"
      data-filter-toggle
      aria-haspopup="dialog"
      aria-expanded={filtersOpen}
      onclick={() => (filtersOpen = true)}
    >
      <!-- A word and, only once there is one, a count. With an icon and
           "(0)" this button was 152px and left the field 118px to type in
           (audit UX-11); the chips under the row already show which
           filters are on. -->
      <span>{activeFilterChips.length ? m.search_filters_count({ count: activeFilterChips.length }) : m.search_filters()}</span>
    </button>
  </div>

  {#if activeFilterChips.length}
    <!-- The one thing that has to stay on the screen once the filters left
         it: with the panel in a sheet, these chips are the only place the
         state of the query is visible. -->
    <div class="search-chips" transition:disclose={whileStaying}>
      {#each activeFilterChips as chip (chip.key)}
        <button class="tag-chip is-selected press" data-active-filter-chip onclick={chip.remove}>
          <Icon name="x" size={14} />
          {chip.label}
        </button>
      {/each}
      <button class="tag-chip press" data-filter-clear onclick={clearAllFilters}>{m.search_filters_clear_all()}</button>
    </div>
  {/if}

  <!-- What a screen reader is told when an answer lands: the count, or
       that nothing matched, once per answer. The whole answer area used to
       be the live region, so every keystroke's pause read out the whole
       list of results. In the document while empty, because a live region
       has to exist before its content changes to be announced. -->
  <p class="visually-hidden" role="status" data-search-status>
    {hasCriteria && answered && settled ? (foundNothing ? m.no_results() : m.results_count({ count: foundTotal })) : ''}
  </p>

  <!-- One block at a time, each swapping for the next in place by one
       crossfade: the opening state, the first read's skeleton, nothing
       found, or the results. A crossfade rather than a height travel,
       because the results run past the bottom of the phone and opening
       their height swept the whole visible screen in three frames; nothing
       sits under this area to be pushed. The opening state stays until the
       first answer, so the box empties into results rather than into a gap
       or a notice. `data-search-idle` names the whole opening state - what
       the walkthrough waits to see gone once typing starts, and back once
       the field clears. -->
  <div class="search-answer">
    {#if !hasCriteria || (!answered && !loading)}
      <div data-search-idle in:fadeUp out:crossfade>
        <!-- One plain line about what is searched. What each filter covers
             is said once, in the Filters sheet, where the filters are
             (ticket 16). -->
        <p class="search-hint">{m.search_hint()}</p>

        {#if savedQuestions.length}
          <p class="search-filter-label">{m.saved_questions_title()}</p>
          <div class="tag-row" role="group" aria-label={m.saved_questions_title()}>
            {#each savedQuestions as question (question.id)}
              <a class="tag-chip press" data-saved-question-chip={question.id} href="/search/questions/{question.id}">
                <Icon name="bookmark" size={14} />{question.name}
              </a>
            {/each}
          </div>
        {/if}

        {#if popularTags.length}
          <p class="search-filter-label">{m.search_filter_tags_label()}</p>
          <div class="tag-row" role="group" aria-label={m.search_filter_tags_label()}>
            {#each popularTags as tag (tag.id)}
              <button class="tag-chip press" data-idle-tag-chip={tag.id} onclick={() => toggleTag(tag.id)}>
                {tag.label}
              </button>
            {/each}
          </div>
        {/if}

        {#if recentSearchList.length}
          <p class="search-filter-label">{m.search_recent_label()}</p>
          <ListCard {role}>
            {#each recentSearchList as term (term)}
              <ListRow key={term} icon="search" title={term} data-recent-search-row onclick={() => runRecentSearch(term)} />
            {/each}
          </ListCard>
        {/if}
      </div>
    {:else if !answered}
      <!-- Only on a first read of the journal (a search held over from an
           entry, or an address that asks one): every later question keeps
           the previous answer up until its own lands. -->
      <div out:crossfade><Skeleton variant="card" count={3} /></div>
    {:else if foundNothing}
      <div class="search-nothing" in:fadeUp out:crossfade>
        <Notice
          icon="search"
          key="search-none"
          title={m.no_results()}
          text={debouncedQuery ? m.no_results_body({ query: debouncedQuery }) : m.search_no_results_filtered()}
        />
      </div>
    {:else}
      <!-- Inside the results, each list opens and gives back its own height
           as a refined question adds or drops one. -->
      <div in:fadeUp out:crossfade>
        {#if starredOnly && starredPhotos.length}
          <!-- Ported from the old /search/starred (ticket 18): the same grid,
               the same unstar affordance, shown now under this screen's own
               Starred toggle instead of behind a second door. -->
          <div transition:disclose={whileStaying}>
            {#if hits.length || hitRows.length}<SectionHeading text={m.starred_shelf_photos_label()} />{/if}
            <StarredPhotoGrid photos={starredPhotos} />
          </div>
        {/if}

        {#if hits.length}
          <div transition:disclose={whileStaying}>
            {#if photosShown}
              <div transition:disclose={whileStaying}><SectionHeading text={m.search_entries_heading()} /></div>
            {/if}
            <EntryDays {groups} {role} {marginNotesByEntry} />
            {#if remaining > 0}
              <button class="btn btn-soft search-more" data-search-more transition:disclose={whileStaying} onclick={() => (pages += 1)}>
                <span>{m.list_more({ count: Math.min(PAGE, remaining) })}</span>
              </button>
            {/if}
          </div>
        {/if}

        {#if hitRows.length}
          <div transition:disclose={whileStaying}>
            {#if hits.length || photosShown}
              <div transition:disclose={whileStaying}><SectionHeading text={m.search_elsewhere_heading()} /></div>
            {/if}
            <ListCard role={hitsRole}>
              {#each hitRows as row (row.key)}
                <!-- Each row opens and gives back its own height as the
                     answer changes under the typing (the Transition door's
                     rows, rule 10). -->
                <div class="rows-divide" transition:disclose={whileStaying}>
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
                </div>
              {/each}
            </ListCard>
            {#if hitsRemaining > 0}
              <button class="btn btn-soft search-more" data-search-hits-more transition:disclose={whileStaying} onclick={() => (hitPages += 1)}>
                <span>{m.list_more({ count: Math.min(PAGE, hitsRemaining) })}</span>
              </button>
            {/if}
          </div>
        {/if}

        <!-- One count, the total, in the same words as a saved question's
             (ticket 16: "Entries: 27" here and "35 results ... Entries 21
             results" there). Under the results rather than over them: a
             line of its own above the first day put the first entry at
             y 316 of 844, past the first third, where the results are
             meant to start. The screen reader hears it first anyway, from
             the status line above. -->
        <p class="search-count" data-search-count>
          {#key foundTotal}<span in:fadeUp out:crossfade>{m.results_count({ count: foundTotal })}</span>{/key}
        </p>
      </div>
    {/if}
  </div>

  <Sheet bind:open={filtersOpen} title={m.search_filters()}>
    <SectionHeading text={m.search_filters()} />

    <!-- The count the screen behind the sheet is showing, repeated here
         because the sheet covers it. Filtering against a number you cannot
         see is guessing, and this is the screen's own wording rather than a
         new line of copy. -->
    {#if hasCriteria && settled}
      <p class="search-count" data-filter-count>{m.results_count({ count: foundTotal })}</p>
    {/if}

    <!-- What the filters cover, said here and only here (ticket 16): these
         are entry fields, so a letter or a consult question ignores them,
         and the dates are the one filter that reaches further. -->
    <p class="search-hint" data-search-scope>{m.search_filters_entries_only()}</p>

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
    <p class="search-hint">{m.search_filters_date_scope()}</p>

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
      <!-- The starred shelf's one door now (ticket 18): `/search/starred`
           redirects here with this already on. Entry-only like the three
           beside it - a starred photo is the photo library's own read
           (photoLibrary.starred, below), not this filter's. -->
      <button
        class="tag-chip press"
        class:is-selected={starredOnly}
        aria-pressed={starredOnly}
        data-filter-starred
        onclick={() => (starredOnly = !starredOnly)}
      >
        {m.search_filter_starred()}
      </button>
    </div>
  </Sheet>

  <Sheet busy={questionWrite.busy} bind:open={savingOpen} title={m.saved_question_save_sheet()} onClose={() => (savingName = '')}>
    <h3>{m.saved_question_save_sheet()}</h3>
    <Field label={m.saved_question_name_label()} id="saved-question-name">
      {#snippet children(id)}
        <input
          class="input"
          {id}
          name="saved-question-name"
          placeholder={m.saved_question_name_placeholder()}
          readonly={questionWrite.busy} bind:value={savingName}
        />
      {/snippet}
    </Field>
    <p class="search-hint">{m.saved_question_save_hint()}</p>
    <div class="stack-3">
      <button
        class="btn btn-primary"
        data-saved-question-save-confirm
        disabled={!savingName.trim() || questionWrite.busy}
        onclick={saveQuestion}
      >
        <span>{m.saved_question_save_confirm()}</span>
      </button>
    </div>
  </Sheet>
</div>

<style>
  /* Search's own hint lines; the screen is their one reader, so they live
     here rather than in screens.css (check-screens-classes). */
  .search-hint {
    font-size: var(--text-sm);
    color: var(--text-2);
    margin: var(--space-3) 0 0;
  }

  /* The notice arrives by its own `collapse`, which pulls it up by its
     height and lets it travel down. Here that margin collapsed through every
     block above it, so the whole answer area, the outgoing results too,
     jumped 97px up in one frame and slid back. A formatting context of its
     own keeps the travel inside this box, clipped to its edge. */
  .search-nothing {
    display: flow-root;
    overflow: clip;
  }
  /* 8 under the controls rather than the screen's 24, and a tight day card
     (EntryDays), so the first entry row starts inside the first third of a
     390x844 phone (ticket 16): 316 with a count line over the results,
     289 without one, 277 with both. */
  .search-controls {
    margin-bottom: var(--space-2);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .search-controls .search-box {
    flex: 1 1 8rem;
    min-width: 0;
  }
  .search-controls [data-filter-toggle] {
    flex: 0 0 auto;
  }
</style>
