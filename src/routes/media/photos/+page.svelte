<script lang="ts">
  import PhotoViewer from '$lib/components/PhotoViewer.svelte';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  import { photoOwnerHref } from '$lib/data/photos/library';
  import { withSourceReturn } from '$lib/navigation/sourceRecord';
  /* The photo library: every photograph in the journal, wherever it is
     kept, and the wipe over any two of them (phase 11 ticket 14).

     Until this the grid read the `photo` table, which is an entry's
     photographs and a milestone's, and the line over it said "Every photo
     in your journal". Four more tables hold photographs - hair progress,
     hair removal, tryouts, surgery recovery - and `video_note` holds a
     note recorded in the editor, and none of the five could be found again
     except through the day it hangs off. `journal.photoLibrary` is the one
     read across all six; this screen is where it is looked at.

     What the chips do is narrow, not navigate. The grid is the same grid
     either way and the selection is the same selection, so tapping "Hair"
     moves the photographs rather than repainting the screen (ADR-0078,
     motion/narrow.ts). The chip lives in the query, so a link can open the
     library already narrowed and a reload keeps it.

     COMPARE READS THE WHOLE LIBRARY, never the narrowed grid. Putting a
     hair photograph beside a body one is the thing this screen offers that
     neither the hair screen nor the surgery screen can, and an anchor
     picked under one chip has to survive the next chip. So the wipe's list
     is every photograph the library holds, in order, and the grid is only
     where they are picked.

     A video note is in the library and is not in that list: the wipe reads
     full JPEG bytes through readPhoto (PhotoWipe.svelte) and a `.webm` is
     not a frame. Its tile plays it instead of picking it. */
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import { replaceRoute } from '$lib/navigation/smart-back';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import { calendarDuration, dateInputValueFromEpochDay, epochDayFromDateInputValueOrToday } from '$lib/data/epochDay';
  import type { ComparePair } from '$lib/data/photos/compare-state';
  import {
    orderAnchorsByJourney,
    toComparePair,
    toggleCompareAnchor
  } from '$lib/data/photos/compare-state';
  import {
    chipsFor,
    narrowTo,
    photoChipFromQuery,
    yearMarks,
    type LibraryPhoto,
    type PhotoChip
  } from '$lib/data/photos/library';
  import { photoOwnerLine, photoSourceLabel } from '$lib/data/vocabulary/photoLibraryLabels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { Measurement } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoChipRow from '$lib/components/PhotoChipRow.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import VideoNotePlayer from '$lib/components/VideoNotePlayer.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import PhotoWipe from '$lib/components/kit/PhotoWipe.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { measureCells, pinnedOut, tileIn, travelCells } from '$lib/motion/narrow';
  import { isReducedMotion } from '$lib/motion/tokens';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  /* One query over six tables, already dated and ordered by the journal
     (photoLibrary.ts). Thumbnails only - PhotoThumb never decodes a full
     photo to draw a 104px tile. */
  let libraryQuery = liveList((j) => j.photoLibrary.inJournal());
  let library = $derived(libraryQuery.rows);

  /** Which chip the query names, falling back to the whole library both
      for an unknown value and for a chip this journal has nothing behind:
      a link to `?source=tryouts` written before the last tryout photograph
      was deleted opens on everything rather than on an empty grid with no
      chip to leave it by. */
  const SOURCE_PARAM = 'source';
  let chips = $derived(chipsFor(library));
  let requested = $derived(photoChipFromQuery(page.url.searchParams.get(SOURCE_PARAM)));
  let chip = $derived(chips.includes(requested) ? requested : 'everything');
  let shown = $derived(narrowTo(library, chip));
  let marks = $derived(yearMarks(shown));

  /* Every photograph the wipe can read, narrowed by nothing. See the header:
     an anchor picked under one chip must still be there under the next. */
  let comparable = $derived(library.filter((photo) => photo.source !== 'video'));

  let selected = $state<string[]>([]);
  let comparing = $state(false);
  let viewingId = $derived(page.url.searchParams.get('photo'));
  let viewing = $derived(library.find((photo) => photo.id === viewingId) ?? null);
  let playing = $derived(viewing?.source === 'video' ? viewing : null);
  let ownerHref = $derived(viewing ? withSourceReturn(photoOwnerHref(viewing), page.url) : undefined);

  export const snapshot = {
    capture: () => ({ selected: [...selected], comparing }),
    restore: (value: { selected: string[]; comparing: boolean }) => {
      selected = value.selected;
      comparing = value.comparing;
    }
  };

  function viewPhoto(id: string | null) {
    const url = new URL(page.url);
    if (id) url.searchParams.set('photo', id);
    else url.searchParams.delete('photo');
    void replaceRoute(url, { noScroll: true, keepFocus: true });
  }

  let orderedSelected = $derived(orderAnchorsByJourney(selected, comparable));
  let pair = $derived(toComparePair(selected, comparable));

  let gapLabel = $derived.by(() => {
    if (!pair) return '';
    const duration = calendarDuration(comparable[pair.left].epochDay, comparable[pair.right].epochDay);
    return `${fmtDuration(duration)} ${m.apart_suffix()}`;
  });

  /* The measurement combined view (ticket 08): the same date range the two
     anchor photos span, so a number and an image answer "what changed"
     side by side. */
  let rangeQuery = liveList((j) =>
    pair
      ? j.measurements.getMeasurementsInRange(comparable[pair.left].epochDay, comparable[pair.right].epochDay)
      : Promise.resolve([])
  );
  let rangeMeasurements = $derived(rangeQuery.rows);

  let rangeSummaries = $derived.by(() => {
    const byType = new Map<string, Measurement[]>();
    for (const measurement of rangeMeasurements) {
      const list = byType.get(measurement.type) ?? [];
      list.push(measurement);
      byType.set(measurement.type, list);
    }
    // Ordered by the vocabulary's own order, hidden types included: a
    // range someone is comparing may still hold a measurement logged
    // against a type since hidden, and this summary reads it back
    // exactly as logged (CONTEXT: "Hidden").
    return vocabulary.measurementTypes
      .filter((t) => byType.has(t.key))
      .map((t) => {
        const list = byType.get(t.key)!;
        return { type: t.key, first: list[0], last: list[list.length - 1] };
      });
  });

  function toggle(id: string) {
    selected = toggleCompareAnchor(selected, id, comparable);
  }

  /* The wipe owns which two photographs it is showing and hands back the
     pair a press of its own earlier/later controls landed on; this screen
     holds them as ids, because the grid behind it is where they were
     picked and a live update can drop one of them. */
  function setPair(next: ComparePair) {
    selected = [comparable[next.left].id, comparable[next.right].id];
  }

  /* The mode control (ticket 11): a segmented Browse/Compare, matching how
     the voice screen switches its own tabs, in place of the primary button
     this used to be. "Compare" only ever takes hold once two photos are
     picked - same gate the button enforced by only rendering with a pair -
     so tapping it early is a no-op rather than a jump to a screen with
     nothing to show. */
  function setComparing(next: boolean) {
    if (next) {
      if (pair) comparing = true;
      // Else a no-op: nothing is ready to compare yet, and the segmented
      // control's own value (bound to `comparing`) simply does not move.
    } else {
      comparing = false;
      selected = [];
    }
  }

  let gridEl = $state<HTMLElement>();

  /* Whether the grid has been painted once. A tile that comes with the grid
     gets no entrance of its own, because the skeleton is already fading out
     over it (ReadGate, tests/feature-screens.test.ts); a tile that arrives
     afterwards - a chip widening, a photograph added while this screen is
     open - fades in. The effect runs after the flush that created those
     first tiles, so they read false and everything later reads true. */
  let painted = $state(false);
  $effect(() => {
    if (gridEl) painted = true;
  });

  /** Narrowing by a chip, as one move rather than a repaint: measure where
      the tiles stand, change the query, then walk the survivors back to
      where they were and release them (ADR-0078, motion/narrow.ts). The
      tiles the chip drops leave the flow in the same frame, so the grid
      rewraps once instead of twice. */
  async function pickChip(next: PhotoChip) {
    const before = measureCells(gridEl, 'data-photo-key');
    const url = new URL(page.url);
    if (next === 'everything') url.searchParams.delete(SOURCE_PARAM);
    else url.searchParams.set(SOURCE_PARAM, next);
    /* A navigation and not `replaceState`: shallow routing updates `history`
       and `page.state` and never `page.url` (kit's own client.js), so a chip
       read out of the query would never see its own write. A same-route
       navigation keeps this component and its selection, and `replaceRoute`
       is how the app replaces an entry rather than pushing one - it tells
       the back-depth count what SvelteKit cannot (smart-back.ts), so a chip
       press does not leave a screen behind for back to walk into. The scroll
       and the focus stay where the finger left them. */
    await replaceRoute(url, { noScroll: true, keepFocus: true });
    await tick();
    travelCells(before, gridEl, 'data-photo-key');
  }

  /* The scrubber appears once the grid is taller than the screen, which is
     the point at which scrolling to a year stops being something a thumb
     can do (the ticket's own rule). Measured rather than counted: how many
     thumbnails a screen holds depends on the width, the text size and
     whether the grid is narrowed. */
  let gridTall = $state(false);
  $effect(() => {
    const grid = gridEl;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      gridTall = grid.getBoundingClientRect().height > window.innerHeight;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  });

  function jumpToYear(id: string) {
    gridEl?.querySelector(`[data-photo-key="${id}"]`)?.scrollIntoView({
      behavior: isReducedMotion() ? 'auto' : 'smooth',
      block: 'start'
    });
  }

  /* Editing a single photo's day (ticket 47, ADR-0008/0015): every photo
     this app can normalize has had its capture date stripped on import, so
     this is the only place after the fact to say when one is really from -
     Persona 1's shoebox print, dated to 1994 rather than to the day it was
     scanned in. Held by id rather than by the photo object itself: the
     list is a live query, and re-opening the sheet after a write should
     read the row it just changed rather than a stale copy of it.

     Offered on an entry's and a milestone's photographs alone, because
     `epoch_day_override` is a column the `photo` table alone has: the other
     five tables date a row from the record it belongs to, and a photograph
     dated to its hair-removal session has no day of its own to override. */
  let dayEditorId = $state<string | null>(null);
  let dayEditorValue = $state('');

  const datedByItsOwner = (photo: LibraryPhoto) => photo.source === 'entry' || photo.source === 'milestone';

  function openDayEditor(photo: LibraryPhoto) {
    dayEditorId = photo.id;
    dayEditorValue = dateInputValueFromEpochDay(photo.epochDay);
  }

  async function saveDayEditor() {
    if (!dayEditorId) return;
    await journal.photos.setEpochDayOverride(dayEditorId, epochDayFromDateInputValueOrToday(dayEditorValue));
    dayEditorId = null;
  }

  const cellDate = (photo: LibraryPhoto) =>
    fmtDay(photo.epochDay, { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<div class="screen">
  {#if comparing && pair}
    <ScreenHeader title={m.ph_compare()} back={() => (comparing = false)} />
    <p class="compare-gap" data-compare-gap>{gapLabel}</p>
    <PhotoWipe
      photos={comparable}
      {pair}
      onPair={setPair}
      role={roleAt(activeFlag.roles, 0)}
      date={(photo) => fmtDay(photo.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
      note={photoOwnerLine}
    />
    {#if rangeSummaries.length}
      <SectionHeading text={m.ph_measurements_title()} />
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each rangeSummaries as s (s.type)}
          <ListRow
            static
            data-range-measurement={s.type}
            title={vocabulary.measurementTypeName(s.type)}
            subtitle={s.first.id === s.last.id
              ? `${s.first.value} ${s.first.unit}`
              : `${s.first.value} ${s.first.unit} → ${s.last.value} ${s.last.unit}`}
          />
        {/each}
      </ListCard>
    {/if}

    <div>
      <button class="btn btn-soft press" data-photos-back-to-all onclick={() => setComparing(false)}>
        <span>{m.ph_back_to_all()}</span>
      </button>
    </div>
  {:else}
    <ScreenHeader title={m.progress_photos()} back="/more" />
    <div class="screen-part">
      <Segmented
        name={m.progress_photos()}
        options={[
          { value: 'browse', label: m.ph_tab_browse() },
          { value: 'compare', label: m.ph_tab_compare() }
        ]}
        value={comparing && pair ? 'compare' : 'browse'}
        onChange={(v) => setComparing(v === 'compare')}
        compact
        key="photos-tab"
      />
    </div>
    <ReadGate read={libraryQuery} variant="block" count={2}>
      {#snippet rows()}
        <PhotoChipRow {chips} {chip} onPick={pickChip} />
        {#if comparing && !pair}
          <!-- Reachable when a live update drops one of the two anchors
               while the full compare view is open (code review, ticket 11):
               `comparing` survives the fall back to this grid, but this
               branch never draws the compare view, so the segmented control
               above reads its value off `comparing && pair` rather than
               `comparing` alone - otherwise it would say "Compare" over a
               screen showing the grid and this very reset notice. -->
          <p class="muted small" style="margin-bottom:var(--space-2)">{m.ph_compare_reset()}</p>
        {/if}
        <p class="photo-count" data-photo-count>{m.ph_count({ count: shown.length })}</p>
        <p class="muted small" style="margin-bottom:var(--space-4)">
          {orderedSelected.length === 0
            ? m.ph_pick_two()
            : orderedSelected.length === 1
              ? m.ph_one_selected()
              : m.ph_two_selected()}
        </p>
        <div class="photo-library">
          <div class="photo-grid" bind:this={gridEl}>
            {#each shown as p (p.id)}
              <div class="photo-cell-wrap" data-photo-key={p.id} data-photo-source={p.source} in:tileIn={{ when: painted }} out:pinnedOut>
                {#if p.source === 'video'}
                  <!-- A note plays rather than being picked, and its tile
                       draws no still: the bytes are up to 10MiB apiece
                       (videoNotes/limits.ts) and decoding one per tile to
                       show a frame nobody asked for is the cost the
                       thumbnail pipeline exists to avoid. The glyph is the
                       affordance; the note itself opens in the app's own
                       player. -->
                  <button
                    class="photo-cell"
                    data-photo-video={p.id}
                    data-photo-view={p.id}
                    aria-label={m.ph_video_open({ date: cellDate(p) })}
                    onclick={() => viewPhoto(p.id)}
                  >
                    <span class="photo-thumb photo-video-thumb">
                      <Icon name="play" size={26} />
                      <span class="photo-label">{photoSourceLabel(p.source)}</span>
                    </span>
                    <span class="photo-date">{fmtDay(p.epochDay, { month: 'short', year: '2-digit' })}</span>
                  </button>
                {:else}
                  <div class="photo-cell-controls">
                  <button
                    class="photo-cell"
                    data-photo-cell
                    class:is-selected={orderedSelected.includes(p.id)}
                    aria-pressed={orderedSelected.includes(p.id)}
                    aria-label={m.ph_cell_aria_sourced({ source: photoSourceLabel(p.source), date: cellDate(p) })}
                    onclick={() => toggle(p.id)}
                  >
                    <PhotoThumb photo={p} size={104} label={photoSourceLabel(p.source)} />
                    <span class="photo-date">{fmtDay(p.epochDay, { month: 'short', year: '2-digit' })}</span>
                    {#if orderedSelected.includes(p.id)}<span class="photo-check"><Icon name="check" size={14} /></span>{/if}
                  </button>
                  {#if datedByItsOwner(p)}
                    <button class="photo-edit-day" data-photo-edit-day aria-label={m.ph_edit_day()} onclick={() => openDayEditor(p)}>
                      <Icon name="calendar" size={14} />
                    </button>
                  {/if}
                  </div>
                  <button class="btn btn-soft press photo-view-action" data-photo-view={p.id} onclick={() => viewPhoto(p.id)}>{m.photo_library_view()}</button>
                {/if}
              </div>
            {/each}
          </div>
          {#if gridTall && marks.length}
            <div class="photo-years" data-photo-years>
              <div class="photo-years-inner" role="group" aria-label={m.ph_years_label()}>
                {#each marks as mark (mark.year)}
                  <button
                    class="photo-year"
                    data-photo-year={mark.year}
                    aria-label={m.ph_year_jump({ year: mark.year })}
                    onclick={() => jumpToYear(mark.id)}
                  >
                    {mark.year}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        <div>
          <a class="btn btn-soft press" href="/media/photos/export" data-journey-export>
            <Icon name="image" size={20} /><span>{m.pj_open()}</span>
          </a>
        </div>
      {/snippet}
      {#snippet empty()}
        <div class="screen-part">
          <Notice
            icon="image"
            key="photos-empty"
            role={roleAt(activeFlag.roles, 0)}
            title={m.ph_empty_title()}
            text={m.ph_empty_body()}
          />
        </div>
      {/snippet}
    </ReadGate>
  {/if}

  <SourceRecordHandoff id={viewingId} ready={!libraryQuery.loading && !libraryQuery.failed} found={!!viewing} />
  <PhotoViewer photo={viewing?.source !== 'video' ? viewing : null} {ownerHref} onClose={() => viewPhoto(null)} />

  <Sheet open={playing !== null} title={m.ph_video_title()} onClose={() => viewPhoto(null)}>
    {#if playing}
      <h3>{m.ph_video_title()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.ph_video_grid_hint()}</p>
      <VideoNotePlayer fileName={playing.fileName} />
      <a class="btn btn-soft press" data-photo-owner href={ownerHref}>{m.photo_open_owner()}</a>
    {/if}
  </Sheet>

  <Sheet open={dayEditorId !== null} title={m.photo_day_edit_title()} onClose={() => (dayEditorId = null)}>
    {#if dayEditorId !== null}
      <h3>{m.photo_day_edit_title()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.photo_day_edit_hint()}</p>
      <Field label={m.photo_day_label()} id="photo-day-edit">
        {#snippet children(id)}
          <DatePicker name="photo-day-edit" bind:value={dayEditorValue} {id} />
        {/snippet}
      </Field>
      <button class="btn btn-primary press" data-photo-day-edit-save onclick={saveDayEditor}>
        <span>{m.photo_day_edit_save()}</span>
      </button>
    {/if}
  </Sheet>
</div>

<style>
  /* The day-edit affordance on a browse cell (ticket 47): a sibling of
     .photo-cell rather than a change to it, so export/+page.svelte's own
     .photo-cell button - screens.css's shared class - keeps meaning
     exactly what it always has there.

     Sized and lifted the same way .starred-photo-unstar already solves
     the identical problem (screens.css): a real button here needs the
     full --touch-target hit area, but a 44px disc would swallow half the
     104px cell, so the tap target and the visual circle are two
     differently-sized boxes - the outer button transparent and centred
     on the corner, the smaller ::before disc carrying the surface fill
     and the shadow that lifts it off whatever the photo underneath
     happens to be. */
  .photo-cell-controls { position: relative; }
  .photo-view-action { width: 100%; margin-top: var(--space-3); }
  .photo-edit-day {
    position: absolute; bottom: -8px; left: -8px;
    width: var(--touch-target); height: var(--touch-target);
    border: none; cursor: pointer; background: none; color: var(--text-1);
    display: flex; align-items: center; justify-content: center;
  }
  .photo-edit-day :global(.icon) { position: relative; }
  .photo-edit-day::before {
    content: '';
    position: absolute; inset: 0; margin: auto;
    width: 22px; height: 22px; border-radius: 50%;
    /* The same disc as .starred-photo-unstar::before in screens.css, and
       the same trade: an edge rather than the app's second elevation. */
    background: var(--surface); border: 1px solid var(--outline);
  }

  /* The year rail, over the grid rather than beside it. Beside it was the
     first shape and it cost a column: the rail plus its gap is about 48px,
     which at 390px takes `repeat(auto-fill, minmax(104px, 1fr))` from three
     tracks to two. So the rail is taken out of the flow and hangs into the
     screen's own side padding, which leaves about 20px of it over the last
     column - the scrubber's usual place in a photo grid, and the reference
     this came from (corner, Mobbin).

     Sticky inside an absolutely positioned full-height box: the box gives
     the rail the grid's own top and bottom to stick between, so it arrives
     with the grid and leaves with it rather than riding the whole screen. */
  .photo-library { position: relative; }
  .photo-years {
    position: absolute;
    top: 0; bottom: 0; right: 0;
    pointer-events: none;
  }
  .photo-years-inner {
    position: sticky; top: var(--space-4);
    display: flex; flex-direction: column; gap: var(--space-1);
    pointer-events: auto;
  }
  /* A year stands on a photograph, so it carries its own surface the way
     every other control that does already has to (.photo-edit-day above,
     .starred-photo-unstar in screens.css): an edge and a fill, never a
     shadow and never a tint of the picture underneath. */
  .photo-year {
    position: relative;
    min-height: 28px; min-width: 40px;
    padding: 0 var(--space-2);
    border: 1px solid var(--outline); border-radius: var(--radius-pill);
    background: var(--surface); cursor: pointer;
    font: inherit; font-size: var(--text-xs); font-variant-numeric: tabular-nums;
    color: var(--text-2);
  }
  /* The pill is 28px, which is under the 48px floor, so the target is
     extended past it by a transparent overlay - the trick `.tag-chip::after`
     plays for the same reason (components.css), which is also why the pill
     above carries `position: relative` as its first line. The rail's own 4px
     gap keeps two stacked targets from meeting. */
  .photo-year::after { content: ''; position: absolute; inset: -10px 0; }
  .photo-year:hover { color: var(--text-1); border-color: var(--accent-border); }

  /* A video note's tile. Flat rather than the hue a photograph's
     placeholder takes (PhotoThumb.svelte), because this one is not a
     photograph waiting to load: it is what a video note looks like. */
  .photo-video-thumb {
    background: var(--surface-2);
    color: var(--text-2);
    width: 100%;
    aspect-ratio: 1;
  }

  .photo-count {
    font-size: var(--text-sm);
    color: var(--text-1);
    margin: 0 0 var(--space-1);
  }

  /* The two-up grid this screen drew before redesign ticket 55 went with
     the wipe that replaced it, `.compare-wrap`/`.compare-side` and all:
     both halves of that comparison now live inside PhotoWipe.svelte, which
     is also where the fallback for two photographs it cannot wipe between
     is drawn. */
</style>
