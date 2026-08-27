<script lang="ts">
  /* Staging against a published scale, and fixed-position photos, on the
     surface kit (phase 5 UX ticket 25).

     Three of this screen's four cards were saying something rather than
     holding something - where the week count is measured from, that a
     photo is due, and how to take one so two of them compare. All three
     are notices now, which is the surface for a remark with at most one
     action on it, and the protocol's dismiss is the notice's own rather
     than an icon button wired into a header row. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { hairAnchorEpochDay } from '$lib/data/hairAnchor';
  import { isHairPhotoDue } from '$lib/data/hairPhotoSchedule';
  import { hairScaleName, hairScaleSub, hairStageName } from '$lib/data/vocabulary/labels';
  import { HAIR_SCALES, gradesOfScale, isGradedScale, stagesByScale } from '$lib/data/hairStageScales';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { HairStage } from '$lib/data/types';
  import type { HairPhoto } from '$lib/data/journal/hairProgress';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import { pickPhotos } from '$lib/stores/photoPicking';
  import { photoReview } from '$lib/stores/photoReview.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Two areas, two stripes: the staging and the photographs. The notices
     that talk about the app rather than about the journal take no role at
     all, which is the call Home's backup notice makes. */
  const SECTION_ROLE = { stages: 0, photos: 1 };

  const today = todayEpochDay();

  /* Bounded from epoch day 0 rather than from the anchor itself: getDoses
     needs a range (doses.ts has no unbounded read). No dose can predate
     1970-01-01, so this is unbounded in practice. */
  let dosesQuery = liveQuery(['dose'], (j) => j.doses.getDoses(0, today));
  let doses = $derived(dosesQuery.value ?? []);

  /* The day this screen counts weeks from: whatever the person set, else
     their earliest logged dose of anything, else nothing (hairAnchor.ts,
     ticket 33). No drug is named - ticket 09's finasteride/dutasteride/
     minoxidil list is gone. */
  let anchorEpochDay = $derived(hairAnchorEpochDay(prefs.hairAnchorEpochDay, doses));
  let anchorIsUserSet = $derived(prefs.hairAnchorEpochDay !== null);

  let stagesQuery = liveQuery(['hairProgress'], (j) => j.hairProgress.getStages());
  let stages = $derived(stagesQuery.value ?? []);

  /* Grouped so that no list, and no run of subtitles, ever reads as one
     series across two scales (ticket 33, hairStageScales.ts). Newest first
     within each scale, which is the order the single list used to be in. */
  let stageGroups = $derived(stagesByScale([...stages].reverse()));

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

  let anchorEditor = $state<string | null>(null);

  function openAnchorEditor() {
    anchorEditor = dateInputValueFromEpochDay(prefs.hairAnchorEpochDay ?? anchorEpochDay ?? today);
  }

  function saveAnchor() {
    if (anchorEditor === null) return;
    // A date input the person cleared reads as null, which is this
    // preference's own "not set" - so an empty field saves as unset rather
    // than silently keeping the old day.
    prefs.hairAnchorEpochDay = epochDayFromDateInputValue(anchorEditor);
    anchorEditor = null;
  }

  function clearAnchor() {
    prefs.hairAnchorEpochDay = null;
    anchorEditor = null;
  }

  /* `scale` starts null on a new staging and the save button stays disabled
     until it is picked. No scale is preselected on purpose: defaulting to
     either one would be the app guessing which pattern the person has, which
     is the assumption ticket 33 exists to remove. */
  let stageEditor = $state<{ id?: string; date: string; scale: string | null; stage: string; description: string } | null>(
    null
  );
  let stageDeleteTarget = $state<HairStage | null>(null);

  function openStageEditor(existing: HairStage | null) {
    stageEditor = existing
      ? {
          id: existing.id,
          date: dateInputValueFromEpochDay(existing.epochDay),
          scale: existing.scale,
          stage: existing.stage,
          description: existing.description
        }
      : { date: dateInputValueFromEpochDay(today), scale: null, stage: '', description: '' };
  }

  /** Picking a scale clears both the grade and the prose rather than
      carrying either over. The two scales share codes and mean different
      things by them, so a kept '3' would silently become a different claim
      (hairStageScales.ts) - and prose has nowhere to live on a graded scale,
      so clearing it here is what stops a person's own words disappearing
      between the sheet and the save (hairProgress.ts's checkedStaging drops
      it either way). */
  function pickScale(scale: string) {
    if (!stageEditor || stageEditor.scale === scale) return;
    stageEditor.scale = scale;
    stageEditor.stage = gradesOfScale(scale)[0] ?? '';
    stageEditor.description = '';
  }

  async function saveStage() {
    if (!stageEditor?.scale) return;
    await journal.hairProgress.upsertStage({
      id: stageEditor.id,
      epochDay: epochDayFromDateInputValue(stageEditor.date) ?? today,
      scale: stageEditor.scale,
      stage: stageEditor.stage,
      description: stageEditor.description
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

  // The context is the hair-progress log as a whole - a schedule, not a
  // single dated entry - so its last photo is the log's last one, already
  // loaded above for photoDue.
  const hairPhotoReview = photoReview(
    () => (photos.length ? { fileName: photos[photos.length - 1].fileName } : null),
    storePhoto
  );

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
  <ScreenHeader title={m.hair_progress()} back="/more" subtitle={m.hair_intro()} />

  {#if dosesQuery.loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else}
    <div data-anchor>
      <Notice
        icon="clock"
        key="hair-anchor"
        text={anchorEpochDay == null
          ? m.hair_unanchored_note()
          : anchorIsUserSet
            ? m.hair_anchor_from_set({ date: dayLabel(anchorEpochDay) })
            : m.hair_anchor_from_dose({ date: dayLabel(anchorEpochDay) })}
        action={{
          label: anchorIsUserSet ? m.hair_anchor_change_action() : m.hair_anchor_set_action(),
          onclick: openAnchorEditor
        }}
      />
    </div>

    <SectionHeading text={m.hair_stage_section_title()}>
      {#snippet action()}
        <button class="icon-btn press" data-add-stage aria-label={m.hair_stage_add_aria()} onclick={() => openStageEditor(null)}>
          <Icon name="plus" size={20} />
        </button>
      {/snippet}
    </SectionHeading>

    {#if stagesQuery.loading}
      <div out:crossfade><Skeleton variant="line" count={2} /></div>
    {:else if stages.length}
      <div class="screen-part">
        {#each stageGroups as group (group.scale)}
          <!-- Each scale keeps its own card and its own name above it. A run
               of subtitles across two scales reads as one series, which is
               the thing ticket 33 split these groups apart to stop. -->
          <p class="hair-scale-name" data-scale-group={group.scale}>{hairScaleName(group.scale)}</p>
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.stages)}>
            {#each group.stages as s (s.id)}
              {@const graded = isGradedScale(s.scale)}
              <ListRow
                key={s.id}
                data-hair-stage={s.id}
                icon="comb"
                title={graded ? hairStageName(s.scale, s.stage) : s.description || m.hair_other_unwritten()}
                subtitle={stageSubtitle(s.epochDay)}
                chevron={false}
                onclick={() => openStageEditor(s)}
              />
            {/each}
          </ListCard>
        {/each}
      </div>
    {:else}
      <div class="screen-part">
        <Notice
          icon="comb"
          key="hair-stages-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.stages)}
          title={m.hair_stage_empty_title()}
          text={m.hair_stage_empty_body()}
          action={{ label: m.hair_stage_empty_action(), primary: true, onclick: () => openStageEditor(null) }}
        />
      </div>
    {/if}

    <p class="muted small">{m.hair_scale_source()}</p>

    <SectionHeading text={m.hair_photo_section_title()} />

    {#if photoDue}
      <div data-photo-due>
        <Notice
          icon="camera"
          key="hair-photo-due"
          role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
          title={m.hair_photo_due_title()}
          text={m.hair_photo_due_body()}
        />
      </div>
    {/if}

    {#if !prefs.hairPhotoProtocolDismissed}
      <div data-protocol>
        <Notice
          icon="info"
          key="hair-photo-protocol"
          title={m.hair_photo_protocol_title()}
          text={m.hair_photo_protocol_body()}
          dismiss={{ label: m.hair_photo_protocol_dismiss_aria(), onclick: dismissProtocol }}
        />
      </div>
    {/if}

    <div class="photo-row" style="margin:var(--space-4) 0">
      <button class="photo-add" aria-label={m.add_photo()} onclick={pickHairPhoto}>
        <Icon name="image" size={20} /><span>{m.add_photo()}</span>
      </button>
      <button class="photo-add" aria-label={m.add_photo_camera()} onclick={hairPhotoReview.capture}>
        <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
      </button>
    </div>

    {#if photosQuery.loading}
      <div out:crossfade><Skeleton variant="line" count={2} /></div>
    {:else if photos.length}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}>
          {#each [...photos].reverse() as p (p.id)}
            {@const since = sinceStart(p.epochDay)}
            <ListRow
              static
              data-hair-photo={p.id}
              title={dayLabel(p.epochDay)}
              subtitle={since}
              action={{
                icon: 'trash',
                label: m.hair_photo_delete_sheet(),
                onclick: () => (photoDeleteTarget = p),
                attrs: { 'data-delete-hair-photo': p.id }
              }}
            >
              {#snippet leading()}<PhotoThumb photo={p} size={48} />{/snippet}
            </ListRow>
          {/each}
        </ListCard>
      </div>
    {:else}
      <div class="screen-part">
        <Notice
          icon="camera"
          key="hair-photos-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
          title={m.hair_photo_empty_title()}
          text={m.hair_photo_empty_body()}
        />
      </div>
    {/if}
  {/if}

  <Sheet open={anchorEditor !== null} title={m.hair_anchor_sheet()} onClose={() => (anchorEditor = null)}>
    {#if anchorEditor !== null}
      <h3>{m.hair_anchor_sheet()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.hair_anchor_sheet_hint()}</p>
      <div class="field">
        <label class="field-label" for="hair-anchor-date">{m.hair_anchor_date_label()}</label>
        <input class="input" type="date" id="hair-anchor-date" name="hair-anchor-date" bind:value={anchorEditor} />
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-hair-anchor onclick={saveAnchor}><span>{m.hair_anchor_save()}</span></button>
        {#if anchorIsUserSet}
          <button class="btn btn-ghost" data-clear-hair-anchor onclick={clearAnchor}><span>{m.hair_anchor_clear()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

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
        <span class="field-label" id="hair-scale-label">{m.hair_scale_label()}</span>
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.stages)}>
          <div role="radiogroup" aria-labelledby="hair-scale-label">
            {#each HAIR_SCALES as scale (scale)}
              <button
                class="kit-row"
                role="radio"
                aria-checked={stageEditor.scale === scale}
                data-pick-scale={scale}
                onclick={() => pickScale(scale)}
              >
                <span class="kit-row-text">
                  <span class="kit-row-title">{hairScaleName(scale)}</span>
                  <span class="kit-row-sub">{hairScaleSub(scale)}</span>
                </span>
                <span class="kit-row-trail">
                  {#if stageEditor.scale === scale}<Icon name="check" size={20} />{/if}
                </span>
              </button>
            {/each}
          </div>
        </ListCard>
      </div>
      {#if stageEditor.scale}
        {@const scale = stageEditor.scale}
        <div class="disclosed" transition:disclose>
          {#if isGradedScale(scale)}
            <div class="field">
              <label class="field-label" for="hair-stage-value">{m.hair_stage_label()}</label>
              <select class="input" id="hair-stage-value" bind:value={stageEditor.stage}>
                {#each gradesOfScale(scale) as grade (grade)}
                  <option value={grade}>{hairStageName(scale, grade)}</option>
                {/each}
              </select>
            </div>
          {:else}
            <div class="field">
              <label class="field-label" for="hair-other-value">{m.hair_other_label()}</label>
              <input
                class="input"
                id="hair-other-value"
                name="hair-other-value"
                placeholder={m.hair_other_placeholder()}
                bind:value={stageEditor.description}
              />
            </div>
          {/if}
        </div>
      {/if}
      <div class="stack-3">
        <button class="btn btn-primary" data-save-hair-stage disabled={!stageEditor.scale} onclick={saveStage}>
          <span>{m.hair_stage_save()}</span>
        </button>
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

  <PhotoAlignmentReview
    photo={hairPhotoReview.photo}
    reference={hairPhotoReview.reference}
    onAccept={hairPhotoReview.accept}
    onRetake={hairPhotoReview.capture}
    onCancel={hairPhotoReview.cancel}
  />
</div>

<style>
  /* The scale's own name over its card. Not a SectionHeading: the area is
     already named ("Staging") and these are the two scales inside it, so
     giving each the screen-title size would make the area's own heading
     the smaller of the two. */
  .hair-scale-name {
    margin: var(--space-4) 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }
</style>
