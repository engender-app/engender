<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { db } from '$lib/data/db.svelte';
  import { milestoneStatus, upsertMilestone, deleteMilestone, randomTemplates } from '$lib/data/repositories/milestones';
  import { fmtDay, epochDayFromLocalDate, localDateFromEpochDay } from '$lib/data/dates';
  import { dateInputValue, dateFromInputValue } from '$lib/data/dateInput';
  import { todayEpochDay } from '$lib/data/db.svelte';
  import type { Milestone, MilestoneTemplate } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  let shown = $state(randomTemplates(3));
  let editor = $state<{ id?: string; name: string; date: string; photo: Milestone['photo']; templateKey: string | null } | null>(null);
  let deleteTarget = $state<Milestone | null>(null);

  let sorted = $derived([...db.milestones].sort((a, b) => a.epochDay - b.epochDay));

  function statusText(mi: Milestone): string {
    const s = milestoneStatus(mi);
    return s.type === 'countdown' ? `in ${s.days} days` : s.type === 'today' ? 'today' : `${s.years} year${s.years === 1 ? '' : 's'} ago`;
  }

  function openEditor(existing: Milestone | null, template: MilestoneTemplate | null) {
    editor = existing
      ? { id: existing.id, name: existing.name, date: dateInputValue(localDateFromEpochDay(existing.epochDay)), photo: existing.photo, templateKey: existing.templateKey }
      : { name: template?.name ?? '', date: dateInputValue(localDateFromEpochDay(todayEpochDay())), photo: null, templateKey: template?.key ?? null };
  }

  function saveMilestone() {
    if (!editor) return;
    const epochDay = editor.date ? epochDayFromLocalDate(dateFromInputValue(editor.date)) : todayEpochDay();
    upsertMilestone({
      id: editor.id,
      name: editor.name.trim() || 'Milestone',
      epochDay,
      kind: epochDay > todayEpochDay() ? 'countdown' : 'anniversary',
      templateKey: editor.templateKey,
      photo: editor.photo,
    });
    editor = null;
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
      <button class="icon-btn" data-shuffle aria-label="Shuffle templates" onclick={() => (shown = randomTemplates(3))}>
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
              <PhotoThumb photo={editor.photo} size={64} />
              <button class="photo-remove" aria-label="Remove photo" onclick={() => (editor!.photo = null)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          {:else}
            <button class="photo-add" aria-label={m.add_photo()}
              onclick={() => (editor!.photo = { id: 'mp' + Date.now(), hue: Math.floor(Math.random() * 360), label: 'Photo' })}>
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
        <button class="btn btn-danger" onclick={() => { deleteMilestone(deleteTarget!.id); deleteTarget = null; }}>
          <span>Delete milestone</span>
        </button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
