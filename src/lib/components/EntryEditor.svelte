<script lang="ts">
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { db, todayEpochDay } from '$lib/data/db.svelte';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { getEntry, upsertEntry, deleteEntry } from '$lib/data/repositories/entries';
  import { activeDimensions, activePreset } from '$lib/data/repositories/dimensions';
  import { visibleTagGroups } from '$lib/data/repositories/tags';
  import { toast } from '$lib/stores/toasts.svelte';
  import type { Entry, Photo } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import DimensionSlider from '$lib/components/DimensionSlider.svelte';
  import TagPicker from '$lib/components/TagPicker.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  let { epochDay, entryId }: { epochDay?: number; entryId?: number } = $props();

  // Captured once on purpose: the route wraps this component in {#key}, so a
  // different entry/day mounts a fresh editor with a fresh draft.
  // svelte-ignore state_referenced_locally
  const existing = entryId != null ? getEntry(entryId) : undefined;
  // svelte-ignore state_referenced_locally
  const day = existing?.epochDay ?? epochDay ?? todayEpochDay();

  /* Local draft; committed as one action on Save (F1). */
  let draft = $state<Omit<Entry, 'id'> & { id?: number }>(
    existing
      ? {
          ...existing,
          dims: { ...existing.dims },
          tags: [...existing.tags],
          photos: existing.photos.map((p) => ({ ...p })),
        }
      : { epochDay: day, timestamp: 0, mood: null, note: '', dims: {}, tags: [], photos: [] }
  );

  let deleteOpen = $state(false);
  let dims = $derived(activeDimensions());
  let preset = $derived(activePreset());
  let isToday = $derived(day === todayEpochDay());

  function addPhoto() {
    draft.photos.push({ id: 'ph' + Date.now(), hue: Math.floor(Math.random() * 360), label: 'Photo' } as Photo);
  }

  function saveEntry() {
    upsertEntry({ ...draft, timestamp: draft.timestamp || undefined } as Entry);
    goto('/');
    toast(m.saved());
  }

  function confirmDelete() {
    deleteOpen = false;
    if (existing) deleteEntry(existing.id);
    goto('/');
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href={existing ? `/day/${day}` : '/'} aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{existing ? m.entry() : m.new_entry()}</h1>
    <div class="header-action">
      {#if existing}
        <button class="icon-btn" aria-label={m.delete_entry()} onclick={() => (deleteOpen = true)}>
          <Icon name="trash" size={20} />
        </button>
      {/if}
    </div>
  </header>
  <p class="editor-date">
    {isToday ? `${m.today()} · ` : ''}{fmtDay(day)}{existing ? ` · ${fmtTime(existing.timestamp)}` : ''}
  </p>

  <section class="card editor-section">
    <h2 class="editor-heading">{m.mood()}</h2>
    <MoodPicker value={draft.mood} onPick={(v) => (draft.mood = v)} />
  </section>

  <section class="card editor-section">
    <div class="spread">
      <h2 class="editor-heading">{m.gender_label()}</h2>
      <a class="small" style="color:var(--accent);text-decoration:none" href="/settings">{m.preset_prefix()} {preset.name}</a>
    </div>
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.gender_hint()}</p>
    {#each dims as dim (dim.key)}
      <DimensionSlider {dim} value={draft.dims[dim.key] ?? null} onInput={(v) => (draft.dims[dim.key] = v)} />
    {/each}
  </section>

  <section class="card editor-section">
    <h2 class="editor-heading">{m.tags_label()}</h2>
    <TagPicker
      groups={visibleTagGroups()}
      selected={draft.tags}
      onToggle={(id) =>
        (draft.tags = draft.tags.includes(id) ? draft.tags.filter((x) => x !== id) : [...draft.tags, id])}
    />
  </section>

  <section class="card editor-section">
    <h2 class="editor-heading">{m.note_label()}</h2>
    <textarea class="input" id="ed-note" name="note" rows="4" placeholder={m.note_placeholder()} bind:value={draft.note}
    ></textarea>
  </section>

  <section class="card editor-section">
    <h2 class="editor-heading">{m.photos_label()}</h2>
    <div class="photo-row">
      {#each draft.photos as p, i (p.id)}
        <div class="photo-wrap">
          <PhotoThumb photo={p} size={72} />
          <button class="photo-remove" aria-label="Remove photo" onclick={() => draft.photos.splice(i, 1)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      {/each}
      <button class="photo-add" aria-label={m.add_photo()} onclick={addPhoto}>
        <Icon name="camera" size={22} /><span>{m.add_photo()}</span>
      </button>
    </div>
  </section>

  <div class="editor-savebar">
    <button class="btn btn-primary" data-save onclick={saveEntry}>
      <Icon name="check" size={20} /><span>{m.save_entry()}</span>
    </button>
  </div>

  <Sheet bind:open={deleteOpen} title={m.delete_entry_q()}>
    <h3>{m.delete_entry_q()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.delete_entry_hint()}</p>
    <div class="stack-3">
      <button class="btn btn-danger" onclick={confirmDelete}><span>{m.delete_entry()}</span></button>
      <button class="btn btn-ghost" onclick={() => (deleteOpen = false)}><span>{m.keep_it()}</span></button>
    </div>
  </Sheet>
</div>
