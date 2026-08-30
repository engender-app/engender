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
    type JournalBookInclusion,
    type JournalBookInclusionKey
  } from '$lib/data/journal/journalBook';
  import type { WrappedCardContent } from '$lib/data/wrappedCard';
  import Icon from '$lib/components/Icon.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import JournalBookPhoto from '$lib/components/JournalBookPhoto.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import WrappedCard from '$lib/components/WrappedCard.svelte';

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

  const dayLong = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* Ticket 16's card, given the three counts the recap seam already
     produces for this range. Palette art comes with the page rather than
     as a fourth switch: the opening page is one choice, and a card with the
     art off and nothing else to turn on would be a blank sheet. */
  let opening = $derived<WrappedCardContent | null>(
    book?.opening
      ? {
          paletteArt: true,
          stats: [
            { label: m.wrapped_stat_entries(), value: String(book.opening.entryCount) },
            { label: m.wrapped_stat_streak(), value: String(book.opening.bestStreak) },
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

  function printBook() {
    void printCurrentPage(m.journal_book_title());
  }
</script>

<div class="screen">
  <ScreenHeader title={m.journal_book_title()} back="/settings" class="no-print" subtitle={m.journal_book_intro()}>
    {#snippet actions()}
      <button class="icon-btn" aria-label={m.journal_book_print()} onclick={printBook}>
        <Icon name="share" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <div class="card no-print" style="margin-bottom:var(--space-4)">
    <div class="cd-endpoints">
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
    <div class="card" data-book-inclusion style="margin-bottom:var(--space-4)">
      <p class="muted small" style="margin-bottom:var(--space-3)">{m.journal_book_include_note()}</p>
      {#each JOURNAL_BOOK_INCLUSION_KEYS as key (key)}
        <div class="spread inclusion-row" data-inclusion={key}>
          <span>{journalBookPartName(key)}</span>
          <Switch
            checked={inclusion[key]}
            label={journalBookPartName(key)}
            onChange={(v) => include(key, v)}
          />
        </div>
      {/each}
    </div>
  </div>

  {#if range === null}
    <!-- Nothing to assemble until both boundaries are picked; the hint above already says so. -->
  {:else if bookQuery.loading || !book}
    <Skeleton variant="block" count={4} />
  {:else}
    {#if opening}
      <div class="opening-page" data-book-opening>
        <WrappedCard content={opening} />
      </div>
    {/if}

    <div class="print-heading">
      <h1>{m.journal_book_title()}</h1>
      <p>{m.journal_book_range({ from: dayLong(book.fromEpochDay), to: dayLong(book.toEpochDay) })}</p>
    </div>

    {#if empty}
      <p class="muted small">{m.journal_book_empty()}</p>
    {/if}

    {#if book.entries.length}
      <SectionTitle text={journalBookPartName('entries')} />
      <div class="section-block">
        {#each book.entries as entry (entry.id)}
          <article class="book-entry" data-book-entry>
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
            <ListRow static title={effect.name} subtitle={`${dayLong(effect.epochDay)} · ${severityName(effect.severity)}`} />
          {/each}
        </ListCard>
      </div>
    {/if}
  {/if}
</div>

<style>
  .inclusion-row {
    padding: var(--space-2) 0;
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
