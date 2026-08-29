<script lang="ts">
  /* One consolidated entry for everything the app may show or fire
     unprompted (ticket 51): the live tiles (ADR-0039's amendment), the
     stock notice, and wrapped and on-this-day, whose toggles moved here
     from the Tracking card - same keys, same cascading disablement, only
     the rows' screen changed.

     The rows are not written here: LIVE_TILE_ROWS is the part later tile
     tickets extend (45/46/47/48/50), and this page draws one row per entry
     and nothing else, more/+page.svelte's data-driven shape with a Switch
     at the trailing edge.

     A row carrying a Switch stays a plain .kit-row div, as those four rows
     were on the Tracking card: ListRow renders an <a> or a <button>, and a
     switch inside either would be a control nested in a control - the line
     settings-surfaces.test.ts already holds. */
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import { isAndroid } from '$lib/platform';
  import {
    androidRetrospectiveNotifications,
    type AndroidRetrospectiveNotificationStatus
  } from '$lib/retrospective/android-bridge';
  import { disclose } from '$lib/motion/reveal';
  import { LIVE_TILE_ROWS, type LiveTileRow } from './rows.ts';

  let isWeb = $derived(!isAndroid());

  /* Wrapped/on-this-day notifications share one Android permission, so one
     status/request pair covers both of their sub-toggles - moved here with
     them from settings/+page.svelte, which has no row left that reads it. */
  let retroNotifyStatus = $state<AndroidRetrospectiveNotificationStatus>({ notifications: 'not-required' });

  async function refreshRetroNotifyStatus() {
    if (isWeb) return;
    try {
      retroNotifyStatus = await androidRetrospectiveNotifications.getStatus();
    } catch (error) {
      console.error('Could not read retrospective notification status', error);
    }
  }

  async function requestRetroNotifications() {
    try {
      retroNotifyStatus = await androidRetrospectiveNotifications.requestNotificationPermission();
    } catch (error) {
      console.error('Could not request notification permission', error);
    }
  }

  $effect(() => {
    if (isWeb) return;
    void refreshRetroNotifyStatus();
  });

  /* Written straight through, the way every switch on these screens is:
     a tick is the change. Turning a kind off also turns its notification
     off (phase 4 features ticket 04's cascading disablement, kept), so
     there is no second switch left on to remember. */
  function setKind(row: LiveTileRow, v: boolean) {
    prefs[row.prefKey] = v;
    if (!v && row.notify) prefs[row.notify.prefKey] = false;
  }

  let anyNotifyOn = $derived(LIVE_TILE_ROWS.some((row) => row.notify && prefs[row.notify.prefKey]));
</script>

<div class="screen" data-screen>
  <ScreenHeader title={m.live_tiles_title()} back="/settings" subtitle={m.live_tiles_sub()} />

  <ListCard>
    {#each LIVE_TILE_ROWS as row (row.key)}
      <div class="kit-row" data-live-tile={row.key}>
        <span class="kit-row-text">
          <span class="kit-row-title">{row.title()}</span>
          <span class="kit-row-sub">{row.subtitle()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch checked={prefs[row.prefKey]} label={row.title()} onChange={(v) => setKind(row, v)} />
        </span>
      </div>
      {#if row.notify && !isWeb && prefs[row.prefKey]}
        {@const notify = row.notify}
        <div class="kit-row" data-live-tile-notify={row.key} transition:disclose>
          <span class="kit-row-text">
            <span class="kit-row-title">{notify.title()}</span>
            <span class="kit-row-sub">{notify.subtitle()}</span>
          </span>
          <span class="kit-row-trail">
            <Switch
              checked={prefs[notify.prefKey]}
              label={notify.title()}
              onChange={(v) => {
                prefs[notify.prefKey] = v;
              }}
            />
          </span>
        </div>
      {/if}
    {/each}
  </ListCard>

  {#if !isWeb && anyNotifyOn && retroNotifyStatus.notifications === 'denied'}
    <Notice
      icon="alert"
      key="retro-notify-denied"
      title={m.retro_notify_capabilities_title()}
      text={m.retro_notify_capabilities_body()}
      action={{ label: m.rem_allow_notifications(), onclick: requestRetroNotifications }}
    />
  {/if}
</div>
