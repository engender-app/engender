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

     A PDF (tickets 53 and 55, ADR-0065) shows its first page the same way,
     from the thumbnail drawn once at import, and then the page itself as
     the renderer finishes it - which is what the thumbnail is for: the
     screen has something to show in the moment before a megabyte of
     library has even loaded. Pages after that are turned here, and there
     is no text layer on any of them (ADR-0065): what a document says is
     not something this app reads.

     It keeps its size and its export, which is the honest fallback for a
     file the renderer cannot read: written back out unchanged through the
     share sheet or a download (archive/deliver.ts), the only way this app
     hands a file to anything outside its own encryption. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import DocumentTargetPicker from '$lib/components/DocumentTargetPicker.svelte';
  import { documentTargets } from '$lib/components/documentTargets.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { detailDraft } from '$lib/components/kit/detailDraft.svelte';
  import { deliverBlob } from '$lib/data/archive/deliver';
  import { nameSlug } from '$lib/data/fold';
  import { openPdf, type OpenPdf } from '$lib/data/documents/pdf';
  import { documentThumbName, isPdfDocument } from '$lib/data/journal/documents';
  import { journal } from '$lib/data/live/journal.svelte';
  import { readPhoto, readThumbnailFile } from '$lib/stores/photoFiles';
  import { toast } from '$lib/stores/toasts.svelte';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValueOrToday, todayEpochDay } from '$lib/data/epochDay';
  import { documentTarget } from '$lib/data/journal/documents';
  import { DOCUMENT_TARGET_ICON, documentTargetKindLabel } from '$lib/data/vocabulary/documentTargetLabels';
  import type { DocumentTarget, JournalDocument } from '$lib/data/types';
  import { crossfade } from '$lib/motion/reveal';
  import { EASE_OUT_CSS, motionDistance, motionDuration } from '$lib/motion/tokens';
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

  /* What the document is filed under (ticket 56, ADR-0065). The four reads
     behind the name are documentTargets.svelte.ts's, shared with the picker
     the pencil opens, and they answer in three states rather than two: a
     read still in flight is not a target that is gone. */
  let target = $derived(stored ? documentTarget(stored) : null);

  const targets = documentTargets();
  let resolved = $derived(target ? targets.resolve(target) : null);

  let pickingTarget = $state(false);

  async function pickTarget(next: DocumentTarget | null) {
    if (!stored) return;
    try {
      await journal.documents.setDocumentTarget(stored.id, next);
    } catch (error) {
      console.error('a document link could not be saved', error);
      toast(m.document_edit_failed());
    }
  }

  let isPdf = $derived(stored ? isPdfDocument(stored.fileName) : false);

  /* The page, drawn at whatever shape it is rather than through PhotoThumb.
     That primitive is a fixed square tile with a caption across the bottom,
     which is right for a grid of photographs and wrong for one sheet of
     A4: it crops the letterhead off the top and repeats the title that is
     already in the field below. So the read and the blob's lifetime are
     here, the same two moves PhotoThumb makes, with the aspect left alone.

     The thumbnail, for either kind of document: an image's from
     normalisation, a PDF's its first page drawn at import (ticket 55).
     Read under the name the area derives rather than through
     `readThumbnail`, whose `.jpg` rewrite would hand a PDF its own bytes
     back under a JPEG's type (photos/names.ts). For a PDF this is what is
     on screen until the renderer has a page of its own. */
  let pageUrl = $state<string | null>(null);

  $effect(() => {
    const fileName = stored?.fileName;
    if (!fileName) return;

    let stale = false;
    let objectUrl: string | null = null;
    readThumbnailFile(documentThumbName(fileName)).then(
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

  /* The renderer, opened on the bytes this screen already holds and closed
     when the screen goes. Only a PDF ever reaches it, and only once
     somebody has opened the document: that tap is the whole of what wakes
     a megabyte of library (ADR-0065's "nothing wakes it until somebody
     opens a document").

     `unreadable` is a whole file the renderer refused - encrypted,
     truncated, or not the PDF its header claimed. The screen says so in a
     line and keeps the export, which is the honest thing to offer for a
     file this app cannot draw. */
  let pages = $state<OpenPdf | null>(null);
  let pageNumber = $state(1);
  let unreadable = $state(false);

  $effect(() => {
    const bytes = pdfBytes;
    if (!bytes) return;

    let stale = false;
    let opened: OpenPdf | null = null;
    openPdf(bytes).then(
      (open) => {
        if (stale) return open.close();
        opened = open;
        pages = open;
        pageNumber = 1;
      },
      (error) => {
        if (stale) return;
        console.error('a document could not be opened for reading', error);
        unreadable = true;
      }
    );

    /* Everything the last document put on this screen goes with it,
       including what went wrong on it. SvelteKit reuses this component
       across two ids (detailDraft's own reason for reading the route
       parameter reactively), so a page that failed on one document would
       otherwise leave the next one's screen saying so, hiding its
       thumbnail behind a line about a page it never had - and `shownPage`
       surviving would make the next document's first page read as the
       same page it already had, which is what decides whether it
       animates. */
    return () => {
      stale = true;
      opened?.close();
      pages = null;
      pageDrawn = false;
      pageFailed = false;
      unreadable = false;
      shownPage = 0;
      turnedBy = 0;
    };
  });

  /* Where the page is drawn, and how big it is drawn. The canvas stays
     mounted whether or not there is anything on it yet, because a page
     cannot be rendered into an element that only appears once the page has
     rendered; `pageDrawn` is what decides whether it is the thing on
     screen or the thumbnail behind it still is.

     The size is the sheet's own box in device pixels, rounded to a step so
     that a keyboard opening or an address bar collapsing does not re-render
     the page for the sake of four pixels. Capped, because a page is vector
     and would otherwise happily rasterise at whatever a desktop window
     asks for. */
  let canvas = $state<HTMLCanvasElement | null>(null);
  let frameWidth = $state(0);
  let pageDrawn = $state(false);
  let pageFailed = $state(false);

  const RENDER_STEP = 64;
  const RENDER_CAP = 2048;
  /** How much of the screen's height one sheet may take. Declared here and
      handed to the stylesheet below as a custom property, rather than
      written as a number in the CSS and again as a fraction here: the two
      have to agree for the page to be rendered at the size it is drawn at,
      and nothing but this line would have made them. */
  const SHEET_VIEWPORT_SHARE = 0.44;

  let renderEdge = $derived.by(() => {
    if (frameWidth === 0 || typeof window === 'undefined') return 0;
    const sheetHeight = window.innerHeight * SHEET_VIEWPORT_SHARE;
    const devicePixels = Math.max(frameWidth, sheetHeight) * (window.devicePixelRatio || 1);
    return Math.min(RENDER_CAP, Math.ceil(devicePixels / RENDER_STEP) * RENDER_STEP);
  });

  $effect(() => {
    const open = pages;
    const target = canvas;
    const number = pageNumber;
    const edge = renderEdge;
    if (!open || !target || edge === 0) return;

    let stale = false;
    open.page(number, edge).then(
      (bitmap) => {
        if (stale) return bitmap.close();
        target.width = bitmap.width;
        target.height = bitmap.height;
        target.getContext('2d')?.drawImage(bitmap, 0, 0);
        bitmap.close();
        const arrived = number !== shownPage;
        shownPage = number;
        pageDrawn = true;
        pageFailed = false;
        // A re-render at a new size is the same page again, and animating
        // it would make a rotation or a keyboard opening look like a turn.
        if (arrived) sheetArrives(target);
      },
      (error) => {
        if (stale) return;
        // One page of a file the rest of which is fine: a scanned page in
        // a format the renderer choked on, or a damaged object. Said in a
        // line rather than left as an empty canvas.
        console.error('a page of a document could not be drawn', error);
        pageFailed = true;
        pageDrawn = false;
      }
    );

    return () => {
      stale = true;
    };
  });

  /* The page's own two moments, both authored here rather than in CSS: a
     class-driven animation cannot be replayed for a canvas whose pixels
     changed under it, and this is the same WAAPI shape the resize
     primitive uses (motion/reveal.ts), on the same easing token.

     The first page fades in over the thumbnail it replaces - the same
     picture at a better resolution, so the motion says "sharpened" rather
     than "something new". A turn adds the small travel the tap implies:
     the page comes in from the side the thumb reached for, which is what
     tells a person the sheet moved rather than redrew. Both come out at
     zero under reduced motion, where `motionDuration` returns 0. */
  let shownPage = 0;
  let turnedBy = 0;

  function sheetArrives(target: HTMLCanvasElement) {
    const duration = motionDuration('--dur-med');
    const travel = turnedBy === 0 ? 0 : motionDistance('--motion-distance-sm') * turnedBy;
    turnedBy = 0;
    if (duration === 0) return;
    target.animate([{ opacity: 0, transform: `translateX(${travel}px)` }, { opacity: 1, transform: 'none' }], {
      duration,
      easing: EASE_OUT_CSS
    });
  }

  const turnPage = (by: number) => {
    if (!pages) return;
    const next = pageNumber + by;
    if (next < 1 || next > pages.pageCount) return;
    turnedBy = by;
    pageNumber = next;
  };

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
    <!-- The page itself, at the top of the screen the tap opened. The
         canvas is always mounted and only sometimes the thing on screen:
         a page cannot be drawn into an element that appears once it has
         been drawn. Behind it, in order, the thumbnail from import and
         then the paper icon, which is what a document whose page could
         not be drawn at all is left with. -->
    <div
      class="screen-part doc-page"
      style="--doc-sheet-height: {SHEET_VIEWPORT_SHARE * 100}vh"
      bind:clientWidth={frameWidth}
    >
      <!-- The sheet and the control that turns it are one column, so the
           pager is exactly as wide as the page it belongs to rather than
           as wide as the screen. -->
      <div class="doc-sheet">
        <canvas
          class="doc-page-canvas"
          class:drawn={pageDrawn}
          data-document-page-canvas={pageDrawn ? 'drawn' : 'blank'}
          bind:this={canvas}
          aria-label={m.document_page_alt({ title: stored.title })}
        >
          <!-- A canvas's own children are what a screen reader is offered
               in place of the pixels, so the page says what it is there
               too. -->
          {m.document_page_alt({ title: stored.title })}
        </canvas>
        {#if !pageDrawn}
          <!-- Not the thumbnail when a page failed: that thumbnail is page
               one, and page one under a line about page five is a worse
               answer than the empty sheet. -->
          {#if pageUrl && !pageFailed}
            <img class="doc-page-image" data-document-page src={pageUrl} alt={m.document_page_alt({ title: stored.title })} />
          {:else}
            <div class="doc-page-empty"><Icon name="documents" size={28} /></div>
          {/if}
        {/if}

        {#if pages}
          <!-- Pages and nothing else (ADR-0065): no zoom, no rotation, no
               grid of every page, and no text under any of them.

               The count shows for a one-page document too, because "Page 1
               of 1" is how a person knows they have seen the whole thing;
               the two chevrons are what a single page does not get, since
               a control that can never do anything is not worth the two
               places it would take under every e-recepta. -->
          <div class="doc-pager" class:one-page={pages.pageCount === 1}>
            {#if pages.pageCount > 1}
              <button
                class="icon-btn press"
                data-page-back
                aria-label={m.document_page_prev()}
                disabled={pageNumber <= 1}
                onclick={() => turnPage(-1)}
              >
                <Icon name="chevronLeft" size={22} />
              </button>
            {/if}
            <p class="doc-page-count" data-page-count aria-live="polite">
              {m.document_page_count({ page: pageNumber, pages: pages.pageCount })}
            </p>
            {#if pages.pageCount > 1}
              <button
                class="icon-btn press"
                data-page-forward
                aria-label={m.document_page_next()}
                disabled={pageNumber >= pages.pageCount}
                onclick={() => turnPage(1)}
              >
                <Icon name="chevronRight" size={22} />
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    {#if isPdf}
      <div class="screen-part stack-3">
        {#if unreadable}
          <p class="muted small" data-document-unreadable>{m.document_pdf_unreadable()}</p>
        {:else if pageFailed}
          <p class="muted small" data-document-page-failed>{m.document_page_failed()}</p>
        {/if}

        <p data-document-size>{pdfBytes ? fileSize(pdfBytes.byteLength) : ''}</p>
        <button class="btn btn-soft press" data-export-document disabled={!pdfBytes} onclick={exportPdf}>
          <Icon name="share" size={20} /><span>{m.document_export()}</span>
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
      <!-- The link is a row of the same list card the rest of the app files
           things in, rather than a line of text with a button beside it: it
           goes to the target the way any row goes to what it names, and the
           trailing control is the row's own `action` - which is what keeps a
           button out of the middle of a link (ListRow's own reason for the
           split shape). Unlinked, the row has nowhere to go, so it acts. -->
      <Field label={m.document_link_label()} legend>
        {#snippet children()}
          <ListCard>
            {#if resolved?.state === 'found'}
              <ListRow
                key="document-target"
                data-document-link
                icon={DOCUMENT_TARGET_ICON[target!.kind]}
                title={resolved.text}
                subtitle={documentTargetKindLabel(target!.kind)}
                href={resolved.href}
                action={{
                  icon: 'pencil',
                  label: m.document_link_change(),
                  onclick: () => (pickingTarget = true),
                  attrs: { 'data-pick-document-target': 'true' }
                }}
              />
            {:else if resolved?.state === 'loading'}
              <!-- The lists behind the name have not landed yet, so no row:
                   a name still coming and a target that is gone read nothing
                   alike, and one of the two would have to be guessed. -->
              <Skeleton variant="line" count={1} />
            {:else if resolved}
              <!-- A link whose target is gone, which a restored archive can
                   carry (ADR-0065): the paper outlives what it was filed
                   under, so the row states that and offers the picker rather
                   than pointing at nothing. -->
              <ListRow
                key="document-target"
                data-document-link
                static
                icon={DOCUMENT_TARGET_ICON[target!.kind]}
                title={m.document_target_gone()}
                action={{
                  icon: 'pencil',
                  label: m.document_link_change(),
                  onclick: () => (pickingTarget = true),
                  attrs: { 'data-pick-document-target': 'true' }
                }}
              />
            {:else}
              <ListRow
                key="document-target"
                data-document-link
                data-pick-document-target="true"
                icon="plus"
                title={m.document_link_add()}
                subtitle={m.document_link_none()}
                chevron={false}
                onclick={() => (pickingTarget = true)}
              />
            {/if}
          </ListCard>
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

  <DocumentTargetPicker
    open={pickingTarget}
    current={target}
    onPick={(next) => pickTarget(next)}
    onClose={() => (pickingTarget = false)}
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
  .doc-page-canvas,
  .doc-page-empty {
    max-width: 100%;
    /* The share the renderer draws to, handed down from the script so the
       page is never rasterised at one size and capped at another. */
    max-height: var(--doc-sheet-height);
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

  /* The sheet and its pager as one column, which is what keeps the
     control the width of the page rather than the width of the screen.
     The gap is tight on purpose: the pager belongs to the page above it,
     and the file's own block below is a screen-part away. */
  .doc-sheet {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-1);
  }

  /* Mounted from the start and hidden until there is a page on it, so that
     the render has somewhere to go. display:none rather than opacity,
     because an invisible sheet still standing in the layout would hold the
     thumbnail's own place open beside it. */
  .doc-page-canvas {
    display: none;
    width: auto;
    height: auto;
  }

  .doc-page-canvas.drawn {
    display: block;
  }

  /* The pager reads as one control rather than three: the count is what
     the eye lands on, and the two chevrons sit at the ends of the page's
     own width so a thumb finds them in the same place on every page. */
  .doc-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  /* With nothing to turn, the count is the only thing in the row, and a
     lone label pushed to one end would read as a label that lost its
     control. */
  .doc-pager.one-page {
    justify-content: center;
  }

  .doc-page-count {
    /* Tabular, so a page number growing a digit does not shift the
       chevrons under the thumb that is tapping them. */
    font-variant-numeric: tabular-nums;
    color: var(--text-2);
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
