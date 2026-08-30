<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import DatePicker from './DatePicker.svelte';
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';
  import Sheet from './Sheet.svelte';
  import Field from './kit/Field.svelte';
  import {
    todayEpochDay,
    epochDayFromDateInputValueOrToday,
    dateInputValueFromEpochDay
  } from '$lib/data/epochDay';
  import { pickPhotos, capturePhoto } from '$lib/stores/photoPicking';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';

  let {
    open,
    goalKey = null,
    goalTitle = '',
    onConfirm,
    onDismiss
  }: {
    open: boolean;
    goalKey: string | null;
    goalTitle: string;
    onConfirm: (data: {
      title: string;
      epochDay: number;
      photo: NormalizedPhoto | null;
      goalKey: string | null;
    }) => void | Promise<void>;
    onDismiss: () => void;
  } = $props();

  let name = $state('');
  let date = $state('');
  let pickedPhoto = $state<NormalizedPhoto | null>(null);

  $effect(() => {
    if (open) {
      name = goalTitle;
      date = dateInputValueFromEpochDay(todayEpochDay());
      pickedPhoto = null;
    }
  });

  async function pick() {
    const [photo] = await pickPhotos(1);
    if (photo) pickedPhoto = photo;
  }

  async function capture() {
    const photo = await capturePhoto();
    if (photo) pickedPhoto = photo;
  }

  async function handleConfirm() {
    const trimmed = name.trim() || m.ms_default_name();
    const epochDay = epochDayFromDateInputValueOrToday(date);
    await onConfirm({
      title: trimmed,
      epochDay,
      photo: pickedPhoto,
      goalKey
    });
  }
</script>

<Sheet {open} title={m.roadmap_milestone_prompt_sheet_title()} onClose={onDismiss}>
  <h3>{m.roadmap_milestone_prompt_title({ goal: goalTitle })}</h3>
  <Field label={m.ms_name_label()} id="roadmap-milestone-name">
    {#snippet children(id)}
      <input
        class="input"
        {id}
        name="milestone-name"
        bind:value={name}
        placeholder={m.ms_name_placeholder()}
      />
    {/snippet}
  </Field>
  <Field label={m.ms_date_label()} id="roadmap-milestone-date">
    {#snippet children(id)}
      <DatePicker bind:value={date} {id} name="milestone-date" />
    {/snippet}
  </Field>
  <Field label={m.ms_photo_label()} legend>
    {#snippet children()}
      <div class="photo-row">
        {#if pickedPhoto}
          <div class="photo-wrap">
            <PhotoThumb photo={{ fileName: null }} bytes={pickedPhoto.thumb} size={64} />
            <button
              type="button"
              class="photo-remove"
              aria-label={m.photo_remove()}
              onclick={() => (pickedPhoto = null)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        {:else}
          <button type="button" class="photo-add" data-add-photo aria-label={m.add_photo()} onclick={pick}>
            <Icon name="image" size={20} /><span>{m.add_photo()}</span>
          </button>
          <button
            type="button"
            class="photo-add"
            data-capture-photo
            aria-label={m.add_photo_camera()}
            onclick={capture}
          >
            <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
          </button>
        {/if}
      </div>
    {/snippet}
  </Field>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button
      type="button"
      class="btn btn-primary"
      data-confirm-milestone
      onclick={handleConfirm}
    >
      <span>{m.roadmap_milestone_prompt_add()}</span>
    </button>
    <button
      type="button"
      class="btn btn-ghost"
      data-dismiss-milestone
      onclick={onDismiss}
    >
      <span>{m.skip()}</span>
    </button>
  </div>
</Sheet>
