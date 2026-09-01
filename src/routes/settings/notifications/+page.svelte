<script lang="ts">
  /* The notifications view: the second of two screens over the unprompted
     registry (phase 6 ticket 04). This one answers "stop buzzing my phone";
     /settings/live-tiles answers "stop putting things on my home screen".
     Two views, one list - not two registries and not a third screen, because
     the two questions are asked by different people in different moments.

     Six producers reach this list. Four of them used to decide for
     themselves: reminders and the daily check-in through AlarmManager, a
     wear session's elapsed prompt as a reminder row nobody had a switch for,
     and the auto-export failure notice with no settings home at all. The
     other two, wrapped and on-this-day, are grandfathered behind the toggles
     they already had - see the admission rule in registry.ts, which is the
     thing a seventh producer has to argue with.

     The rows are not written here, the same way they are not written on the
     surfaces view: this page draws one row per registry entry with a
     `notify` and nothing else.

     Absent on web rather than shown and inert (user story 18): a browser
     cannot fire a scheduled notification while the app is closed, so a
     switch here would be a promise the platform does not keep. */
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import { isAndroid } from '$lib/platform';
  import {
    androidRetrospectiveNotifications,
    type AndroidRetrospectiveNotificationStatus
  } from '$lib/retrospective/android-bridge';
  import { disclose } from '$lib/motion/reveal';
  import { NOTIFICATION_ROWS, type UnpromptedRow } from '$lib/unprompted/registry';

  let isWeb = $derived(!isAndroid());

  /* Every producer here posts through the same POST_NOTIFICATIONS
     permission, so one status/request pair covers the whole list - it moved
     here with the two retrospective rows that used to be the only ones
     reading it. */
  let notifyStatus = $state<AndroidRetrospectiveNotificationStatus>({ notifications: 'not-required' });

  async function refreshStatus() {
    if (isWeb) return;
    try {
      notifyStatus = await androidRetrospectiveNotifications.getStatus();
    } catch (error) {
      console.error('Could not read notification status', error);
    }
  }

  async function requestNotifications() {
    try {
      notifyStatus = await androidRetrospectiveNotifications.requestNotificationPermission();
    } catch (error) {
      console.error('Could not request notification permission', error);
    }
  }

  $effect(() => {
    if (isWeb) return;
    void refreshStatus();
  });

  /* Turning a notification on for a kind that also surfaces turns the kind
     itself on, which is the other direction of the cascade the surfaces view
     already had. Both directions keep one invariant - nothing fires for a
     kind that is off - and without this one the switch would go on while
     `wrappedEnabled` was off, which is a promise the scheduler does not
     keep. Turning it off is final rather than a snooze: nothing anywhere
     writes these keys back. */
  function setNotify(row: UnpromptedRow, v: boolean) {
    prefs[row.notify!.prefKey] = v;
    if (v && row.surface) prefs[row.surface.prefKey] = true;
  }

  let anyOn = $derived(NOTIFICATION_ROWS.some((row) => prefs[row.notify!.prefKey]));
</script>

<div class="screen" data-screen>
  <ScreenHeader title={m.notif_title()} back="/settings" subtitle={m.notif_sub()} />

  {#if isWeb}
    <Notice icon="info" key="notifications-web" title={m.notif_web_title()} text={m.notif_web_body()} />
  {:else}
    <ListCard>
      {#each NOTIFICATION_ROWS as row (row.key)}
        {@const notify = row.notify!}
        <div class="kit-row" data-notification={row.key}>
          <span class="kit-row-text">
            <span class="kit-row-title">{row.title()}</span>
            <span class="kit-row-sub">{notify.subtitle()}</span>
          </span>
          <span class="kit-row-trail">
            <Switch
              checked={prefs[notify.prefKey]}
              label={row.title()}
              onChange={(v) => setNotify(row, v)}
            />
          </span>
        </div>
      {/each}
    </ListCard>

    {#if notifyStatus.notifications === 'denied' && anyOn}
      <Notice
        icon="alert"
        key="notify-denied"
        title={m.retro_notify_capabilities_title()}
        text={m.retro_notify_capabilities_body()}
        action={{ label: m.rem_allow_notifications(), onclick: requestNotifications }}
      />
    {/if}

    <div class="card" data-quiet-hours>
      <div class="pref-row">
        <span class="kit-row-text">
          <span class="kit-row-title"><Icon name="moon" size={16} /> {m.notif_quiet_title()}</span>
          <span class="kit-row-sub">{m.notif_quiet_sub()}</span>
        </span>
        <Switch
          checked={prefs.quietHoursEnabled}
          label={m.notif_quiet_title()}
          onChange={(v) => {
            prefs.quietHoursEnabled = v;
          }}
        />
      </div>
      {#if prefs.quietHoursEnabled}
        <div class="quiet-window" transition:disclose>
          <Field label={m.notif_quiet_from()} id="quiet-start">
            {#snippet children(id)}
              <input class="input" type="time" name="quiet-start" {id} bind:value={prefs.quietHoursStart} />
            {/snippet}
          </Field>
          <Field label={m.notif_quiet_to()} id="quiet-end">
            {#snippet children(id)}
              <input class="input" type="time" name="quiet-end" {id} bind:value={prefs.quietHoursEnd} />
            {/snippet}
          </Field>
        </div>
        <p class="muted small" transition:disclose>{m.notif_quiet_held()}</p>
      {/if}
    </div>

    <div class="card pref-row">
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
  {/if}
</div>

<style>
  /* Two time fields side by side, the shape journaling-pause's two date
     fields already use, so the window reads as one range rather than as two
     unrelated settings. */
  .quiet-window {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin-top: var(--space-3);
  }
</style>
