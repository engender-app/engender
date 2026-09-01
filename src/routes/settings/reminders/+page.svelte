<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { resolveReminderOrigin } from '$lib/data/provenance';
  import { reminderScheduleLabel, reminderTypeLabel } from '$lib/data/vocabulary/reminderLabel';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { isAndroid } from '$lib/platform';
  import { androidReminders, type AndroidReminderStatus } from '$lib/reminders/android-bridge';

  const TYPE_ICON: Record<string, string> = { med: 'heart', injection: 'zap', appointment: 'calendar', other: 'bell' };
  let isWeb = $derived(!isAndroid());

  let reminders = liveList((j) => j.reminders.getReminders());
  let status = $state<AndroidReminderStatus>({ notifications: 'not-required', exactAlarms: 'not-required' });

  async function refreshStatus() {
    if (isWeb) return;
    try {
      status = await androidReminders.getStatus();
    } catch (error) {
      console.error('Could not read Android reminder status', error);
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
    <EmptyState
      title={m.rem_web_title()}
      text={m.rem_web_body()}
    />
    <p class="muted small" style="text-align:center">{m.rem_web_note()}</p>
  {:else}
    <div class="card checkin-card">
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
        <div class="spread">
          <label class="small muted" for="checkin-time">{m.checkin_time()}</label>
          <input
            class="input"
            style="width:110px"
            type="time"
            id="checkin-time"
            name="checkin-time"
            bind:value={prefs.checkInTime}
          />
        </div>
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
      {/if}
    </div>

    <div class="card spread">
      <span class="kit-row-text">
        <span class="kit-row-title"><Icon name="shield" size={16} /> {m.rem_hide_titles_title()}</span>
        <span class="kit-row-sub">{m.rem_hide_titles_sub()}</span>
      </span>
      <Switch
        checked={prefs.hideNotificationTitles}
        label={m.rem_hide_titles_title()}
        onChange={(v) => {
          prefs.hideNotificationTitles = v;
        }}
      />
    </div>

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
