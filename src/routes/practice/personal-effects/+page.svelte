<script lang="ts">
  /* When you first noticed each change, on the surface kit (phase 5 UX
     ticket 25).

     The groups keep their disclosure - a screen that opened every category
     at once would be a page of timelines - and it finally has motion. A
     group used to appear at full height, which shoved everything under it
     down the screen in one frame; it opens its own height now
     (DIRECTION.md tier 3, and the one place that tier spends a layout
     property), so the rows below travel with it. Reduced motion is an
     instant cut, and the chevron has already turned to say what happened.

     The group is a list card rather than a `.card` holding a `.list-group`,
     which was two containers deep for one list.

     The screen opens on the axis now (phase 10 redesign ticket 57,
     DIRECTION.md rule 16): every change already marked, at the month it was
     noticed, before any group is opened. The groups are the log under that
     reading and are otherwise untouched - they are still where a change is
     marked for the first time, and still where the literature's bands are
     drawn against the one change each belongs to. Two drawings on one
     screen answering two questions: when did I notice this, and what do the
     tables say about when people usually do.

     Side effects moved in whole (phase 11 all-four-doors ticket 13): a side
     effect and a change you were hoping for are both something you noticed
     after starting a regimen, and having them on two screens made the
     reader classify their own symptom before they could write it down. The
     axis draws both kinds now (`NoticedAxis`, `$lib/data/noticedAxis`'s
     `kind` field), the list under it keeps both under their own headings,
     and the cycle block that used to sit under the side effects screen came
     with it, its gate unchanged. What did not move: the record itself, the
     literature bands, or the rule that no band is drawn for what somebody
     noticed rather than what the tables expect. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { earliestEpisode } from '$lib/data/regimenEpisode';
  import {
    effectTier,
    effectWindowShape,
    literatureWindow,
    literatureWindowDays
  } from '$lib/data/personalEffectWindow';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { cycleTrackingVisible } from '$lib/data/cycleTracking';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { severityName, cycleEventKindName } from '$lib/data/vocabulary/labels';
  import type { PersonalEffectCatalogEntry, SideEffect } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import HostedRows from '$lib/components/HostedRows.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  import Switch from '$lib/components/Switch.svelte';
  import EffectsTimeline from '$lib/components/EffectsTimeline.svelte';
  import NoticedAxis from '$lib/components/NoticedAxis.svelte';
  import type { NoticedChange, NoticedChangeKind } from '$lib/data/noticedAxis';
  import {
    EFFECT_DIRECTIONS,
    effectDirectionLabel,
    type EffectDirection
  } from '$lib/data/effectDirections';
  import AreaFinish from '$lib/components/AreaFinish.svelte';

  const SEVERITIES = [1, 2, 3, 4, 5];

  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.rows);
  /* The anchor is HRT's own start, not whichever episode is active right
     now (ticket 07) - activeEpisodesAt is the wrong function here, this is
     the one place earliestEpisode is called from. Its drug decides which
     bands may be drawn at all (ticket 27), so the whole episode is held
     rather than only its start day. */
  let anchor = $derived(earliestEpisode(episodes));
  let anchorEpochDay = $derived(anchor?.startEpochDay ?? null);

  let markersQuery = liveList((j) => j.personalEffects.getMarkers());
  let markers = $derived(markersQuery.rows);
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

  const directionOf = (e: PersonalEffectCatalogEntry): EffectDirection => e.direction ?? 'other';

  /* Category, then direction, is the coarse control (CONTEXT: "Effect
     category"); collapsed by default so a new journal's screen stays no
     longer than the eight-row screen this replaces - the acceptance
     criterion this file exists to keep. Keyed by direction and category
     together, since the same category groups separately under each
     direction. */
  let expandedGroups = $state(new Set<string>());
  const groupKey = (direction: EffectDirection, categoryKey: string | null) => `${direction}::${categoryKey ?? 'none'}`;
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
    /* Read inside the two branches that have one: a completion window is
       null on the no-completion shape, and pulling its min out above the
       switch would put the string "undefined" in a variable the sentence
       happens not to use. */
    switch (effectWindowShape(key)) {
      case 'no-completion':
        return m.effect_window_no_completion({ onsetMin, onsetMax });
      case 'open-completion':
        return m.effect_window_open_completion({ onsetMin, onsetMax, compMin: String(window.completionMonths!.min) });
      case 'bounded':
        return m.effect_window_bounded({
          onsetMin,
          onsetMax,
          compMin: String(window.completionMonths!.min),
          compMax: String(window.completionMonths!.max)
        });
      case 'none':
        /* Unreachable behind the band gate above - a key with no window
           has no band either - and typed rather than dropped so a fourth
           shape cannot be added without this screen being told. */
        return null;
    }
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

  /* The side effects half of the merged screen (ticket 13): the same list,
     the same editor sheet and the same cycle block that used to live on
     /health/side-effects, moved here whole. */
  let effectsQuery = liveList((j) => j.sideEffects.getSideEffects());
  let effects = $derived(effectsQuery.rows);

  const record = recordEditor<SideEffect, { id?: string; date: string; name: string; severity: string }>({
    blank: () => ({ date: dateInputValueFromEpochDay(todayEpochDay()), name: '', severity: '' }),
    fromRecord: (effect) => ({
      id: effect.id,
      date: dateInputValueFromEpochDay(effect.epochDay),
      name: effect.name,
      severity: effect.severity === null ? '' : String(effect.severity)
    }),
    async upsert(draft) {
      const name = draft.name.trim();
      if (!name) return false;
      await journal.sideEffects.upsertSideEffect({
        id: draft.id,
        name,
        severity: draft.severity === '' ? null : Number(draft.severity),
        epochDay: epochDayFromDateInputValueOrToday(draft.date)
      });
    },
    remove: (id) => journal.sideEffects.deleteSideEffect(id),
    findById: (id) => effects.find((effect) => effect.id === id)
  });

  /* Ticket 11's second entry point into the appointment prep list: a
     one-tap add, seeded from what is already on screen, rather than a
     detour through that list's own editor. */
  async function addToAppointmentPrep(name: string) {
    await journal.checklists.addToStandaloneChecklist(m.appointment_prep_from_effect_item({ name }));
    toast(m.appointment_prep_added_toast());
  }

  /* The cycle log as a second area of this screen (ADR-0043), moved here
     with the rest of what /health/side-effects drew (ticket 13): bleeding
     and spotting are physiological effects like anything else read here, so
     the most recent ones sit beneath the two lists once cycle tracking is
     surfaced at all - an active testosterone regimen or the explicit
     opt-in (cycleTracking.ts). This screen is where that gate lives now.

     The rows state, they do not open anything: editing happens on the cycle
     screen the trailing row links to, which owns the chart and the range
     pickers this list deliberately does not duplicate. */
  let cycleEventsQuery = liveList((j) => j.cycleEvents.getCycleEvents());
  let cycleEvents = $derived(cycleEventsQuery.rows);
  let cycleShown = $derived(cycleTrackingVisible(episodes, Date.now(), prefs.cycleTrackingEnabled));
  let recentCycleEvents = $derived([...cycleEvents].sort((a, b) => b.epochDay - a.epochDay).slice(0, 3));

  /* What the axis at the top of the screen draws: the changes that carry a
     marker, joined to their catalogue entry (ticket 57), and every side
     effect logged (ticket 13) - the two kinds `NoticedChange.kind` tells
     apart. Personal effects are only the visible ones, the same catalogue
     the groups below and the chart inside them read, so hiding an effect or
     turning its category off takes it off the axis too. A marker for an
     effect that is no longer visible keeps its record and stops being
     drawn, which is what "hiding keeps everything already marked against
     it" already promises in the manage sheet. Side effects carry no such
     rule - there is no picker to hide them from - so every one logged is on
     the line. */
  let noticedChanges = $derived<NoticedChange[]>([
    ...visibleEffects.flatMap((effect) => {
      const marker = markerFor(effect.key);
      if (!marker) return [];
      return [
        {
          key: effect.key,
          kind: 'personal-effect' as const,
          label: effect.name,
          direction: directionOf(effect),
          firstNoticedEpochDay: marker.firstNoticedEpochDay
        }
      ];
    }),
    ...effects.map((effect) => ({
      key: effect.id,
      kind: 'side-effect' as const,
      label: effect.name,
      direction: 'other' as const,
      firstNoticedEpochDay: effect.epochDay,
      severity: severityName(effect.severity) ?? null
    }))
  ]);

  let editor = $state<{ effect: PersonalEffectCatalogEntry; date: string } | null>(null);

  function openEditor(effect: PersonalEffectCatalogEntry) {
    const existing = markerFor(effect.key);
    editor = { effect, date: dateInputValueFromEpochDay(existing?.firstNoticedEpochDay ?? today) };
  }

  /* A mark on the axis opens the same sheet its row in the list below
     opens, which is the whole of how editing is reachable from the
     drawing - the axis draws no marker the catalogue does not still carry,
     so a personal effect's key always finds one. A side effect's key is its
     own record id instead of a catalogue key, which is what `kind` is for:
     the two namespaces happen never to collide, but the kind is what this
     trusts to pick the sheet, not the shape of the key. */
  function openMark(key: string, kind: NoticedChangeKind) {
    if (kind === 'personal-effect') {
      const effect = visibleEffects.find((e) => e.key === key);
      if (effect) openEditor(effect);
    } else {
      const effect = effects.find((e) => e.id === key);
      if (effect) record.openEditor(effect);
    }
  }

  async function saveMarker() {
    if (!editor) return;
    const epochDay = epochDayFromDateInputValueOrToday(editor.date);
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
  <!-- The intro stays in the body rather than becoming the header's
       subtitle. At 420 characters it is by some way the longest of these
       screens' intros, and in the header it is seven lines of lead before
       a single change is named. A subtitle is a line; this is a paragraph,
       and it belongs where a paragraph goes. The subtitle carries the
       shorter claim instead (ticket 13): what both halves of this screen
       are, and the "no grading and no advice" line the side effects screen
       used to open on, rather than losing it in the merge. -->
  <ScreenHeader title={m.effects_timeline()} back="/care" subtitle={m.effects_timeline_subtitle()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.side_effect_add_aria()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
      <button class="icon-btn press" data-manage-effects aria-label={m.effect_manage_types_aria()} onclick={() => (manageOpen = true)}>
        <Icon name="settings" size={20} />
      </button>
    {/snippet}
  </ScreenHeader>

  {#if episodesQuery.loading || markersQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={3} /></div>
  {:else}
    <!-- What is true now, before the records (DIRECTION.md rule 16): every
         change already marked, at the month it was noticed, on one line. -->
    <div class="screen-part">
      <NoticedAxis changes={noticedChanges} {anchorEpochDay} todayEpochDay={today} onOpen={openMark} />
    </div>

    <!-- Under the axis rather than over it, and no longer instead of it.
         This notice used to replace the whole screen, so a journal with no
         regimen in it saw nothing it had marked (ticket 57) - and a person
         can notice a change before they are on anything, or restore a
         journal and not have typed a regimen back in yet. It reads as what
         a regimen would buy the line above it: months counted from a start
         day instead of calendar months. -->
    {#if anchorEpochDay == null}
      <div class="screen-part">
        <Notice
          icon="sparkle"
          key="effects-no-regimen"
          role={roleAt(activeFlag.roles, 0)}
          title={m.effects_no_regimen_title()}
          text={m.effects_no_regimen_body()}
          action={{ label: m.effects_no_regimen_action(), primary: true, href: '/care/regimen' }}
        />
      </div>
    {/if}

    <!-- All three of these are about the literature's bands, so they keep
         the company of the chart that draws them: with no regimen there is
         no band on the screen for them to be describing. -->
    {#if anchorEpochDay !== null}
      <p class="muted small" style="margin-bottom:var(--space-2)">{m.effects_intro()}</p>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.effect_variability_notice()}</p>
    {/if}

    {#each EFFECT_DIRECTIONS as direction (direction)}
      {@const directionEffects = visibleEffects.filter((e) => directionOf(e) === direction)}
      {#if directionEffects.length}
        <SectionHeading text={effectDirectionLabel(direction)} />
        {#each vocabulary.effectCategories as cat, i (cat.key)}
          {@const groupEffects = directionEffects.filter((e) => e.categoryKey === cat.key)}
          {#if groupEffects.length}
            {@const key = groupKey(direction, cat.key)}
            {@const expanded = expandedGroups.has(key)}
            <div class="effect-group" data-effect-group={key}>
              <ListCard role={roleAt(activeFlag.roles, i)}>
                <ListRow onclick={() => toggleGroup(key)} aria-expanded={expanded} chevron={false} title={cat.name}>
                  {#snippet trailing()}
                    {m.effect_group_count({ count: groupEffects.length })}
                    <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={20} />
                  {/snippet}
                </ListRow>
                {#if expanded}
                  <div class="effect-group-body" transition:disclose>
                    {#if anchorEpochDay !== null}
                      <EffectsTimeline rows={timelineRowsFor(groupEffects)} {anchorEpochDay} todayEpochDay={today} />
                    {/if}
                    {#each groupEffects as e (e.key)}
                      {@const marker = markerFor(e.key)}
                      <ListRow
                        key={e.key}
                        title={e.name}
                        subtitle={marker
                          ? m.effect_first_noticed({
                              date: fmtDay(marker.firstNoticedEpochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                            })
                          : m.effect_not_marked()}
                        chevron={false}
                        onclick={() => openEditor(e)}
                      />
                    {/each}
                  </div>
                {/if}
              </ListCard>
            </div>
          {/if}
        {/each}
        {@const uncategorized = directionEffects.filter((e) => e.categoryKey === null)}
        {#if uncategorized.length}
          {@const key = groupKey(direction, null)}
          {@const expanded = expandedGroups.has(key)}
          <div class="effect-group" data-effect-group={key}>
            <ListCard role={roleAt(activeFlag.roles, 0)}>
              <ListRow
                onclick={() => toggleGroup(key)}
                aria-expanded={expanded}
                chevron={false}
                title={m.effect_type_category_none()}
              >
                {#snippet trailing()}
                  {m.effect_group_count({ count: uncategorized.length })}
                  <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={20} />
                {/snippet}
              </ListRow>
              {#if expanded}
                <div class="effect-group-body" transition:disclose>
                  {#if anchorEpochDay !== null}
                    <EffectsTimeline rows={timelineRowsFor(uncategorized)} {anchorEpochDay} todayEpochDay={today} />
                  {/if}
                  {#each uncategorized as e (e.key)}
                    {@const marker = markerFor(e.key)}
                    <ListRow
                      key={e.key}
                      title={e.name}
                      subtitle={marker
                        ? m.effect_first_noticed({
                            date: fmtDay(marker.firstNoticedEpochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                          })
                        : m.effect_not_marked()}
                      chevron={false}
                      onclick={() => openEditor(e)}
                    />
                  {/each}
                </div>
              {/if}
            </ListCard>
          </div>
        {/if}
      {/if}
    {/each}

    {#if anchorEpochDay !== null}
      <p class="muted small">{m.effects_source()}</p>
    {/if}

    <!-- The other change hanging off this screen (ticket 13): a side effect
         and a change you were hoping for are both something you noticed
         after starting a regimen, and having them as two screens made the
         reader classify their own symptom before they could write it down.
         Its own heading, list, editor sheet and empty state - moved here
         whole from /health/side-effects, which is a redirect stub now. -->
    <!-- The wrapper names nothing but the crop: a sign-off render needs one
         stable box around the heading and the list, the way `data-noticed-axis`
         already gives the axis one. -->
    <div data-side-effects-section>
      <SectionHeading text={m.side_effects()} />
      <ReadGate read={effectsQuery} variant="line" count={3}>
        {#snippet rows()}
          <div class="screen-part">
            <ListCard role={roleAt(activeFlag.roles, 1)}>
              {#each [...effects].reverse() as effect (effect.id)}
                {@const severity = severityName(effect.severity)}
                {@const day = fmtDay(effect.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}
                <ListRow
                  key={effect.id}
                  data-side-effect={effect.id}
                  icon="zap"
                  title={effect.name}
                  subtitle={severity ? `${day} · ${severity}` : day}
                  chevron={false}
                  onclick={() => record.openEditor(effect)}
                />
              {/each}
            </ListCard>
          </div>
        {/snippet}
        {#snippet empty()}
          <div class="screen-part">
            <Notice
              icon="zap"
              key="side-effects-empty"
              role={roleAt(activeFlag.roles, 1)}
              title={m.side_effect_empty_title()}
              text={m.side_effect_empty_body()}
              action={{ label: m.side_effect_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
            />
          </div>
        {/snippet}
      </ReadGate>
    </div>

    <!-- The cycle log, gated exactly as it was on /health/side-effects
         (ADR-0043, ticket 13 moved the block rather than weakening the
         gate): a second area, so a heading. -->
    {#if cycleShown && !cycleEventsQuery.loading}
      <SectionHeading text={m.cycle_events()} />
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 2)}>
          {#each recentCycleEvents as event (event.id)}
            <!-- Static rows (the shape regimen's pause rows use, ticket 16):
                 they name nothing to press, and routing them through ListRow
                 would add a tab stop and a wash to text that does nothing.
                 The trailing row below is the way in. -->
            <div class="kit-row is-static" data-cycle-event={event.id}>
              <span class="kit-row-ico"><Icon name="calendar" size={22} /></span>
              <span class="kit-row-text">
                <span class="kit-row-title">{cycleEventKindName(event.kind)}</span>
                <span class="kit-row-sub">{fmtDay(event.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </span>
            </div>
          {/each}
          <ListRow
            key="all-cycle-events"
            icon="calendar"
            title={m.cycle_events_open_row_title()}
            subtitle={m.cycle_events_open_row_sub()}
            href="/health/cycle-events"
          />
        </ListCard>
      </div>
    {/if}
  {/if}

  <!-- Hair progress, the one change that keeps its own screen (phase 9
       carpet ticket 16): a published scale and a camera behind it, so it
       stays hosted rather than folded in here.

       Outside the `anchorEpochDay` branch above on purpose. That branch
       replaces this whole screen with a "set up a regimen first" notice, and
       hair progress is usable without one. Inside it, the row would be the
       dead route the ticket forbids. cycle-events shares this host too
       (ticket 13) but draws by hand above rather than through this
       component - `HostedRows.svelte` excludes it by key. -->
  <HostedRows host="effects" card />

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
      <Field label={m.effect_first_noticed_label()} id="effect-date">
        {#snippet children(id)}
          <DatePicker name="effect-date" bind:value={editor!.date} {id} />
        {/snippet}
      </Field>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-effect onclick={saveMarker}><span>{m.effect_save()}</span></button>
        {#if markerFor(editor.effect.key)}
          <button class="btn btn-ghost" data-clear-effect onclick={clearMarker}><span>{m.effect_clear()}</span></button>
          <p class="muted small">{m.effect_clear_hint()}</p>
        {/if}
      </div>
    {/if}
  </Sheet>

  <RecordSheet
    {record}
    handle="side-effect"
    newTitle={m.side_effect_new_sheet()}
    editTitle={m.side_effect_edit_sheet()}
    saveLabel={m.side_effect_save()}
    deleteLabel={m.side_effect_delete()}
    confirm={{
      title: m.side_effect_delete_sheet(),
      question: (effect) => m.side_effect_delete_q({ name: effect.name }),
      hint: () => m.side_effect_delete_hint(),
      confirmLabel: m.side_effect_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.side_effect_name_label()} id="side-effect-name">
        {#snippet children(id)}
          <input class="input" {id} name="side-effect-name" placeholder={m.side_effect_name_placeholder()} bind:value={editor.name} />
        {/snippet}
      </Field>
      <Field label={m.side_effect_date_label()} id="side-effect-date">
        {#snippet children(id)}
          <DatePicker name="side-effect-date" bind:value={editor.date} {id} />
        {/snippet}
      </Field>
      <Field label={m.side_effect_severity_label()} legend>
        {#snippet children()}
          <Segmented
            name={m.side_effect_severity_label()}
            options={SEVERITIES.map((v) => ({ value: String(v), label: severityName(v) ?? String(v) }))}
            value={editor.severity}
            onChange={(v) => (editor.severity = v)}
          />
        {/snippet}
      </Field>
    {/snippet}
    {#snippet extraActions(editor)}
      <button class="btn btn-soft" data-add-to-appointment-prep onclick={() => addToAppointmentPrep(editor.name)}>
        <span>{m.appointment_prep_add_button()}</span>
      </button>
    {/snippet}
  </RecordSheet>

  <!-- One row shape, called from both branches below - it was written out
       twice (per-category, then again for the uncategorized group) before
       a code review named the duplication. `effectiveHidden` is passed in
       rather than recomputed here because the two branches derive it
       differently: a categorized effect also answers to its category's
       own Switch, an uncategorized one only ever answers to its own.
       Declared outside the Sheet below - a snippet declared as a direct
       child of a component is treated as an implicit prop for it. -->
  {#snippet managedEffectRow(e: PersonalEffectCatalogEntry, effectiveHidden: boolean)}
    <div class="rows-divide managed-tag" class:is-hidden={effectiveHidden}>
      <span class="managed-label">
        {e.name}{#if !e.builtIn}<span class="muted small"> · {m.custom_suffix()}</span>{/if}
      </span>
      {#if effectiveHidden}<span class="muted small">{m.tags_hidden()}</span>{/if}
      <button
        class="icon-btn"
        data-effect-type-hide={e.key}
        aria-label={e.hidden ? m.effect_type_show_aria({ name: e.name }) : m.effect_type_hide_aria({ name: e.name })}
        onclick={() => journal.personalEffects.setEffectTypeHidden(e.key, !e.hidden)}
      >
        <Icon name={e.hidden ? 'eye' : 'eyeOff'} size={16} />
      </button>
    </div>
  {/snippet}

  <!-- Saying you are done with this area (phase 8 features ticket 04). -->
  <AreaFinish group="effects" />

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

    <h3>{m.effect_manage_types()}</h3>
    <p class="muted small" style="margin-bottom:var(--space-3)">{m.effect_manage_types_intro()}</p>
    <!-- Grouped the same way the timeline above groups them (by category),
         rather than one flat list of every effect the catalogue has - the
         two disagreeing about how these effects are organised was its own
         kind of confusing (Alicja, 2026-08-27). A category's own Switch,
         above, already keeps every effect under it out of the timeline and
         the "mark a change" picker (visiblePersonalEffectTypes); shown here
         as effectively hidden too, rather than only in the two screens this
         one does not do the toggling for, so what a row says matches what
         the category switch already decided for it. Its own eye toggle
         stays live regardless - hiding it individually is a choice that
         should still stick once the category comes back on. -->
    {#each vocabulary.effectCategories as cat (cat.key)}
      {@const catEffects = vocabulary.personalEffectTypes.filter((e) => e.categoryKey === cat.key)}
      {#if catEffects.length}
        <p class="field-label" style="margin:var(--space-3) 0 var(--space-2)">{cat.name}</p>
        <div class="managed-tags">
          {#each catEffects as e (e.key)}
            {@render managedEffectRow(e, e.hidden || !cat.enabled)}
          {/each}
        </div>
      {/if}
    {/each}
    {@const uncategorized = vocabulary.personalEffectTypes.filter((e) => e.categoryKey === null)}
    {#if uncategorized.length}
      <p class="field-label" style="margin:var(--space-3) 0 var(--space-2)">{m.effect_type_category_none()}</p>
      <div class="managed-tags">
        {#each uncategorized as e (e.key)}
          {@render managedEffectRow(e, e.hidden)}
        {/each}
      </div>
    {/if}

    <Field label={m.effect_type_new_label()} id="new-effect-type">
      {#snippet children(id)}
        <input
          class="input"
          {id}
          name="new-effect-type"
          placeholder={m.effect_type_new_placeholder()}
          bind:value={newEffectName}
        />
      {/snippet}
    </Field>
    <Field label={m.effect_type_category_label()} id="new-effect-type-category">
      {#snippet children(id)}
        <select class="input" {id} bind:value={newEffectCategory}>
          <option value="">{m.effect_type_category_none()}</option>
          {#each vocabulary.effectCategories as cat, i (cat.key)}
            <option value={cat.key}>{cat.name}</option>
          {/each}
        </select>
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-add-effect-type onclick={addEffectType}><span>{m.effect_type_add()}</span></button>
  </Sheet>
</div>

<style>
  .effect-group {
    margin-bottom: var(--space-3);
  }

  /* The body is inside the card, under the header row, so it takes the
     card's own inset rather than the row's - a timeline is a drawing and
     wants the width, and the rows under it bring their own padding. */
  .effect-group-body {
    padding: var(--space-3) var(--space-3) 0;
  }
</style>
