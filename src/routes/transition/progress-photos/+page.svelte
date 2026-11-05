<script lang="ts">
  /* Progress photos (pre-release-human 12, bug 25): shots taken on purpose
     in one of three poses, a timeline per pose, and the wipe over any two
     shots of the same pose.

     Split off the photo library, which had been both "every photograph in
     the journal" and this, under a name that said one and a line that said
     the other. The library is browse-only now; comparing lives here, where
     the photographs were taken to be compared. The compare is the
     library's own - the same Browse and Compare tabs, the same pick-two
     selection, the same PhotoWipe sheet and compare-state.ts - scoped to
     one pose, because a front shot beside a side shot compares nothing.

     Taking a shot opens the in-app camera with the last shot in the pose
     laid over it (ProgressCamera.svelte). */
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, type LiveList } from '$lib/data/live/journal.svelte';
  import { fmtDay, fmtDuration, photoCaptionDate } from '$lib/data/dates';
  import { calendarDuration, todayEpochDay } from '$lib/data/epochDay';
  import type { BuiltInProgressPose, ProgressPhoto, ProgressPose, ProgressPoseRow } from '$lib/data/journal/progressPhotos';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import { orderAnchorsByJourney, toComparePair } from '$lib/data/photos/compare-state';
  import { readPhoto } from '$lib/stores/photoFiles';
  import { offerUndo, undoable } from '$lib/stores/deleteUndo';
  import { toast } from '$lib/stores/toasts.svelte';
  import { attempt, writer } from '$lib/stores/attempt.svelte';
  import { collapse, crossfade } from '$lib/motion/reveal';
  import { pinnedOut, tileIn } from '$lib/motion/narrow';
  import { motionDuration } from '$lib/motion/tokens';
  import { fade } from 'svelte/transition';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import ProgressCamera from '$lib/components/ProgressCamera.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import PhotoWipe from '$lib/components/kit/PhotoWipe.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import HoldSelectBar from '$lib/components/HoldSelectBar.svelte';
  import { checkIn, holdSelection } from '$lib/components/kit/holdSelect.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import ProgressPoseSheet from '$lib/components/ProgressPoseSheet.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';

  const BUILT_IN_LABEL: Record<BuiltInProgressPose, () => string> = {
    front: m.pph_pose_front,
    side: m.pph_pose_side,
    back: m.pph_pose_back
  };

  let photosQuery = liveList((j) => j.progressPhotos.getPhotos());
  let photos = $derived(photosQuery.rows);

  /* The person's poses (version 122): Front, Side and Back, renamed or
     hidden as they chose, then their own. */
  let posesQuery = liveList((j) => j.progressPhotos.getPoses());
  let poses = $derived(posesQuery.rows);
  let shownPoses = $derived(poses.filter((p) => !p.hidden));
  const poseLabel = (p: ProgressPoseRow) => p.name || (BUILT_IN_LABEL[p.id as BuiltInProgressPose]?.() ?? p.name);
  const labelOf = (id: ProgressPose) => {
    const row = poses.find((p) => p.id === id);
    return row ? poseLabel(row) : (BUILT_IN_LABEL[id as BuiltInProgressPose]?.() ?? '');
  };

  /* The pose the person picked; the one shown falls back to the first pose
     still on the list when theirs was hidden or deleted. */
  let chosen = $state<ProgressPose>('front');
  let pose = $derived(posesQuery.loading || shownPoses.some((p) => p.id === chosen) ? chosen : (shownPoses[0]?.id ?? 'front'));
  let editingPoses = $state(false);

  /* The screen waits on both reads, so the pose control never paints the
     built-in names and then swaps in the person's own. */
  const screenRead: LiveList<ProgressPhoto> = {
    get rows() { return photosQuery.rows; },
    get loading() { return photosQuery.loading || posesQuery.loading; },
    get empty() { return !posesQuery.loading && photosQuery.empty; },
    get failed() { return photosQuery.failed || posesQuery.failed; },
    get stale() { return photosQuery.stale || posesQuery.stale; },
    retry() { photosQuery.retry(); posesQuery.retry(); }
  };

  /* An empty pose just goes, with the usual undo; one holding photographs
     asks first, over the pose sheet's own close. */
  async function deletePose(row: ProgressPoseRow) {
    const count = photos.filter((photo) => photo.pose === row.id).length;
    if (count === 0) {
      await removePose(row);
      return;
    }
    editingPoses = false;
    await tick();
    poseDeleteFailed = false;
    poseToDelete = { row, count };
  }

  const poseRemoving = writer();
  let poseDeleteFailed = $state(false);
  async function removePose(row: ProgressPoseRow): Promise<boolean> {
    let deletion: Awaited<ReturnType<typeof undoable>> | undefined;
    if (!(await poseRemoving.run(async () => { deletion = await undoable((j) => j.progressPhotos.deletePose(row.id)); }, m.write_failed()))) return false;
    offerUndo(deletion!, m.record_deleted());
    return true;
  }
  async function confirmPoseDelete() {
    const target = poseToDelete;
    if (!target) return;
    if (await removePose(target.row)) poseToDelete = null;
    else poseDeleteFailed = true;
  }
  let poseToDelete = $state<{ row: ProgressPoseRow; count: number } | null>(null);
  /** This pose's shots, oldest first: the timeline and the wipe's list. */
  let shots = $derived(photos.filter((photo) => photo.pose === pose));
  /** What the camera lays over its picture: the newest shot in the pose. */
  let ghost = $derived(shots.at(-1) ?? null);

  let selecting = $state(false);
  let selected = $state<string[]>([]);
  let comparing = $state(false);
  let capturing = $state(false);
  let viewing = $state<ProgressPhoto | null>(null);
  /* Holding a shot picks shots to delete (holdSelect.svelte.ts). Its own
     selection, apart from compare's pick-two: the two never run at once,
     since a hold starts nothing while comparing and comparing clears it. */
  const held = holdSelection();
  let screenEl = $state<HTMLElement>();

  export const snapshot = {
    capture: () => ({ pose, selecting, selected: [...selected] }),
    restore: (value: { pose: ProgressPose; selecting: boolean; selected: string[] }) => {
      chosen = value.pose;
      selecting = value.selecting;
      selected = value.selected;
    }
  };

  /* A pose is its own timeline, so a selection never crosses one. */
  function pickPose(next: string) {
    chosen = next;
    selected = [];
    held.clear();
  }

  function setSelecting(next: boolean) {
    selecting = next;
    held.clear();
    if (!next) selected = [];
  }

  let orderedSelected = $derived(orderAnchorsByJourney(selected, shots));
  let pair = $derived(toComparePair(selected, shots));

  let gapLabel = $derived.by(() => {
    if (!pair) return '';
    const duration = calendarDuration(shots[pair.left].epochDay, shots[pair.right].epochDay);
    return `${fmtDuration(duration)} ${m.apart_suffix()}`;
  });

  function toggle(id: string) {
    if (selected.includes(id)) selected = selected.filter((anchor) => anchor !== id);
    else if (selected.length < 2) selected = [...selected, id];
  }

  const cellDate = (photo: ProgressPhoto) => fmtDay(photo.epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  async function storeShot(photo: NormalizedPhoto): Promise<boolean> {
    if (!(await attempt(() => journal.progressPhotos.addPhoto(todayEpochDay(), pose, photo), m.photo_save_failed()))) return false;
    toast(m.saved(), { kind: 'record-saved' });
    return true;
  }

  const shotRecord = recordEditor<ProgressPhoto>({
    remove: (id) => undoable((j) => j.progressPhotos.deletePhoto(id)),
    findById: (id) => photos.find((photo) => photo.id === id)
  });

  async function askToDelete(photo: ProgressPhoto) {
    viewing = null;
    await tick();
    shotRecord.askToDelete(photo);
  }

  /* The library's "open where it came from" lands here with ?photo=, on
     that shot's own pose. */
  let sourceId = $derived(page.url.searchParams.get('photo'));
  let sourcePhoto = $derived(photos.find((photo) => photo.id === sourceId));
  function openSource() {
    if (!sourcePhoto) return;
    chosen = sourcePhoto.pose;
    viewing = sourcePhoto;
  }

  /* Whether the grid has been painted once: tiles that come with it get no
     entrance of their own (ReadGate already fades the body in), and tiles
     after that - a pose switched, a shot added - fade in. The library's
     own rule, with the library's own transitions (motion/narrow.ts). */
  let gridEl = $state<HTMLElement>();
  let painted = $state(false);
  $effect(() => {
    if (gridEl) painted = true;
  });

  /* The viewed shot's full picture, a one-deep stack for the reason
     ProgressCamera's are. */
  let viewUrls = $state<string[]>([]);
  $effect(() => {
    const name = viewing?.fileName;
    if (!name) return;
    let cancelled = false;
    void readPhoto(name).then((bytes) => {
      if (cancelled || !bytes) return;
      viewUrls = [URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }))];
    });
    return () => {
      cancelled = true;
    };
  });

  const countIn = (node: Element) => crossfade(node, undefined, { direction: 'in' });
  const fast = () => motionDuration('--dur-fast');
</script>

<div class="screen" bind:this={screenEl}>
  <ScreenHeader title={m.pph_title()} back="/more" />
  <SourceRecordHandoff id={sourceId} ready={!photosQuery.loading && !photosQuery.failed} found={!!sourcePhoto} onOpen={openSource} />

  <ReadGate read={screenRead} variant="block" count={2}>
    {#snippet rows()}
      <div class="screen-part pose-row">
        <Segmented
          name={m.pph_pose_label()}
          options={shownPoses.map((p) => ({ value: p.id, label: poseLabel(p) }))}
          value={pose}
          onChange={pickPose}
          key="progress-pose"
          grows
        />
        <button class="icon-btn press" data-progress-poses-edit aria-label={m.pph_poses_edit()} onclick={() => (editingPoses = true)}>
          <Icon name="pencil" size={18} />
        </button>
      </div>
      <div class="screen-part progress-actions">
        <button class="btn btn-primary press" data-progress-open-camera onclick={() => (capturing = true)}>
          <Icon name="camera" size={20} /><span>{m.pph_take()}</span>
        </button>
        <Segmented
          name={m.ph_compare()}
          options={[
            { value: 'browse', label: m.ph_tab_browse() },
            { value: 'compare', label: m.ph_tab_compare() }
          ]}
          value={selecting ? 'compare' : 'browse'}
          onChange={(v) => setSelecting(v === 'compare')}
          compact
          key="progress-tab"
        />
      </div>
      {#if selecting}
        <div class="compare-selection" transition:collapse>
          <p role="status" data-compare-progress>{m.ph_selection_count({ count: orderedSelected.length })}</p>
          <p class="muted small">{selected.length < 2 ? m.ph_pick_two() : m.ph_selection_full()}</p>
          <!-- Every picked id, a deleted one included, so a shot that went
               while it was picked can still be taken off the selection. -->
          {#each selected as id (id)}
            {@const anchor = shots.find((photo) => photo.id === id)}
            <div class="compare-anchor" transition:collapse>
              <span>
                {#if anchor}{cellDate(anchor)}{:else}<span role="status" data-anchor-unavailable>{m.ph_selection_unavailable()}</span>{/if}
              </span>
              <button
                class="btn btn-soft press"
                data-anchor-remove={id}
                onclick={() => toggle(id)}
                aria-label={m.ph_selection_remove({ photo: anchor ? cellDate(anchor) : m.ph_selection_unavailable() })}
              >{m.ph_selection_remove_short()}</button>
            </div>
          {/each}
          <button class="btn btn-primary press" data-compare-open disabled={!pair} onclick={() => (comparing = true)}>{m.ph_compare()}</button>
        </div>
      {/if}

      <div class="photo-grid" bind:this={gridEl} data-progress-grid={pose}>
        {#each shots as p (p.id)}
          {@const picked = (selecting && selected.includes(p.id)) || held.has(p.id)}
          <div class="photo-cell-wrap" data-photo-key={p.id} in:tileIn={{ when: painted }} out:pinnedOut>
            <button
              class="photo-cell"
              data-photo-cell
              class:is-selected={picked}
              aria-pressed={selecting || held.active ? picked : undefined}
              {@attach held.cell(p.id, !selecting)}
              disabled={selecting && selected.length === 2 && !selected.includes(p.id)}
              aria-label={m.pph_cell_aria({ pose: labelOf(p.pose), date: cellDate(p) })}
              onclick={() => (selecting ? toggle(p.id) : (viewing = p))}
            >
              <PhotoThumb photo={p} size={104} />
              <span class="photo-date">{photoCaptionDate(p.epochDay)}</span>
              {#if picked}<span class="photo-check" transition:checkIn><Icon name="check" size={14} /></span>{/if}
            </button>
          </div>
        {/each}
      </div>
      <div class="pose-empty">
        {#if shots.length === 0}
          <p class="muted small" data-progress-pose-empty in:countIn out:crossfade>{m.pph_pose_empty()}</p>
        {/if}
      </div>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="progressShot"
        key="progress-photos-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.pph_empty_title()}
        text={m.pph_empty_body()}
        action={{ label: m.pph_take(), primary: true, onclick: () => (capturing = true) }}
      />
    {/snippet}
  </ReadGate>

  <HoldSelectBar
    selection={held}
    scope={screenEl}
    remove={async (j, ids) => {
      for (const id of ids) await j.progressPhotos.deletePhoto(id);
    }}
  />

  <ProgressCamera
    open={capturing}
    title={m.pph_camera_title({ pose: labelOf(pose) })}
    {ghost}
    onSave={storeShot}
    onClose={() => (capturing = false)}
  />

  <Sheet open={comparing} title={m.ph_compare()} onClose={() => (comparing = false)}>
    {#if pair}
      <p class="compare-gap" data-compare-gap>{gapLabel}</p>
      <PhotoWipe
        photos={shots}
        {pair}
        role={roleAt(activeFlag.roles, 0)}
        date={(photo) => fmtDay(photo.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
      />
    {:else}
      <p role="status">{m.ph_selection_unavailable()}</p>
    {/if}
  </Sheet>

  <Sheet open={viewing !== null} title={m.photo_view_title()} onClose={() => (viewing = null)} onClosed={() => (viewUrls = [])}>
    {#if viewing}
      {@const shown = viewing}
      <p>{labelOf(shown.pose)}, {cellDate(shown)}</p>
      <div class="view-frame" data-progress-view>
        {#each viewUrls as url (url)}
          <img
            src={url}
            alt={m.photo_alt()}
            in:fade={{ duration: fast() }}
            out:fade={{ duration: fast() }}
            onoutroend={() => URL.revokeObjectURL(url)}
          />
        {/each}
      </div>
      <button class="btn btn-ghost press" data-progress-delete={shown.id} onclick={() => askToDelete(shown)}>
        <Icon name="trash" size={20} /><span>{m.pph_delete()}</span>
      </button>
    {/if}
  </Sheet>

  <ProgressPoseSheet open={editingPoses} {poses} label={poseLabel} onClose={() => (editingPoses = false)} onDelete={deletePose} />

  <ConfirmDeleteSheet
    open={poseToDelete !== null}
    title={m.pph_pose_delete_sheet()}
    question={poseToDelete ? m.pph_pose_delete_q({ count: poseToDelete.count, pose: poseLabel(poseToDelete.row) }) : ''}
    hint={m.photos_select_delete_hint()}
    confirmLabel={m.pph_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-progress-pose-confirm': '' }}
    busy={poseRemoving.busy}
    failed={poseDeleteFailed}
    onConfirm={confirmPoseDelete}
    onCancel={() => (poseToDelete = null)}
  />

  <RecordSheet
    record={shotRecord}
    handle="progress-photo"
    confirm={{
      title: m.pph_delete_sheet(),
      question: () => m.pph_delete_q(),
      hint: () => m.pph_delete_hint(),
      confirmLabel: m.pph_delete(),
      cancelLabel: m.keep_it()
    }}
  />
</div>

<style>
  /* The pose control and the pencil that edits its list, on one line: the
     control scrolls inside its own track when the poses outgrow it. */
  .pose-row { display: flex; align-items: center; gap: var(--space-2); }
  .pose-row :global(.segmented-wrap) { min-width: 0; }
  .progress-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .progress-actions .btn-primary { flex: 1 1 auto; }
  .compare-selection { display: grid; gap: var(--space-3); margin-bottom: var(--space-4); }
  .compare-anchor { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .compare-anchor .btn { flex-shrink: 0; }
  /* Holds the line's place, so the line arriving or leaving with a pose
     switch fades where it stands rather than moving what is around it. */
  .pose-empty { position: relative; min-height: 1.5em; }
  .view-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 4;
    max-height: 60vh;
    margin: var(--space-3) 0;
    border-radius: var(--r-block);
    overflow: clip;
    background: var(--surface-2);
  }
  .view-frame img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
