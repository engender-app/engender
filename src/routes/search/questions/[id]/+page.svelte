<script lang="ts">
  /* One saved question, answered as a run (phase 8 features ticket 06,
     CONTEXT: "Saved question").

     Two reads, the same two `/search` makes and with the same shape - the
     acceptance criterion is that a saved question's results equal the
     equivalent ad hoc search's results, and the only way that is true by
     construction rather than by careful copying is to call the same two
     functions with filters read straight off the saved row
     (entrySearchFiltersOf, savedQuestionQuery.ts). No filter sheet here:
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
  import { entrySearchFiltersOf } from '$lib/data/savedQuestionQuery';
  import { tagIdsMatching } from '$lib/data/searchQuery';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import EntryDays from '$lib/components/EntryDays.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { searchHitRows } from '$lib/components/searchHitRows';

  const PAGE = 30;

  let id = $derived(page.params.id);
  let questionsQuery = liveList((j) => j.savedQuestions.getSavedQuestions());
  let questions = $derived(questionsQuery.rows);
  let question = $derived(questions.find((q) => q.id === id));

  let pages = $state(1);
  let hitPages = $state(1);
  $effect(() => {
    id;
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

  const NOTHING_ASKED = { hits: [], total: 0 };
  let search = liveQuery((j) => {
    if (!question) return Promise.resolve(NOTHING_ASKED);
    const q = question;
    const limit = PAGE * pages;
    const matchingTagIds = tagIdsMatching(q.queryText, vocabulary.tags);
    const filters = entrySearchFiltersOf(q);
    return Promise.all([
      j.entries.searchEntries(q.queryText, matchingTagIds, filters, limit),
      j.entries.countSearchMatches(q.queryText, matchingTagIds, filters)
    ]).then(([hits, total]) => ({ hits, total }));
  });

  const NOTHING_ELSEWHERE = { hits: [], total: 0 };
  let elsewhere = liveQuery((j) => {
    const typed = question?.queryText.trim();
    if (!question || !typed) return Promise.resolve(NOTHING_ELSEWHERE);
    const limit = PAGE * hitPages;
    return j.textSearch.search({
      query: typed,
      today: todayEpochDay(),
      startEpochDay: question.startEpochDay,
      endEpochDay: question.endEpochDay,
      limit
    });
  });

  let results = $derived(search.value ?? NOTHING_ASKED);
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

  let elsewhereResults = $derived(elsewhere.value ?? NOTHING_ELSEWHERE);
  let hitRows = $derived(searchHitRows(elsewhereResults.hits, question?.queryText.trim() ?? ''));
  let hitsRemaining = $derived(Math.max(0, elsewhereResults.total - elsewhereResults.hits.length));

  let foundTotal = $derived(total + elsewhereResults.total);
  let loading = $derived(search.loading || elsewhere.loading);
  let foundNothing = $derived(hits.length === 0 && hitRows.length === 0);

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
        <button class="icon-btn" aria-label={m.saved_question_rename_aria()} data-saved-question-rename onclick={openRename}>
          <Icon name="pencil" />
        </button>
        <button class="icon-btn" aria-label={m.saved_question_delete_aria()} data-saved-question-delete onclick={() => (deleteOpen = true)}>
          <Icon name="trash" />
        </button>
      {/snippet}
    </ScreenHeader>

    <div aria-live="polite">
      {#if loading}
        <Skeleton variant="card" count={3} />
      {:else if !foundNothing}
        <p class="search-count" data-search-count>{m.results_count({ count: foundTotal })}</p>

        {#if hits.length}
          <!-- A draw from the question currently being asked, not a mode of
               its own (spec.md's own line) - the same control /search's own
               ad hoc run offers, over this saved question's `hits`. -->
          <button class="btn btn-soft search-random" data-search-random onclick={drawRandom}>
            <Icon name="shuffle" size={20} /><span>{m.random_draw_label()}</span>
          </button>
          {#if hitRows.length}
            <SectionHeading text={m.search_entries_heading()} />
          {/if}
          <EntryDays {groups} {role} clampNotes={false} {marginNotesByEntry} />
          {#if remaining > 0}
            <button class="btn btn-soft search-more" data-search-more onclick={() => (pages += 1)}>
              <span>{m.search_more({ count: Math.min(PAGE, remaining) })}</span>
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
            <span>{m.search_more({ count: Math.min(PAGE, hitsRemaining) })}</span>
          </button>
        {/if}
      {:else}
        <Notice icon="bookmark" key="saved-question-none" title={m.no_results()} text={m.saved_question_no_results()} />
      {/if}
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
      confirmLabel={m.saved_question_delete()}
      cancelLabel={m.keep_it()}
      confirmAttrs={{ 'data-confirm-delete-saved-question': '' }}
      onConfirm={confirmDelete}
      onCancel={() => (deleteOpen = false)}
    />
  {:else if !questionsQuery.loading}
    <ScreenHeader title={m.saved_questions_title()} back="/search/questions" />
    <Notice icon="bookmark" key="saved-question-gone" title={m.saved_question_gone_title()} text={m.saved_question_gone_body()} />
  {/if}
</div>
