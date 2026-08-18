<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { earliestHairTreatmentDoseEpochDay } from '$lib/data/hairTreatmentAnchor';
  import { isHairPhotoDue } from '$lib/data/hairPhotoSchedule';
  import { hairStageName } from '$lib/data/vocabulary/labels';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { HairStage, NorwoodHamiltonStage } from '$lib/data/types';
  import type { HairPhoto } from '$lib/data/journal/hairProgress';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import { capturePhoto, pickPhotos } from '$lib/stores/photoPicking';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  const NORWOOD_HAMILTON_STAGES: NorwoodHamiltonStage[] = ['1', '2', '2a', '3', '3v', '3a', '4', '4a', '5', '5a', '6', '7'];

  const today = todayEpochDay();

  let episodesQuery = liveQuery(['regimen'], (j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.value ?? []);

  /* Bounded from epoch day 0 rather than from the anchor itself: getDoses
     needs a range (doses.ts has no unbounded read), and chaining the range
     off `episodes` here would race this liveQuery against episodesQuery on
     a single regimen write, each async and neither guaranteed to see the
     other's latest value first. No dose can predate 1970-01-01, so this is
     unbounded in practice without the chain. */
  let dosesQuery = liveQuery(['dose'], (j) => j.doses.getDoses(0, today));
  let doses = $derived(dosesQuery.value ?? []);

  /* Ticket 09's own anchor: the first dose actually logged against
     finasteride, dutasteride or minoxidil - distinct from ticket 07's
     earliest-regimen-episode-overall anchor, and never guessed at when
     null (hairTreatmentAnchor.ts). */
  let anchorEpochDay = $derived(earliestHairTreatmentDoseEpochDay(doses, episodes));

  let stagesQuery = liveQuery(['hairProgress'], (j) => j.hairProgress.getStages());
  let stages = $derived(stagesQuery.value ?? []);

  let photosQuery = liveQuery(['hairProgress'], (j) => j.hairProgress.getPhotos());
  let photos = $derived(photosQuery.value ?? []);

  let lastPhotoEpochDay = $derived(photos.at(-1)?.epochDay ?? null);
  let photoDue = $derived(isHairPhotoDue(anchorEpochDay, lastPhotoEpochDay, today));

  /** Null with no anchor, or for a record dated before it - "since
      starting" has no honest answer for either. */
  function sinceStart(epochDay: number): string | null {
    if (anchorEpochDay == null || epochDay < anchorEpochDay) return null;
    const weeks = Math.floor((epochDay - anchorEpochDay) / 7);
    return m.hair_since_start({ weeks: m.n_weeks({ n: weeks }) });
  }

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /** The date, plus " · since starting" once an anchor makes that honest -
      composed here rather than as adjacent mustaches in the markup, so the
      separator's spacing does not depend on Svelte's block-boundary
      whitespace trimming. */
  function stageSubtitle(epochDay: number): string {
    const since = sinceStart(epochDay);
    return since ? `${dayLabel(epochDay)} · ${since}` : dayLabel(epochDay);
  }

  let stageEditor = $state<{ id?: string; date: string; stage: NorwoodHamiltonStage } | null>(null);
  let stageDeleteTarget = $state<HairStage | null>(null);

  function openStageEditor(existing: HairStage | null) {
    stageEditor = existing
      ? { id: existing.id, date: dateInputValueFromEpochDay(existing.epochDay), stage: existing.stage }
      : { date: dateInputValueFromEpochDay(today), stage: '1' };
  }

  async function saveStage() {
    if (!stageEditor) return;
    await journal.hairProgress.upsertStage({
      id: stageEditor.id,
      epochDay: epochDayFromDateInputValue(stageEditor.date) ?? today,
      stage: stageEditor.stage
    });
    stageEditor = null;
  }

  function askToDeleteStage() {
    if (!stageEditor?.id) return;
    stageDeleteTarget = stages.find((s) => s.id === stageEditor!.id) ?? null;
    if (stageDeleteTarget) stageEditor = null;
  }

  async function deleteStage() {
    if (!stageDeleteTarget) return;
    const id = stageDeleteTarget.id;
    stageDeleteTarget = null;
    await journal.hairProgress.deleteStage(id);
  }

  let photoDeleteTarget = $state<HairPhoto | null>(null);

  async function storePhoto(photo: NormalizedPhoto | null) {
    if (!photo) return;
    await journal.hairProgress.addPhoto(today, photo);
  }

  async function pickHairPhoto() {
    const [photo] = await pickPhotos(1);
    await storePhoto(photo ?? null);
  }

  async function captureHairPhoto() {
    await storePhoto(await capturePhoto());
  }

  async function deletePhoto() {
    if (!photoDeleteTarget) return;
    const id = photoDeleteTarget.id;
    photoDeleteTarget = null;
    await journal.hairProgress.deletePhoto(id);
  }

  function dismissProtocol() {
    prefs.hairPhotoProtocolDismissed = true;
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.hair_progress()}</h1>
  </header>

  <p class="muted small" style="margin-bottom:var(--space-4)">{m.hair_intro()}</p>

  {#if episodesQuery.loading || dosesQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else}
    {#if anchorEpochDay == null}
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.hair_unanchored_note()}</p>
    {/if}

    <SectionTitle text={m.hair_stage_section_title()}>
      {#snippet aside()}
        <button class="icon-btn" data-add-stage aria-label={m.hair_stage_add_aria()} onclick={() => openStageEditor(null)}>
          <Icon name="plus" size={18} />
        </button>
      {/snippet}
    </SectionTitle>

    {#if stagesQuery.loading}
      <Skeleton variant="line" count={2} />
    {:else if stages.length}
      <div class="list-group">
        {#each [...stages].reverse() as s (s.id)}
          <button
            class="list-row"
            data-hair-stage={s.id}
            aria-label={m.hair_stage_row_aria({ stage: hairStageName(s.stage), date: dayLabel(s.epochDay) })}
            onclick={() => openStageEditor(s)}
          >
            <span class="row-text">
              <span class="row-title">{hairStageName(s.stage)}</span>
              <span class="row-subtitle">{stageSubtitle(s.epochDay)}</span>
            </span>
            <Icon name="pencil" size={18} />
          </button>
        {/each}
      </div>
    {:else}
      <EmptyState title={m.hair_stage_empty_title()} text={m.hair_stage_empty_body()}>
        {#snippet action()}
          <button class="btn btn-soft" onclick={() => openStageEditor(null)}><span>{m.hair_stage_empty_action()}</span></button>
        {/snippet}
      </EmptyState>
    {/if}

    <SectionTitle text={m.hair_photo_section_title()} />

    {#if photoDue}
      <div class="card" data-photo-due style="margin-bottom:var(--space-3)">
        <h3>{m.hair_photo_due_title()}</h3>
        <p class="muted small">{m.hair_photo_due_body()}</p>
      </div>
    {/if}

    {#if !prefs.hairPhotoProtocolDismissed}
      <div class="card" data-protocol style="margin-bottom:var(--space-3)">
        <div class="spread">
          <h3>{m.hair_photo_protocol_title()}</h3>
          <button class="icon-btn" aria-label={m.hair_photo_protocol_dismiss_aria()} onclick={dismissProtocol}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <p class="muted small">{m.hair_photo_protocol_body()}</p>
      </div>
    {/if}

    <div class="photo-row" style="margin-bottom:var(--space-4)">
      <button class="photo-add" aria-label={m.add_photo()} onclick={pickHairPhoto}>
        <Icon name="image" size={20} /><span>{m.add_photo()}</span>
      </button>
      <button class="photo-add" aria-label={m.add_photo_camera()} onclick={captureHairPhoto}>
        <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
      </button>
    </div>

    {#if photosQuery.loading}
      <Skeleton variant="line" count={2} />
    {:else if photos.length}
      <div class="list-group">
        {#each [...photos].reverse() as p (p.id)}
          {@const since = sinceStart(p.epochDay)}
          <div class="list-row" data-hair-photo={p.id} aria-label={m.hair_photo_row_aria({ date: dayLabel(p.epochDay) })}>
            <PhotoThumb photo={p} size={48} />
            <span class="row-text">
              <span class="row-title">{dayLabel(p.epochDay)}</span>
              {#if since}<span class="row-subtitle">{since}</span>{/if}
            </span>
            <button class="icon-btn" aria-label={m.hair_photo_delete_sheet()} onclick={() => (photoDeleteTarget = p)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <EmptyState title={m.hair_photo_empty_title()} text={m.hair_photo_empty_body()} />
    {/if}
  {/if}

  <Sheet
    open={stageEditor !== null}
    title={stageEditor?.id ? m.hair_stage_edit_sheet() : m.hair_stage_new_sheet()}
    onClose={() => (stageEditor = null)}
  >
    {#if stageEditor}
      <h3>{stageEditor.id ? m.hair_stage_edit_sheet() : m.hair_stage_new_sheet()}</h3>
      <div class="field">
        <label class="field-label" for="hair-stage-date">{m.hair_stage_date_label()}</label>
        <input class="input" type="date" id="hair-stage-date" name="hair-stage-date" bind:value={stageEditor.date} />
      </div>
      <div class="field">
        <label class="field-label" for="hair-stage-value">{m.hair_stage_label()}</label>
        <select class="input" id="hair-stage-value" bind:value={stageEditor.stage}>
          {#each NORWOOD_HAMILTON_STAGES as st (st)}
            <option value={st}>{hairStageName(st)}</option>
          {/each}
        </select>
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-hair-stage onclick={saveStage}><span>{m.hair_stage_save()}</span></button>
        {#if stageEditor.id}
          <button class="btn btn-ghost" data-delete-hair-stage onclick={askToDeleteStage}><span>{m.hair_stage_delete()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={stageDeleteTarget !== null} title={m.hair_stage_delete_sheet()} onClose={() => (stageDeleteTarget = null)}>
    {#if stageDeleteTarget}
      <h3>{m.hair_stage_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.hair_stage_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-hair-stage onclick={deleteStage}><span>{m.hair_stage_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (stageDeleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet open={photoDeleteTarget !== null} title={m.hair_photo_delete_sheet()} onClose={() => (photoDeleteTarget = null)}>
    {#if photoDeleteTarget}
      <h3>{m.hair_photo_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.hair_photo_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" data-confirm-delete-hair-photo onclick={deletePhoto}><span>{m.hair_photo_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (photoDeleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
