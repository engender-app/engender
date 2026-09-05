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
     list screen's import.

     A PDF (ticket 53, ADR-0065) has no thumbnail to draw here, so it shows
     the same paper icon the list row already uses, plus its size and one
     action: write the file back out, unchanged, through the share sheet or
     a download (archive/deliver.ts) - the only way this app hands a file
     to anything outside its own encryption. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { detailDraft } from '$lib/components/kit/detailDraft.svelte';
  import { deliverBlob } from '$lib/data/archive/deliver';
  import { nameSlug } from '$lib/data/fold';
  import { isPdfDocument } from '$lib/data/journal/documents';
  import { journal } from '$lib/data/live/journal.svelte';
  import { readPhoto, readThumbnail } from '$lib/stores/photoFiles';
  import { toast } from '$lib/stores/toasts.svelte';
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

  let isPdf = $derived(stored ? isPdfDocument(stored.fileName) : false);

  /* The page, drawn at whatever shape it is rather than through PhotoThumb.
     That primitive is a fixed square tile with a caption across the bottom,
     which is right for a grid of photographs and wrong for one sheet of
     A4: it crops the letterhead off the top and repeats the title that is
     already in the field below. So the read and the blob's lifetime are
     here, the same two moves PhotoThumb makes, with the aspect left alone.

     It is the thumbnail rather than the full page. What it is for is
     recognising which document this is; reading one is ticket 55's viewer,
     which is also where the zoom lives. A PDF has no thumbnail at all
     (ticket 53), so this never runs for one - `readThumbnail` would
     otherwise hand back the PDF's own bytes under a JPEG's `type`
     (photos/names.ts's `thumbFileName` only rewrites a `.jpg` suffix). */
  let pageUrl = $state<string | null>(null);

  $effect(() => {
    const fileName = stored?.fileName;
    if (!fileName || isPdfDocument(fileName)) return;

    let stale = false;
    let objectUrl: string | null = null;
    readThumbnail(fileName).then(
      (bytes) => {
        if (stale || !bytes) return;
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
        pageUrl = objectUrl;
      },
      // A file written under another key throws out of the store rather
      // than reading as null, and the empty frame is already what is on
      // screen - swallowing it here is what keeps it from surfacing as an
      // unhandled rejection (PhotoThumb.svelte says the same).
      () => {}
    );

    return () => {
      stale = true;
      pageUrl = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });

  /* A PDF's own bytes, read once and held for as long as this screen is
     open: the size line needs its length, and the export action needs the
     same bytes right after - reading twice would cost a second decrypt of
     a file that can be tens of megabytes (ticket 53's own ceiling). */
  let pdfBytes = $state<Uint8Array | null>(null);

  $effect(() => {
    const fileName = stored?.fileName;
    if (!fileName || !isPdfDocument(fileName)) return;

    let stale = false;
    readPhoto(fileName).then(
      (bytes) => {
        if (!stale) pdfBytes = bytes;
      },
      () => {}
    );

    return () => {
      stale = true;
      pdfBytes = null;
    };
  });

  const fileSize = (bytes: number): string =>
    bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  async function exportPdf() {
    if (!stored || !pdfBytes) return;
    try {
      const delivery = await deliverBlob(
        `${nameSlug(stored.title) || 'document'}.pdf`,
        new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      );
      if (delivery === 'cancelled') {
        toast(m.exp_cancelled());
        return;
      }
      toast(delivery === 'shared' ? m.pj_shared() : m.pj_downloaded());
    } catch (error) {
      console.error('a document could not be exported', error);
      toast(m.pj_failed());
    }
  }

  let saving = $state(false);

  async function saveChanges() {
    if (!stored || draft.title.trim() === '' || saving) return;
    saving = true;
    try {
      await journal.documents.updateDocument({
        ...stored,
        title: draft.title,
        epochDay: epochDayFromDateInputValueOrToday(draft.day)
      });
    } catch (error) {
      /* An update naming an id the journal no longer holds throws
         (ADR-0053), which here means the row went while this screen was
         open. The same shape the import's own failure takes on the list
         screen: say so rather than leave a button that did nothing. */
      console.error('a document could not be updated', error);
      toast(m.document_edit_failed());
    } finally {
      saving = false;
    }
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
    <!-- The page itself, at the top of the screen the tap opened. A PDF
         has no page image to show (ticket 53) - the same empty frame an
         image document's own thumbnail still loading uses, here shown on
         purpose rather than while waiting. -->
    <div class="screen-part doc-page">
      {#if pageUrl}
        <img class="doc-page-image" data-document-page src={pageUrl} alt={m.document_page_alt({ title: stored.title })} />
      {:else}
        <div class="doc-page-empty"><Icon name="documents" size={28} /></div>
      {/if}
    </div>

    {#if isPdf}
      <div class="screen-part stack-3">
        <p data-document-size>{pdfBytes ? fileSize(pdfBytes.byteLength) : ''}</p>
        <button class="btn btn-soft press" data-export-document disabled={!pdfBytes} onclick={exportPdf}>
          <span>{m.document_export()}</span>
        </button>
        <p class="muted small">{m.document_export_hint()}</p>
      </div>
    {/if}

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
     making a screen read as generic. The corner radius is the sheet's own,
     which is what stops a photograph of paper reading as a photograph. */
  .doc-page {
    display: flex;
    justify-content: center;
  }

  /* Capped by height rather than width, because paper is portrait and a
     sheet scaled to the screen's width would push both fields and the
     delete off the bottom on a 390px phone. */
  .doc-page-image,
  .doc-page-empty {
    max-width: 100%;
    max-height: 44vh;
    border-radius: var(--radius-md);
    /* A scan of white paper on a light background has no edge of its own -
       in the light theme the sheet and the screen behind it are within a
       few percent of each other and the page floats. The app separates
       surfaces with a line rather than a shadow (kit.css bans box-shadow),
       so the sheet gets the same line every other surface has. */
    border: 1px solid var(--outline);
  }

  .doc-page-image {
    width: auto;
    height: auto;
  }

  .doc-page-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 160px;
    height: 220px;
    color: var(--text-2);
    background: var(--surface-2);
  }
</style>
