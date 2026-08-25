<script lang="ts">
  /* Settings, on the surface kit (phase 5 ticket 24). The three sections
     stay hand-written, per this ticket's own scope line - what changes is
     the container each sits in, same as the More hub next to it.

     Appearance's swatches, segments and switches are heterogeneous content
     with no row shape to them, so they sit in one ListCard's padded slot
     (.settings-pad) rather than being forced through ListRow. Tracking and
     Privacy's navigable rows are genuinely list-card material and go
     through ListRow properly; the handful of rows that carry a Switch
     instead of a chevron stay hand-written in the kit's own row classes,
     because ListRow always renders as an interactive <a> or <button> and a
     button wrapping a switch's own button is a nested control - so a row
     with nothing for the row itself to do is a plain element wearing
     .kit-row, the same move Home's milestone-empty state already makes. */
  import { m } from '$lib/paraglide/messages';
  import { setLocale, getLocale } from '$lib/paraglide/runtime';
  import { backupAgeDays } from '$lib/data/backupHealth';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { isAndroid } from '$lib/platform';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import {
    androidRetrospectiveNotifications,
    type AndroidRetrospectiveNotificationStatus
  } from '$lib/retrospective/android-bridge';

  /* Keyed, not worded, so the swatch names translate with everything else. */
  const PALETTES: [string, () => string][] = [
    ['trans', m.palette_trans], ['nonbinary', m.palette_nonbinary], ['genderfluid', m.palette_genderfluid],
    ['bisexual', m.palette_bisexual], ['lesbian', m.palette_lesbian], ['pansexual', m.palette_pansexual],
    ['rainbow', m.palette_rainbow], ['agender', m.palette_agender],
  ];

  /* COL-001: mood's own fixed 5-step scale, picked independently of the
     gender palette above - see ADR-0025. */
  const MOOD_PRESETS: [string, () => string][] = [
    ['amber', m.mood_preset_amber], ['teal', m.mood_preset_teal],
    ['plum', m.mood_preset_plum], ['moss', m.mood_preset_moss],
  ];

  let isWeb = $derived(!isAndroid());
  let preset = $derived(vocabulary.activePreset);
  let metricName = $derived(vocabulary.metricName);
  let backupAge = $derived(backupAgeDays(prefs.lastBackupAt));

  /* Reminders are not mirrored (ADR-0004 lists what is), and this row shows a
     count of the enabled ones - which only the Android build displays at all. */
  let reminders = liveQuery(['reminder'], (j) => j.reminders.getReminders());
  let activeReminders = $derived((reminders.value ?? []).filter((r) => r.enabled).length);

  let presetSheet = $state(false);
  let metricSheet = $state(false);
  let disguiseSheet = $state(false);
  let aboutSheet = $state(false);

  /* Wrapped/on-this-day notifications (phase 4 features ticket 04) share one
     Android permission, so one status/request pair covers both toggles below
     - the same "Allow notifications" flow reminders/+page.svelte already
     uses for its own, separate POST_NOTIFICATIONS check. */
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

  function setLanguage(v: string) {
    prefs.language = v as typeof prefs.language;
    const target = v === 'system' ? ((navigator.language || 'en').startsWith('pl') ? 'pl' : 'en') : (v as 'en' | 'pl');
    if (target !== getLocale()) setLocale(target); // reloads; all state is persisted
  }

  function pickPalette(key: string) {
    prefs.palette = key;
  }

  function pickMoodPreset(key: string) {
    prefs.moodPreset = key;
  }
</script>

<div class="screen">
  <!-- Hidden on the live build (Alicja, 2026-08-25): a visible "Settings"
       sitting directly above "Appearance" is the same two-headers-stacked
       problem DIRECTION.md 3d names for the More hub, even though this
       screen isn't itself a tab - the title stays in the document for a
       screen reader and the outline, same as there. -->
  <ScreenHeader title={m.nav_settings()} titleHidden />

  <SectionHeading text={m.settings_appearance()} />
  <ListCard>
    <div class="settings-pad">
      <p class="field-label" style="margin-bottom:var(--space-3)">{m.colour_palette()}</p>
      <div class="palette-grid" role="radiogroup" aria-label={m.colour_palette()}>
        {#each PALETTES as [key, label] (key)}
          <button
            class="palette-swatch press"
            class:is-active={prefs.palette === key}
            role="radio"
            aria-checked={prefs.palette === key}
            data-palette-pick={key}
            onclick={() => pickPalette(key)}
          >
            <span class="swatch-preview" data-swatch={key}></span>
            <span class="swatch-name">{label()}</span>
          </button>
        {/each}
      </div>
      <div class="hr"></div>
      <p class="field-label" style="margin-bottom:var(--space-3)">{m.mood_colours()}</p>
      <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">{m.mood_colours_note()}</p>
      <div class="mood-preset-grid" role="radiogroup" aria-label={m.mood_colours()}>
        {#each MOOD_PRESETS as [key, label] (key)}
          <button
            class="palette-swatch press"
            class:is-active={prefs.moodPreset === key}
            role="radio"
            aria-checked={prefs.moodPreset === key}
            data-mood-preset-pick={key}
            onclick={() => pickMoodPreset(key)}
          >
            <span class="swatch-preview" data-mood-swatch={key}></span>
            <span class="swatch-name">{label()}</span>
          </button>
        {/each}
      </div>
      <div class="hr"></div>
      <div class="pref-row">
        <span class="kit-row-title">{m.theme()}</span>
        <Segmented
          name={m.theme()}
          options={[
            { value: 'system', label: m.theme_system() },
            { value: 'light', label: m.theme_light() },
            { value: 'dark', label: m.theme_dark() },
          ]}
          value={prefs.theme}
          onChange={(v) => {
            prefs.theme = v as typeof prefs.theme;
          }}
        />
      </div>
      <div class="pref-row">
        <span class="kit-row-title">{m.language()}</span>
        <Segmented
          name={m.language()}
          options={[
            { value: 'system', label: m.theme_system() },
            { value: 'en', label: 'English' },
            { value: 'pl', label: 'Polski' },
          ]}
          value={prefs.language}
          onChange={setLanguage}
        />
      </div>
      <div class="hr"></div>
      <p class="field-label" style="margin-bottom:var(--space-3)">{m.settings_accessibility_pack()}</p>
      <div class="pref-row">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.a11y_text_size_boost()}</span>
          <span class="kit-row-sub">{m.a11y_text_size_boost_sub()}</span>
        </span>
        <Switch
          checked={prefs.a11yTextSizeBoost}
          label={m.a11y_text_size_boost()}
          onChange={(v) => {
            prefs.a11yTextSizeBoost = v;
          }}
        />
      </div>
      <div class="pref-row">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.a11y_legibility_boost()}</span>
          <span class="kit-row-sub">{m.a11y_legibility_boost_sub()}</span>
        </span>
        <Switch
          checked={prefs.a11yLegibilityBoost}
          label={m.a11y_legibility_boost()}
          onChange={(v) => {
            prefs.a11yLegibilityBoost = v;
          }}
        />
      </div>
      <div class="pref-row">
        <span class="kit-row-text">
          <span class="kit-row-title">{m.a11y_motion_reduce_override()}</span>
          <span class="kit-row-sub">{m.a11y_motion_reduce_override_sub()}</span>
        </span>
        <Switch
          checked={prefs.a11yMotionReduce}
          label={m.a11y_motion_reduce_override()}
          onChange={(v) => {
            prefs.a11yMotionReduce = v;
          }}
        />
      </div>
    </div>
  </ListCard>

  <SectionHeading text={m.settings_tracking()} />
  <!-- Tracking is several cards, not one: the navigable rows, tag groups,
       the four related toggles, and the metric picker each want a
       different shape (DIRECTION.md 2b), but sitting flush against each
       other with no heading between them read as one accidental slab
       rather than four deliberate ones (Alicja, on the live build).
       .stack-3 (components.css) already gives a run of siblings a gap
       between each - reused rather than a one-off margin per card. -->
  <div class="stack-3" data-settings-list>
    <ListCard>
      <ListRow
        key="preset"
        icon="heart"
        title={m.gender_preset()}
        subtitle={preset.name}
        chevron={false}
        onclick={() => (presetSheet = true)}
      >
        <!-- SH-103: chevronDown ("opens in place") rather than chevronRight
             ("navigates away"), so a sheet-opening row no longer looks
             identical to the href rows around it. -->
        {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
      </ListRow>
      <ListRow key="dimension" icon="stats" title={m.custom_dimension()} subtitle={m.custom_dimension_sub()} href="/settings/dimension" />
      <ListRow
        key="reminders"
        icon="bell"
        title={m.reminders()}
        subtitle={isWeb
          ? m.reminders_web_sub()
          : m.settings_reminders_sub({ count: String(activeReminders), state: prefs.checkInEnabled ? m.on() : m.off() })}
        href="/settings/reminders"
        chevron={false}
      >
        {#snippet trailing()}<Icon name={isWeb ? 'info' : 'chevronRight'} size={isWeb ? 18 : 20} />{/snippet}
      </ListRow>
      <ListRow
        key="journey-anchor"
        icon="flag"
        title={m.journey_anchor_title()}
        subtitle={vocabulary.journeyAnchor
          ? m.journey_anchor_row_sub_set({ name: vocabulary.journeyAnchor.name })
          : m.journey_anchor_row_sub_unset()}
        href="/settings/journey-anchor"
      />
      <ListRow key="affirmations" icon="sparkle" title={m.affirmations_row_title()} subtitle={m.affirmations_row_sub()} href="/settings/affirmations" />
      <ListRow key="body-regions" icon="heart" title={m.body_regions_row_title()} subtitle={m.body_regions_row_sub()} href="/settings/body-regions" />
      <ListRow key="streak-goal" icon="sparkle" title={m.streak_goal_title()} subtitle={m.streak_goal_row_sub()} href="/settings/streak-goal" />
      <ListRow key="journaling-pause" icon="moon" title={m.journaling_pause_title()} subtitle={m.journaling_pause_row_sub()} href="/settings/journaling-pause" />
    </ListCard>

    <ListCard>
      <div class="kit-row" style="cursor:default">
        <span class="kit-row-ico"><Icon name="tag" size={22} /></span>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.tag_groups()}</span>
          <span class="kit-row-sub">{m.tag_groups_sub()}</span>
        </span>
      </div>
      <div class="taggroup-toggles">
        {#each vocabulary.tagGroups as g (g.key)}
          <div class="spread taggroup-row">
            <span>{g.name}</span>
            <Switch checked={g.enabled} label={m.settings_taggroup_switch({ group: g.name })} onChange={(v) => journal.tags.setGroupEnabled(g.key, v)} />
          </div>
        {/each}
        <a class="manage-tags-link" href="/settings/tags">{m.manage_tags()} <Icon name="chevronRight" size={16} /></a>
      </div>
    </ListCard>

    <!-- Four related toggles as one card with hairlines between, rather
         than four boxes stacked with a margin apart - DIRECTION.md's
         decision 3: "tighter, not airier", and the shape One rounded card
         repeated is the thing 2b calls generic; a run of the same-shaped
         row is not that, it is one surface with several related facts on
         it. Each stays a plain div rather than a ListRow: the row itself
         does nothing when tapped, the switch inside it does, and a row
         that acted too would make the switch a button inside a button. -->
    <ListCard>
      <div class="kit-row" data-entry-nudges>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.entry_nudges()}</span>
          <span class="kit-row-sub">{m.entry_nudges_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs.entryNudges}
            label={m.entry_nudges()}
            onChange={(v) => {
              prefs.entryNudges = v;
            }}
          />
        </span>
      </div>
      <div class="kit-row" data-guided-prompts>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.guided_prompts()}</span>
          <span class="kit-row-sub">{m.guided_prompts_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs.guidedPromptsEnabled}
            label={m.guided_prompts()}
            onChange={(v) => {
              prefs.guidedPromptsEnabled = v;
            }}
          />
        </span>
      </div>
      <div class="kit-row" data-wrapped-toggle>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.wrapped()}</span>
          <span class="kit-row-sub">{m.wrapped_settings_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs.wrappedEnabled}
            label={m.wrapped()}
            onChange={(v) => {
              prefs.wrappedEnabled = v;
              // Cascading disablement (ticket 04): the notification toggle
              // below is not just hidden when wrapped is off, it is turned
              // off too, so there is no second switch left on to remember.
              if (!v) prefs.wrappedNotificationsEnabled = false;
            }}
          />
        </span>
      </div>
      {#if !isWeb && prefs.wrappedEnabled}
        <div class="kit-row" data-wrapped-notify-toggle>
          <span class="kit-row-text">
            <span class="kit-row-title">{m.retro_notify_title()}</span>
            <span class="kit-row-sub">{m.wrapped_notify_sub()}</span>
          </span>
          <span class="kit-row-trail">
            <Switch
              checked={prefs.wrappedNotificationsEnabled}
              label={m.retro_notify_title()}
              onChange={(v) => {
                prefs.wrappedNotificationsEnabled = v;
              }}
            />
          </span>
        </div>
      {/if}
      <div class="kit-row" data-on-this-day-toggle>
        <span class="kit-row-text">
          <span class="kit-row-title">{m.on_this_day()}</span>
          <span class="kit-row-sub">{m.on_this_day_settings_sub()}</span>
        </span>
        <span class="kit-row-trail">
          <Switch
            checked={prefs.onThisDayEnabled}
            label={m.on_this_day()}
            onChange={(v) => {
              prefs.onThisDayEnabled = v;
              if (!v) prefs.onThisDayNotificationsEnabled = false;
            }}
          />
        </span>
      </div>
      {#if !isWeb && prefs.onThisDayEnabled}
        <div class="kit-row" data-on-this-day-notify-toggle>
          <span class="kit-row-text">
            <span class="kit-row-title">{m.retro_notify_title()}</span>
            <span class="kit-row-sub">{m.on_this_day_notify_sub()}</span>
          </span>
          <span class="kit-row-trail">
            <Switch
              checked={prefs.onThisDayNotificationsEnabled}
              label={m.retro_notify_title()}
              onChange={(v) => {
                prefs.onThisDayNotificationsEnabled = v;
              }}
            />
          </span>
        </div>
      {/if}
    </ListCard>

    {#if !isWeb && (prefs.wrappedNotificationsEnabled || prefs.onThisDayNotificationsEnabled) && retroNotifyStatus.notifications === 'denied'}
      <Notice
        icon="alert"
        key="retro-notify-denied"
        title={m.retro_notify_capabilities_title()}
        text={m.retro_notify_capabilities_body()}
        action={{ label: m.rem_allow_notifications(), onclick: requestRetroNotifications }}
      />
    {/if}

    <ListCard>
      <ListRow
        key="metric"
        icon="palette"
        title={m.home_cal_colour()}
        subtitle={`${m.coloured_by()} ${metricName}`}
        chevron={false}
        onclick={() => (metricSheet = true)}
      >
        {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
      </ListRow>
    </ListCard>
  </div>

  <SectionHeading text={m.settings_privacy()} />
  <ListCard>
    <ListRow key="security" icon="shield" title={m.settings_security_row()} subtitle={m.settings_security_sub()} href="/settings/security" />
    <ListRow
      key="disguise"
      icon="shield"
      title={m.disguise_row()}
      subtitle={prefs.disguise ? m.settings_disguise_on() : m.off()}
      chevron={false}
      onclick={() => (disguiseSheet = true)}
    >
      {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
    </ListRow>
    <ListRow
      key="export"
      icon="download"
      title={m.export_import()}
      subtitle={backupAge != null ? m.settings_backup_age({ days: m.n_days({ n: backupAge }) }) : m.settings_backup_none()}
      href="/settings/export"
    />
    <ListRow key="journal-book" icon="book" title={m.journal_book_row()} subtitle={m.journal_book_row_sub()} href="/settings/journal-book" />
    <ListRow key="trash" icon="trash" title={m.trash_title()} subtitle={m.trash_row_sub()} href="/settings/trash" />
    <ListRow
      key="about"
      icon="info"
      title={m.about()}
      subtitle={m.settings_about_sub()}
      chevron={false}
      onclick={() => (aboutSheet = true)}
    >
      {#snippet trailing()}<Icon name="chevronDown" size={20} />{/snippet}
    </ListRow>
  </ListCard>
  <p class="muted small" style="text-align:center;margin-top:var(--space-5)">
    <span translate="no">{m.app_name()}</span> · {m.footer_note()}
  </p>

  <Sheet bind:open={presetSheet} title={m.gender_preset()}>
    <h3>{m.gender_preset()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.preset_note()}</p>
    <div class="list-group" style="box-shadow:none">
      {#each vocabulary.presets as p (p.id)}
        <button
          class="list-row"
          data-selected={prefs.activePreset === p.id ? 'true' : 'false'}
          data-pick-preset={p.id}
          onclick={() => {
            prefs.activePreset = p.id;
            presetSheet = false;
          }}
        >
          <span class="row-text">
            <span class="row-title" data-row-title>{p.name}</span>
            <span class="row-subtitle">{vocabulary.presetDimensionNames(p.dims)}{p.builtIn ? '' : ` · ${m.custom_suffix()}`}</span>
          </span>
          {#if prefs.activePreset === p.id}<Icon name="check" size={20} />{/if}
        </button>
      {/each}
      <a class="list-row" href="/settings/dimension" onclick={() => (presetSheet = false)}>
        <span class="row-icon"><Icon name="plus" size={20} /></span>
        <span class="row-text">
          <span class="row-title">{m.add_custom()}</span>
          <span class="row-subtitle">{m.add_custom_sub()}</span>
        </span>
      </a>
    </div>
  </Sheet>

  <Sheet bind:open={metricSheet} title={m.home_cal_colour()}>
    <h3>{m.home_cal_colour()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.metric_note()}</p>
    <div class="list-group" style="box-shadow:none">
      {#each [{ key: null, name: m.mood() }, ...vocabulary.dimensions] as d (d.key ?? 'mood')}
        <button
          class="list-row"
          onclick={() => {
            selectMetric(d.key);
            metricSheet = false;
          }}
        >
          <span class="row-text"><span class="row-title">{d.name}</span></span>
          {#if prefs.metricDimension === d.key}<Icon name="check" size={20} />{/if}
        </button>
      {/each}
    </div>
  </Sheet>

  <Sheet bind:open={disguiseSheet} title={m.disguise_row()}>
    <h3>{m.disguise_row()}</h3>
    <div class="stack-3">
      <div class="card spread" style="box-shadow:none;background:var(--surface-2)">
        <span class="row-text">
          <span class="row-title">{m.disguise_app_title()}</span>
          <span class="row-subtitle">
            {isAndroid() ? m.disguise_app_sub_android() : m.disguise_app_sub_web()}
          </span>
        </span>
        <Switch
          checked={prefs.disguise}
          label={m.disguise_app_title()}
          onChange={(v) => {
            prefs.disguise = v;
          }}
        />
      </div>
      <div class="disguise-preview" class:is-on={prefs.disguise}>
        <span class="disguise-icon"><Icon name="book" size={22} /></span>
        <span>
          <strong>Notes</strong><br />
          <span class="muted small">{isAndroid() ? m.disguise_preview_android() : m.disguise_preview_web()}</span>
        </span>
      </div>
      <!-- Web only: on Android the launcher alias switches at once, so there
           is nothing to warn about. Here the manifest is the browser's to
           refresh, and a promise the app cannot keep is worse than none. -->
      {#if !isAndroid()}
        <p class="muted small">{m.disguise_installed_note()}</p>
      {/if}
      <div class="card spread" style="box-shadow:none;background:var(--surface-2)">
        <span class="row-text">
          <span class="row-title">{m.lock_on_leave_title()}</span>
          <span class="row-subtitle">
            {m.lock_on_leave_sub()}{prefs.appLock ? '' : ` · ${m.lock_needs_app_lock()}`}
          </span>
        </span>
        <Switch
          checked={prefs.lockOnLeave}
          label={m.lock_on_leave_title()}
          onChange={(v) => {
            prefs.lockOnLeave = v;
          }}
        />
      </div>
      <div class="card spread" style="box-shadow:none;background:var(--surface-2)">
        <span class="row-text">
          <span class="row-title">{m.quick_exit_title()}</span>
          <span class="row-subtitle">
            {isAndroid() ? m.quick_exit_sub_android() : m.quick_exit_sub_web()}{prefs.appLock
              ? ''
              : ` · ${m.quick_exit_no_lock()}`}
          </span>
        </span>
        <Switch
          checked={prefs.quickExit}
          label={m.quick_exit_title()}
          onChange={(v) => {
            prefs.quickExit = v;
          }}
        />
      </div>
    </div>
  </Sheet>

  <Sheet bind:open={aboutSheet} title={m.about()}>
    <h3>{m.about()}</h3>
    <div class="stack-3">
      <p class="small">
        <span translate="no">{m.app_name()}</span>
        <span class="muted">· {m.version()} <span translate="no" data-app-version>{__APP_VERSION__}</span></span>
      </p>
      <p class="small">{m.about_license()}</p>
      <p class="small">
        <strong>{m.about_no_network_title()}</strong> {m.about_no_network_body()}
      </p>
    </div>
  </Sheet>
</div>
