<script lang="ts">
  /* The person's own pose list on Progress photos (pre-release-human 12),
     opened by the pencil beside the pose control.

     The rows are the managed-list rows Settings draws for body regions and
     tags (screens.css, .managed-tag): the name, "hidden" when it is, and
     icon buttons for rename, hide and - on a pose of the person's own -
     delete. Front, Side and Back rename and hide but never go
     (progressPhotos.ts). Naming happens in one field under the list rather
     than in a second sheet, as body regions does: a sheet opened from a
     sheet would close this one first, and the list is what the person is
     looking at while they name. The pencil puts that pose's name in the
     field; the button says which of the two the field is doing.

     Deleting a pose that holds photographs asks first, on the screen's own
     confirm sheet (the caller's `onDelete`); an empty one just goes, with
     the usual undo. */
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { journalTextAutocomplete } from '$lib/platform';
  import { journal } from '$lib/data/live/journal.svelte';
  import type { ProgressPose, ProgressPoseRow } from '$lib/data/journal/progressPhotos';
  import { writer, rowWriter } from '$lib/stores/attempt.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { discloseWidth } from '$lib/motion/reveal';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import Field from './kit/Field.svelte';

  let {
    open,
    poses,
    label,
    onClose,
    onDelete
  }: {
    open: boolean;
    poses: ProgressPoseRow[];
    /** What a pose is called on screen: its own name, or the catalogue's. */
    label: (pose: ProgressPoseRow) => string;
    onClose: () => void;
    /** Delete this custom pose: the caller asks first when it holds
        photographs, and runs the undoable delete. */
    onDelete: (pose: ProgressPoseRow) => void;
  } = $props();

  /** The pose the field is renaming, or null while it names a new one. */
  let renaming = $state<ProgressPoseRow | null>(null);
  let name = $state('');
  let input = $state<HTMLInputElement>();

  const visibleCount = $derived(poses.filter((pose) => !pose.hidden).length);

  async function startRename(pose: ProgressPoseRow) {
    renaming = pose;
    name = label(pose);
    await tick();
    input?.focus();
    input?.select();
  }

  function stopRename() {
    renaming = null;
    name = '';
  }

  const saving = writer();
  async function save() {
    const typed = name.trim();
    const target = renaming;
    if (target) {
      /* A built-in given back its catalogue name, or emptied, keeps no
         name of its own, so a later language switch still renames it. */
      const own = target.builtIn && (typed === '' || typed === label({ ...target, name: '' })) ? '' : typed;
      if (!own && !target.builtIn) return;
      if (!(await saving.run(() => journal.progressPhotos.renamePose(target.id, own), m.write_failed()))) return;
      stopRename();
      toast(m.saved(), { kind: 'record-saved' });
      return;
    }
    if (!typed) return;
    if (!(await saving.run(() => journal.progressPhotos.addPose(typed), m.write_failed()))) return;
    name = '';
    toast(m.saved(), { kind: 'record-saved' });
  }

  const hiding = rowWriter();
  function toggleHidden(pose: ProgressPoseRow) {
    void hiding(pose.id, () => journal.progressPhotos.setPoseHidden(pose.id as ProgressPose, !pose.hidden), m.write_failed());
  }

  function close() {
    stopRename();
    onClose();
  }
</script>

<Sheet busy={saving.busy} {open} title={m.pph_poses_sheet()} onClose={close}>
  <h3>{m.pph_poses_sheet()}</h3>
  <div class="managed-tags" data-progress-poses>
    {#each poses as pose (pose.id)}
      <div class="rows-divide managed-tag" class:is-hidden={pose.hidden} data-progress-pose-row={pose.id}>
        <span class="managed-label">{label(pose)}</span>
        {#if pose.hidden}<span class="muted small" transition:discloseWidth>{m.pph_pose_hidden()}</span>{/if}
        <span class="managed-actions">
          <button
            class="icon-btn"
            data-progress-pose-rename={pose.id}
            aria-label={m.pph_pose_rename_aria({ pose: label(pose) })}
            onclick={() => startRename(pose)}
          >
            <Icon name="pencil" size={16} />
          </button>
          <button
            class="icon-btn"
            data-progress-pose-hide={pose.id}
            aria-label={pose.hidden ? m.pph_pose_show_aria({ pose: label(pose) }) : m.pph_pose_hide_aria({ pose: label(pose) })}
            disabled={!pose.hidden && visibleCount === 1}
            onclick={() => toggleHidden(pose)}
          >
            <Icon name={pose.hidden ? 'eye' : 'eyeOff'} size={16} />
          </button>
          {#if !pose.builtIn}
            <button
              class="icon-btn"
              data-progress-pose-delete={pose.id}
              aria-label={m.pph_pose_delete_aria({ pose: label(pose) })}
              onclick={() => onDelete(pose)}
            >
              <Icon name="trash" size={16} />
            </button>
          {/if}
        </span>
      </div>
    {/each}
  </div>

  <div class="pose-name">
    <Field label={renaming ? m.pph_pose_rename({ pose: label(renaming) }) : m.pph_pose_new()} id="progress-pose-name">
      {#snippet children(id)}
        <input
          bind:this={input}
          autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="progress-pose-name"
          placeholder={renaming?.builtIn ? label({ ...renaming, name: '' }) : undefined}
          bind:value={name}
          onkeydown={(event) => {
            if (event.key === 'Enter') void save();
          }}
        />
      {/snippet}
    </Field>
    <div class="pose-name-actions">
      <button
        class="btn btn-primary press"
        data-progress-pose-save
        disabled={saving.busy || (!name.trim() && !renaming?.builtIn)}
        onclick={save}
      >
        <span>{renaming ? m.pph_pose_save() : m.pph_pose_add()}</span>
      </button>
      {#if renaming}
        <button class="btn btn-ghost press" data-progress-pose-cancel transition:discloseWidth onclick={stopRename}>
          <span>{m.cancel()}</span>
        </button>
      {/if}
    </div>
  </div>
</Sheet>

<style>
  .pose-name { margin-top: var(--space-4); display: grid; gap: var(--space-3); }
  .pose-name-actions { display: flex; gap: var(--space-3); }
  .pose-name-actions .btn-primary { flex: 1; }
</style>
