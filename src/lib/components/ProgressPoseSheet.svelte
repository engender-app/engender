<script lang="ts">
  /* The person's own pose list on Progress photos,
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
  import { crossfade, discloseWidth } from '$lib/motion/reveal';
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

  /* What the field and its button say. Each crossfades in place over a
     still surface: switching between naming a new pose and
     renaming one swapped both texts in one frame (Alicja's rule: content
     may crossfade, never swap). The label is keyed and its leaving line is
     pinned out of flow by `crossfade`; the button's two words are both
     always there (below). Neither the label's line nor the button moves. */
  const fieldLabel = $derived(renaming ? m.pph_pose_rename({ pose: label(renaming) }) : m.pph_pose_new());
  const textIn = (node: Element) => crossfade(node, undefined, { direction: 'in' });

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
    <!-- The label drawn here, the field's own kept for assistive tech: a
         Field label is plain text and cannot hold two crossfading lines. -->
    <p class="field-label pose-name-label" aria-hidden="true" data-progress-pose-label>
      {#key fieldLabel}<span in:textIn out:crossfade>{fieldLabel}</span>{/key}
    </p>
    <Field label={fieldLabel} id="progress-pose-name" hidden>
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
        <!-- Both words, stacked in one cell as wide as the wider, each fading
             by class: a keyed swap pinned the leaving word to the left of a
             box that had already changed width, and it stepped 5px sideways
             in its first frame. -->
        <span class="pose-name-swap">
          <span class:is-shown={!renaming} aria-hidden={renaming !== null}>{m.pph_pose_add()}</span>
          <span class:is-shown={renaming !== null} aria-hidden={renaming === null}>{m.save_name()}</span>
        </span>
      </button>
      <!-- Always in the row and faded rather than added: arriving through
           its own width it took 48px from Save in one frame (its padding
           and the gap do not travel), and the button beside it changed
           size under the finger. Out of reach while there is nothing to
           cancel. -->
      <button
        class="btn btn-ghost press pose-name-cancel"
        class:is-shown={renaming !== null}
        data-progress-pose-cancel
        inert={renaming === null}
        aria-hidden={renaming === null}
        onclick={stopRename}
      >
        <span>{m.cancel()}</span>
      </button>
    </div>
  </div>
</Sheet>

<style>
  .pose-name { margin-top: var(--space-4); display: grid; gap: var(--space-3); }
  .pose-name-actions { display: flex; gap: var(--space-3); }
  .pose-name-actions .btn-primary { flex: 1; }
  /* The two lines a crossfade swaps sit in one box that keeps its place:
     `crossfade` pins the leaving one out of flow against it. */
  .pose-name-label { position: relative; margin: 0 0 calc(var(--space-2) - var(--space-3)); }
  .pose-name-swap { display: inline-grid; justify-items: center; }
  .pose-name-swap > span {
    grid-area: 1 / 1;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease-out);
  }
  .pose-name-swap > span.is-shown { opacity: 1; }
  .pose-name-cancel { opacity: 0; transition: opacity var(--dur-fast) var(--ease-out); }
  .pose-name-cancel.is-shown { opacity: 1; }
</style>
