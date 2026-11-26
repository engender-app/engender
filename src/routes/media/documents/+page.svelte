<script lang="ts">
  import { collapse } from '$lib/motion/reveal';
  import { undoable } from '$lib/stores/deleteUndo';
  import { journalTextAutocomplete } from '$lib/platform';
  /* The documents index shows the total, then groups by filing target
     kind (ADR-0065). Reuse the four picker groups and put unfiled
     documents last. documentTargets.svelte.ts shares the target reads
     and supplies the attached record's name.

     A row shows a 48px crop from the top of the document and the
     documents or image icon. The full page requires an explicit tap.
     Disguise changes branding and has no per-document visibility
     switch (ADR-0063).

     Choose the file before opening the metadata sheet. Cancelling the
     picker leaves no draft. Require a title because search uses it
     to identify the document. */
  import { onDestroy, onMount } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import DocumentThumb from '$lib/components/DocumentThumb.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { documentTargets } from '$lib/components/documentTargets.svelte';
  import { journal, liveList, type LiveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValueOrToday, todayEpochDay } from '$lib/data/epochDay';
  import { isPdfDocument } from '$lib/data/journal/documents';
  import { groupDocumentsByTarget, type DocumentGroupKind } from '$lib/data/journal/documentGroups';
  import type { DocumentFile } from '$lib/data/documents/accept';
  import { DOCUMENT_TARGET_SECTION_HEADING } from '$lib/data/vocabulary/documentTargetLabels';
  import type { JournalDocument } from '$lib/data/types';
  import { claimPendingDocument, pickDocument } from '$lib/stores/documentPicking';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let documentsQuery = liveList((j) => j.documents.getDocuments());

  type ImportDraft = { id?: string; title: string; day: string; content: DocumentFile | null };
  let picking = $state(false);
  let active = true;
  onDestroy(() => { active = false; });

  const record = recordEditor<JournalDocument, ImportDraft>({
    blank: () => ({ title: '', day: dateInputValueFromEpochDay(todayEpochDay()), content: null }),
    upsert: async (draft) => {
      if (!draft.content || !draft.title.trim()) return false;
      await journal.documents.addDocument(
        { epochDay: epochDayFromDateInputValueOrToday(draft.day), title: draft.title },
        draft.content
      );
    },
    remove: (id) => undoable((j) => j.documents.deleteDocument(id)),
    findById: (id) => documentsQuery.rows.find((document) => document.id === id)
  });

  /* A file that came back while the app was locked (non-system handler under
     Lock immediately) opens the import sheet the same way a pick does. */
  onMount(() => {
    void claimPendingDocument(() => active && !record.editor && !record.saving).then((content) => {
      if (!content || !active) return;
      record.openEditor(null);
      record.editor!.content = content;
    });
  });

  async function startImport() {
    if (picking || record.editor || record.saving) return;
    picking = true;
    try {
      const content = await pickDocument('document');
      if (!content || !active) return;
      // Acquire before metadata, but compare against a draft without a file:
      // selected bytes are pending work even when every field is unchanged.
      record.openEditor(null);
      record.editor!.content = content;
    } finally {
      picking = false;
    }
  }

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* The file's own kind - the two the app can hold, read off the name the
     way the document's own screen already does (documents.ts's
     `isPdfDocument`), never off what the picker claimed. One read of the
     file name per row rather than one per fact drawn from it. */
  const documentKind = (fileName: string) =>
    isPdfDocument(fileName)
      ? { icon: 'documents', word: m.document_kind_pdf() }
      : { icon: 'image', word: m.document_kind_image() };
  const dayAndKind = (document: JournalDocument, word: string) => `${dayLabel(document.epochDay)} · ${word}`;

  const targets = documentTargets();

  /** The specific thing a document is filed under, resolved through the
      same four live reads the picker and the document's own screen use -
      not the generic per-kind wording the flat list used before ticket 58,
      which existed only to avoid this exact cost. `false` while the reads
      are still landing or there is nothing to say, matching `ListRow`'s
      own "no line" convention (`subtitle`'s `RowLine`). */
  const attachmentLine = (document: JournalDocument): string | false => {
    if (document.targetKind === null || document.targetId === null) return false;
    const resolved = targets.resolve({ kind: document.targetKind, id: document.targetId });
    if (resolved.state === 'found') return resolved.text;
    if (resolved.state === 'gone') return m.document_target_gone();
    return false;
  };

  /* The group headings: the picker's own four section titles
     (`DOCUMENT_TARGET_SECTION_HEADING`, shared with documentTargets.svelte.ts
     rather than re-declared), and `document_link_none` ("Not linked to
     anything") for the leftover bucket - the same fact the document's own
     screen already states about one paper, said here about a whole group
     of them. */
  const groupHeading = (kind: DocumentGroupKind): string =>
    kind === 'unattached' ? m.document_link_none() : DOCUMENT_TARGET_SECTION_HEADING[kind]();

  let groups = $derived(groupDocumentsByTarget(documentsQuery.rows));

  /* The list waits for everything a row draws, not only the documents.
     Each row's second line names what it is filed under, through
     `targets`' own four reads; when those landed after the documents, the
     line arrived in a row
     already on screen, and the first group grew 11px in one frame under
     the gate's fade (ux-carpet ticket 212, 1 of 15 cold loads). Latched,
     like a read's own loading: a line that changes later is that row's own
     change, not an arrival. */
  let rowsSettled = $state(false);
  $effect.pre(() => {
    if (rowsSettled || documentsQuery.loading) return;
    const linking = documentsQuery.rows.some(
      (d) =>
        d.targetKind !== null &&
        d.targetId !== null &&
        targets.resolve({ kind: d.targetKind, id: d.targetId }).state === 'loading'
    );
    if (!linking) rowsSettled = true;
  });
  const documentsRead: LiveList<JournalDocument> = {
    get rows() {
      return documentsQuery.rows;
    },
    get loading() {
      return !rowsSettled && !documentsQuery.failed;
    },
    get empty() {
      return rowsSettled && documentsQuery.empty;
    },
    get failed() {
      return documentsQuery.failed;
    },
    get stale() {
      return documentsQuery.stale;
    },
    retry: () => documentsQuery.retry()
  };
</script>

<div class="screen">
  <!-- No subtitle: the screen used to open on what it cannot do ("Search
       finds titles only") before saying what it holds (release audit U17).
       That line now sits under the summary row, where the pile it
       qualifies is counted. -->
  <ScreenHeader title={m.documents_title()} back="/more">
    {#snippet actions()}
      <button
        class="icon-btn press"
        data-add
        aria-label={m.add_a_document()}
        disabled={picking || record.editor !== null || record.saving}
        aria-busy={picking}
        onclick={startImport}
      >
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <span class="visually-hidden" role="status" data-document-import-status>{picking ? m.imp_running() : ''}</span>
  {#if picking}<p class="muted small" aria-hidden="true" data-document-import-progress>{m.imp_running()}</p>{/if}

  <ReadGate read={documentsRead} count={3}>
    {#snippet rows(documents)}
      <div class="screen-part" data-documents-present-reading>
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          <ListRow
            static
            data-documents-summary
            icon="documents"
            title={m.documents_summary({ count: documents.length })}
            subtitle={m.documents_search_note()}
          />
        </ListCard>
      </div>

      {#each groups as group (group.kind)}
        <div class="screen-part" data-documents-group={group.kind}>
          <!-- A heading names which pile this is, and with only one pile
               there is nothing to tell apart - "Not linked to anything"
               over the whole list read as a reprimand for filing paper
               without attaching it (audit item 9). -->
          {#if groups.length > 1 || group.kind !== 'unattached'}
            <SectionHeading text={groupHeading(group.kind)} />
          {/if}
          <ListCard role={roleAt(activeFlag.roles, 0)}>
            {#each group.documents as document (document.id)}
              {@const kind = documentKind(document.fileName)}
              <div class="rows-divide" transition:collapse>
                <ListRow
                  key={document.id}
                  title={document.title}
                  subtitle={[dayAndKind(document, kind.word), attachmentLine(document)]}
                  href={`/media/documents/${document.id}`}
                >
                  <!-- The page itself where there is one, and the kind mark
                       the row used to draw where there is not (audit item 9;
                       ADR-0065's own note carries the reversal). -->
                  {#snippet leading()}
                    <DocumentThumb fileName={document.fileName} title={document.title} />
                  {/snippet}
                </ListRow>
              </div>
            {/each}
          </ListCard>
        </div>
      {/each}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="documents"
        key="documents-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.documents_empty_title()}
        text={m.documents_empty_body()}
        action={{ label: picking ? m.imp_running() : m.add_a_document(), primary: true, onclick: startImport }}
      />
    {/snippet}
  </ReadGate>

  <RecordSheet
    {record}
    handle="document"
    newTitle={m.document_new_sheet()}
    saveLabel={record.saving ? m.entry_saving() : m.save()}
    canSave={(draft) => !!draft.content && !!draft.title.trim()}
    {fields}
    confirm={{
      title: m.document_delete_sheet(),
      question: (document) => m.document_delete_q({ title: document.title }),
      hint: () => m.document_delete_hint(),
      confirmLabel: m.delete(),
      cancelLabel: m.keep_it()
    }}
  />
  {#snippet fields(draft: ImportDraft)}
    <Field label={m.document_title_label()} id="document-title">
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="document-title"
          placeholder={m.document_title_placeholder()}
          bind:value={draft.title}
          required
          aria-invalid={!draft.title.trim()}
          aria-describedby={!draft.title.trim() ? 'document-requirements' : undefined}
        />
      {/snippet}
    </Field>
    <Field label={m.document_day_label()} id="document-day">
      {#snippet children(id)}
        <DatePicker name="document-day" bind:value={draft.day} {id} />
      {/snippet}
    </Field>
    <p class="muted small" id="document-requirements" aria-live="polite">
      {draft.title.trim() ? '' : m.document_title_required()}
    </p>
  {/snippet}
</div>
