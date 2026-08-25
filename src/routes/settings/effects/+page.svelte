<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { earliestEpisode } from '$lib/data/regimenEpisode';
  import { literatureWindow, literatureWindowDays } from '$lib/data/personalEffectWindow';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { PersonalEffectCatalogEntry } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import EffectsTimeline from '$lib/components/EffectsTimeline.svelte';

  let episodesQuery = liveQuery(['regimen'], (j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.value ?? []);
  /* The anchor is HRT's own start, not whichever episode is active right
     now (ticket 07) - activeEpisodesAt is the wrong function here, this is
     the one place earliestEpisode is called from. Its drug decides which
     bands may be drawn at all (ticket 27), so the whole episode is held
     rather than only its start day. */
  let anchor = $derived(earliestEpisode(episodes));
  let anchorEpochDay = $derived(anchor?.startEpochDay ?? null);

  let markersQuery = liveQuery(['personalEffect'], (j) => j.personalEffects.getMarkers());
  let markers = $derived(markersQuery.value ?? []);
  const markerFor = (effect: string) => markers.find((marker) => marker.effect === effect) ?? null;

  const today = todayEpochDay();

  /* The catalogue a hidden effect or a disabled category has already
     removed (CONTEXT: "Hidden", "Effect category") - what the timeline and
     the "mark a change" list offer. The full, unfiltered list lives only in
     the manage sheet below. */
  let visibleEffects = $derived(vocabulary.visiblePersonalEffectTypes);

  /* Whether an effect has a band at all is decided once, here, and read by
     both the chart and the editor sheet's caption - asking
     literatureWindowDays in one place and the predicate behind it in the
     other would be two decisions free to drift apart. Null before there is
     any anchor to ask about. */
  let bands = $derived(
    anchor == null ? null : new Map(visibleEffects.map((e) => [e.key, literatureWindowDays(e.key, anchor)] as const))
  );

  /** Tier 1 (a literature window exists), tier 2 (built-in, no window - the
      community catalogue), or tier 3 (a person's own addition, no source at
      all). Derived rather than stored (personalEffectWindow.ts's header):
      whether a key has a window is the only fact that decides this. */
  function effectTier(e: PersonalEffectCatalogEntry): 1 | 2 | 3 {
    if (!e.builtIn) return 3;
    return literatureWindow(e.key) ? 1 : 2;
  }

  const DIRECTIONS = ['feminizing', 'masculinizing', 'other'] as const;
  type DirectionGroup = (typeof DIRECTIONS)[number];
  const directionOf = (e: PersonalEffectCatalogEntry): DirectionGroup => e.direction ?? 'other';
  function directionLabel(direction: DirectionGroup): string {
    if (direction === 'feminizing') return m.effects_direction_feminizing();
    if (direction === 'masculinizing') return m.effects_direction_masculinizing();
    return m.effects_direction_other();
  }

  /* Category, then direction, is the coarse control (CONTEXT: "Effect
     category"); collapsed by default so a new journal's screen stays no
     longer than the eight-row screen this replaces - the acceptance
     criterion this file exists to keep. Keyed by direction and category
     together, since the same category groups separately under each
     direction. */
  let expandedGroups = $state(new Set<string>());
  const groupKey = (direction: DirectionGroup, categoryKey: string | null) => `${direction}::${categoryKey ?? 'none'}`;
  function toggleGroup(key: string) {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedGroups = next;
  }

  function timelineRowsFor(effects: PersonalEffectCatalogEntry[]) {
    return effects.map((e) => ({
      key: e.key,
      label: e.name,
      onset: bands?.get(e.key)?.onset ?? null,
      completion: bands?.get(e.key)?.completion ?? null,
      markerDay: markerFor(e.key)?.firstNoticedEpochDay ?? null
    }));
  }

  /* One whole-sentence message per window shape (no completion window,
     open-ended, or bounded) rather than concatenating parts - each is a
     full sentence in its own right, so nothing here has to guess how any
     other language would order the pieces.

     Null where the band is withheld, and nothing is said in its place: the
     sentence would be a timing claim about a hormone this person is not on
     (ticket 27), or about an effect the literature has no window for at
     all (tiers 2 and 3, ticket 41). */
  function windowCaption(key: string): string | null {
    if (bands?.get(key) == null) return null;
    const window = literatureWindow(key)!;
    const onsetMin = String(window.onsetMonths.min);
    const onsetMax = String(window.onsetMonths.max);
    if (!window.completionMonths) return m.effect_window_no_completion({ onsetMin, onsetMax });
    const compMin = String(window.completionMonths.min);
    if (window.completionMonths.max == null) return m.effect_window_open_completion({ onsetMin, onsetMax, compMin });
    return m.effect_window_bounded({ onsetMin, onsetMax, compMin, compMax: String(window.completionMonths.max) });
  }

  /** The source caption under a tier-2 or tier-3 effect's edit sheet - a
      tier-1 effect's citation is the shared `effects_source` line under
      the chart instead, since every tier-1 band comes from the same two
      guideline tables (ticket 41's own acceptance criterion: a tier-2
      effect must not read as though it sat under that citation). */
  function sourceCaption(e: PersonalEffectCatalogEntry): string | null {
    const tier = effectTier(e);
    if (tier === 2) return m.effect_source_community();
    if (tier === 3) return m.effect_source_custom();
    return null;
  }

  let editor = $state<{ effect: PersonalEffectCatalogEntry; date: string } | null>(null);

  function openEditor(effect: PersonalEffectCatalogEntry) {
    const existing = markerFor(effect.key);
    editor = { effect, date: dateInputValueFromEpochDay(existing?.firstNoticedEpochDay ?? today) };
  }

  async function saveMarker() {
    if (!editor) return;
    const epochDay = epochDayFromDateInputValue(editor.date) ?? today;
    await journal.personalEffects.upsertMarker({ effect: editor.effect.key, firstNoticedEpochDay: epochDay });
    editor = null;
  }

  async function clearMarker() {
    if (!editor) return;
    const key = editor.effect.key;
    editor = null;
    await journal.personalEffects.clearMarker(key);
  }

  let manageOpen = $state(false);
  let newEffectName = $state('');
  let newEffectCategory = $state('');

  async function addEffectType() {
    const name = newEffectName.trim();
    if (!name) return;
    await journal.personalEffects.addCustomEffectType(name, newEffectCategory || null);
    newEffectName = '';
    newEffectCategory = '';
  }
</script>

<div class="screen">
  <ScreenHeader title={m.effects_timeline()} back="/settings">
    {#snippet actions()}
      <button class="icon-btn" data-manage-effects aria-label={m.effect_manage_types_aria()} onclick={() => (manageOpen = true)}>
        <Icon name="settings" size={20} />
      </button>
    {/snippet}
  </ScreenHeader>

  {#if episodesQuery.loading || markersQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if anchorEpochDay == null}
    <EmptyState title={m.effects_no_regimen_title()} text={m.effects_no_regimen_body()}>
      {#snippet action()}
        <a class="btn btn-soft" href="/settings/regimen"><span>{m.effects_no_regimen_action()}</span></a>
      {/snippet}
    </EmptyState>
  {:else}
    <p class="muted small" style="margin-bottom:var(--space-2)">{m.effects_intro()}</p>
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.effect_variability_notice()}</p>

    {#each DIRECTIONS as direction (direction)}
      {@const directionEffects = visibleEffects.filter((e) => directionOf(e) === direction)}
      {#if directionEffects.length}
        <h2 class="direction-heading">{directionLabel(direction)}</h2>
        {#each vocabulary.effectCategories as cat (cat.key)}
          {@const groupEffects = directionEffects.filter((e) => e.categoryKey === cat.key)}
          {#if groupEffects.length}
            {@const key = groupKey(direction, cat.key)}
            {@const expanded = expandedGroups.has(key)}
            <div class="card effect-group" data-effect-group={key}>
              <button class="spread effect-group-header" onclick={() => toggleGroup(key)} aria-expanded={expanded}>
                <span>{cat.name}</span>
                <span class="effect-group-header-right">
                  <span class="muted small">{m.effect_group_count({ count: groupEffects.length })}</span>
                  <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={18} />
                </span>
              </button>
              {#if expanded}
                <EffectsTimeline rows={timelineRowsFor(groupEffects)} {anchorEpochDay} todayEpochDay={today} />
                <div class="list-group" style="margin-top:var(--space-3)">
                  {#each groupEffects as e (e.key)}
                    {@const marker = markerFor(e.key)}
                    <button class="list-row" onclick={() => openEditor(e)}>
                      <span class="row-text">
                        <span class="row-title">{e.name}</span>
                        <span class="row-subtitle">
                          {marker
                            ? m.effect_first_noticed({
                                date: fmtDay(marker.firstNoticedEpochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                              })
                            : m.effect_not_marked()}
                        </span>
                      </span>
                      <Icon name="pencil" size={18} />
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/each}
        {@const uncategorized = directionEffects.filter((e) => e.categoryKey === null)}
        {#if uncategorized.length}
          {@const key = groupKey(direction, null)}
          {@const expanded = expandedGroups.has(key)}
          <div class="card effect-group" data-effect-group={key}>
            <button class="spread effect-group-header" onclick={() => toggleGroup(key)} aria-expanded={expanded}>
              <span>{m.effect_type_category_none()}</span>
              <span class="effect-group-header-right">
                <span class="muted small">{m.effect_group_count({ count: uncategorized.length })}</span>
                <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={18} />
              </span>
            </button>
            {#if expanded}
              <EffectsTimeline rows={timelineRowsFor(uncategorized)} {anchorEpochDay} todayEpochDay={today} />
              <div class="list-group" style="margin-top:var(--space-3)">
                {#each uncategorized as e (e.key)}
                  {@const marker = markerFor(e.key)}
                  <button class="list-row" onclick={() => openEditor(e)}>
                    <span class="row-text">
                      <span class="row-title">{e.name}</span>
                      <span class="row-subtitle">
                        {marker
                          ? m.effect_first_noticed({
                              date: fmtDay(marker.firstNoticedEpochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                            })
                          : m.effect_not_marked()}
                      </span>
                    </span>
                    <Icon name="pencil" size={18} />
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    {/each}

    <p class="muted small" style="margin-top:var(--space-4)">{m.effects_source()}</p>
  {/if}

  <Sheet open={editor !== null} title={editor ? editor.effect.name : ''} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.effect.name}</h3>
      {@const caption = windowCaption(editor.effect.key)}
      {@const source = sourceCaption(editor.effect)}
      {#if caption}
        <p class="muted small" style="margin-bottom:var(--space-3)">{caption}</p>
      {/if}
      {#if source}
        <p class="muted small" style="margin-bottom:var(--space-3)">{source}</p>
      {/if}
      <div class="field">
        <label class="field-label" for="effect-date">{m.effect_first_noticed_label()}</label>
        <input class="input" type="date" id="effect-date" name="effect-date" bind:value={editor.date} />
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-effect onclick={saveMarker}><span>{m.effect_save()}</span></button>
        {#if markerFor(editor.effect.key)}
          <button class="btn btn-ghost" data-clear-effect onclick={clearMarker}><span>{m.effect_clear()}</span></button>
          <p class="muted small">{m.effect_clear_hint()}</p>
        {/if}
      </div>
    {/if}
  </Sheet>

  <Sheet open={manageOpen} title={m.effect_manage_types()} onClose={() => (manageOpen = false)}>
    <h3>{m.effects_categories_heading()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.effects_categories_intro()}</p>
    <div class="taggroup-toggles">
      {#each vocabulary.effectCategories as cat (cat.key)}
        <div class="spread taggroup-row">
          <span>{cat.name}</span>
          <Switch
            checked={cat.enabled}
            label={m.effect_category_switch({ category: cat.name })}
            onChange={(v) => journal.effectCategories.setCategoryEnabled(cat.key, v)}
          />
        </div>
      {/each}
    </div>

    <h3 style="margin-top:var(--space-4)">{m.effect_manage_types()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.effect_manage_types_intro()}</p>
    <div class="managed-tags">
      {#each vocabulary.personalEffectTypes as e (e.key)}
        <div class="managed-tag" class:is-hidden={e.hidden}>
          <span class="managed-label">
            {e.name}{#if !e.builtIn}<span class="muted small"> · {m.custom_suffix()}</span>{/if}
          </span>
          {#if e.hidden}<span class="muted small">{m.tags_hidden()}</span>{/if}
          <button
            class="icon-btn"
            data-effect-type-hide={e.key}
            aria-label={e.hidden ? m.effect_type_show_aria({ name: e.name }) : m.effect_type_hide_aria({ name: e.name })}
            onclick={() => journal.personalEffects.setEffectTypeHidden(e.key, !e.hidden)}
          >
            <Icon name={e.hidden ? 'eye' : 'eyeOff'} size={16} />
          </button>
        </div>
      {/each}
    </div>

    <div class="field" style="margin-top:var(--space-4)">
      <label class="field-label" for="new-effect-type">{m.effect_type_new_label()}</label>
      <input
        class="input"
        id="new-effect-type"
        name="new-effect-type"
        placeholder={m.effect_type_new_placeholder()}
        bind:value={newEffectName}
      />
    </div>
    <div class="field">
      <label class="field-label" for="new-effect-type-category">{m.effect_type_category_label()}</label>
      <select class="input" id="new-effect-type-category" bind:value={newEffectCategory}>
        <option value="">{m.effect_type_category_none()}</option>
        {#each vocabulary.effectCategories as cat (cat.key)}
          <option value={cat.key}>{cat.name}</option>
        {/each}
      </select>
    </div>
    <button class="btn btn-primary" data-add-effect-type onclick={addEffectType}><span>{m.effect_type_add()}</span></button>
  </Sheet>
</div>

<style>
  .direction-heading {
    font-size: var(--text-sm);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-2);
    margin: var(--space-4) 0 var(--space-2);
  }
  .effect-group {
    margin-bottom: var(--space-3);
  }
  .effect-group-header {
    width: 100%;
    text-align: left;
  }
  .effect-group-header-right {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
</style>
