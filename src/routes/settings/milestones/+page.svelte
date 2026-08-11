<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { reference } from '$lib/data/live/reference.svelte';
  import { milestoneStatus } from '$lib/data/milestoneStatus';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { Milestone, MilestoneTemplate, Photo } from '$lib/data/types';
  import { pickPhotos, type EditorPhoto } from '$lib/stores/photoPicking';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let shown = $state(vocabulary.randomTemplates(3));
  /* A milestone shows one photo, so `photo` is whatever it will end up with -
     the stored row, a picked replacement, or none - and `storedPhotoId`
     remembers what was there when the editor opened, so that row can still be
     deleted after `photo` has been cleared. Nothing is committed until Save
     (F1), so closing the sheet undoes both. */
  let editor = $state<{
    id?: string;
    name: string;
    date: string;
    photo: EditorPhoto | null;
    storedPhotoId: string | null;
    templateKey: string | null;
  } | null>(null);
  let deleteTarget = $state<Milestone | null>(null);

  // Mirrored, and the journal already orders them by day (ADR-0004).
  let sorted = $derived(reference.milestones);

  function statusText(mi: Milestone): string {
    const s = milestoneStatus(mi, todayEpochDay());
    return s.type === 'countdown' ? `in ${s.days} days` : s.type === 'today' ? 'today' : `${s.years} year${s.years === 1 ? '' : 's'} ago`;
  }

  function openEditor(existing: Milestone | null, template: MilestoneTemplate | null) {
    editor = existing
      ? {
          id: existing.id,
          name: existing.name,
          date: dateInputValueFromEpochDay(existing.epochDay),
          photo: existing.photo && { kind: 'stored', photo: existing.photo },
          storedPhotoId: existing.photo?.id ?? null,
          templateKey: existing.templateKey
        }
      : {
          name: template?.name ?? '',
          date: dateInputValueFromEpochDay(todayEpochDay()),
          photo: null,
          storedPhotoId: null,
          templateKey: template?.key ?? null
        };
  }

  async function pickPhoto() {
    const [photo] = await pickPhotos(1); // a milestone shows one
    if (photo && editor) editor.photo = { kind: 'picked', photo };
  }

  async function saveMilestone() {
    if (!editor) return;
    // Read out before the sheet closes: `editor` is null from the next line on.
    const draft = { ...editor };
    editor = null;

    const id = await journal.milestones.upsertMilestone({
      id: draft.id,
      name: draft.name.trim() || 'Milestone',
      epochDay: epochDayFromDateInputValue(draft.date) ?? todayEpochDay(),
      templateKey: draft.templateKey
    });
    const picked = draft.photo?.kind === 'picked' ? draft.photo.photo : null;
    // The stored row goes if it was taken off, or if a picked photo replaces it.
    if (draft.storedPhotoId && (picked || !draft.photo)) await journal.photos.remove(draft.storedPhotoId);
    if (picked) await journal.photos.attach({ milestoneId: id }, picked);
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.milestones()}</h1>
    <div class="header-action"></div>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">
    Days that matter — past ones come back as anniversaries, future ones count down on Home.
  </p>

  <div class="card editor-section">
    <div class="spread" style="margin-bottom:var(--space-3)">
      <h2 class="editor-heading">Add a milestone</h2>
      <button class="icon-btn" data-shuffle aria-label="Shuffle templates" onclick={() => (shown = vocabulary.randomTemplates(3))}>
        <Icon name="shuffle" size={20} />
      </button>
    </div>
    <div class="stack-3">
      <button class="list-row template-row" data-own style="border:1.5px dashed var(--accent-border);border-radius:var(--radius-md)"
        onclick={() => openEditor(null, null)}>
        <span class="row-icon"><Icon name="pencil" size={20} /></span>
        <span class="row-text">
          <span class="row-title">Create your own</span>
          <span class="row-subtitle">any day that means something</span>
        </span>
      </button>
      {#each shown as tp (tp.key)}
        <button class="list-row template-row" data-template={tp.key} style="background:var(--surface-2);border-radius:var(--radius-md)"
          onclick={() => openEditor(null, tp)}>
          <span class="row-icon"><Icon name="flag" size={20} /></span>
          <span class="row-text"><span class="row-title">{tp.name}</span></span>
          <Icon name="chevronRight" size={18} />
        </button>
      {/each}
    </div>
  </div>

  <SectionTitle text="Your milestones" />
  <div class="list-group">
    {#each sorted as mi (mi.id)}
      <div class="list-row">
        {#if mi.photo}
          <PhotoThumb photo={mi.photo} size={40} />
        {:else}
          <span class="row-icon"><Icon name="flag" size={20} /></span>
        {/if}
        <span class="row-text">
          <span class="row-title">{mi.name}</span>
          <span class="row-subtitle">{fmtDay(mi.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })} · {statusText(mi)}</span>
        </span>
        <button class="icon-btn" aria-label="Edit {mi.name}" onclick={() => openEditor(mi, null)}><Icon name="pencil" size={18} /></button>
        <button class="icon-btn" aria-label="Delete {mi.name}" onclick={() => (deleteTarget = mi)}><Icon name="trash" size={18} /></button>
      </div>
    {:else}
      <p class="muted small" style="padding:var(--space-4)">No milestones yet.</p>
    {/each}
  </div>

  <Sheet open={editor !== null} title="Milestone" onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? 'Edit milestone' : editor.name || 'Your milestone'}</h3>
      <div class="field">
        <label class="field-label" for="ms-name">Name</label>
        <input class="input" id="ms-name" name="ms-name" placeholder="e.g. First laser session" bind:value={editor.name} />
      </div>
      <div class="field">
        <label class="field-label" for="ms-date">Date <span class="muted">(past or future)</span></label>
        <input class="input" type="date" id="ms-date" name="ms-date" bind:value={editor.date} />
      </div>
      <div class="field">
        <span class="field-label">Photo (optional)</span>
        <div class="photo-row">
          {#if editor.photo}
            <div class="photo-wrap">
              {#if editor.photo.kind === 'stored'}
                <PhotoThumb photo={editor.photo.photo} size={64} />
              {:else}
                <PhotoThumb photo={{ fileName: null }} bytes={editor.photo.photo.thumb} size={64} />
              {/if}
              <button class="photo-remove" aria-label="Remove photo" onclick={() => (editor!.photo = null)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          {:else}
            <button class="photo-add" aria-label={m.add_photo()} onclick={pickPhoto}>
              <Icon name="camera" size={20} /><span>{m.add_photo()}</span>
            </button>
          {/if}
        </div>
      </div>
      <button class="btn btn-primary" data-save-ms onclick={saveMilestone}>
        <span>{editor.id ? 'Save changes' : 'Add milestone'}</span>
      </button>
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title="Delete milestone" onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>Delete “{deleteTarget.name}”?</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">Its photo is removed too. This cannot be undone.</p>
      <div class="stack-3">
        <button class="btn btn-danger" onclick={() => { journal.milestones.deleteMilestone(deleteTarget!.id); deleteTarget = null; }}>
          <span>Delete milestone</span>
        </button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
