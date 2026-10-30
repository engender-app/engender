<script lang="ts">
  import { undoable } from '$lib/stores/deleteUndo';
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { resolveReminderOrigin } from '$lib/data/provenance';
  import { reminderScheduleLabel } from '$lib/data/vocabulary/reminderLabel';
  import { prefs, preferencesAttached } from '$lib/data/prefs/store.svelte';
  import type { Reminder } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import TimePicker from '$lib/components/TimePicker.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { dateInputValueFromEpochDay, epochDayFromDateInputValue, epochDayFromLocalDate } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { nextCheckIn } from '$lib/reminders/checkIn';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { collapse, disclose } from '$lib/motion/reveal';
  import { isAndroid } from '$lib/platform';
  import { androidReminders, type AndroidReminderStatus } from '$lib/reminders/android-bridge';
  import { watchStatus } from '$lib/permissions/watchStatus';

  let isWeb = $derived(!isAndroid());

  let reminders = liveList((j) => j.reminders.getReminders());
  /* 'unreadable' is a read the bridge refused (ticket 41): neither a grant
     nor a refusal, so the screen says it could not check rather than
     claiming either. */
  let status = $state<AndroidReminderStatus | 'unreadable'>({ notifications: 'not-required', exactAlarms: 'not-required' });
  let statusReady = $state(false);

  // Web's one write (ADR-0063): a reminder that can never ring on this
  // device still needs a cancel path, and this is it.
  const record = recordEditor<Reminder>({
    remove: (id) => undoable((j) => j.reminders.deleteReminder(id)),
    findById: (id) => reminders.rows.find((r) => r.id === id)
  });

  /* Re-read whenever the screen comes back to the front, because both
     ways out of a refusal are Android's own settings screens (ticket 41,
     U30). Every read goes through the watcher, the ones after a request
     too, so a read from before the trip to settings cannot land last. */
  let statusWatch: ReturnType<typeof watchStatus<AndroidReminderStatus | 'unreadable'>> | null = null;

  async function requestNotifications() {
    try {
      await androidReminders.requestNotificationPermission();
    } catch (error) {
      console.error('Could not request notification permission', error);
    }
    await statusWatch?.refresh();
  }

  async function requestExactAlarms() {
    try {
      await androidReminders.requestExactAlarmPermission();
    } catch (error) {
      console.error('Could not request exact alarm permission', error);
    }
    await statusWatch?.refresh();
  }

  async function openBatterySettings() {
    try {
      await androidReminders.openBatterySettings();
    } catch (error) {
      console.error('Could not open battery settings', error);
    }
  }

  $effect(() => {
    if (isWeb) return;
    const watch = watchStatus<AndroidReminderStatus | 'unreadable'>({
      read: () => androidReminders.getStatus(),
      unreadable: 'unreadable',
      apply: (next) => {
        status = next;
        statusReady = true;
      }
    });
    statusWatch = watch;
    return () => {
      watch.stop();
      statusWatch = null;
    };
  });

  /* The check-in's pause (functional audit ticket 08): one date, the last
     silent day. A date that has gone by is no pause, so the field reads
     empty again the day after without anything having to clear it. */
  let today = $derived(currentDay());
  let pausedThrough = $derived(
    prefs.checkInPausedThrough !== null && prefs.checkInPausedThrough >= today ? prefs.checkInPausedThrough : null
  );
  let pauseValue = $derived(pausedThrough === null ? '' : dateInputValueFromEpochDay(pausedThrough));
  /* When it rings again: checkIn.ts's rule, the one the alarm is held to. */
  let backOn = $derived.by(() => {
    if (pausedThrough === null) return null;
    const at = nextCheckIn(
      { enabled: true, time: prefs.checkInTime, pausedThroughEpochDay: pausedThrough, latestEntryEpochDay: null },
      new Date()
    );
    return at && m.checkin_pause_back({ date: fmtDay(epochDayFromLocalDate(at), { day: 'numeric', month: 'long' }), time: prefs.checkInTime });
  });
  function setPause(value: string) {
    prefs.checkInPausedThrough = value ? epochDayFromDateInputValue(value) : null;
  }

  /* Latched: a reserve must not put its placeholder back (ticket 211). */
  let remindersRevealed = $state(false);
  $effect.pre(() => {
    if (!reminders.loading) remindersRevealed = true;
  });
  const remindersEstimate = readReserve('reminders');
  const remindersRemember = (px: number) => rememberReserve('reminders', px);
  const checkInEstimate = readReserve('reminders-check-in');
  const checkInRemember = (px: number) => rememberReserve('reminders-check-in', px);
  const permissionEstimate = readReserve('reminders-permission');
  const permissionRemember = (px: number) => rememberReserve('reminders-permission', px);
</script>

<div class="screen" data-screen>
  <ScreenHeader title={m.reminders()} back="/settings">
    {#snippet actions()}
      {#if !isWeb}
        <a class="icon-btn" href="/settings/reminders/new" aria-label={m.rem_add_aria()}><Icon name="plus" size={22} /></a>
      {/if}
    {/snippet}
  </ScreenHeader>

  {#if isWeb}
    <!-- Ticket 13: the limitation notice is the handoff. A browser holds
         the rows as data (ADR-0063); the action is the transfer task the
         text describes, not another sentence about it. -->
    <Notice
      icon="bell"
      key="reminders-web"
      title={m.rem_web_list_note()}
      text={m.rem_web_note()}
      action={{ label: m.export_import(), href: '/settings/export' }}
    />

    <!-- Held until the reminders have answered, then faded in (ux-carpet
         ticket 211): the empty notice stood in for a list that then cut in
         at full opacity. -->
    <ReadReserve ready={remindersRevealed} estimate={remindersEstimate} onrest={remindersRemember}>
      {#if reminders.rows.length === 0}
        <Notice icon="bell" key="reminders-empty" title={m.rem_empty_title()} text={m.rem_empty_body()} />
      {:else}
        <ListCard>
          {#each reminders.rows as r (r.id)}
            {@const origin = resolveReminderOrigin(r)}
            <div class="rows-divide" transition:collapse>
              <ListRow
                static
                key={r.id}
                data-reminder={r.id}
                icon="bell"
                title={r.title}
                subtitle={[reminderScheduleLabel(r), origin?.text]}
                action={{
                  icon: 'trash',
                  label: m.rem_delete_aria({ title: r.title }),
                  onclick: () => record.askToDelete(r)
                }}
              />
            </div>
          {/each}
        </ListCard>
      {/if}
    </ReadReserve>

    <RecordSheet
      {record}
      handle="reminder"
      confirm={{
        title: m.rem_delete_sheet(),
        question: (reminder) => m.rem_delete_q({ title: reminder.title }),
        hint: () => m.rem_delete_hint(),
        confirmLabel: m.rem_delete(),
        cancelLabel: m.keep_it()
      }}
    />
  {:else}
    <!-- Carpet 30: the app's own daily check-in, flush on the page. It had a
         `.card` with a 1.5px `--accent-border` edge, which was the group
         saying "this one is mine, not a reminder you made" - a claim rule 4
         has no treatment for, and one the row's own title makes in words.
         The shape is the disguise sheet's, settled on carpet 29: `.spread`
         rows in a stack, no ground, no edge, no separators. -->
    <ReadReserve ready={preferencesAttached()} estimate={checkInEstimate} onrest={checkInRemember} data-checkin>
      <div class="stack-3">
        <div class="spread">
          <span class="kit-row-text">
            <span class="kit-row-title"><Icon name="sparkle" size={16} /> {m.checkin_title()}</span>
            <span class="kit-row-sub">{m.checkin_sub()}</span>
          </span>
          <Switch
            checked={prefs.checkInEnabled}
            label={m.checkin_title()}
            onChange={(v) => {
              prefs.checkInEnabled = v;
            }}
          />
        </div>
        {#if prefs.checkInEnabled}
        <!-- What the switch above turns on, opening its own height rather
             than arriving at full size (rule 10, and it is the group's own
             edge that used to hold these two rows together). `disclose` is
             tier 3's primitive for exactly this, and it substitutes a cut
             under reduced motion rather than being deleted. -->
        <div class="disclosed" transition:disclose>
          <!-- `Field spread`, so this row carries the same shape as the two
               switch rows around it: the name at the left edge, the control at
               the right. What was here wrote the pair by hand and capped the
               input at `width: 110px`, which is under the min-content width of
               a platform time control - notifications' `.quiet-window` already
               says so about the same input - so the value was clipped and the
               row read as a label losing an argument with a pill. The cap is
               the 160px `/settings/reminders/[id]` gives the same field. -->
          <div class="stack-3">
            <Field label={m.checkin_time()} id="checkin-time" spread>
              {#snippet children(id)}
                <TimePicker {id} name="checkin-time" style="max-width:160px" required bind:value={prefs.checkInTime} />
              {/snippet}
            </Field>
            <!-- The pause sits on the check-in itself rather than on a screen
                 of its own (functional audit ticket 08): an empty field is no
                 pause, a date is the last quiet day, and the picker's own
                 Clear is how it resumes. -->
            <Field label={m.checkin_pause_label()} id="checkin-pause" spread>
              {#snippet children(id)}
                <DatePicker
                  {id}
                  name="checkin-pause"
                  style="max-width:160px"
                  min={dateInputValueFromEpochDay(today)}
                  value={pauseValue}
                  onchange={setPause}
                  placeholder={m.checkin_pause_none()}
                  data-checkin-pause
                />
              {/snippet}
            </Field>
            {#if backOn}
              <div class="disclosed" transition:disclose>
                <p class="checkin-back" data-checkin-back>{backOn}</p>
              </div>
            {/if}
          </div>
        </div>
        {/if}
      </div>
    </ReadReserve>

    <!-- One kit Notice per refusal (ticket 41), so each says only what its
         own permission costs and carries its one way out, and a grant made
         in Android's settings takes its notice away by the collapse Notice
         owns rather than in one frame. The inexact one states the accepted
         fallback after a revoke: Android cancels the exact alarms and the
         app sets them again only when it next opens or the phone restarts,
         never sooner. A read Android refused says so and offers another
         try, rather than calling either permission on or off. -->
    <ReadReserve ready={statusReady} estimate={permissionEstimate} onrest={permissionRemember}>
      {#if status === 'unreadable'}
        <Notice
          icon="alert"
          key="reminders-permissions-unknown"
          title={m.perm_status_unknown_title()}
          text={m.rem_status_unknown_body()}
          action={{ label: m.read_retry(), onclick: () => void statusWatch?.refresh() }}
        />
      {:else}
      {#if status.notifications === 'denied'}
        <Notice
          icon="alert"
          key="reminders-notifications-off"
          title={m.rem_notifications_off_title()}
          text={m.rem_notifications_off_body()}
          action={{ label: m.rem_allow_notifications(), onclick: requestNotifications }}
        />
      {/if}
      {#if status.exactAlarms === 'denied'}
        <Notice
          icon="alert"
          key="reminders-inexact"
          title={m.rem_inexact_title()}
          text={m.rem_inexact_body()}
          action={{ label: m.rem_allow_exact_alarms(), onclick: requestExactAlarms }}
        />
      {/if}
      {/if}
    </ReadReserve>

    <ReadReserve ready={remindersRevealed} estimate={remindersEstimate} onrest={remindersRemember}>
      <!-- The notifications screen's Reminders switch gates every row below
           (platform-sync.ts's schedulableReminders), and each row keeps its
           own switch on while it is off - so the list says so rather than
           showing a column of switched-on reminders that will not ring
           (functional audit ticket 08). -->
      {#if !prefs.remindersEnabled && reminders.rows.length > 0}
        <Notice
          icon="bell"
          key="reminders-switched-off"
          title={m.rem_switched_off_title()}
          text={m.rem_switched_off_body()}
          action={{ label: m.rem_switched_off_action(), href: '/settings/notifications' }}
        />
      {/if}
      <ListCard>
        {#each reminders.rows as r (r.id)}
          <!-- A navigable title beside an independent Switch, and ListRow has
               no shape for that: `href` makes the whole row the link, which
               would toggle the switch by navigating past it; `action` renders
               one icon button, not a Switch (ticket 18). -->
          {@const origin = resolveReminderOrigin(r)}
          <div transition:collapse class="kit-row" data-list-row={r.id}>
            <span class="kit-row-ico"><Icon name="bell" size={22} /></span>
            <a class="kit-row-text" href="/settings/reminders/{r.id}" style="text-decoration:none;color:inherit">
              <span class="kit-row-title">{r.title}</span>
              <span class="kit-row-sub">{reminderScheduleLabel(r)}</span>
              {#if origin}<span class="kit-row-sub">{origin.text}</span>{/if}
            </a>
            <span class="kit-row-trail">
              <Switch checked={r.enabled} label={m.rem_enable_aria({ title: r.title })} onChange={(v) => journal.reminders.setEnabled(r.id, v)} />
            </span>
          </div>
        {/each}
      </ListCard>
    </ReadReserve>

    <div class="notice notice-info">
      <Icon name="info" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.rem_battery_title()}</span>
        {m.rem_battery_body()}
        <button class="btn btn-soft" onclick={openBatterySettings}>{m.rem_battery_link()}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* The pause's answer, read under the field it answers: --text-2 like a
     field hint, flush with the label above it. */
  .checkin-back {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }
</style>
