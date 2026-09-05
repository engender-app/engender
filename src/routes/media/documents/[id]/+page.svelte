<script lang="ts">
  /* One document (phase 8 features ticket 52, ADR-0065).

     This is the only screen in the app that draws a document's page at all.
     The list behind it is deliberately text (ADR-0065), so the tap that
     lands here is what the person chose to show themselves, and the image
     goes at the top of the screen where they are already looking rather
     than behind a further control.

     The two fields are editable for one reason: the title is the only
     handle anything has on a document - the list shows it, search matches
     it, the app never reads the page - so a typo in it is a document that
     cannot be found again, and re-importing needs a file the person may no
     longer have. The date is the same field the import asks for, and the
     same reason it is editable there: paper is dated by when it was written,
     not by when it was scanned.

     Reached by id through `detailDraft`, which reads the route parameter
     reactively - a `const id = page.params.id` goes stale when SvelteKit
     reuses this component across two ids. There is no `new` here: a
     document cannot exist before its file does, so it is always born on the
     list screen's import. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { detailDraft } from '$lib/components/kit/detailDraft.svelte';
  import { journal } from '$lib/data/live/journal.svelte';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValueOrToday, todayEpochDay } from '$lib/data/epochDay';
  import type { JournalDocument } from '$lib/data/types';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  const DOCUMENTS = '/media/documents';

  const detail = detailDraft<JournalDocument, { title: string; day: string }>({
    read: (j, id) => j.documents.getDocument(id).then((found) => found ?? undefined),
    blank: () => ({ title: '', day: dateInputValueFromEpochDay(todayEpochDay()) }),
    fromRecord: (found) => ({ title: found.title, day: dateInputValueFromEpochDay(found.epochDay) })
  });
  let draft = $derived(detail.draft);
  let stored = $derived(detail.record);

  let confirming = $state(false);

  async function saveChanges() {
    if (!stored || draft.title.trim() === '') return;
    await journal.documents.updateDocument({
      ...stored,
      title: draft.title,
      epochDay: epochDayFromDateInputValueOrToday(draft.day)
    });
  }

  async function deleteDocument() {
    if (!stored) return;
    confirming = false;
    await journal.documents.deleteDocument(stored.id);
    await goto(DOCUMENTS);
  }
</script>

<div class="screen">
  <ScreenHeader title={m.document_title()} back={DOCUMENTS} />

  {#if detail.loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if stored}
    <!-- The page itself, at the top of the screen the tap opened. The
         thumbnail rather than the full image: it is what normalisation
         already produced (photos/normalize.ts), and a reader big enough to
         work with is ticket 55's viewer. -->
    <div class="screen-part doc-page">
      <PhotoThumb photo={stored} size={220} label={stored.title} />
    </div>

    <div class="editor-section">
      <Field label={m.document_title_label()} id="document-title">
        {#snippet children(id)}
          <input class="input" {id} name="document-title" bind:value={draft.title} />
        {/snippet}
      </Field>
      <Field label={m.document_day_label()} id="document-day">
        {#snippet children(id)}
          <DatePicker name="document-day" bind:value={draft.day} {id} />
        {/snippet}
      </Field>
      <button
        class="btn btn-primary press"
        data-save-document
        disabled={draft.title.trim() === ''}
        onclick={saveChanges}
      >
        <span>{m.document_save_changes()}</span>
      </button>
      <button class="btn btn-ghost press" data-delete-document onclick={() => (confirming = true)}>
        <Icon name="trash" size={18} />
        <span>{m.document_delete()}</span>
      </button>
    </div>
  {:else}
    <div class="screen-part">
      <Notice
        icon="documents"
        key="document-missing"
        role={roleAt(activeFlag.roles, 0)}
        title={m.document_missing_title()}
        text={m.document_missing_body()}
        action={{ label: m.document_missing_action(), href: DOCUMENTS }}
      />
    </div>
  {/if}

  <ConfirmDeleteSheet
    open={confirming}
    title={m.document_delete_sheet()}
    question={stored ? m.document_delete_q({ title: stored.title }) : ''}
    hint={m.document_delete_hint()}
    confirmLabel={m.document_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-document': '' }}
    onConfirm={deleteDocument}
    onCancel={() => (confirming = false)}
  />
</div>

<style>
  /* The page sits on its own, centred, with nothing drawn around it: a box
     around the one picture on the screen is what DIRECTION.md 2b names as
     making a screen read as generic. */
  .doc-page {
    display: flex;
    justify-content: center;
  }
</style>
