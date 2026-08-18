<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { setLocale, getLocale } from '$lib/paraglide/runtime';
  import { backupAgeDays } from '$lib/data/backupHealth';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
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
     count of the enabled ones - which only the Android build displays at all.
     Milestones are mirrored, so their count needs no query. */
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
  <header class="screen-header"><h1 class="screen-title">{m.nav_settings()}</h1></header>

  <SectionTitle text={m.settings_appearance()} />
  <div class="card">
    <p class="field-label" style="margin-bottom:var(--space-3)">{m.colour_palette()}</p>
    <div class="palette-grid" role="radiogroup" aria-label={m.colour_palette()}>
      {#each PALETTES as [key, label] (key)}
        <button
          class="palette-swatch"
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
          class="palette-swatch"
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
      <span class="row-title">{m.theme()}</span>
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
      <span class="row-title">{m.language()}</span>
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
      <span class="row-text">
        <span class="row-title">{m.a11y_text_size_boost()}</span>
        <span class="row-subtitle">{m.a11y_text_size_boost_sub()}</span>
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
      <span class="row-text">
        <span class="row-title">{m.a11y_legibility_boost()}</span>
        <span class="row-subtitle">{m.a11y_legibility_boost_sub()}</span>
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
      <span class="row-text">
        <span class="row-title">{m.a11y_motion_reduce_override()}</span>
        <span class="row-subtitle">{m.a11y_motion_reduce_override_sub()}</span>
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

  <SectionTitle text={m.settings_tracking()} />
  <div class="list-group">
    <button class="list-row" onclick={() => (presetSheet = true)}>
      <span class="row-icon"><Icon name="heart" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.gender_preset()}</span>
        <span class="row-subtitle" data-active-preset-name>{preset.name}</span>
      </span>
      <!-- SH-103: chevronDown ("opens in place") rather than chevronRight
           ("navigates away"), so a sheet-opening row no longer looks
           identical to the <a> rows around it. -->
      <span class="row-trailing"><Icon name="chevronDown" size={20} /></span>
    </button>
    <a class="list-row" href="/settings/dimension">
      <span class="row-icon"><Icon name="stats" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.custom_dimension()}</span>
        <span class="row-subtitle">{m.custom_dimension_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <div class="list-row" style="cursor:default">
      <span class="row-icon"><Icon name="tag" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.tag_groups()}</span>
        <span class="row-subtitle">{m.tag_groups_sub()}</span>
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
    <div class="card" style="margin-top:var(--space-3)">
      <div class="spread" data-entry-nudges>
        <span class="row-text">
          <span class="row-title">{m.entry_nudges()}</span>
          <span class="row-subtitle">{m.entry_nudges_sub()}</span>
        </span>
        <Switch
          checked={prefs.entryNudges}
          label={m.entry_nudges()}
          onChange={(v) => {
            prefs.entryNudges = v;
          }}
        />
      </div>
    </div>
    <div class="card" style="margin-top:var(--space-3)">
      <div class="spread" data-wrapped-toggle>
        <span class="row-text">
          <span class="row-title">{m.wrapped()}</span>
          <span class="row-subtitle">{m.wrapped_settings_sub()}</span>
        </span>
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
      </div>
      {#if !isWeb && prefs.wrappedEnabled}
        <div class="spread" style="margin-top:var(--space-3)" data-wrapped-notify-toggle>
          <span class="row-text">
            <span class="row-title">{m.retro_notify_title()}</span>
            <span class="row-subtitle">{m.wrapped_notify_sub()}</span>
          </span>
          <Switch
            checked={prefs.wrappedNotificationsEnabled}
            label={m.retro_notify_title()}
            onChange={(v) => {
              prefs.wrappedNotificationsEnabled = v;
            }}
          />
        </div>
      {/if}
    </div>
    <div class="card" style="margin-top:var(--space-3)">
      <div class="spread" data-on-this-day-toggle>
        <span class="row-text">
          <span class="row-title">{m.on_this_day()}</span>
          <span class="row-subtitle">{m.on_this_day_settings_sub()}</span>
        </span>
        <Switch
          checked={prefs.onThisDayEnabled}
          label={m.on_this_day()}
          onChange={(v) => {
            prefs.onThisDayEnabled = v;
            if (!v) prefs.onThisDayNotificationsEnabled = false;
          }}
        />
      </div>
      {#if !isWeb && prefs.onThisDayEnabled}
        <div class="spread" style="margin-top:var(--space-3)" data-on-this-day-notify-toggle>
          <span class="row-text">
            <span class="row-title">{m.retro_notify_title()}</span>
            <span class="row-subtitle">{m.on_this_day_notify_sub()}</span>
          </span>
          <Switch
            checked={prefs.onThisDayNotificationsEnabled}
            label={m.retro_notify_title()}
            onChange={(v) => {
              prefs.onThisDayNotificationsEnabled = v;
            }}
          />
        </div>
      {/if}
    </div>
    {#if !isWeb && (prefs.wrappedNotificationsEnabled || prefs.onThisDayNotificationsEnabled) && retroNotifyStatus.notifications === 'denied'}
      <div class="notice notice-warning" style="margin-top:var(--space-3)">
        <Icon name="alert" size={20} />
        <div class="notice-body">
          <span class="notice-title">{m.retro_notify_capabilities_title()}</span>
          {m.retro_notify_capabilities_body()}
          <button class="btn btn-soft" style="margin-top:var(--space-2)" onclick={requestRetroNotifications}>
            {m.rem_allow_notifications()}
          </button>
        </div>
      </div>
    {/if}
    <button class="list-row" onclick={() => (metricSheet = true)}>
      <span class="row-icon"><Icon name="palette" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.home_cal_colour()}</span>
        <span class="row-subtitle">{m.coloured_by()} {metricName}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronDown" size={20} /></span>
    </button>
  </div>

  <SectionTitle text={m.settings_care()} />
  <div class="list-group">
    <a class="list-row" href="/settings/reminders">
      <span class="row-icon"><Icon name="bell" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.reminders()}</span>
        <span class="row-subtitle">
          {isWeb
            ? m.reminders_web_sub()
            : m.settings_reminders_sub({
                count: String(activeReminders),
                state: prefs.checkInEnabled ? m.on() : m.off()
              })}
        </span>
      </span>
      <span class="row-trailing">{#if isWeb}<Icon name="info" size={18} />{:else}<Icon name="chevronRight" size={20} />{/if}</span>
    </a>
    <a class="list-row" href="/settings/milestones">
      <span class="row-icon"><Icon name="flag" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.milestones()}</span>
        <span class="row-subtitle">{m.settings_milestones_sub({ count: vocabulary.milestones.length })}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <a class="list-row" href="/settings/photos">
      <span class="row-icon"><Icon name="image" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.progress_photos()}</span>
        <span class="row-subtitle">{m.progress_photos_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <a class="list-row" href="/settings/labs">
      <span class="row-icon"><Icon name="flask" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.lab_results()}</span>
        <span class="row-subtitle">{m.lab_results_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <a class="list-row" href="/settings/measurements">
      <span class="row-icon"><Icon name="ruler" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.body_measurements()}</span>
        <span class="row-subtitle">{m.body_measurements_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <a class="list-row" href="/settings/regimen">
      <span class="row-icon"><Icon name="timeline" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.regimen()}</span>
        <span class="row-subtitle">{m.regimen_row_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <a class="list-row" href="/settings/side-effects">
      <span class="row-icon"><Icon name="zap" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.side_effects()}</span>
        <span class="row-subtitle">{m.side_effects_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <a class="list-row" href="/settings/effects">
      <span class="row-icon"><Icon name="sparkle" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.effects_timeline()}</span>
        <span class="row-subtitle">{m.effects_timeline_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <a class="list-row" href="/settings/hormone-curve">
      <span class="row-icon"><Icon name="curve" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.curve_title()}</span>
        <span class="row-subtitle">{m.curve_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <a class="list-row" href="/settings/hair-progress">
      <span class="row-icon"><Icon name="comb" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.hair_progress()}</span>
        <span class="row-subtitle">{m.hair_progress_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
  </div>

  <SectionTitle text={m.settings_privacy()} />
  <div class="list-group">
    <a class="list-row" href="/settings/security">
      <span class="row-icon"><Icon name="shield" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.settings_security_row()}</span>
        <span class="row-subtitle">{m.settings_security_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <button class="list-row" onclick={() => (disguiseSheet = true)}>
      <span class="row-icon"><Icon name="shield" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.disguise_row()}</span>
        <span class="row-subtitle">{prefs.disguise ? m.settings_disguise_on() : m.off()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronDown" size={20} /></span>
    </button>
    <a class="list-row" href="/settings/export">
      <span class="row-icon"><Icon name="download" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.export_import()}</span>
        <span class="row-subtitle">
          {backupAge != null ? m.settings_backup_age({ days: m.n_days({ n: backupAge }) }) : m.settings_backup_none()}
        </span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <button class="list-row" data-about-open onclick={() => (aboutSheet = true)}>
      <span class="row-icon"><Icon name="info" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.about()}</span>
        <span class="row-subtitle">{m.settings_about_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronDown" size={20} /></span>
    </button>
  </div>
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
            <span class="row-title">{p.name}</span>
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
