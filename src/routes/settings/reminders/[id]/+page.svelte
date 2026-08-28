<script lang="ts">
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import {
    choiceFromRule,
    nextOccurrence,
    ruleFromChoice,
    type RecurrenceChoice,
    type ReminderRule
  } from '$lib/data/reminderRule';
  import { intlLocale } from '$lib/data/dates';
  import type { Reminder } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import { detailDraft } from '$lib/components/kit/detailDraft.svelte';

  const TYPES = [
    { value: 'med', label: m.rem_type_med() },
    { value: 'injection', label: m.rem_type_injection() },
    { value: 'appointment', label: m.rem_type_appointment() },
    { value: 'other', label: m.rem_type_other() },
  ];
  /* What the segmented control offers; the stored rule is reminderRule.ts's
     shape (a one-off day, DAILY/WEEKLY, or an anchored EVERY_N_DAYS). */
  const RECURRENCES: { value: RecurrenceChoice; label: string }[] = [
    { value: 'ONCE', label: m.rem_rec_once() },
    { value: 'DAILY', label: m.rem_rec_daily() },
    { value: 'EVERY_3_DAYS', label: m.rem_rec_every_3() },
    { value: 'EVERY_7_DAYS', label: m.rem_rec_every_7() },
    { value: 'WEEKLY', label: m.rem_rec_weekly() },
  ];

  /* Reminders are tens of rows and not mirrored, so the one being edited comes
     from the list rather than from a query of its own. The draft is filled the
     moment it arrives and never again, and refilled if the route moves to
     another id - both are detailDraft.ts's rules, node-tested there. */
  const detail = detailDraft<Reminder, { title: string; type: Reminder['type']; time: string; choice: RecurrenceChoice }>({
    read: async (j, id) => (await j.reminders.getReminders()).find((r) => r.id === id),
    blank: () => ({ title: '', type: 'med', time: '20:00', choice: 'DAILY' }),
    fromRecord: (found) => ({ title: found.title, type: found.type, time: found.time, choice: choiceFromRule(found) })
  });
  let draft = $derived(detail.draft);

  const ruleFromDraft = (): ReminderRule =>
    ruleFromChoice(draft.choice, draft.time, detail.record ?? null, new Date());

  /* The rule the Android scheduler is held to case for case
     (reminder-rule.json): the preview cannot promise a moment that will not
     fire. Only an elapsed one-off has no occurrence left, and ruleFromDraft()
     dates a one-off forward every time it is called, so there is always a
     moment here to show. */
  let nextPreview = $derived.by(() => {
    return new Intl.DateTimeFormat(intlLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(nextOccurrence(ruleFromDraft(), new Date())!);
  });

  function saveReminder() {
    journal.reminders.upsertReminder({
      id: detail.record?.id,
      title: draft.title || m.rem_default_name(),
      type: draft.type,
      enabled: detail.record?.enabled ?? true,
      ...ruleFromDraft(),
    });
    goto('/settings/reminders');
  }
</script>

<div class="screen">
  <ScreenHeader title={detail.isNew ? m.rem_new_title() : m.rem_edit_title()} back="/settings/reminders" />

  <div class="card editor-section">
    <div class="field">
      <span class="field-label">{m.rem_type_label()}</span>
      <Segmented name={m.rem_type_label()} options={TYPES} value={draft.type} onChange={(v) => (draft.type = v as Reminder['type'])} />
    </div>
    <div class="field">
      <label class="field-label" for="r-name">{m.rem_name_label()}</label>
      <input class="input" id="r-name" name="r-name" placeholder={m.rem_name_placeholder()} bind:value={draft.title} />
    </div>
    <div class="field">
      <label class="field-label" for="r-time">{m.rem_time_label()}</label>
      <input class="input" id="r-time" name="r-time" type="time" style="max-width:160px" bind:value={draft.time} />
    </div>
    <div class="field">
      <span class="field-label">{m.rem_repeats_label()}</span>
      <Segmented name={m.rem_repeats_label()} options={RECURRENCES} value={draft.choice} onChange={(v) => (draft.choice = v as RecurrenceChoice)} />
    </div>
    <p class="next-preview"><Icon name="clock" size={14} /> {m.rem_next({ when: nextPreview })}</p>
  </div>

  <div class="notice notice-info">
    <Icon name="info" size={20} />
    <div class="notice-body">
      {m.rem_alarm_note()}
      <a href="/settings/reminders">{m.rem_alarm_note_link()}</a>
    </div>
  </div>

  <div class="editor-savebar">
    <button class="btn btn-primary" data-save onclick={saveReminder}>
      <Icon name="check" size={20} /><span>{m.rem_save()}</span>
    </button>
  </div>
</div>
