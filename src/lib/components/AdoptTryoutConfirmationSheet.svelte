<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import DatePicker from './DatePicker.svelte';
  import Icon from './Icon.svelte';
  import MoodFace from './MoodFace.svelte';
  import Sheet from './Sheet.svelte';
  import Switch from './Switch.svelte';
  import Field from './kit/Field.svelte';
  import {
    todayEpochDay,
    epochDayFromDateInputValueOrToday,
    dateInputValueFromEpochDay
  } from '$lib/data/epochDay';
  import { moodName } from '$lib/data/vocabulary/labels';
  import type { FeltSenseEntry, Tryout } from '$lib/data/types';

  let {
    open,
    tryout,
    feltSense = [],
    onConfirm,
    onDismiss
  }: {
    open: boolean;
    tryout: Tryout | null;
    feltSense?: FeltSenseEntry[];
    onConfirm: (options: {
      createMilestone: boolean;
      milestoneTitle: string;
      milestoneEpochDay: number;
      updateProfileName: boolean;
    }) => void | Promise<void>;
    onDismiss: () => void;
  } = $props();

  let milestoneName = $state('');
  let date = $state('');
  let updateProfileName = $state(false);

  let durationDays = $derived.by(() => {
    if (!tryout) return 1;
    return Math.max(1, todayEpochDay() - tryout.startEpochDay + 1);
  });

  let majorityMood = $derived.by(() => {
    if (!feltSense || feltSense.length === 0) return null;
    const counts = new Map<number, number>();
    for (const f of feltSense) {
      counts.set(f.mood, (counts.get(f.mood) ?? 0) + 1);
    }
    let maxCount = -1;
    let majority = feltSense[0].mood;
    for (let mood = 1; mood <= 5; mood++) {
      const count = counts.get(mood) ?? 0;
      if (count > maxCount) {
        maxCount = count;
        majority = mood;
      }
    }
    return majority;
  });

  $effect(() => {
    if (open && tryout) {
      milestoneName = tryout.label;
      date = dateInputValueFromEpochDay(todayEpochDay());
      updateProfileName = tryout.kind === 'name';
    }
  });

  async function handleAdoptWithMilestone() {
    if (!tryout) return;
    const trimmed = milestoneName.trim() || tryout.label;
    const epochDay = epochDayFromDateInputValueOrToday(date);
    await onConfirm({
      createMilestone: true,
      milestoneTitle: trimmed,
      milestoneEpochDay: epochDay,
      updateProfileName: tryout.kind === 'name' && updateProfileName
    });
  }

  async function handleAdoptWithoutMilestone() {
    if (!tryout) return;
    await onConfirm({
      createMilestone: false,
      milestoneTitle: '',
      milestoneEpochDay: todayEpochDay(),
      updateProfileName: tryout.kind === 'name' && updateProfileName
    });
  }
</script>

<Sheet {open} title={m.tryout_adopt_sheet_title()} onClose={onDismiss}>
  {#if tryout}
    <h3 class="adopt-heading">{m.tryout_adopt_prompt_title({ name: tryout.label })}</h3>

    <div class="adopt-stats" data-adopt-stats>
      <div class="adopt-stat-row">
        <span class="adopt-stat-icon"><Icon name="clock" size={18} /></span>
        <span class="adopt-stat-text" data-adopt-duration>{m.tryout_adopt_duration({ days: m.n_days({ n: durationDays }) })}</span>
      </div>
      {#if majorityMood !== null}
        <div class="adopt-stat-row" data-adopt-majority-mood>
          <span class="adopt-stat-face"><MoodFace step={majorityMood} size={22} /></span>
          <span class="adopt-stat-text">{m.tryout_adopt_majority_rating({ rating: moodName(majorityMood) })}</span>
        </div>
      {/if}
    </div>

    <Field label={m.ms_name_label()} id="adopt-milestone-name">
      {#snippet children(id)}
        <input
          class="input"
          {id}
          name="milestone-name"
          bind:value={milestoneName}
          placeholder={tryout.label}
        />
      {/snippet}
    </Field>

    <Field label={m.ms_date_label()} id="adopt-milestone-date">
      {#snippet children(id)}
        <DatePicker bind:value={date} {id} name="milestone-date" />
      {/snippet}
    </Field>

    {#if tryout.kind === 'name'}
      <div class="adopt-profile-option" data-adopt-profile-option>
        <div class="spread">
          <span class="adopt-profile-text">{m.tryout_adopt_update_profile_name({ name: tryout.label })}</span>
          <Switch
            checked={updateProfileName}
            label={m.tryout_adopt_update_profile_name({ name: tryout.label })}
            onChange={(v) => (updateProfileName = v)}
          />
        </div>
      </div>
    {/if}

    <div class="stack-3" style="margin-top:var(--space-4)">
      <button
        type="button"
        class="btn btn-primary"
        data-confirm-adopt-milestone
        onclick={handleAdoptWithMilestone}
      >
        <span>{m.tryout_adopt_confirm_add()}</span>
      </button>
      <button
        type="button"
        class="btn btn-soft"
        data-adopt-without-milestone
        onclick={handleAdoptWithoutMilestone}
      >
        <span>{m.tryout_adopt_without_milestone()}</span>
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        data-dismiss-adopt
        onclick={onDismiss}
      >
        <span>{m.keep_it()}</span>
      </button>
    </div>
  {/if}
</Sheet>

<style>
  .adopt-heading {
    margin: 0 0 var(--space-3);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    color: var(--text);
  }

  .adopt-stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    margin-bottom: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-card);
  }

  .adopt-stat-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .adopt-stat-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-2);
  }

  .adopt-stat-face {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .adopt-stat-text {
    font-weight: var(--weight-medium);
    color: var(--text);
  }

  .adopt-profile-option {
    margin-top: var(--space-3);
  }

  .adopt-profile-text {
    font-size: var(--text-sm);
    color: var(--text);
  }
</style>
