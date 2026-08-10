<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { db } from '$lib/data/db.svelte';
  import { upsertReminder } from '$lib/data/repositories/reminders';
  import { intlLocale } from '$lib/data/dates';
  import type { Reminder } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';

  const TYPES = [
    { value: 'med', label: 'Medication' },
    { value: 'injection', label: 'Injection' },
    { value: 'appointment', label: 'Appointment' },
    { value: 'other', label: 'Other' },
  ];
  const RECURRENCES = [
    { value: 'ONCE', label: 'Once' },
    { value: 'DAILY', label: 'Daily' },
    { value: 'EVERY_3_DAYS', label: 'Every 3 days' },
    { value: 'EVERY_7_DAYS', label: 'Every 7 days' },
    { value: 'WEEKLY', label: 'Weekly' },
  ];

  const isNew = page.params.id === 'new';
  const existing = isNew ? undefined : db.reminders.find((r) => r.id === page.params.id);

  let draft = $state(
    existing
      ? { ...existing, recurrence: existing.recurrence ?? 'ONCE' }
      : { title: '', type: 'med' as Reminder['type'], time: '20:00', recurrence: 'DAILY', enabled: true }
  );

  let nextPreview = $derived.by(() => {
    const [h, mi] = draft.time.split(':').map(Number);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
    if (next <= now) {
      const add = draft.recurrence === 'EVERY_3_DAYS' ? 3 : draft.recurrence === 'EVERY_7_DAYS' || draft.recurrence === 'WEEKLY' ? 7 : 1;
      next.setDate(next.getDate() + add);
    }
    return new Intl.DateTimeFormat(intlLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(next);
  });

  function saveReminder() {
    upsertReminder({
      ...draft,
      recurrence: draft.recurrence === 'ONCE' ? null : draft.recurrence,
      title: draft.title || 'Reminder',
    } as Reminder);
    goto('/settings/reminders');
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings/reminders" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{isNew ? 'New reminder' : 'Edit reminder'}</h1>
    <div class="header-action"></div>
  </header>

  <div class="card editor-section">
    <div class="field">
      <span class="field-label">Type</span>
      <Segmented name="Type" options={TYPES} value={draft.type} onChange={(v) => (draft.type = v as Reminder['type'])} />
    </div>
    <div class="field">
      <label class="field-label" for="r-name">Name</label>
      <input class="input" id="r-name" name="r-name" placeholder="e.g. Estradiol patch" bind:value={draft.title} />
    </div>
    <div class="field">
      <label class="field-label" for="r-time">Time</label>
      <input class="input" id="r-time" name="r-time" type="time" style="max-width:160px" bind:value={draft.time} />
    </div>
    <div class="field">
      <span class="field-label">Repeats</span>
      <Segmented name="Repeats" options={RECURRENCES} value={draft.recurrence ?? 'ONCE'} onChange={(v) => (draft.recurrence = v)} />
    </div>
    <p class="next-preview"><Icon name="clock" size={14} /> Next: <strong>{nextPreview}</strong></p>
  </div>

  <div class="notice notice-info">
    <Icon name="info" size={20} />
    <div class="notice-body">
      Exact alarms survive reboots, but aggressive battery savers can silence them.
      <a href="/settings/reminders">Check your phone’s battery settings</a> if a reminder ever goes quiet.
    </div>
  </div>

  <div class="editor-savebar">
    <button class="btn btn-primary" data-save onclick={saveReminder}>
      <Icon name="check" size={20} /><span>Save reminder</span>
    </button>
  </div>
</div>
