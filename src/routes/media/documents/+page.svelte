<script lang="ts">
  /* The paper somebody keeps (phase 8 features ticket 52, ADR-0065; phase
     10 redesign ticket 58).

     A row never draws the page itself - that is ADR-0065's decision and it
     is about the room the phone is held in rather than about the schema: a
     grid of thumbnails of scanned diagnoses would be the most glanceable
     screen in the app. Disguise is branding only and a per-document hide
     flag is out (ADR-0063), so layout is what carries it - the page image
     lives one deliberate tap away, on the document's own screen. What
     changed under ticket 58: a row now also carries the kind (a PDF and a
     photograph wear different marks, `documents`/`image` from the existing
     icon set - no new glyph, ADR-0065's ban is on the page, not on saying
     which file format it is) and, where the paper is filed under
     something, that thing's own name rather than just its kind - the
     picker's own four live reads (documentTargets.svelte.ts), reused here
     rather than re-wired, since resolving one target and forty are the
     same four queries.

     Grouped by kind rather than by the specific record: the picker's own
     four sections (Milestones / Surgery journey / Regimen / Roadmap) are
     already the vocabulary a person filing a document sees, reusing them
     here needs no new copy, and it keeps the group count bounded at five
     however many milestones or goals somebody has - a "which one" question
     the row's own attachment line already answers. Unfiled papers get
     their own group, last.

     DIRECTION.md rule 16 ("an area screen opens by saying what is true
     now"): a plain present-reading row - how many documents there are and
     how much room they take - opens the screen, above the groups. Its
     total is a live file-size query (photoFiles.ts's `totalSize`, summing
     the stored file only, not its incidental thumbnail cache) rather than
     anything stored on the row, so it needs its own async read.

     Importing is two steps and the order matters: the file is chosen
     first, and the sheet that asks for a title and a date only opens once
     there is something to file. Backing out of the picker leaves no
     half-filled sheet behind. The title is required because a document has
     no other handle - search matches it and nothing else - and there is no
     honest default: a scan is called `scan_0142.jpg` and "Document 3" is
     worse than asking. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { documentTargets } from '$lib/components/documentTargets.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValueOrToday, todayEpochDay } from '$lib/data/epochDay';
  import { isPdfDocument } from '$lib/data/journal/documents';
  import { groupDocumentsByTarget, type DocumentGroupKind } from '$lib/data/journal/documentGroups';
  import type { DocumentFile } from '$lib/data/documents/accept';
  import { DOCUMENT_TARGET_SECTION_HEADING } from '$lib/data/vocabulary/documentTargetLabels';
  import type { JournalDocument } from '$lib/data/types';
  import { documentsSummaryText } from '$lib/data/vocabulary/documentsSummary';
  import { totalSize } from '$lib/stores/photoFiles';
  import { pickDocument } from '$lib/stores/documentPicking';
  import { toast } from '$lib/stores/toasts.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let documentsQuery = liveList((j) => j.documents.getDocuments());

  /* The bytes waiting for a title. Held here rather than in the draft
     because they are not a field somebody edits, and because a sheet closed
     without them saved would otherwise look like a document with no file. */
  let picked = $state<DocumentFile | null>(null);
  let title = $state('');
  let day = $state(dateInputValueFromEpochDay(todayEpochDay()));
  let saving = $state(false);

  async function startImport() {
    const content = await pickDocument();
    // Backing out of the picker, and a refused file, both leave nothing
    // open (picker.ts's own "backing out is an ordinary outcome"; a
    // refusal already raised its own toast in documentPicking.ts).
    if (!content) return;
    title = '';
    day = dateInputValueFromEpochDay(todayEpochDay());
    picked = content;
  }

  async function saveImport() {
    if (!picked || title.trim() === '' || saving) return;
    saving = true;
    try {
      await journal.documents.addDocument(
        { epochDay: epochDayFromDateInputValueOrToday(day), title },
        picked
      );
      picked = null;
    } catch (error) {
      /* A full disk or an unwritable store. The sheet stays open with the
         bytes and the typed title still in it, so the person can try again
         without picking the file a second time - and the toast says what
         happened rather than leaving a button that did nothing. */
      console.error('a document could not be filed', error);
      toast(m.document_save_failed());
    } finally {
      saving = false;
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

  /* The present reading (DIRECTION.md rule 16): a live size query rather
     than a stored figure, since nothing else in the row's own data carries
     it. Re-run whenever the document list changes rather than on a timer -
     an import or a delete is the only thing that can move this number. */
  let totalBytes = $state<number | null>(null);
  $effect(() => {
    const names = documentsQuery.rows.map((document) => document.fileName);
    let stale = false;
    totalSize(names).then((bytes) => {
      if (!stale) totalBytes = bytes;
    });
    return () => {
      stale = true;
    };
  });
</script>

<div class="screen">
  <ScreenHeader title={m.documents_title()} back="/more" subtitle={m.documents_intro()}>
    {#snippet actions()}
      <button
        class="icon-btn press"
        data-add
        aria-label={m.document_add_aria()}
        onclick={startImport}
      >
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={documentsQuery} count={3}>
    {#snippet rows(documents)}
      {#if totalBytes !== null}
        <div class="screen-part" data-documents-present-reading>
          <ListCard role={roleAt(activeFlag.roles, 0)}>
            <ListRow static data-documents-summary icon="documents" title={documentsSummaryText(documents.length, totalBytes)} />
          </ListCard>
        </div>
      {/if}

      {#each groups as group (group.kind)}
        <div class="screen-part" data-documents-group={group.kind}>
          <SectionHeading text={groupHeading(group.kind)} />
          <ListCard role={roleAt(activeFlag.roles, 0)}>
            {#each group.documents as document (document.id)}
              {@const kind = documentKind(document.fileName)}
              <ListRow
                key={document.id}
                icon={kind.icon}
                title={document.title}
                subtitle={[dayAndKind(document, kind.word), attachmentLine(document)]}
                href={`/media/documents/${document.id}`}
              />
            {/each}
          </ListCard>
        </div>
      {/each}
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="documents"
          key="documents-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.documents_empty_title()}
          text={m.documents_empty_body()}
          action={{ label: m.documents_empty_action(), primary: true, onclick: startImport }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <Sheet open={picked !== null} title={m.document_new_sheet()} onClose={() => (picked = null)}>
    <h3>{m.document_new_sheet()}</h3>
    <!-- No `hint` on either field: Field.svelte concatenates label and
         hint with no space between them, so both labels carry their own
         meaning instead. The date's says which day it means, which is the
         whole reason it is editable. -->
    <Field label={m.document_title_label()} id="document-title">
      {#snippet children(id)}
        <input class="input" {id} name="document-title" placeholder={m.document_title_placeholder()} bind:value={title} />
      {/snippet}
    </Field>
    <Field label={m.document_day_label()} id="document-day">
      {#snippet children(id)}
        <DatePicker name="document-day" bind:value={day} {id} />
      {/snippet}
    </Field>
    <div class="stack-3">
      <button class="btn btn-primary press" data-save-document disabled={title.trim() === ''} onclick={saveImport}>
        <span>{m.document_save()}</span>
      </button>
    </div>
  </Sheet>
</div>
