<script lang="ts">
  /* The progress-photo journey export, on the surface kit (phase 5 UX
     ticket 25).

     Three cards became three named areas. Each of them held one control
     and a line of hint under a `.row-title` borrowed from a list row, so
     the screen read as three boxes of settings rather than as a range, a
     choice and a result - and the preview, which is the only thing on the
     screen worth looking at, was boxed at the same weight as the two
     controls above it. It sits on the page now at the width of the screen,
     which is also the width the collage was made at. */
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import {
    customInclusiveRange,
    dateInputValueFromEpochDay,
    dayRangeEndMin,
    dayRangeStartMax,
    epochDayFromDateInputValue
  } from '$lib/data/epochDay';
  import {
    journeyFileName,
    journeyRangeBounds,
    journeySelection,
    timelapseDurationMs,
    type JourneyOutput
  } from '$lib/data/photos/journey';
  import {
    recordTimelapse,
    renderCollage,
    timelapseSupported,
    JOURNEY_SURROUND,
    type JourneyFrame
  } from '$lib/data/photos/journey-render';
  import {
    chipsFor,
    narrowTo,
    photoChipFromQuery,
    type PhotoChip
  } from '$lib/data/photos/library';
  import { photoSourceLabel } from '$lib/data/vocabulary/photoLibraryLabels';
  import { measureCells, pinnedOut, tileIn, travelCells } from '$lib/motion/narrow';
  import Progress from '$lib/components/Progress.svelte';
  import { createProgress } from '$lib/components/progress.svelte';
  import { deliverBlob } from '$lib/data/archive/deliver';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { readPhoto } from '$lib/stores/photoFiles';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import VideoNotePlayer from '$lib/components/VideoNotePlayer.svelte';
  import PhotoChipRow from '$lib/components/PhotoChipRow.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Ticket 27. Two steps, deliberately not one: this screen makes a file and
     holds it, and it takes a second press to hand that file to the share
     sheet. Nothing here writes to storage - the collage exists in a Blob
     until somebody shares it or leaves the screen, which is what keeps the
     export off the device unless a person asked for it. */

  /* The whole library (phase 11 ticket 14), minus its video notes: a
     collage and a timelapse are made by decoding each frame as a
     photograph (journey-render.ts), and a note's `.webm` is not one. So
     the grid below reads every photograph the journal holds - hair,
     tryouts, surgery recovery included - and the chip row narrows it, but
     Video is never one of the chips here. */
  let libraryQuery = liveList((j) => j.photoLibrary.inJournal());
  let photos = $derived(libraryQuery.rows.filter((photo) => photo.source !== 'video'));
  let bounds = $derived(journeyRangeBounds(photos));

  let startInput = $state('');
  let endInput = $state('');
  let excluded = $state<string[]>([]);
  let output = $state<JourneyOutput>('collage');

  /** The same query parameter the library reads, so a chip survives the
      trip between the two screens (library.ts, media/photos/+page.svelte). */
  const SOURCE_PARAM = 'source';
  let gridEl = $state<HTMLElement>();

  /* The same gate the library keeps on its own tiles, and for the same
     reason: the tiles that come with the grid get no entrance, the ones a
     chip brings in afterwards fade (motion/narrow.ts). */
  let painted = $state(false);
  $effect(() => {
    if (gridEl) painted = true;
  });

  /** Narrowing moves the grid rather than repainting it, the same three
      frames the library's own chip row plays (ADR-0078, motion/narrow.ts). */
  async function pickChip(next: PhotoChip) {
    const before = measureCells(gridEl, 'data-photo-key');
    const url = new URL(page.url);
    if (next === 'everything') url.searchParams.delete(SOURCE_PARAM);
    else url.searchParams.set(SOURCE_PARAM, next);
    replaceState(url, page.state);
    await tick();
    travelCells(before, gridEl, 'data-photo-key');
  }

  let running = $state(false);
  /* The shared bar (ADR-0070). This screen had the app's only honest
     (done, total) already and was spending it on button-label text; what
     it gains here is the bar, the throttle and the hold at full. */
  const progress = createProgress();
  let made = $state.raw<{ blob: Blob; from: string } | null>(null);
  let previewUrl = $state<string | null>(null);

  // MediaRecorder is missing on Safari, which has no WebM encoder. Read once
  // rather than per render: it cannot change while the screen is open.
  const canRecord = timelapseSupported();

  /* The picker opens on the whole journey, once there is a journey to open
     on. Guarded on the inputs being empty so it seeds rather than resets:
     a live query that re-runs after a photo is added must not throw away
     the range somebody typed. */
  $effect(() => {
    if (!bounds || (startInput && endInput)) return;
    startInput = dateInputValueFromEpochDay(bounds.start);
    endInput = dateInputValueFromEpochDay(bounds.end);
  });

  let range = $derived(customInclusiveRange(epochDayFromDateInputValue(startInput), epochDayFromDateInputValue(endInput)));

  /* The grid shows everything in the range and the export takes what has not
     been tapped out, so both go through journeySelection() rather than one of
     them repeating the range test.

     The chip sits between the two: it says which photographs this export is
     of, and tapping a tile out says which of those to leave behind. Its
     chips come from what the range actually holds, so narrowing to Hair
     over a fortnight with no hair photographs in it is not something this
     screen can offer. */
  let inRange = $derived(range ? journeySelection(photos, range, []) : []);
  let chips = $derived(chipsFor(inRange));
  let requested = $derived(photoChipFromQuery(page.url.searchParams.get(SOURCE_PARAM)));
  let chip = $derived(chips.includes(requested) ? requested : 'everything');
  let shown = $derived(narrowTo(inRange, chip));
  let selected = $derived(shown.filter((photo) => !excluded.includes(photo.id)));
  let seconds = $derived(Math.max(1, Math.round(timelapseDurationMs(selected.length) / 1000)));

  /* What a finished export was made from. Changing the range, tapping a
     photo out or switching to the other output puts the picker back rather
     than leaving a preview that no longer shows what is selected. */
  let recipe = $derived(`${output}:${selected.map((photo) => photo.id).join(',')}`);
  let showing = $derived(made && made.from === recipe ? made : null);

  const dateOf = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  function toggle(id: string) {
    excluded = excluded.includes(id) ? excluded.filter((other) => other !== id) : [...excluded, id];
  }

  /* One object URL at a time, revoked when the blob it points at is
     replaced or the screen closes - a preview per attempt otherwise leaks
     one blob each. */
  $effect(() => {
    const blob = showing?.blob;
    if (!blob) {
      previewUrl = null;
      return;
    }
    const url = URL.createObjectURL(blob);
    previewUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  /* The grid above can be several screens tall, so a finished export off the
     bottom of it reads as nothing having happened. */
  function reveal(node: HTMLElement) {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
  }

  async function make() {
    const frames: JourneyFrame[] = selected.map((photo) => ({
      fileName: photo.fileName,
      caption: dateOf(photo.epochDay)
    }));

    const from = recipe;
    /* Live only while an export is being made, so the stop button on the
       bar and the render loop are talking about the same run.

       A fourth cancellable operation beyond the three phase-9 audit ticket
       11 enumerates, and deliberately: this screen already shipped a stop
       button, and it sits squarely inside ADR-0070's own rule, which
       decides cancel by whether the journal has been written to rather
       than by which operation is running. Rendering a collage writes
       nothing anywhere. Taking the button away to match a list would have
       been a regression dressed as compliance. */
    const controller = new AbortController();
    running = true;
    made = null;
    progress.start({ onCancel: () => controller.abort() });
    progress.report(0, frames.length);
    try {
      const options = {
        onProgress: (done: number, total: number) => progress.report(done, total),
        signal: controller.signal
      };
      const blob =
        output === 'collage'
          ? await renderCollage(frames, readPhoto, options)
          : await recordTimelapse(frames, readPhoto, options);
      // Before the preview replaces the picker, so the bar is not cut off
      // mid-thought by the thing it was counting down to (ADR-0070).
      await progress.finish();
      made = { blob, from };
    } catch (error) {
      progress.abandon();
      // A cancelled export is an answer, not a failure: the person pressed
      // stop and the screen going back to the picker says so by itself.
      if (!controller.signal.aborted) {
        console.error(`the ${output} export failed`, error);
        toast(m.pj_failed());
      }
    } finally {
      running = false;
    }
  }

  /* The only thing on this screen that sends anything anywhere, and it goes
     through the same share sheet the archive exports use (deliver.ts). It
     deliberately does not stamp lastBackupAt: a collage is not a copy of the
     journal, and Home must not tell anyone their journal is safe on it. */
  async function share() {
    if (!showing) return;
    try {
      const delivery = await deliverBlob(journeyFileName(prefs.name, output), showing.blob);
      if (delivery === 'cancelled') {
        toast(m.exp_cancelled());
        return;
      }
      toast(delivery === 'shared' ? m.pj_shared() : m.pj_downloaded());
    } catch (error) {
      console.error('sharing the journey export failed', error);
      toast(m.pj_failed());
    }
  }
</script>

<div class="screen">
  <ScreenHeader title={m.pj_title()} back="/media/photos" />

  <ReadGate read={libraryQuery} variant="block" count={2}>
    {#snippet rows()}
      <div class="screen-part">
        <SectionHeading text={m.pj_range_title()} />
        <div class="compare-picker-grid">
          <label for="pj-start">{m.recap_custom_start_label()}</label>
          <DatePicker id="pj-start" max={dayRangeStartMax(endInput)} bind:value={startInput} />
          <label for="pj-end">{m.recap_custom_end_label()}</label>
          <DatePicker id="pj-end" min={dayRangeEndMin(startInput)} bind:value={endInput} />
        </div>
        <PhotoChipRow {chips} {chip} onPick={pickChip} />

        <p class="muted small">
          {#if !range}
            {m.recap_custom_range_required()}
          {:else if selected.length === 0}
            {m.pj_none_in_range()}
          {:else}
            {m.pj_count({ count: selected.length })} {m.pj_leave_out_hint()}
          {/if}
        </p>

        {#if shown.length}
          <div class="photo-grid" bind:this={gridEl}>
            {#each shown as p (p.id)}
              {@const included = !excluded.includes(p.id)}
              <div class="photo-cell-wrap" data-photo-key={p.id} data-photo-source={p.source} in:tileIn={{ when: painted }} out:pinnedOut>
                <button
                  class="photo-cell"
                  class:is-selected={included}
                  aria-pressed={included}
                  aria-label={m.ph_cell_aria_sourced({
                    source: photoSourceLabel(p.source),
                    date: fmtDay(p.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                  })}
                  onclick={() => toggle(p.id)}
                >
                  <PhotoThumb photo={p} size={104} label={photoSourceLabel(p.source)} />
                  <span class="photo-date">{fmtDay(p.epochDay, { month: 'short', year: '2-digit' })}</span>
                  {#if included}<span class="photo-check"><Icon name="check" size={14} /></span>{/if}
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <SectionHeading text={m.pj_output_title()} />
        {#if canRecord}
          <Segmented
            name={m.pj_output_title()}
            value={output}
            onChange={(v) => (output = v as JourneyOutput)}
            options={[
              { value: 'collage', label: m.pj_output_collage() },
              { value: 'timelapse', label: m.pj_output_timelapse() }
            ]}
            key="journey-output"
          />
        {/if}
        <p class="muted small">
          {#if output === 'collage'}
            {m.pj_collage_hint()}
            {#if !canRecord}{' '}{m.pj_timelapse_unavailable()}{/if}
          {:else}
            {m.pj_timelapse_hint()} {m.pj_timelapse_length({ n: seconds })}
          {/if}
        </p>

        {#if previewUrl && showing}
          <div class="journey-preview" use:reveal>
            {#if output === 'collage'}
              <img src={previewUrl} alt={m.pj_preview_collage_alt()} style:background={JOURNEY_SURROUND} />
            {:else}
              <!-- The app's own video player (ticket 46), not the browser's
                   transport: a timelapse this app just rendered is played
                   with the same control, scrub and materials as a video note
                   and a recording. The URL stays this screen's to revoke. -->
              <VideoNotePlayer src={previewUrl} />
            {/if}
            <p class="muted small">{m.pj_stays_here()}</p>
            <div class="journey-actions">
              <button class="btn btn-primary press" data-share onclick={share}>
                <Icon name="share" size={20} /><span>{m.pj_share()}</span>
              </button>
              <button class="btn btn-soft press" data-again onclick={() => (made = null)}>
                <span>{m.pj_again()}</span>
              </button>
            </div>
          </div>
        {:else}
          <SaveBar>
            <button class="btn btn-primary press" data-generate disabled={running || selected.length === 0} onclick={make}>
              <span>{m.pj_generate()}</span>
            </button>
          </SaveBar>
          <Progress run={progress} label={m.pj_running()} handle="journey" />
        {/if}
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="image"
          key="journey-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.ph_empty_title()}
          text={m.ph_empty_body()}
        />
      </div>
    {/snippet}
    {#snippet failed()}
      <div class="screen-part">
        <Notice
          icon="alert"
          key="journey-read-failed"
          role={roleAt(activeFlag.roles, 0)}
          title={m.pj_read_failed_title()}
          text={m.pj_read_failed_body()}
        />
      </div>
    {/snippet}
  </ReadGate>
</div>

<style>
  .journey-preview {
    margin-top: var(--space-4);
  }

  /* The collage only: a timelapse is VideoNotePlayer now (ticket 46), which
     brings its own frame and its own corner. */
  .journey-preview img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: var(--r-block);
  }
  .journey-actions {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
  .journey-actions .btn {
    flex: 1;
  }
</style>
