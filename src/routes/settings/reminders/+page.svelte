<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { db } from '$lib/data/db.svelte';
  import { setReminderEnabled, scheduleLabel } from '$lib/data/repositories/reminders';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { isAndroid } from '$lib/platform';

  const TYPE_ICON: Record<string, string> = { med: 'heart', injection: 'zap', appointment: 'calendar', other: 'bell' };
  let isWeb = $derived(!isAndroid());
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.reminders()}</h1>
    <div class="header-action">
      {#if !isWeb}
        <a class="icon-btn" href="/settings/reminders/new" aria-label="Add reminder"><Icon name="plus" size={22} /></a>
      {/if}
    </div>
  </header>

  {#if isWeb}
    <EmptyState
      riveLabel="Web reminders: a bell with a gentle z-z-z"
      title="Reminders need the Android app"
      text="Browsers cannot fire scheduled notifications reliably while the app is closed. Install the Android app to get medication and check-in reminders."
    />
    <p class="muted small" style="text-align:center">
      Your data syncs nowhere — but an encrypted export moves it to the Android app safely.
    </p>
  {:else}
    <div class="card checkin-card">
      <div class="spread">
        <span class="row-text">
          <span class="row-title"><Icon name="sparkle" size={16} /> Daily check-in</span>
          <span class="row-subtitle">“How are you today?” · skipped on days you already logged</span>
        </span>
        <Switch
          checked={prefs.checkInEnabled}
          label="Daily check-in"
          onChange={(v) => {
            prefs.checkInEnabled = v;
          }}
        />
      </div>
      {#if prefs.checkInEnabled}
        <div class="spread" style="margin-top:var(--space-3)">
          <label class="small muted" for="checkin-time">Time</label>
          <input
            class="input"
            style="width:110px"
            type="time"
            id="checkin-time"
            name="checkin-time"
            bind:value={prefs.checkInTime}
          />
        </div>
      {/if}
    </div>

    <div class="list-group" style="margin-top:var(--space-4)">
      {#each db.reminders as r (r.id)}
        <div class="list-row">
          <span class="row-icon"><Icon name={TYPE_ICON[r.type] || 'bell'} size={22} /></span>
          <a class="row-text" href="/settings/reminders/{r.id}" style="text-decoration:none;color:inherit">
            <span class="row-title">{r.title}</span>
            <span class="row-subtitle">{r.type} · {scheduleLabel(r)}</span>
          </a>
          <Switch checked={r.enabled} label="Enable {r.title}" onChange={(v) => setReminderEnabled(r.id, v)} />
        </div>
      {/each}
    </div>

    <div class="notice notice-info" style="margin-top:var(--space-5)">
      <Icon name="info" size={20} />
      <div class="notice-body">
        <span class="notice-title">Reminders and battery savers</span>
        Some phones (Xiaomi, Samsung, Huawei, OnePlus) kill background apps and silence alarms. If reminders stop
        arriving, allow the app to run in the background.
        <a href="/settings/reminders">Open battery settings</a>
      </div>
    </div>
  {/if}
</div>
