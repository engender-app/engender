<script lang="ts">
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { setLocale, getLocale } from '$lib/paraglide/runtime';
  import { db } from '$lib/data/db.svelte';
  import { todayEpochDay, epochDayFromTimestamp } from '$lib/data/epochDay';
  import { setGroupEnabled } from '$lib/data/repositories/tags';
  import { prefs, selectMetric } from '$lib/data/prefs/store.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { isAndroid } from '$lib/platform';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  const PALETTES: [string, string][] = [
    ['trans', 'Transgender'], ['nonbinary', 'Nonbinary'], ['genderfluid', 'Genderfluid'],
    ['bisexual', 'Bisexual'], ['lesbian', 'Lesbian'], ['pansexual', 'Pansexual'],
    ['rainbow', 'Rainbow'], ['agender', 'Agender'],
  ];

  let isWeb = $derived(!isAndroid());
  let preset = $derived(vocabulary.activePreset);
  let metricName = $derived(vocabulary.metricName);
  let backupAge = $derived(
    prefs.lastBackupAt ? todayEpochDay() - epochDayFromTimestamp(prefs.lastBackupAt) : null
  );

  let presetSheet = $state(false);
  let metricSheet = $state(false);
  let disguiseSheet = $state(false);
  let aboutSheet = $state(false);

  function setLanguage(v: string) {
    prefs.language = v as typeof prefs.language;
    const target = v === 'system' ? ((navigator.language || 'en').startsWith('pl') ? 'pl' : 'en') : (v as 'en' | 'pl');
    if (target !== getLocale()) setLocale(target); // reloads; all state is persisted
  }

  function pickPalette(key: string) {
    prefs.palette = key;
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
          <span class="swatch-name">{label}</span>
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
  </div>

  <SectionTitle text={m.settings_tracking()} />
  <div class="list-group">
    <button class="list-row" onclick={() => (presetSheet = true)}>
      <span class="row-icon"><Icon name="heart" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.gender_preset()}</span>
        <span class="row-subtitle">{preset.name}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
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
          <Switch checked={g.enabled} label="{g.name} group" onChange={(v) => setGroupEnabled(g.key, v)} />
        </div>
      {/each}
      <a class="manage-tags-link" href="/settings/tags">{m.manage_tags()} <Icon name="chevronRight" size={16} /></a>
    </div>
    <button class="list-row" onclick={() => (metricSheet = true)}>
      <span class="row-icon"><Icon name="palette" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.home_cal_colour()}</span>
        <span class="row-subtitle">{m.coloured_by()} {metricName}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
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
            : `${db.reminders.filter((r) => r.enabled).length} active · daily check-in ${prefs.checkInEnabled ? m.on() : m.off()}`}
        </span>
      </span>
      <span class="row-trailing">{#if isWeb}<Icon name="info" size={18} />{:else}<Icon name="chevronRight" size={20} />{/if}</span>
    </a>
    <a class="list-row" href="/settings/milestones">
      <span class="row-icon"><Icon name="flag" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.milestones()}</span>
        <span class="row-subtitle">{db.milestones.length} significant days</span>
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
  </div>

  <SectionTitle text={m.settings_privacy()} />
  <div class="list-group">
    <div class="list-row" style="cursor:default">
      <span class="row-icon"><Icon name="lock" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.app_lock()}</span>
        <span class="row-subtitle">
          {#if prefs.appLock}
            {m.on()} · PIN{isAndroid() ? ' + biometrics' : ''} ·
            <a href="/settings/lock" style="color:var(--accent)">{m.try_it()}</a>
          {:else}{m.off()}{/if}
        </span>
      </span>
      <Switch
        checked={prefs.appLock}
        label={m.app_lock()}
        onChange={(v) => {
          prefs.appLock = v;
          if (v) goto('/settings/lock?setup=1');
        }}
      />
    </div>
    <button class="list-row" onclick={() => (disguiseSheet = true)}>
      <span class="row-icon"><Icon name="shield" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.disguise_row()}</span>
        <span class="row-subtitle">{prefs.disguise ? 'disguised as “Notes”' : m.off()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </button>
    <a class="list-row" href="/settings/export">
      <span class="row-icon"><Icon name="download" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.export_import()}</span>
        <span class="row-subtitle">{backupAge != null ? `last backup ${backupAge} days ago` : 'no backup yet'}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <button class="list-row" onclick={() => (aboutSheet = true)}>
      <span class="row-icon"><Icon name="info" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.about()}</span>
        <span class="row-subtitle">GPLv3 · no network requests</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
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
          data-pick-preset={p.id}
          onclick={() => {
            prefs.activePreset = p.id;
            presetSheet = false;
          }}
        >
          <span class="row-text">
            <span class="row-title">{p.name}</span>
            <span class="row-subtitle">{m.scales_count({ count: String(p.dims.length) })}{p.builtIn ? '' : ` · ${m.custom_suffix()}`}</span>
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
          <span class="row-title">Disguise app</span>
          <span class="row-subtitle">
            {isAndroid()
              ? 'launcher icon and name become a neutral “Notes” — the app closes briefly to switch'
              : 'browser tab shows a neutral “Notes” title and icon'}
          </span>
        </span>
        <Switch
          checked={prefs.disguise}
          label="Disguise app"
          onChange={(v) => {
            prefs.disguise = v;
          }}
        />
      </div>
      <div class="disguise-preview" class:is-on={prefs.disguise}>
        <span class="disguise-icon"><Icon name="book" size={22} /></span>
        <span>
          <strong>Notes</strong><br />
          <span class="muted small">{isAndroid() ? 'how the app appears in your launcher' : 'how the tab appears'}</span>
        </span>
      </div>
      <div class="card spread" style="box-shadow:none;background:var(--surface-2)">
        <span class="row-text">
          <span class="row-title">Lock on leave</span>
          <span class="row-subtitle">locks the moment the app goes to background{prefs.appLock ? '' : ' · needs app lock on'}</span>
        </span>
        <Switch
          checked={prefs.lockOnLeave}
          label="Lock on leave"
          onChange={(v) => {
            prefs.lockOnLeave = v;
          }}
        />
      </div>
      <div class="card spread" style="box-shadow:none;background:var(--surface-2)">
        <span class="row-text">
          <span class="row-title">Quick exit</span>
          <span class="row-subtitle">two-finger swipe down locks instantly{isAndroid() ? '' : ' and swaps the tab to a blank page'}</span>
        </span>
        <Switch
          checked={prefs.quickExit}
          label="Quick exit"
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
      <p class="small"><span translate="no">{m.app_name()}</span> <span class="muted">· version 0.1.0</span></p>
      <p class="small">Free software under the <strong>GPLv3</strong> license. Source code is public.</p>
      <p class="small">
        <strong>This app makes no network requests.</strong> No account, no cloud, no telemetry, no analytics. Your
        journal exists only on this device and in backups you export yourself.
      </p>
    </div>
  </Sheet>
</div>
