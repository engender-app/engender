<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery, onFirstResult } from '$lib/data/live/journal.svelte';
  import { nextOccurrence, type ReminderRule } from '$lib/data/reminderRule';
  import { epochDayFromLocalDate, todayEpochDay } from '$lib/data/epochDay';
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
  /* What the segmented control offers; the stored rule is reminderRule.ts's
     shape (a one-off day, DAILY/WEEKLY, or an anchored EVERY_N_DAYS). */
  const RECURRENCES = [
    { value: 'ONCE', label: 'Once' },
    { value: 'DAILY', label: 'Daily' },
    { value: 'EVERY_3_DAYS', label: 'Every 3 days' },
    { value: 'EVERY_7_DAYS', label: 'Every 7 days' },
    { value: 'WEEKLY', label: 'Weekly' },
  ];

  function choiceFromRule(r: Reminder): string {
    if (r.recurrence === null) return 'ONCE';
    if (r.recurrence === 'EVERY_N_DAYS') return r.interval === 7 ? 'EVERY_7_DAYS' : 'EVERY_3_DAYS';
    return r.recurrence;
  }

  const isNew = page.params.id === 'new';

  /* Reminders are tens of rows and not mirrored, so the one being edited comes
     from the list rather than from a query of its own. The draft is filled the
     moment it arrives and never again - re-running would discard whatever the
     user has typed since. */
  let stored = liveQuery([], (j) => (isNew ? Promise.resolve([]) : j.reminders.getReminders()));
  let existing = $derived(stored.value?.find((r) => r.id === page.params.id));

  let draft = $state({ title: '', type: 'med' as Reminder['type'], time: '20:00', choice: 'DAILY' });

  onFirstResult(stored, (reminders) => {
    const found = reminders?.find((r) => r.id === page.params.id);
    if (found) draft = { title: found.title, type: found.type, time: found.time, choice: choiceFromRule(found) };
  });

  function ruleFromDraft(): ReminderRule {
    const none = { interval: null, anchorEpochDay: null, epochDay: null };
    if (draft.choice === 'ONCE') {
      // "Once" means the next moment the chosen time comes around; the
      // shared rule function decides whether that is today or tomorrow.
      const at = nextOccurrence({ ...none, time: draft.time, recurrence: 'DAILY' }, new Date());
      return { ...none, time: draft.time, recurrence: null, epochDay: epochDayFromLocalDate(at) };
    }
    if (draft.choice === 'EVERY_3_DAYS' || draft.choice === 'EVERY_7_DAYS') {
      const interval = draft.choice === 'EVERY_3_DAYS' ? 3 : 7;
      // An existing progression keeps its anchor; a new one starts today.
      const anchorEpochDay =
        existing?.recurrence === 'EVERY_N_DAYS' && existing.interval === interval
          ? existing.anchorEpochDay
          : todayEpochDay();
      return { ...none, time: draft.time, recurrence: 'EVERY_N_DAYS', interval, anchorEpochDay };
    }
    return { ...none, time: draft.time, recurrence: draft.choice as 'DAILY' | 'WEEKLY' };
  }

  /* The same function the scheduler uses (ADR-0010): the preview cannot
     disagree with what will actually fire. */
  let nextPreview = $derived.by(() => {
    return new Intl.DateTimeFormat(intlLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(nextOccurrence(ruleFromDraft(), new Date()));
  });

  function saveReminder() {
    journal.reminders.upsertReminder({
      id: existing?.id,
      title: draft.title || 'Reminder',
      type: draft.type,
      enabled: existing?.enabled ?? true,
      ...ruleFromDraft(),
    });
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
      <Segmented name="Repeats" options={RECURRENCES} value={draft.choice} onChange={(v) => (draft.choice = v)} />
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
