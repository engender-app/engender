<script lang="ts">
  /* One saved question, answered as a run (phase 8 features ticket 06,
     CONTEXT: "Saved question").

     Three reads, the same three `/search` makes and with the same shape - the
     acceptance criterion is that a saved question's results equal the
     equivalent ad hoc search's results, and the only way that is true by
     construction rather than by careful copying is to call the same
     functions with filters read straight off the saved row
     (entrySearchFiltersOf, savedQuestionQuery.ts). The third is the starred
     photos a Starred question also answers with, read and counted through
     the same helpers /search uses. No filter sheet here:
     what narrows the read is what the question was saved with, not
     something this screen offers to change.

     The one real difference from `/search` is `clampNotes` on `EntryDays` -
     a run is meant to be read rather than scanned, so the note prints in
     full instead of clamping to two lines. Everything else - paging, the
     elsewhere list, the section headings - is the same reading, drawn the
     same way, because both renderings exist on the same data and only the
     entries' own density is the open question the ticket names. */
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { entryDayGroups } from '$lib/data/recentEntries';
  import { drawRandomEntry } from '$lib/data/randomDraw';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { disclose } from '$lib/motion/reveal';
  import { whileStaying } from '$lib/motion/whileStaying';
  import { answerTotal, entrySearchFiltersOf, starredPhotosAsked } from '$lib/data/savedQuestionQuery';
  import { tagIdsMatching } from '$lib/data/searchQuery';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import Icon from '$lib/components/Icon.svelte';
  import SearchActions from '$lib/components/SearchActions.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import EntryDays from '$lib/components/EntryDays.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import StarredPhotoGrid from '$lib/components/StarredPhotoGrid.svelte';
  import { searchHitRows } from '$lib/components/searchHitRows';

  const PAGE = 30;

  let id = $derived(page.params.id);
  let questionsQuery = liveList((j) => j.savedQuestions.getSavedQuestions());
  let questions = $derived(questionsQuery.rows);
  let question = $derived(questions.find((q) => q.id === id));

  let criteriaOpen = $state(false);
  let pages = $state(1);
  let hitPages = $state(1);
  $effect(() => {
    id;
    criteriaOpen = false;
    pages = 1;
    hitPages = 1;
    drawnIds = new Set();
  });

  /* Random, scoped to this saved question rather than its own control
     (phase 8 features ticket 08, spec.md: "Random, scoped") - the same
     mechanism /search's own ad hoc run uses, over this screen's `hits`
     instead. */
  let drawnIds = $state<Set<number>>(new Set());
  function drawRandom() {
    const draw = drawRandomEntry(hits, drawnIds);
    if (!draw) return;
    drawnIds = draw.drawnIds;
    void goto(`/entry/${draw.entry.id}`);
  }

  /* `question` is `questions.find(...)` over a liveList's rows, which are
     rebuilt from scratch - every row a fresh object - on any write to the
     saved_question table (phase 8 audit ticket 15): renaming a *different*
     saved question changes no field this screen reads, but still hands
     `question` a new reference, and a closure reading it before its first
     await re-runs on that reference alone. `searchSignature` is a primitive
     (searchQuery.ts's own `criteria` idiom, from /search), so it is
     unchanged when nothing this screen actually asks with has changed; the
     effect below only republishes `stableSearch` - what the two closures
     read - when the signature actually moves, the same as /search waiting
     for the typist to stop before it reads `query`.

     The `lastSearchSignature` guard is load-bearing, not a redundant check
     `$derived`'s own memoization already does: this effect reads `question`
     itself to build `stableSearch`, and a dynamically-tracked dependency
     read during one run stays tracked into the next. Skip the guard and
     every run would read `question` unconditionally, which would keep it a
     tracked dependency forever and re-run this effect on every future
     unrelated rename - the probe's "ignores an unrelated rename" check is
     what would catch that regression. */
  let searchSignature = $derived(question ? JSON.stringify([question.queryText, entrySearchFiltersOf(question)]) : null);
  let stableSearch = $state<{ signature: string; queryText: string; filters: ReturnType<typeof entrySearchFiltersOf> } | null>(null);
  let lastSearchSignature: string | null = null;
  $effect(() => {
    const signature = searchSignature;
    if (signature === lastSearchSignature) return;
    lastSearchSignature = signature;
    stableSearch = question && signature ? { signature, queryText: question.queryText, filters: entrySearchFiltersOf(question) } : null;
  });

  const NOTHING_ASKED = { hits: [], total: 0 };
  let searchAttempt = $state<typeof stableSearch>(null);
  let search = liveQuery((j) => {
    const criteria = stableSearch;
    searchAttempt = criteria;
    if (!criteria) return Promise.resolve(null);
    const { queryText, filters } = criteria;
    const limit = PAGE * pages;
    const matchingTagIds = tagIdsMatching(queryText, vocabulary.tags);
    return Promise.all([
      j.entries.searchEntries(queryText, matchingTagIds, filters, limit),
      j.entries.countSearchMatches(queryText, matchingTagIds, filters)
    ]).then(([hits, total]) => ({ criteria, hits, total }));
  });

  const NOTHING_ELSEWHERE = { hits: [], total: 0 };
  let elsewhereAttempt = $state<typeof stableSearch>(null);
  let elsewhere = liveQuery((j) => {
    const criteria = stableSearch;
    elsewhereAttempt = criteria;
    if (!criteria) return Promise.resolve(null);
    const typed = criteria.queryText.trim();
    if (!typed) return Promise.resolve({ criteria, ...NOTHING_ELSEWHERE });
    const limit = PAGE * hitPages;
    return j.textSearch.search({
      query: typed,
      today: todayEpochDay(),
      startEpochDay: criteria.filters.startEpochDay ?? null,
      endEpochDay: criteria.filters.endEpochDay ?? null,
      limit
    }).then((result) => ({ criteria, ...result }));
  });

  let results = $derived.by(() => {
    const value = search.value;
    return value?.criteria === stableSearch ? value : NOTHING_ASKED;
  });
  let hits = $derived(results.hits);
  let total = $derived(results.total);
  let groups = $derived(entryDayGroups(hits));
  let remaining = $derived(Math.max(0, total - hits.length));

  /* Batched over every entry the run currently shows (phase 8 features
     ticket 07, marginNotes.ts's own reasoning) - the same read /search
     makes for its own entries section. Reads `hits` before its first
     await, so paging in more of the run re-runs it. */
  let entryIds = $derived(hits.map((entry) => entry.id));
  let marginNotesRead = liveQuery((j) => j.marginNotes.forEntries(entryIds));
  let marginNotesByEntry = $derived(marginNotesRead.value ?? new Map());

  let elsewhereResults = $derived.by(() => {
    const value = elsewhere.value;
    return value?.criteria === stableSearch ? value : NOTHING_ELSEWHERE;
  });
  let hitRows = $derived(searchHitRows(elsewhereResults.hits, stableSearch?.queryText.trim() ?? ''));
  let hitsRemaining = $derived(Math.max(0, elsewhereResults.total - elsewhereResults.hits.length));

  /* A Starred question also answers with every starred photo, the grid
     /search shows under the same filter, and counts them in its total. */
  let photosAttempt = $state<typeof stableSearch>(null);
  let photos = liveQuery((j) => {
    const criteria = stableSearch;
    photosAttempt = criteria;
    if (!criteria) return Promise.resolve(null);
    return starredPhotosAsked(j.photoLibrary, criteria.filters).then((rows) => ({ criteria, rows }));
  });
  let starredPhotos = $derived.by(() => {
    const value = photos.value;
    return value?.criteria === stableSearch ? value.rows : [];
  });
  let photosShown = $derived(starredPhotos.length > 0);

  let foundTotal = $derived(answerTotal(total, elsewhereResults.total, starredPhotos.length));
  let loading = $derived(search.loading || elsewhere.loading || photos.loading);
  let anyFailed = $derived(search.failed || elsewhere.failed || photos.failed);
  let foundNothing = $derived(hits.length === 0 && hitRows.length === 0 && !photosShown);
  /* Reads retain old values and failures during a new run. Wait for all
     three attempts to use this question's criteria before showing an answer. */
  let resultsReady = $derived(
    !!stableSearch && stableSearch.signature === searchSignature &&
    searchAttempt === stableSearch && elsewhereAttempt === stableSearch && photosAttempt === stableSearch &&
    (search.value?.criteria === stableSearch || (search.failed && !search.running)) &&
    (elsewhere.value?.criteria === stableSearch || (elsewhere.failed && !elsewhere.running)) &&
    (photos.value?.criteria === stableSearch || (photos.failed && !photos.running)) && !loading
  );
  let revealedCriteria = $state<typeof stableSearch>(null);
  $effect.pre(() => {
    if (resultsReady) revealedCriteria = stableSearch;
  });

  let role = $derived(roleAt(activeFlag.roles, 0));
  let hitsRole = $derived(roleAt(activeFlag.roles, 1));

  let renamingOpen = $state(false);
  let renamingName = $state('');
  function openRename() {
    if (!question) return;
    renamingName = question.name;
    renamingOpen = true;
  }
  async function confirmRename() {
    if (!question) return;
    const name = renamingName.trim();
    if (!name) return;
    await journal.savedQuestions.upsertSavedQuestion({ ...question, name });
    renamingOpen = false;
  }

  let deleteOpen = $state(false);
  async function confirmDelete() {
    if (!question) return;
    const deletedId = question.id;
    deleteOpen = false;
    await journal.savedQuestions.deleteSavedQuestion(deletedId);
    void goto('/search/questions');
  }
</script>

<div class="screen" data-screen>
  {#if question}
    <ScreenHeader title={question.name} back="/search/questions">
      {#snippet actions()}
        <!-- Random sits with the question's other actions rather than over
             its results, as on /search (ticket 16). -->
        <SearchActions draw={revealedCriteria === stableSearch && hits.length > 0 ? drawRandom : undefined} />
        <button class="icon-btn" aria-label={m.saved_question_rename_aria()} data-saved-question-rename onclick={openRename}>
          <Icon name="pencil" />
        </button>
        <button class="icon-btn" aria-label={m.saved_question_delete_aria()} data-saved-question-delete onclick={() => (deleteOpen = true)}>
          <Icon name="trash" />
        </button>
      {/snippet}
    </ScreenHeader>

    <button
      class="btn btn-soft"
      data-saved-question-criteria
      aria-expanded={criteriaOpen}
      aria-controls="saved-question-definition"
      onclick={() => (criteriaOpen = !criteriaOpen)}
    >
      <Icon name="tag" size={20} /><span>{m.saved_question_criteria()}</span>
    </button>
    {#if criteriaOpen}
      <div id="saved-question-definition" class="search-definition" data-saved-question-definition transition:disclose>
        <p>{question.queryText ? m.saved_question_query({ query: question.queryText }) : m.saved_question_no_query()}</p>
        <ul>
          {#each question.tagIds as tagId (tagId)}
            <li>{m.saved_question_tag({ tag: vocabulary.tag(tagId)?.label ?? m.saved_question_missing_tag() })}</li>
          {/each}
          {#each question.moods as mood (mood)}
            <li>{m.search_filter_mood_chip({ mood: moodName(mood) })}</li>
          {/each}
          {#if question.startEpochDay != null}
            <li>{m.search_filter_start_chip({ date: dateInputValueFromEpochDay(question.startEpochDay) })}</li>
          {/if}
          {#if question.endEpochDay != null}
            <li>{m.search_filter_end_chip({ date: dateInputValueFromEpochDay(question.endEpochDay) })}</li>
          {/if}
          {#if question.hasNote}<li>{m.search_filter_has_note()}</li>{/if}
          {#if question.hasPhoto}<li>{m.search_filter_has_photo()}</li>{/if}
          {#if question.starred}<li>{m.search_filter_starred()}</li>{/if}
        </ul>
      </div>
    {/if}

    <div aria-live="polite">
      {#key searchSignature}
      <ReadReserve ready={!!stableSearch && (resultsReady || revealedCriteria === stableSearch)} estimate={240}>
      {#if anyFailed}
        <Notice
          title={m.read_failed()}
          action={{ label: m.read_retry(), onclick: () => { search.retry(); elsewhere.retry(); photos.retry(); } }}
        />
      {/if}
      {#if !foundNothing}

        {#if photosShown}
          <!-- The same grid and the same headings as /search's: photos
               lead, named only when entries or other records follow. -->
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
            <EntryDays {groups} {role} clampNotes={false} {marginNotesByEntry} />
            {#if remaining > 0}
              <button class="btn btn-soft search-more" data-search-more onclick={() => (pages += 1)}>
                <span>{m.list_more({ count: Math.min(PAGE, remaining) })}</span>
              </button>
            {/if}
          </div>
        {/if}

        {#if hitRows.length}
          <div transition:disclose={whileStaying}>
            <!-- Named only under entries or photos, to be elsewhere from:
                 the call /search makes about the same lists (ticket 16). -->
            {#if hits.length || photosShown}<SectionHeading text={m.search_elsewhere_heading()} />{/if}
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
            {#if hitsRemaining > 0}
              <button class="btn btn-soft search-more" data-search-hits-more onclick={() => (hitPages += 1)}>
                <span>{m.list_more({ count: Math.min(PAGE, hitsRemaining) })}</span>
              </button>
            {/if}
          </div>
        {/if}

        <!-- One count, the total, in the same words and the same place as
             /search's: under the results (ticket 16). -->
        <p class="search-count" data-search-count>{m.results_count({ count: foundTotal })}</p>
      {:else if !anyFailed}
        <Notice icon="bookmark" key="saved-question-none" title={m.no_results()} text={m.saved_question_no_results()} />
      {/if}
      </ReadReserve>
      {/key}
    </div>

    <Sheet bind:open={renamingOpen} title={m.saved_question_edit_sheet()}>
      <h3>{m.saved_question_edit_sheet()}</h3>
      <Field label={m.saved_question_name_label()} id="saved-question-rename-name">
        {#snippet children(fieldId)}
          <input class="input" id={fieldId} name="saved-question-rename-name" bind:value={renamingName} />
        {/snippet}
      </Field>
      <div class="stack-3">
        <button
          class="btn btn-primary"
          data-saved-question-rename-confirm
          disabled={!renamingName.trim()}
          onclick={confirmRename}
        >
          <span>{m.saved_question_rename_confirm()}</span>
        </button>
      </div>
    </Sheet>

    <ConfirmDeleteSheet
      open={deleteOpen}
      title={m.saved_question_delete_sheet()}
      question={m.saved_question_delete_q({ name: question.name })}
      hint={m.saved_question_delete_hint()}
      confirmLabel={m.saved_question_delete()}
      cancelLabel={m.keep_it()}
      confirmAttrs={{ 'data-confirm-delete-saved-question': '' }}
      onConfirm={confirmDelete}
      onCancel={() => (deleteOpen = false)}
    />
  {:else if !questionsQuery.loading}
    <ScreenHeader title={m.saved_questions_title()} back="/search/questions" />
    <Notice icon="bookmark" key="saved-question-gone" title={m.saved_question_gone_title()} text={m.saved_question_gone_body()} action={{ label: m.search(), href: '/search' }} />
  {/if}
</div>

<style>
  .search-definition {
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
  }
  .search-definition ul {
    padding-inline-start: var(--space-5);
  }
</style>
