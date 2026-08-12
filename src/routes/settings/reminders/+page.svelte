<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { reminderScheduleLabel, reminderTypeLabel } from '$lib/data/vocabulary/reminderLabel';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { isAndroid } from '$lib/platform';

  const TYPE_ICON: Record<string, string> = { med: 'heart', injection: 'zap', appointment: 'calendar', other: 'bell' };
  let isWeb = $derived(!isAndroid());

  let reminders = liveQuery(['reminder'], (j) => j.reminders.getReminders());
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.reminders()}</h1>
    <div class="header-action">
      {#if !isWeb}
        <a class="icon-btn" href="/settings/reminders/new" aria-label={m.rem_add_aria()}><Icon name="plus" size={22} /></a>
      {/if}
    </div>
  </header>

  {#if isWeb}
    <EmptyState
      riveLabel={m.rive_reminders_web()}
      title={m.rem_web_title()}
      text={m.rem_web_body()}
    />
    <p class="muted small" style="text-align:center">{m.rem_web_note()}</p>
  {:else}
    <div class="card checkin-card">
      <div class="spread">
        <span class="row-text">
          <span class="row-title"><Icon name="sparkle" size={16} /> {m.checkin_title()}</span>
          <span class="row-subtitle">{m.checkin_sub()}</span>
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
        <div class="spread" style="margin-top:var(--space-3)">
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
      {/if}
    </div>

    <div class="list-group" style="margin-top:var(--space-4)">
      {#each reminders.value ?? [] as r (r.id)}
        <div class="list-row">
          <span class="row-icon"><Icon name={TYPE_ICON[r.type] || 'bell'} size={22} /></span>
          <a class="row-text" href="/settings/reminders/{r.id}" style="text-decoration:none;color:inherit">
            <span class="row-title">{r.title}</span>
            <span class="row-subtitle">{reminderTypeLabel(r.type)} · {reminderScheduleLabel(r)}</span>
          </a>
          <Switch checked={r.enabled} label={m.rem_enable_aria({ title: r.title })} onChange={(v) => journal.reminders.setEnabled(r.id, v)} />
        </div>
      {/each}
    </div>

    <div class="notice notice-info" style="margin-top:var(--space-5)">
      <Icon name="info" size={20} />
      <div class="notice-body">
        <span class="notice-title">{m.rem_battery_title()}</span>
        {m.rem_battery_body()}
        <a href="/settings/reminders">{m.rem_battery_link()}</a>
      </div>
    </div>
  {/if}
</div>
