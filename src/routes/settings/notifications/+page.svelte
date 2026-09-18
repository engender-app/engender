<script lang="ts">
  /* The one screen over the unprompted registry (phase 6 tickets 02 and 04,
     merged from two screens onto one by deepening ticket 09). "Stop showing
     me this" and "stop buzzing my phone" are two questions about the same
     list, so this is one `{#each}` with two toggle columns rather than two
     screens each running their own - ADR-0039's amendment argues for
     exactly this consolidation. `/settings/live-tiles` used to be the first
     question's own screen; it now redirects here.

     **Minus Today's own thirteen** (phase 11 ticket 04). A live tile is
     arranged where it draws, in Today's editor, so this screen is every
     other registered kind: the stock notice, the two look-back cards, and
     the four that fire. `isLiveTileKind` is the filter rather than a second
     list, so the editor and this screen cannot each think they own a kind.
     That also takes the last of the Home column's untruth with it - two of
     the three rows left draw on Look back, never on Home - which is why the
     column head asks whether the app may show the thing at all rather than
     naming a screen.

     The rows are not written here: $lib/unprompted/registry.ts is what a
     later ticket extends, and RegistryRow draws one, so this page is the
     {#each} and nothing else.

     **The four prompts below the list** came off Settings' Tracking section
     with the same ticket, where they floated under no heading of their own.
     Each is the app speaking up without being asked - after a mood-only
     save, while writing, eight hours into a binder session, over a ticked
     roadmap goal - which is the question this whole screen is about. They
     are not registry rows: none of them is a kind of its own with a surface
     and a channel, each is one boolean a single feature reads, so they sit
     under a heading of their own rather than being forced into a list whose
     shape promises two columns.

     Absent on web rather than shown and inert, for the notify column only
     (user story 18): a browser cannot fire a scheduled notification while
     the app is closed, so a switch there would be a promise the platform
     does not keep. The show column carries no such limit - a notice or a
     card is in-app UI, not an OS notification - so it stays live on web,
     and so do the four prompts; only the notify slot on each row, the
     permission notice and the two notification-only cards after the list
     drop out. What takes their place on web sits above the rows it
     explains (ticket 13): the platform notice opens the screen, so every
     row's Show toggle is read beside the explanation of why there is no
     second toggle, not three sections later. */
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
  import { UNPROMPTED_ROWS, type BooleanPrefKey, type UnpromptedRow } from '$lib/unprompted/registry';
  import { isLiveTileKind } from '$lib/data/liveTiles';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';

  /** Every kind Today's editor does not arrange. */
  const ROWS = UNPROMPTED_ROWS.filter((row) => !isLiveTileKind(row.key));

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

  let anyNotifyOn = $derived(ROWS.some((row) => row.notify && prefs[row.notify.prefKey]));

  /* The four prompts, in the order Settings drew them. A list rather than
     four copies of the same eight lines of markup: they differ only in
     which boolean they write and what they are called.

     A named shape rather than an inline one, the way the registry names
     `UnpromptedRow`: the four fields travel together everywhere they go. */
  interface PromptRow {
    /** The walkthrough's handle (ADR-0029), never the title, which is copy. */
    key: string;
    prefKey: BooleanPrefKey;
    title: () => string;
    subtitle: () => string;
  }

  const PROMPTS: PromptRow[] = [
    { key: 'entry-nudges', prefKey: 'entryNudges', title: () => m.entry_nudges(), subtitle: () => m.entry_nudges_sub() },
    { key: 'guided-prompts', prefKey: 'guidedPromptsEnabled', title: () => m.guided_prompts(), subtitle: () => m.guided_prompts_sub() },
    {
      key: 'wear-duration-cue',
      prefKey: 'wearDurationCueEnabled',
      title: () => m.wear_duration_cue_toggle(),
      subtitle: () => m.wear_duration_cue_sub()
    },
    {
      key: 'roadmap-milestone-sync',
      prefKey: 'roadmapMilestoneSyncEnabled',
      title: () => m.roadmap_milestone_sync_title(),
      subtitle: () => m.roadmap_milestone_sync_sub()
    }
  ];
</script>

<div class="screen" data-screen>
  <ScreenHeader title={m.notif_title()} back="/settings" subtitle={m.notif_sub()} />

  {#if isWeb}
    <!-- The in-app/phone distinction first, where the list it governs can
         be read next to it (ticket 13): the switches below are real, and
         what they do not do is reach a phone. -->
    <Notice icon="info" key="notifications-web" title={m.notif_web_title()} text={m.notif_web_body()} />
  {/if}

  {#if !isWeb}
    <div class="registry-heads" aria-hidden="true">
      <span class="registry-head">{m.notif_col_show()}</span>
      <span class="registry-head">{m.notif_col_notify()}</span>
    </div>
  {/if}

  <ListCard>
    {#each ROWS as row (row.key)}
      <RegistryRow
        key={row.key}
        title={row.title()}
        subtitle={row.surface?.subtitle() ?? row.notify?.subtitle() ?? ''}
        surface={row.surface
          ? {
              label: m.notif_show_toggle_aria({ name: row.title() }),
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

  <SectionHeading text={m.notif_prompts_heading()} />
  <!-- Each stays a plain div rather than a ListRow, the rule Settings kept
       for them: the row itself does nothing when tapped, the switch inside
       it does, and a row that acted too would make the switch a button
       inside a button. -->
  <ListCard>
    {#each PROMPTS as prompt (prompt.key)}
      <div class="kit-row" data-prompt={prompt.key}>
        <span class="kit-row-text">
          <span class="kit-row-title">{prompt.title()}</span>
          <span class="kit-row-sub">{prompt.subtitle()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs[prompt.prefKey]}
            label={prompt.title()}
            onChange={(v) => {
              prefs[prompt.prefKey] = v;
            }}
          />
        </span>
      </div>
    {/each}
  </ListCard>

  {#if !isWeb}
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
