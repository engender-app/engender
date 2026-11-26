<script lang="ts">
  import { replaceRoute } from '$lib/navigation/smart-back';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { activeEpisodesAt, sameDrug } from '$lib/data/regimenEpisode';
  import {
    choiceFromRule,
    nextOccurrence,
    ruleFromChoice,
    type RecurrenceChoice,
    type ReminderRule
  } from '$lib/data/reminderRule';
  import { intlLocale } from '$lib/data/dates';
  import { resolveReminderOrigin } from '$lib/data/provenance';
  import type { Reminder } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import TimePicker from '$lib/components/TimePicker.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { detailDraft } from '$lib/components/kit/detailDraft.svelte';
  import DiscardSheet from '$lib/components/kit/DiscardSheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import { journalTextAutocomplete } from '$lib/platform';
  import { writer } from '$lib/stores/attempt.svelte';
  import { toast } from '$lib/stores/toasts.svelte';

  /* What the segmented control offers; the stored rule is reminderRule.ts's
     shape (a one-off day, DAILY, or an anchored EVERY_N_DAYS). */
  const RECURRENCES: { value: RecurrenceChoice; label: string }[] = [
    { value: 'ONCE', label: m.rem_rec_once() },
    { value: 'DAILY', label: m.rem_rec_daily() },
    { value: 'EVERY_3_DAYS', label: m.rem_rec_every_3() },
    { value: 'EVERY_7_DAYS', label: m.rem_rec_every_7() },
  ];

  /* Reminders are tens of rows and not mirrored, so the one being edited comes
     from the list rather than from a query of its own. The draft is filled the
     moment it arrives and never again, and refilled if the route moves to
     another id - both are detailDraft.ts's rules, node-tested there. Back
     with an unsaved change asks first, which is detailDraft's default. */
  const detail = detailDraft<Reminder, { title: string; time: string; choice: RecurrenceChoice; drug: string }>({
    read: async (j, id) => (await j.reminders.getReminders()).find((r) => r.id === id),
    blank: () => ({ title: '', time: '20:00', choice: 'DAILY', drug: '' }),
    fromRecord: (found) => ({ title: found.title, time: found.time, choice: choiceFromRule(found), drug: found.drug ?? '' }),
    // Leaving waits while a save runs, so a late success never lands on another screen.
    saving: () => saving.busy
  });
  let draft = $derived(detail.draft);
  let origin = $derived(detail.record ? resolveReminderOrigin(detail.record) : null);

  /* Which drug the reminder is for (functional audit ticket 20): one of the
     regimens running today, or the one it already names. Picking one makes
     its notification open that drug's dose log, with Taken and Skip; the
     chip picked again un-picks it. A reminder the app manages (stock, wear)
     is offered none: it is about something other than a dose. */
  const episodes = liveList((j) => j.regimen.getEpisodes());
  let drugChoices = $derived.by(() => {
    if (detail.record?.autoSource) return [];
    const names: string[] = [];
    for (const name of [...activeEpisodesAt(episodes.rows, Date.now()).map((e) => e.drug), detail.record?.drug ?? '']) {
      if (name && !names.some((known) => sameDrug(known, name))) names.push(name);
    }
    return names;
  });
  const pickDrug = (name: string) => (draft.drug = sameDrug(draft.drug, name) ? '' : name);

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

  /* Leaves only once the reminder is stored (after-release 06): it used to
     navigate before the write settled, so a failed one vanished with the
     screen. */
  const saving = writer();
  async function saveReminder() {
    const saved = await saving.run(
      () =>
        journal.reminders.upsertReminder({
          id: detail.record?.id,
          title: draft.title || draft.drug || m.rem_default_name(),
          enabled: detail.record?.enabled ?? true,
          drug: draft.drug || null,
          ...ruleFromDraft(),
        }),
      m.write_failed()
    );
    if (!saved) return;
    // The baseline moves first, or the guard would hold the save's own exit.
    detail.commit();
    toast(m.saved(), { kind: 'record-saved' });
    await replaceRoute('/settings/reminders');
  }
</script>

<div class="screen" data-screen>
  <ScreenHeader title={detail.isNew ? m.rem_new_title() : m.rem_edit_title()} back="/settings/reminders" />

  {#if detail.failed && !detail.isNew}
    <Notice key="reminder-read" title={m.read_failed()} action={{ label: m.read_retry(), onclick: () => detail.retry() }} />
  {:else if detail.loading && !detail.isNew}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else if !detail.isNew && !detail.record}
    <!-- An id that names nothing stored: a deleted reminder, an old link.
         Before ticket 04 this drew an empty editable form, and Save made a
         new reminder out of it. -->
    <div class="screen-part" in:crossfade>
      <Notice
        icon="bell"
        key="reminder-missing"
        role={roleAt(activeFlag.roles, 0)}
        title={m.rem_missing_title()}
        action={{ label: m.rem_missing_action(), href: '/settings/reminders' }}
      />
    </div>
  {:else}
  <!-- Inert while the save runs (after-release 06): what is sent is what
       is stored, so nothing can be typed in the meantime and lost when the
       screen leaves. -->
  <div class="screen-part" in:crossfade inert={saving.busy}>
  {#if origin}
    <!-- Editing and saving clears autoSource (reminders.ts), so this notice
         is itself the warning that Save takes the reminder over - shown
         once, before the editor rather than after (phase 5 deepening
         ticket 22). -->
    <Notice
      icon="sparkle"
      key="reminder-provenance"
      title={origin.text}
      text={origin.hint}
      action={origin.href && origin.actionLabel ? { label: origin.actionLabel, href: origin.href } : undefined}
    />
  {/if}

  <Field label={m.name_label()} id="r-name">
    {#snippet children(id)}
      <input autocomplete={journalTextAutocomplete()} class="input" {id} name="r-name" placeholder={m.rem_name_placeholder()} bind:value={draft.title} />
    {/snippet}
  </Field>
  <Field label={m.time_label()} id="r-time">
    {#snippet children(id)}
      <TimePicker {id} name="r-time" style="max-width:160px" required bind:value={draft.time} />
    {/snippet}
  </Field>
  <Field label={m.rem_repeats_label()} legend>
    {#snippet children()}
      <Segmented name={m.rem_repeats_label()} options={RECURRENCES} value={draft.choice} onChange={(v) => (draft.choice = v as RecurrenceChoice)} />
    {/snippet}
  </Field>
  <p class="next-preview">
    <Icon name="clock" size={14} />
    {m.rem_next({ when: nextPreview })}
  </p>

  {#if drugChoices.length > 0}
    <!-- Disclosed rather than drawn: the regimens answer after the form is
         already up, and a new reminder's form is up from the first frame. -->
    <div transition:disclose|local data-reminder-drug-field>
      <Field label={m.rem_drug_label()} hint={m.rem_drug_hint()} legend>
        {#snippet children(labelId, hintId)}
          <div class="tag-row" role="group" aria-labelledby={labelId} aria-describedby={hintId}>
            {#each drugChoices as name (name)}
              <button
                type="button"
                class="tag-chip press"
                class:is-selected={sameDrug(draft.drug, name)}
                aria-pressed={sameDrug(draft.drug, name)}
                data-reminder-drug={name}
                onclick={() => pickDrug(name)}
              >
                {name}
              </button>
            {/each}
          </div>
        {/snippet}
      </Field>
    </div>
  {/if}

  <div class="notice notice-info">
    <Icon name="info" size={20} />
    <div class="notice-body">
      {m.rem_alarm_note()}
      <a href="/settings/reminders">{m.rem_alarm_note_link()}</a>
    </div>
  </div>

  <SaveBar>
    <button class="btn btn-primary" data-save disabled={saving.busy} onclick={saveReminder}>
      <Icon name="check" size={20} /><span>{m.rem_save()}</span>
    </button>
  </SaveBar>
  </div>
  {/if}
</div>

<DiscardSheet guard={detail.guard} />
