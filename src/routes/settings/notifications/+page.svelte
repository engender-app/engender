<script lang="ts">
  /* The one screen over the unprompted registry (phase 6 tickets 02 and 04,
     merged from two screens onto one by deepening ticket 09). "Stop putting
     things on my home screen" and "stop buzzing my phone" are two questions
     about the same list, so this is one `{#each}` with two toggle columns
     rather than two screens each running their own - ADR-0039's amendment
     argues for exactly this consolidation. `/settings/live-tiles` used to be
     the first question's own screen; it now redirects here.

     The rows are not written here: $lib/unprompted/registry.ts is what a
     later ticket extends, and RegistryRow draws one, so this page is the
     {#each} and nothing else.

     Absent on web rather than shown and inert, for the notify column only
     (user story 18): a browser cannot fire a scheduled notification while
     the app is closed, so a switch there would be a promise the platform
     does not keep. The Home column carries no such limit - a live tile is
     in-app UI, not an OS notification - so it stays live on web the way its
     own screen always was, and only the notify slot on each row, the permission
     notice and the two notification-only cards below the list drop out. */
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import RegistryRow from '$lib/unprompted/RegistryRow.svelte';
  import { isAndroid } from '$lib/platform';
  import {
    androidRetrospectiveNotifications,
    type AndroidRetrospectiveNotificationStatus
  } from '$lib/retrospective/android-bridge';
  import { disclose } from '$lib/motion/reveal';
  import { UNPROMPTED_ROWS, type UnpromptedRow } from '$lib/unprompted/registry';

  let isWeb = $derived(!isAndroid());

  /* Every producer here posts through the same POST_NOTIFICATIONS
     permission, so one status/request pair covers the whole list. */
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

  /* Both cascades from the two screens this merged, unchanged: turning a
     kind off also turns its notification off (phase 4 features ticket 04),
     and turning a notification on turns the kind itself on (ticket 04). One
     invariant either direction keeps - nothing fires for a kind that is off
     - whichever switch the person just touched. */
  function setKind(row: UnpromptedRow, v: boolean) {
    if (!row.surface) return;
    prefs[row.surface.prefKey] = v;
    if (!v && row.notify) prefs[row.notify.prefKey] = false;
  }

  function setNotify(row: UnpromptedRow, v: boolean) {
    if (!row.notify) return;
    prefs[row.notify.prefKey] = v;
    if (v && row.surface) prefs[row.surface.prefKey] = true;
  }

  let anyNotifyOn = $derived(UNPROMPTED_ROWS.some((row) => row.notify && prefs[row.notify.prefKey]));
</script>

<div class="screen" data-screen>
  <ScreenHeader title={m.notif_title()} back="/settings" subtitle={m.notif_sub()} />

  {#if !isWeb}
    <div class="registry-heads" aria-hidden="true">
      <span class="registry-head">{m.notif_col_home()}</span>
      <span class="registry-head">{m.notif_col_notify()}</span>
    </div>
  {/if}

  <ListCard>
    {#each UNPROMPTED_ROWS as row (row.key)}
      <RegistryRow
        key={row.key}
        title={row.title()}
        subtitle={row.surface?.subtitle() ?? row.notify?.subtitle() ?? ''}
        surface={row.surface
          ? {
              label: m.notif_home_toggle_aria({ name: row.title() }),
              checked: prefs[row.surface.prefKey],
              onChange: (v) => setKind(row, v)
            }
          : undefined}
        notify={!isWeb && row.notify
          ? {
              label: m.notif_notify_toggle_aria({ name: row.title() }),
              checked: prefs[row.notify.prefKey],
              onChange: (v) => setNotify(row, v)
            }
          : undefined}
      />
    {/each}
  </ListCard>

  {#if isWeb}
    <Notice icon="info" key="notifications-web" title={m.notif_web_title()} text={m.notif_web_body()} />
  {:else}
    {#if notifyStatus.notifications === 'denied' && anyNotifyOn}
      <Notice
        icon="alert"
        key="notify-denied"
        title={m.retro_notify_capabilities_title()}
        text={m.retro_notify_capabilities_body()}
        action={{ label: m.rem_allow_notifications(), onclick: requestNotifications }}
      />
    {/if}

    <ListCard>
      <div class="kit-row" data-quiet-hours>
        <span class="kit-row-text">
          <span class="kit-row-title"><Icon name="moon" size={16} /> {m.notif_quiet_title()}</span>
          <span class="kit-row-sub">{m.notif_quiet_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs.quietHoursEnabled}
            label={m.notif_quiet_title()}
            onChange={(v) => {
              prefs.quietHoursEnabled = v;
            }}
          />
        </span>
      </div>
      {#if prefs.quietHoursEnabled}
        <!-- One `disclosed` wrapper around the whole group rather than a
             transition per child: `disclose` runs with overflow hidden, so a
             margin left free to collapse out afterwards makes the block below
             jump once the inline styles come off (components.css). -->
        <div class="disclosed quiet-body" transition:disclose>
          <div class="quiet-window">
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
          <p class="muted small quiet-note">{m.notif_quiet_held()}</p>
        </div>
      {/if}
    </ListCard>

    <ListCard>
      <div class="kit-row" data-hide-titles>
        <span class="kit-row-text">
          <span class="kit-row-title"><Icon name="shield" size={16} /> {m.rem_hide_titles_title()}</span>
          <span class="kit-row-sub">{m.rem_hide_titles_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs.hideNotificationTitles}
            label={m.rem_hide_titles_title()}
            onChange={(v) => {
              prefs.hideNotificationTitles = v;
            }}
          />
        </span>
      </div>
    </ListCard>
  {/if}
</div>

<style>
  /* Right-aligned to match .kit-row-trail's own two fixed-width slots
     (RegistryRow.svelte), with no left padding of its own so the gap and the
     slot width are the only things that have to agree between the two
     files. +1px accounts for the list card's own border, which the row's
     padding is measured from the inside of. */
  .registry-heads {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: 0 calc(var(--space-4) + 1px) var(--space-2) 0;
  }

  .registry-head {
    flex: 0 0 var(--touch-target);
    text-align: center;
    font-size: var(--text-xs);
    color: var(--text-2);
  }

  /* The window is not a row, so it takes the row's own horizontal padding
     rather than sitting flush against the card's edge (kit.css). */
  .quiet-body {
    padding: var(--space-2) var(--space-4) var(--space-3) var(--space-3);
  }

  /* Two time fields side by side, the shape journaling-pause's two date
     fields already use, so the window reads as one range rather than as two
     unrelated settings. */
  .quiet-window {
    display: grid;
    /* minmax(0, 1fr), not 1fr: a time input's min-content width is the
       platform control's own, which is wider than half a 320px screen once
       the card's padding comes off, and a plain 1fr would let it push the
       row past the viewport. */
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-3);
  }

  .quiet-note {
    margin: var(--space-3) 0 0;
  }
</style>
