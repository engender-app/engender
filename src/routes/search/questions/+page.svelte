<script lang="ts">
  /* The saved questions shelf (phase 8 features ticket 06, CONTEXT: "Saved
     question"). List and delete only - naming happens once, from `/search`
     when there is a query behind it to name, and renaming lives on the run
     itself (the run already knows the question it is renaming). */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import type { SavedQuestion } from '$lib/data/types';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let questionsQuery = liveList((j) => j.savedQuestions.getSavedQuestions());
  let questions = $derived(questionsQuery.rows);

  /** The typed query, quoted - the one thing about a saved question that
      says something a filter sheet cannot. A question with no free text at
      all (structured filters only) gets no subtitle: DIRECTION.md 3b, a
      subtitle is earned. */
  const subtitleOf = (q: SavedQuestion): string | undefined => (q.queryText.trim() ? `“${q.queryText.trim()}”` : undefined);

  let deleteTarget = $state<SavedQuestion | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.savedQuestions.deleteSavedQuestion(id);
  }
</script>

<div class="screen">
  <ScreenHeader title={m.saved_questions_title()} back="/search" subtitle={m.saved_questions_intro()} />

  <ReadGate read={questionsQuery} count={3}>
    {#snippet rows(list)}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each list as q (q.id)}
            <ListRow
              key={q.id}
              data-saved-question={q.id}
              icon="bookmark"
              title={q.name}
              subtitle={subtitleOf(q)}
              href="/search/questions/{q.id}"
              action={{ icon: 'trash', label: m.saved_question_delete_aria(), onclick: () => (deleteTarget = q) }}
            />
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="bookmark"
          key="saved-questions-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.saved_questions_empty_title()}
          text={m.saved_questions_empty_body()}
          action={{ label: m.search(), href: '/search' }}
        />
      </div>
    {/snippet}
  </ReadGate>
</div>

<ConfirmDeleteSheet
  open={deleteTarget !== null}
  title={m.saved_question_delete_sheet()}
  question={deleteTarget ? m.saved_question_delete_q({ name: deleteTarget.name }) : ''}
  confirmLabel={m.saved_question_delete()}
  cancelLabel={m.keep_it()}
  confirmAttrs={{ 'data-confirm-delete-saved-question': '' }}
  onConfirm={confirmDelete}
  onCancel={() => (deleteTarget = null)}
/>
