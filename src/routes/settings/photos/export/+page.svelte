<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValue } from '$lib/data/epochDay';
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
  import { deliverBlob } from '$lib/data/archive/deliver';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { readPhoto } from '$lib/stores/photoFiles';
  import { toast } from '$lib/stores/toasts.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  /* Ticket 27. Two steps, deliberately not one: this screen makes a file and
     holds it, and it takes a second press to hand that file to the share
     sheet. Nothing here writes to storage - the collage exists in a Blob
     until somebody shares it or leaves the screen, which is what keeps the
     export off the device unless a person asked for it. */

  let photosQuery = liveQuery(['photo', 'entry', 'milestone'], (j) => j.photos.inJournal());
  let photos = $derived(photosQuery.value ?? []);
  let bounds = $derived(journeyRangeBounds(photos));

  let startInput = $state('');
  let endInput = $state('');
  let excluded = $state<string[]>([]);
  let output = $state<JourneyOutput>('collage');

  let running = $state(false);
  let progress = $state<{ done: number; total: number } | null>(null);
  /* Live only while an export is being made, so the cancel button and the
     render loop are talking about the same run. */
  let attempt = $state.raw<AbortController | null>(null);
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

  let range = $derived.by(() => {
    const start = epochDayFromDateInputValue(startInput);
    const end = epochDayFromDateInputValue(endInput);
    return start != null && end != null && start <= end ? { start, end } : null;
  });

  /* The grid shows everything in the range and the export takes what has not
     been tapped out, so both go through journeySelection() rather than one of
     them repeating the range test. */
  let inRange = $derived(range ? journeySelection(photos, range, []) : []);
  let selected = $derived(range ? journeySelection(photos, range, excluded) : []);
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
    const controller = new AbortController();
    attempt = controller;
    running = true;
    made = null;
    progress = { done: 0, total: frames.length };
    try {
      const options = {
        onProgress: (done: number, total: number) => (progress = { done, total }),
        signal: controller.signal
      };
      const blob =
        output === 'collage'
          ? await renderCollage(frames, readPhoto, options)
          : await recordTimelapse(frames, readPhoto, options);
      made = { blob, from };
    } catch (error) {
      // A cancelled export is an answer, not a failure: the person pressed
      // stop and the screen going back to the picker says so by itself.
      if (!controller.signal.aborted) {
        console.error(`the ${output} export failed`, error);
        toast(m.pj_failed());
      }
    } finally {
      attempt = null;
      running = false;
      progress = null;
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
  <header class="screen-header">
    <a class="icon-btn" href="/settings/photos" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.pj_title()}</h1>
    <div class="header-action"></div>
  </header>

  {#if photosQuery.loading}
    <Skeleton variant="card" count={2} />
  {:else if photos.length === 0}
    <EmptyState title={m.ph_empty_title()} text={m.ph_empty_body()} />
  {:else}
    <div class="card">
      <span class="row-title">{m.pj_range_title()}</span>
      <div class="compare-picker-grid">
        <label for="pj-start">{m.recap_custom_start_label()}</label>
        <input class="input" id="pj-start" type="date" bind:value={startInput} max={endInput || undefined} />
        <label for="pj-end">{m.recap_custom_end_label()}</label>
        <input class="input" id="pj-end" type="date" bind:value={endInput} min={startInput || undefined} />
      </div>
      <p class="muted small" style="margin-top:var(--space-3)">
        {#if !range}
          {m.recap_custom_range_required()}
        {:else if selected.length === 0}
          {m.pj_none_in_range()}
        {:else}
          {m.pj_count({ count: selected.length })} {m.pj_leave_out_hint()}
        {/if}
      </p>
    </div>

    {#if inRange.length}
      <div class="photo-grid" style="margin-top:var(--space-4)">
        {#each inRange as p (p.id)}
          {@const included = !excluded.includes(p.id)}
          <button
            class="photo-cell"
            class:is-selected={included}
            aria-pressed={included}
            aria-label={m.ph_cell_aria({ date: fmtDay(p.epochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
            onclick={() => toggle(p.id)}
          >
            <PhotoThumb photo={p} size={104} />
            <span class="photo-date">{fmtDay(p.epochDay, { month: 'short', year: '2-digit' })}</span>
            {#if included}<span class="photo-check"><Icon name="check" size={14} /></span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    <div class="card" style="margin-top:var(--space-4)">
      <span class="row-title">{m.pj_output_title()}</span>
      {#if canRecord}
        <div style="margin-top:var(--space-3)">
          <Segmented
            name={m.pj_output_title()}
            value={output}
            onChange={(v) => (output = v as JourneyOutput)}
            options={[
              { value: 'collage', label: m.pj_output_collage() },
              { value: 'timelapse', label: m.pj_output_timelapse() }
            ]}
          />
        </div>
      {/if}
      <p class="muted small" style="margin-top:var(--space-3)">
        {#if output === 'collage'}
          {m.pj_collage_hint()}
          {#if !canRecord}{' '}{m.pj_timelapse_unavailable()}{/if}
        {:else}
          {m.pj_timelapse_hint()} {m.pj_timelapse_length({ n: seconds })}
        {/if}
      </p>
    </div>

    {#if previewUrl && showing}
      <div class="card journey-preview" style="margin-top:var(--space-4)" use:reveal>
        {#if output === 'collage'}
          <img src={previewUrl} alt={m.pj_preview_collage_alt()} style:background={JOURNEY_SURROUND} />
        {:else}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={previewUrl} controls playsinline muted style:background={JOURNEY_SURROUND}></video>
        {/if}
        <p class="muted small">{m.pj_stays_here()}</p>
        <div class="journey-actions">
          <button class="btn btn-primary" data-share onclick={share}>
            <Icon name="share" size={20} /><span>{m.pj_share()}</span>
          </button>
          <button class="btn btn-soft" data-again onclick={() => (made = null)}>
            <span>{m.pj_again()}</span>
          </button>
        </div>
      </div>
    {:else}
      <div class="editor-savebar journey-actions">
        <button class="btn btn-primary" data-generate disabled={running || selected.length === 0} onclick={make}>
          <span>{running && progress ? m.pj_progress({ done: progress.done, total: progress.total }) : m.pj_generate()}</span>
        </button>
        {#if attempt}
          <button class="btn btn-soft" data-stop onclick={() => attempt?.abort()}>
            <span>{m.pj_stop()}</span>
          </button>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .journey-preview img,
  .journey-preview video {
    display: block;
    width: 100%;
    height: auto;
    border-radius: var(--radius-md);
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
