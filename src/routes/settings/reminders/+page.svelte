<script lang="ts">
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { resolveReminderOrigin } from '$lib/data/provenance';
  import { reminderScheduleLabel, reminderTypeLabel } from '$lib/data/vocabulary/reminderLabel';
  import { prefs, preferencesAttached } from '$lib/data/prefs/store.svelte';
  import type { Reminder } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { disclose } from '$lib/motion/reveal';
  import { isAndroid } from '$lib/platform';
  import { androidReminders, type AndroidReminderStatus } from '$lib/reminders/android-bridge';

  const TYPE_ICON: Record<string, string> = { med: 'heart', injection: 'zap', appointment: 'calendar', other: 'bell' };
  let isWeb = $derived(!isAndroid());

  let reminders = liveList((j) => j.reminders.getReminders());
  let status = $state<AndroidReminderStatus>({ notifications: 'not-required', exactAlarms: 'not-required' });
  let statusReady = $state(false);

  // Web's one write (ADR-0063): a reminder that can never ring on this
  // device still needs a cancel path, and this is it.
  const record = recordEditor<Reminder>({
    remove: (id) => journal.reminders.deleteReminder(id),
    findById: (id) => reminders.rows.find((r) => r.id === id)
  });

  async function refreshStatus() {
    if (isWeb) return;
    try {
      status = await androidReminders.getStatus();
    } catch (error) {
      console.error('Could not read Android reminder status', error);
    } finally {
      statusReady = true;
    }
  }

  async function requestNotifications() {
    try {
      status = await androidReminders.requestNotificationPermission();
    } catch (error) {
      console.error('Could not request notification permission', error);
    }
  }

  async function requestExactAlarms() {
    try {
      await androidReminders.requestExactAlarmPermission();
    } catch (error) {
      console.error('Could not request exact alarm permission', error);
    }
    await refreshStatus();
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
    void refreshStatus();
  });

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
            <ListRow
              static
              key={r.id}
              data-reminder={r.id}
              icon={TYPE_ICON[r.type] || 'bell'}
              title={r.title}
              subtitle={[`${reminderTypeLabel(r.type)} · ${reminderScheduleLabel(r)}`, origin?.text]}
              action={{
                icon: 'trash',
                label: m.rem_delete_aria({ title: r.title }),
                onclick: () => record.askToDelete(r)
              }}
            />
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
          <Field label={m.checkin_time()} id="checkin-time" spread>
            {#snippet children(id)}
              <input
                class="input"
                style="max-width:160px"
                type="time"
                {id}
                name="checkin-time"
                bind:value={prefs.checkInTime}
              />
            {/snippet}
          </Field>
          <div class="spread" data-checkin-affirmations>
            <span class="kit-row-text">
              <span class="kit-row-title">{m.checkin_affirmations_title()}</span>
              <span class="kit-row-sub">{m.checkin_affirmations_sub()}</span>
            </span>
            <Switch
              checked={prefs.checkInAffirmationsEnabled}
              label={m.checkin_affirmations_title()}
              onChange={(v) => {
                prefs.checkInAffirmationsEnabled = v;
              }}
            />
          </div>
        </div>
        {/if}
      </div>
    </ReadReserve>

    <ReadReserve ready={statusReady} estimate={permissionEstimate} onrest={permissionRemember}>
      {#if status.notifications === 'denied' || status.exactAlarms === 'denied'}
        <div class="notice notice-warning">
          <Icon name="alert" size={20} />
          <div class="notice-body">
            <span class="notice-title">{m.rem_capabilities_title()}</span>
            {m.rem_capabilities_body()}
            <div class="spread" style="margin-top:var(--space-2);gap:var(--space-2)">
              {#if status.notifications === 'denied'}
                <button class="btn btn-soft" onclick={requestNotifications}>{m.rem_allow_notifications()}</button>
              {/if}
              {#if status.exactAlarms === 'denied'}
                <button class="btn btn-soft" onclick={requestExactAlarms}>{m.rem_allow_exact_alarms()}</button>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </ReadReserve>

    <ReadReserve ready={remindersRevealed} estimate={remindersEstimate} onrest={remindersRemember}>
      <ListCard>
        {#each reminders.rows as r (r.id)}
          <!-- A navigable title beside an independent Switch, and ListRow has
               no shape for that: `href` makes the whole row the link, which
               would toggle the switch by navigating past it; `action` renders
               one icon button, not a Switch (ticket 18). -->
          {@const origin = resolveReminderOrigin(r)}
          <div class="kit-row" data-list-row={r.id}>
            <span class="kit-row-ico"><Icon name={TYPE_ICON[r.type] || 'bell'} size={22} /></span>
            <a class="kit-row-text" href="/settings/reminders/{r.id}" style="text-decoration:none;color:inherit">
              <span class="kit-row-title">{r.title}</span>
              <span class="kit-row-sub">{reminderTypeLabel(r.type)} · {reminderScheduleLabel(r)}</span>
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
