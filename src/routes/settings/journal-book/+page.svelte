<script lang="ts">
  /* The journal book (phase 5 ticket 17): a print of a chosen range, made
     of whatever record types the person ticked.

     It borrows one thing from the clinician visit summary, deliberately
     narrowly: the way that screen prints, which is a print dialog over a
     `@media print` block and a `.no-print` class on everything that is
     controls rather than content. Both of those now live in app.css and
     print/print.ts, extracted when this screen became the second caller.
     What it does not borrow is that screen's section registry (ticket 06):
     a doctor's five sections and a keepsake's seven parts have nothing in
     common but the word "section", and the difference that matters here
     has no place in that registry at all - a book carries what was chosen,
     not what the range holds.

     Nothing is generated anywhere but here. The bytes of a photo come off
     the local file store, the print dialog is the browser's own, and
     nothing on this screen writes to the journal. */
  import { flushSync } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import {
    customInclusiveRange,
    dateInputValueFromEpochDay,
    dayRangeEndMin,
    dayRangeStartMax,
    epochDayFromDateInputValue,
    ongoingWindowRange,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { moodName, severityName } from '$lib/data/vocabulary/labels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { journalBookPartName } from '$lib/data/vocabulary/journalBookLabels';
  import { printCurrentPage } from '$lib/print/print';
  import {
    JOURNAL_BOOK_DEFAULT_INCLUSION,
    JOURNAL_BOOK_INCLUSION_KEYS,
    journalBookCounts,
    type JournalBookInclusion,
    type JournalBookInclusionKey
  } from '$lib/data/journal/journalBook';
  import type { WrappedCardContent } from '$lib/data/wrappedCard';
  import Icon from '$lib/components/Icon.svelte';
  import PrintLetterhead from '$lib/components/PrintLetterhead.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import JournalBookPhoto from '$lib/components/JournalBookPhoto.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import WrappedCard from '$lib/components/WrappedCard.svelte';
  import { crossfade, disclose, resize } from '$lib/motion/reveal';
  import { fadeOnly, motionDuration } from '$lib/motion/tokens';

  const today = todayEpochDay();
  const todayInput = dateInputValueFromEpochDay(today);
  const defaultRange = ongoingWindowRange(today, 365);

  let startInput = $state(dateInputValueFromEpochDay(defaultRange.start));
  let endInput = $state(dateInputValueFromEpochDay(defaultRange.end));
  let inclusion = $state<JournalBookInclusion>({ ...JOURNAL_BOOK_DEFAULT_INCLUSION });

  let range = $derived(customInclusiveRange(epochDayFromDateInputValue(startInput), epochDayFromDateInputValue(endInput)));

  /* The inclusion is read inside the query, so unticking a part stops the
     read that would have found it rather than only the markup that would
     have drawn it - the same shape the wrapped screen's `wrappedEnabled`
     check uses, and the point of the flags living in the assembly. */
  let bookQuery = liveQuery((j) =>
    range ? j.journalBook.getBook(range.start, range.end, inclusion) : Promise.resolve(null)
  );
  let book = $derived(bookQuery.value);

  const CHUNK_SIZE = 25;
  let renderedCount = $state(CHUNK_SIZE);

  $effect(() => {
    if (book?.entries) {
      if (renderedCount < book.entries.length) {
        const handle = requestAnimationFrame(() => {
          renderedCount = Math.min(book.entries.length, renderedCount + CHUNK_SIZE);
        });
        return () => cancelAnimationFrame(handle);
      }
    } else {
      renderedCount = CHUNK_SIZE;
    }
  });

  let visibleEntries = $derived(
    book?.entries ? book.entries.slice(0, renderedCount) : []
  );

  /* The pages themselves, folded away until somebody asks for them (phase 12
     final-audit ticket 20, audit finding U11). The screen used to lay the
     whole chosen range out inline - every entry's date, mood and words, and
     a full-bleed picture per photo - which came to 26,931px on the default
     one year, the tallest screen in the app by a factor of four, with the
     seven switches and Print past all of it. What goes in is now three
     numbers; the document is behind this.

     Print is not: `openForPrint` below is what every print path goes
     through, and it opens this first. */
  let previewOpen = $state(false);
  /* True only for the instant `openForPrint` spends inside `flushSync`, so
     the pages mounted for a print land at once rather than animating open
     under a dialog that is already being drawn. */
  let printing = $state(false);

  let counts = $derived(book ? journalBookCounts(book) : null);
  /* Zeros are left out rather than listed, the same call the import log's
     own counts line makes: "187 entries, 34 photos, 12 milestones" says
     what a book holds, and "187 entries, 0 photos, 0 milestones" spends two
     phrases saying nothing is there. A range holding none of the three says
     so in the empty line under it instead. */
  let summaryText = $derived(
    counts
      ? [
          counts.entries > 0 ? m.n_entries({ n: counts.entries }) : null,
          counts.photos > 0 ? m.n_photos({ n: counts.photos }) : null,
          counts.milestones > 0 ? m.imp_log_n_milestones({ n: counts.milestones }) : null
        ]
          .filter((part) => part !== null)
          .join(', ')
      : ''
  );

  $effect(() => {
    function onBeforePrint() {
      openForPrint();
    }
    function onAfterPrint() {
      printing = false;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeprint', onBeforePrint);
      window.addEventListener('afterprint', onAfterPrint);
      return () => {
        window.removeEventListener('beforeprint', onBeforePrint);
        window.removeEventListener('afterprint', onAfterPrint);
      };
    }
  });

  /* Opacity-only, not `disclose`: a chunk mounts up to 25 of these at
     once, and disclose's one-time height measurement lands wrong when
     that many siblings are being laid out and collapsed in the same
     instant - it reads back small, so the row sits short for its whole
     travel and then snaps to true height the moment the transition ends
     instead of arriving there smoothly. Opacity never depends on a
     measurement, so nothing to get wrong: the row occupies its real,
     final space from the first frame (which is also why the rows below
     it in the same chunk never move once mounted) and only fades in. */
  const entryFade = (_node: Element) => (printing ? { duration: 0 } : fadeOnly(motionDuration('--dur-med')));

  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  const ENTRY_DEPENDENT_PARTS = new Set<JournalBookInclusionKey>([
    'photos',
    'tags',
    'dysphoriaEuphoriaTags'
  ]);

  let includedParts = $derived(
    JOURNAL_BOOK_INCLUSION_KEYS.filter((key) => inclusion[key])
  );
  let partsScope = $derived(
    includedParts.length === 0
      ? m.journal_book_scope_parts_none()
      : includedParts.length === JOURNAL_BOOK_INCLUSION_KEYS.length
        ? m.journal_book_scope_parts_all()
        : m.journal_book_scope_parts({ parts: includedParts.map(journalBookPartName).join(', ') })
  );
  let scopeText = $derived(
    range
      ? m.journal_book_scope({
          range: m.journal_book_range({ from: dayLong(range.start), to: dayLong(range.end) }),
          parts: partsScope
        })
      : m.journal_book_range_required()
  );

  /* Ticket 16's card, given the two counts the recap seam already
     produces for this range. Palette art comes with the page rather than
     as a fourth switch: the opening page is one choice, and a card with the
     art off and nothing else to turn on would be a blank sheet. */
  let opening = $derived<WrappedCardContent | null>(
    book?.opening
      ? {
          paletteArt: true,
          stats: [
            { label: m.wrapped_stat_entries(), value: String(book.opening.entryCount) },
            { label: m.milestones(), value: String(book.opening.milestoneCount) }
          ]
        }
      : null
  );

  let empty = $derived(
    book !== null &&
      book !== undefined &&
      book.opening === null &&
      book.entries.length === 0 &&
      book.milestones.length === 0 &&
      book.sideEffects.length === 0
  );

  /* An empty range needs no fold: three lines saying there is nothing to
     print are not what the audit measured, and a disclosure over them would
     hide the one sentence that explains the blank. So the pages are shown
     outright there, exactly as they were before this ticket. */
  let previewShown = $derived(
    range !== null && !bookQuery.loading && !!book && (previewOpen || empty)
  );

  const tagName = (id: string) => vocabulary.tag(id)?.label ?? id;

  /* Photos and tags qualify an entry rather than standing alone - both are
     drawn under the day they belong to - so turning entries off takes them
     with it. Otherwise ticking Photos and unticking Entries prints nothing
     and says nothing about why. */
  function include(key: JournalBookInclusionKey, value: boolean) {
    inclusion =
      key === 'entries' && !value
        ? { ...inclusion, entries: false, photos: false, tags: false, dysphoriaEuphoriaTags: false }
        : { ...inclusion, [key]: value };
  }

  /* Everything a print needs on the page, in the DOM, before the dialog
     opens: the whole chunked list rather than however much has scrolled in,
     and the pages themselves whether or not the disclosure is open. The
     document that prints is therefore the same one it always was - the fold
     is a thing on the screen, not a thing on paper.

     `flushSync` rather than a plain assignment, because both callers hand
     control straight to the browser afterwards - `window.print()` returns
     nothing to await, and `beforeprint` is the last moment before the page
     is laid out for paper - and Svelte would otherwise apply the change a
     microtask later, after the dialog had already taken its picture. */
  function openForPrint() {
    if (book?.entries) {
      renderedCount = book.entries.length;
    }
    printing = true;
    previewOpen = true;
    flushSync();
    printing = false;
  }

  /** Waits for every photo the book carries to be read off the file store
      and drawn, or for `limitMs` to run out.

      Opening the pages at the moment of a print mounts each photo for the
      first time, and a photo answers its own read a frame or more later
      (JournalBookPhoto). Without this the dialog can open over a book whose
      pictures are still arriving, and the pictures are most of why anybody
      prints one. The cap is what a photo whose file is gone costs: it draws
      nothing and would otherwise never be waited out. */
  async function photosDrawn(limitMs = 2000): Promise<void> {
    const wanted = counts?.photos ?? 0;
    const deadline = performance.now() + limitMs;
    while (
      wanted > 0 &&
      document.querySelectorAll('[data-book-photo]').length < wanted &&
      performance.now() < deadline
    ) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  async function printBook() {
    openForPrint();
    await photosDrawn();
    void printCurrentPage(m.journal_book_title());
  }
</script>

<div class="screen">
  <ScreenHeader title={m.journal_book_title()} back="/settings" class="no-print" subtitle={m.journal_book_intro()} />

  <div class="kit-panel no-print" data-kit-surface style="margin-bottom:var(--space-4)">
    <div class="book-endpoints">
      <Field label={m.journal_book_range_start_label()} id="journal-book-start">
        {#snippet children(id)}
          <DatePicker max={dayRangeStartMax(endInput) ?? todayInput} bind:value={startInput} {id} />
        {/snippet}
      </Field>
      <Field label={m.journal_book_range_end_label()} id="journal-book-end">
        {#snippet children(id)}
          <DatePicker min={dayRangeEndMin(startInput)} max={todayInput} bind:value={endInput} {id} />
        {/snippet}
      </Field>
    </div>
    {#if range === null}
      <p class="muted small">{m.journal_book_range_required()}</p>
    {/if}
  </div>

  <div class="no-print">
    <SectionTitle text={m.journal_book_include_title()} />
    <div data-book-inclusion style="margin-bottom:var(--space-4)">
      <ListCard>
        {#each JOURNAL_BOOK_INCLUSION_KEYS as key (key)}
          <ListRow static key={key} data-inclusion={key} title={journalBookPartName(key)}>
            {#snippet trailing()}
              <Switch
                checked={inclusion[key]}
                label={journalBookPartName(key)}
                onChange={(v) => include(key, v)}
                disabled={!inclusion.entries && ENTRY_DEPENDENT_PARTS.has(key)}
              />
            {/snippet}
          </ListRow>
        {/each}
      </ListCard>
      <!-- What the ticks come to, in the three numbers that decide how long
           the book is. Its own height is what animates, both on the first
           arrival and when a switch changes the figures: the wrapper carries
           `resize`, and the words inside it cut, which is what ADR-0078 asks
           of a label changing under a standing element. -->
      <div use:resize>
        {#if summaryText}
          <p class="small book-summary" data-book-summary>{summaryText}</p>
        {/if}
      </div>
    </div>
  </div>

  <div class="screen-part no-print" use:resize>
  {#if range === null}
    <!-- Nothing to assemble until both boundaries are picked; the hint above already says so. -->
  {:else if bookQuery.loading || !book}
    <div out:crossfade><Skeleton variant="block" count={4} /></div>
  {:else}
    {#if !empty}
      <button
        type="button"
        class="book-preview-toggle"
        aria-expanded={previewOpen}
        data-book-preview-toggle
        onclick={() => (previewOpen = !previewOpen)}
      >
        <span>{m.journal_book_preview_disclosure()}</span>
        <span class="book-preview-chev"><Icon name="chevronDown" size={18} /></span>
      </button>
    {/if}

    <!-- `no-print` on each control rather than inherited from the wrapper:
         `hostSaveBar` moves this node out of the screen into the app column,
         so the wrapper's own class never reaches it. -->
    <SaveBar arrange="stack">
      <p class="small muted book-scope no-print" role="status">{scopeText}</p>
      <button class="btn btn-primary no-print" data-book-print onclick={printBook}>
        <Icon name="share" size={18} />
        <span>{m.journal_book_print()}</span>
      </button>
    </SaveBar>
  {/if}
  </div>

  <!-- The pages, and the only part of this screen that prints. Its own
       `.screen-part` beside the controls rather than inside them, for two
       reasons: the wrapper above carries `resize`, which would animate the
       screen's whole height against this fold's own travel, and
       `.screen > .screen-part > *` (app.css) is what spaces the blocks
       below, so they keep the spacing they had when they were that
       wrapper's children.

       No `use:resize` on it, which is the one stillness this ticket asks
       ADR-0078 for. The box changes size when the range does, and `resize`
       cannot share a node with `disclose` - the two fight over height and
       it oscillates (kit/Notice.svelte's own finding). The pages are still
       through a range change, and what moves then is the summary line
       above.

       `disclose` on a box this size is past the cap its own docstring sets
       - "a group rather than a screen... a disclosure that opens half the
       document is a screen, and belongs to tier 2 as a navigation
       instead" - and that is a deviation rather than an oversight. The cap
       is written against cost, and the cost was measured here: the box's
       height travels 0 to 19,205px over 16 frames at a steady 17ms, no
       frame dropped, because what is animated is one scalar and the pages
       below the window are never painted. Making the fold a navigation is
       the other reading of the same cap and is a bigger decision than this
       ticket - the ticket asked for a disclosure - so it is named here for
       whoever takes it.

       What the travel does leave is a settle: `disclose` measures the box
       at the frame it is created, the photos inside it are still being
       read off the file store then, and the last 6,613px arrive in the one
       frame the animation ends. All of it below the window, and the same
       growth `main` shows while the same photos decode. -->
  {#if previewShown && book}
    <div class="screen-part disclosed" data-book-preview transition:disclose={{ skip: printing }}>
      {#if opening}
        <div class="opening-page" data-book-opening>
          <WrappedCard content={opening} />
        </div>
      {/if}

      <div class="print-heading">
        <PrintLetterhead />
        <h1>{m.journal_book_title()}</h1>
        <p>{m.journal_book_range({ from: dayLong(book.fromEpochDay), to: dayLong(book.toEpochDay) })}</p>
      </div>

      {#if empty}
        <p class="muted small">{m.journal_book_empty()}</p>
      {/if}

      {#if book.entries.length}
        <SectionTitle text={journalBookPartName('entries')} />
        <div class="section-block">
          {#each visibleEntries as entry (entry.id)}
            <article class="book-entry" data-book-entry transition:entryFade>
              <h3 class="book-day">{dayLong(entry.epochDay)}, {fmtTime(entry.timestamp)}</h3>
              {#if entry.mood !== null}<p class="muted small">{moodName(entry.mood)}</p>{/if}
              {#if entry.note.trim()}<p class="book-note">{entry.note}</p>{/if}
              {#each entry.photos as photo (photo.id)}
                <JournalBookPhoto {photo} />
              {/each}
              {#if entry.tags.length}
                <p class="muted small">{entry.tags.map(tagName).join(' · ')}</p>
              {/if}
            </article>
          {/each}
        </div>
      {/if}

      {#if book.milestones.length}
        <SectionTitle text={journalBookPartName('milestones')} />
        <div class="section-block">
          <ListCard>
            {#each book.milestones as milestone (milestone.id)}
              <ListRow static title={milestone.name} subtitle={dayLong(milestone.epochDay)} />
            {/each}
          </ListCard>
        </div>
      {/if}

      {#if book.sideEffects.length}
        <SectionTitle text={journalBookPartName('sideEffects')} />
        <div class="section-block">
          <ListCard>
            {#each book.sideEffects as effect (effect.id)}
              {@const severity = severityName(effect.severity)}
              <ListRow
                static
                title={effect.name}
                subtitle={severity ? `${dayLong(effect.epochDay)} · ${severity}` : dayLong(effect.epochDay)}
              />
            {/each}
          </ListCard>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .book-endpoints {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
    gap: var(--space-3);
  }

  /* The three numbers under the switches: a plain line of the page's own
     ink rather than a quiet aside, since it is the answer to what the
     switches above it do. */
  .book-summary {
    margin-top: var(--space-3);
  }

  /* The same fold the dose log's attribution note and the look-back's fact
     list wear - a full-width row of the secondary ink with its chevron at
     the far edge - so every disclosure in the app reads as one control. */
  .book-preview-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--touch-target);
    padding: var(--space-2) 0;
    border: 0;
    background: none;
    color: var(--text-2);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }
  .book-preview-chev {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    transition: transform var(--dur-med) var(--ease-out);
  }
  .book-preview-toggle[aria-expanded='true'] .book-preview-chev {
    transform: rotate(180deg);
  }

  .section-block {
    margin-bottom: var(--space-4);
  }

  .opening-page {
    margin-bottom: var(--space-4);
  }

  .book-entry {
    margin-bottom: var(--space-4);
  }

  .book-day {
    font-size: var(--text-sm);
    color: var(--text-2);
    margin-bottom: var(--space-1);
  }

  .book-note {
    white-space: pre-wrap;
  }

  @media print {
    /* An opening page is an opening page: whatever follows starts on the
       next sheet. */
    .opening-page {
      break-after: page;
    }
    .book-entry {
      break-inside: avoid;
    }
  }
</style>
