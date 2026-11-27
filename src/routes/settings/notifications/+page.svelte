<script lang="ts">
  /* Draw one RegistryRow per registered kind with separate Show and Notify controls.
     isLiveTileKind keeps Today's live tiles in the Today editor. The writing prompt below
     the list is a single preference and has no registry kind of its own.

     Web keeps Show and the prompts. It omits Notify, the permission notice and the
     notification-only cards because a closed browser cannot deliver these scheduled
     notifications. Put the platform notice above the rows to explain the controls available
     there. */
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import TimePicker from '$lib/components/TimePicker.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import RegistryRow from '$lib/unprompted/RegistryRow.svelte';
  import { isAndroid } from '$lib/platform';
  import { notificationsTitle } from '$lib/notificationsTitle';
  import { androidReminders, type AndroidReminderStatus } from '$lib/reminders/android-bridge';
  import { disclose } from '$lib/motion/reveal';
  import { watchStatus } from '$lib/permissions/watchStatus';
  import {
    UNPROMPTED_ROWS,
    isSurfaceRow,
    surfaceOn,
    withSurface,
    type BooleanPrefKey,
    type UnpromptedRow
  } from '$lib/unprompted/registry';
  import { isLiveTileKind } from '$lib/data/liveTiles';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { currentDay } from '$lib/stores/today.svelte';

  /** Every kind Today's editor does not arrange. */
  const ROWS = UNPROMPTED_ROWS.filter((row) => !isLiveTileKind(row.key));

  let isWeb = $derived(!isAndroid());
  let visibleRows = $derived(isWeb ? ROWS.filter((row) => row.surface) : ROWS);
  // No row carries both switches since FA 13, so Home switches and
  // notification switches get a card each rather than a column each.
  let homeRows = $derived(visibleRows.filter((row) => row.surface));
  let notifyRows = $derived(visibleRows.filter((row) => !row.surface));

  /* Every producer here posts through the same POST_NOTIFICATIONS
     permission, so one status/request pair covers the whole list. */
  let notifyStatus = $state<AndroidReminderStatus | 'unreadable'>({ notifications: 'not-required', exactAlarms: 'not-required' });

  /* Re-read whenever the screen comes back to the front, because the way out of a refusal
     is Android's settings screen. A read the bridge refuses says it could not check, rather
     than calling notifications either on or off. */
  let statusWatch: ReturnType<typeof watchStatus<AndroidReminderStatus | 'unreadable'>> | null = null;

  async function requestNotifications() {
    try {
      await androidReminders.requestNotificationPermission();
    } catch (error) {
      console.error('Could not request notification permission', error);
    }
    await statusWatch?.refresh();
  }

  $effect(() => {
    if (isWeb) return;
    const watch = watchStatus<AndroidReminderStatus | 'unreadable'>({
      read: () => androidReminders.getStatus(),
      unreadable: 'unreadable',
      apply: (next) => {
        notifyStatus = next;
      }
    });
    statusWatch = watch;
    return () => {
      watch.stop();
      statusWatch = null;
    };
  });

  /* Both cascades from the two screens this merged, unchanged: turning a
     kind off also turns its notification off,
     and turning a notification on turns the kind itself on. One
     invariant either direction keeps - nothing fires for a kind that is off
     - whichever switch the person just touched. */
  function setKind(row: UnpromptedRow, v: boolean) {
    if (!isSurfaceRow(row)) return;
    prefs.surfaceOverrides = withSurface(prefs.surfaceOverrides, row.key, v);
    if (!v && row.notify) prefs[row.notify.prefKey] = false;
  }

  function setNotify(row: UnpromptedRow, v: boolean) {
    if (!row.notify) return;
    prefs[row.notify.prefKey] = v;
    if (v && isSurfaceRow(row)) prefs.surfaceOverrides = withSurface(prefs.surfaceOverrides, row.key, true);
  }

  /* The check-in's switch lives on the reminders screen, beside its time and
     its pause; a second one here wrote the same
     preference from a screen that could show neither. Its row here is a way
     there that says where it stands. */
  let checkInState = $derived.by(() => {
    if (!prefs.checkInEnabled) return m.checkin_state_off();
    const through = prefs.checkInPausedThrough;
    if (through !== null && through >= currentDay()) {
      return m.checkin_state_paused({ date: fmtDay(through + 1, { day: 'numeric', month: 'long' }) });
    }
    return m.checkin_state_on({ time: prefs.checkInTime });
  });

  let anyNotifyOn = $derived(ROWS.some((row) => row.notify && prefs[row.notify.prefKey]));

  /* The remaining prompts, in the order Settings drew them. A list rather than
     copies of the same markup: they differ only in
     which boolean they write and what they are called.

     A named shape rather than an inline one, the way the registry names
     `UnpromptedRow`: the four fields travel together everywhere they go. */
  interface PromptRow {
    /** The walkthrough's handle, never the title, which is copy. */
    key: string;
    prefKey: BooleanPrefKey;
    title: () => string;
    subtitle: () => string;
  }

  const PROMPTS: PromptRow[] = [
    { key: 'guided-prompts', prefKey: 'guidedPromptsEnabled', title: () => m.guided_prompts(), subtitle: () => m.guided_prompts_sub() }
  ];
</script>

<div class="screen" data-screen>
  <ScreenHeader title={notificationsTitle()} back="/settings" />

  {#if !isWeb}
    <SectionHeading text={m.notif_section_home()} />
  {/if}
  <ListCard>
    {#each homeRows as row (row.key)}
      <RegistryRow
        key={row.key}
        title={row.title()}
        subtitle={row.surface?.subtitle?.()}
        surface={isSurfaceRow(row)
          ? {
              label: m.notif_show_toggle_aria({ name: row.title() }),
              checked: surfaceOn(prefs.surfaceOverrides, row.key),
              onChange: (v) => setKind(row, v)
            }
          : undefined}
      />
    {/each}
  </ListCard>

  {#if notifyRows.length > 0}
    <SectionHeading text={m.notif_section_notify()} />
    <ListCard>
      {#each notifyRows as row (row.key)}
        {#if row.key === 'check-in'}
          <ListRow key="check-in" title={row.title()} subtitle={checkInState} href="/settings/reminders" />
        {:else}
          <RegistryRow
            key={row.key}
            title={row.title()}
            subtitle={row.notify?.subtitle?.()}
            notify={!isWeb && row.notify
              ? {
                  label: m.notif_notify_toggle_aria({ name: row.title() }),
                  checked: prefs[row.notify.prefKey],
                  onChange: (v) => setNotify(row, v)
                }
              : undefined}
          />
        {/if}
      {/each}
    </ListCard>
  {/if}

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
    {#if notifyStatus === 'unreadable' && anyNotifyOn}
      <Notice
        icon="alert"
        key="notify-unknown"
        title={m.perm_status_unknown_title()}
        text={m.notif_status_unknown_body()}
        action={{ label: m.read_retry(), onclick: () => void statusWatch?.refresh() }}
      />
    {:else if notifyStatus !== 'unreadable' && notifyStatus.notifications === 'denied' && anyNotifyOn}
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
            <Field label={m.range_from_label()} id="quiet-start">
              {#snippet children(id)}
                <TimePicker name="quiet-start" {id} required bind:value={prefs.quietHoursStart} />
              {/snippet}
            </Field>
            <Field label={m.notif_quiet_to()} id="quiet-end">
              {#snippet children(id)}
                <TimePicker name="quiet-end" {id} required bind:value={prefs.quietHoursEnd} />
              {/snippet}
            </Field>
          </div>
        </div>
      {/if}
      <div class="settings-divider"></div>
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
  /* The window is not a row, so it takes the row's own horizontal padding
     rather than sitting flush against the card's edge (kit.css). */
  .quiet-body {
    padding: var(--space-2) var(--space-4) var(--space-3) var(--space-3);
  }

  /* Two time fields side by side, so the window reads as one range rather
     than as two unrelated settings. */
  .quiet-window {
    display: grid;
    /* minmax(0, 1fr), not 1fr: a time field's min-content width is a text
       input's default 20 characters, which is wider than half a 320px
       screen once the card's padding comes off, and a plain 1fr would let
       it push the row past the viewport. */
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-3);
  }

  .settings-divider {
    border-top: 1px solid var(--outline);
  }
</style>
