<script lang="ts">
  /* Safe Space (ticket 52, ADR-0040, CONTEXT: "Safe space").
     The crisis-mode dashboard for intense dysphoria:
     - Calming tool: guided box breathing exercise with concentric ambient halo
     - Grounding statistics: streak and good moments from the journal
     - Visual charts: 30-day timeline and affirming themes breakdown
     - Counterevidence pool: euphoria-tagged, high-euphoria body region, and starred entries,
       plus (ticket 14) an unlocked letter and starred photos drawn alongside it
     - Snapshots: frozen captures of past counterevidence pools
     - Comfort list (phase 6 ticket 14, CONTEXT: "Comfort list"): who to
       text, which walk, which playlist, entirely the person's own words.
       Nothing seeds it, nothing offers it, and nothing anywhere else in the
       app triggers it - the only route in is this screen's own single tap.
     - A panel pointing at the bundled support directory
       (/settings/resources), added at Alicja's request during this
       ticket's review, then reworked from a heading-action link into its
       own panel in the same round - the ticket text itself excludes new
       crisis-resource *content*, and this adds none: same href, same copy
       as the /more hub's own row, just given its own reading here too.

     Purely a read: opening the screen writes nothing (ADR-0037,
     src/lib/data/journal/safeSpaceReads.test.ts pins it at the driver).

     A voice-benchmark delta was ticket 14's third source, gated on ticket
     15's `voice_benchmark` table. That table does not exist yet - there is
     nothing to query, not merely nothing to show - so per the ticket's own
     fallback ("land 1 and 2 and leave 3 for a follow-up") it is left for
     whichever of 15/16 lands the table. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { EUPHORIA_TAG_KEYS } from '$lib/data/vocabulary/builtins';
  import type { ComfortItem, CounterevidenceEntry, CounterevidenceSnapshot } from '$lib/data/types';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { featuredLetter } from '$lib/data/letterRetrospective';
  import Icon from '$lib/components/Icon.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import { smartBack } from '$lib/navigation/smart-back';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import Tile from '$lib/components/kit/Tile.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import BarRows from '$lib/components/kit/BarRows.svelte';
  import type { BarRow } from '$lib/components/kit/barRow';
  import { atGrain } from '$lib/charts/grain';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import BreathingExercise from '$lib/components/BreathingExercise.svelte';
  import LookBackLetterCard from '$lib/components/LookBackLetterCard.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';

  const COUNTEREVIDENCE_LIMIT = 20;
  const HISTORY_LIMIT = 50;
  const TIMELINE_DAYS = 30;
  /** How far back the featured letter looks - letterRetrospective.ts's own
      bound, reused rather than re-guessed (LETTER_RETROSPECTIVE_LIMIT). */
  const LETTER_LOOKBACK = 200;
  /** Starred photos shown on open, most recently starred-shelf-worthy first.
      Bounded so a large starred collection stays a glance rather than a
      second gallery grafted onto a crisis screen - the shelf itself
      (/search/starred, this section's own overflow) is already unbounded.
      Measured (Node's WebCrypto, AES-256-GCM, 50 decrypts averaged per
      size): 10KB, 20KB and 40KB ciphertexts - the range a 320px thumbnail
      at THUMB_QUALITY normalizes to - each decrypt in ~0.02ms. The crypto
      is not the cost; six thumbnails decoding and painting at once is a
      bound worth keeping for its own sake, not because decryption is
      expensive. */
  const PHOTO_LIMIT = 6;

  let today = $derived(todayEpochDay());
  let from = $derived(today - TIMELINE_DAYS + 1);

  let counterevidenceQuery = liveList((j) =>
    j.entries.counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT)
  );
  let counterevidence = $derived(counterevidenceQuery.rows);

  let streakQuery = liveQuery((j) => j.stats.streak(today));
  let streakDays = $derived(streakQuery.value ?? 0);

  let dayAveragesQuery = liveList((j) => j.stats.dayAverages('mood', from, today));
  let rawPoints = $derived(dayAveragesQuery.rows.map((r) => ({ x: r.day, y: r.value })));
  let plotted = $derived(atGrain(rawPoints, TIMELINE_DAYS));

  let affirmingTagRows = $derived.by<BarRow[]>(() => {
    const counts = new Map<string, number>();
    for (const entry of counterevidence) {
      if (entry.tags) {
        for (const t of entry.tags) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
    }
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return sorted.map(([tagId, count]) => ({
      key: tagId,
      name: vocabulary.tag(tagId)?.label ?? tagId,
      value: `${count}×`,
      amount: count
    }));
  });

  let snapshotsQuery = liveList((j) => j.doubtJournal.getSnapshots(HISTORY_LIMIT));
  let snapshots = $derived(snapshotsQuery.rows);

  let lettersQuery = liveList((j) => j.letters.getLetters(LETTER_LOOKBACK));
  let letter = $derived(featuredLetter(lettersQuery.rows, today));

  let starredPhotosQuery = liveList((j) => j.photos.starredPhotos());
  // Most recently starred-shelf-worthy first: starredPhotos() itself reads
  // oldest first (CONTEXT: "Starred", the shelf's own order), and a crisis
  // screen's glance at them wants the newest, not the earliest.
  let recentStarredPhotos = $derived([...starredPhotosQuery.rows].reverse().slice(0, PHOTO_LIMIT));

  async function saveSnapshot() {
    if (counterevidence.length === 0) return;
    const items: CounterevidenceEntry[] = counterevidence.map((e) => ({
      epochDay: e.epochDay,
      mood: e.mood,
      note: e.note
    }));
    await journal.doubtJournal.saveSnapshot(today, items);
  }

  let snapshotDeleteTarget = $state<CounterevidenceSnapshot | null>(null);
  async function deleteSnapshot() {
    if (!snapshotDeleteTarget) return;
    const id = snapshotDeleteTarget.id;
    snapshotDeleteTarget = null;
    await journal.doubtJournal.deleteSnapshot(id);
  }

  const dayLabel = (epochDay: number) =>
    fmtDay(epochDay, { weekday: 'short', day: 'numeric', month: 'short' });

  /* The comfort list (phase 6 ticket 14, CONTEXT: "Comfort list"): entirely
     the person's own words, so this read is the only thing on the screen
     with nothing built in behind it - no starter list, no suggestion. */
  let comfortItemsQuery = liveList((j) => j.comfortItems.getItems());
  let comfortItems = $derived(comfortItemsQuery.rows);

  const comfortRecord = recordEditor<ComfortItem, { id?: string; text: string }>({
    blank: () => ({ text: '' }),
    fromRecord: (item) => ({ id: item.id, text: item.text }),
    async upsert(draft) {
      const text = draft.text.trim();
      if (!text) return false;
      if (draft.id) await journal.comfortItems.editItem(draft.id, text);
      else await journal.comfortItems.addItem(text);
    },
    remove: (id) => journal.comfortItems.deleteItem(id),
    findById: (id) => comfortItems.find((item) => item.id === id)
  });

  /* The journal speaks whole orders (a drag), so the up-button builds the
     order it wants and hands it over - the same reason TagsArea.reorder
     takes it (settings/tags/+page.svelte). */
  function moveComfortItemUp(index: number) {
    const ids = comfortItems.map((item) => item.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    journal.comfortItems.reorder(ids);
  }
</script>

<div class="screen">
  <ScreenHeader title={m.safe_space_title()} back={() => smartBack('/more')} />

  <SectionHeading text={m.safe_space_calm_title()} />
  <BreathingExercise role={roleAt(activeFlag.roles, 0)} />

  <!-- Support directory, its own panel rather than a heading-action link
       (Alicja's review): a link this small was easy to miss above a
       screen someone opens mid-crisis, and a panel of its own matches the
       weight every other reading on this screen already gets. Still no new
       content - same href, same copy, as the /more hub's own row. -->
  <ListCard role={roleAt(activeFlag.roles, 1)}>
    <ListRow
      key="resources"
      icon="globe"
      title={m.resources_title()}
      subtitle={m.resources_row_sub()}
      href="/settings/resources"
    />
  </ListCard>

  <SectionHeading text={m.safe_space_stats_title()} />
  <TileGrid
    role={roleAt(activeFlag.roles, 1)}
    flagFill={activeFlag.fill === 'none' ? undefined : activeFlag.fill}
    data-safe-space-stats
    data-tight
  >
    <Tile
      key="streak"
      title={m.safe_space_stat_streak_title()}
      value={String(streakDays)}
      note={m.safe_space_stat_streak_note()}
      href="/calendar"
    />
    <Tile
      key="evidence"
      title={m.safe_space_stat_evidence_title()}
      value={String(counterevidence.length)}
      note={m.safe_space_stat_evidence_note()}
      href="/search/starred"
    />
  </TileGrid>

  <!-- 30-Day Continuity Timeline -->
  <ChartCard
    heading={m.safe_space_chart_timeline_title()}
    kind="timeline"
    role={roleAt(activeFlag.roles, 1)}
  >
    {#if plotted.points.length > 1}
      <AreaChart
        points={plotted.points}
        min={1}
        max={5}
        ariaLabel={m.safe_space_chart_timeline_title()}
        from={fmtDay(from, { day: 'numeric', month: 'short' })}
        to={fmtDay(today, { day: 'numeric', month: 'short' })}
      />
    {:else}
      <ChartEmpty>{m.safe_space_no_themes()}</ChartEmpty>
    {/if}
  </ChartCard>

  <!-- Affirming Themes Breakdown -->
  {#if affirmingTagRows.length > 0}
    <ChartCard
      heading={m.safe_space_chart_themes_title()}
      kind="affirming-themes"
      role={roleAt(activeFlag.roles, 2)}
    >
      <BarRows rows={affirmingTagRows} />
    </ChartCard>
  {/if}

  <SectionHeading text={m.safe_space_counterevidence_title()} />
  <p class="muted small" style="margin-bottom:var(--space-3)">{m.safe_space_counterevidence_sub()}</p>

  {#if letter}
    <p class="muted small" style="margin-bottom:var(--space-2)">{m.safe_space_letter_intro()}</p>
    <ListCard role={roleAt(activeFlag.roles, 1)}>
      <!-- LookBackLetterCard's `kind` is normally the retrospective's own
           finding - written that day, or opened that day. There is no
           candidate day here, only the letter itself, and Safe Space wants
           one framing regardless: this is what your past self wrote you,
           deliberately, so `written` is hardcoded rather than derived. -->
      <LookBackLetterCard {letter} kind="written" />
    </ListCard>
    <div style="margin-bottom:var(--space-3)"></div>
  {/if}

  {#if recentStarredPhotos.length}
    <p class="muted small" style="margin-bottom:var(--space-2)">{m.safe_space_photos_intro()}</p>
    <div class="photo-grid" data-safe-space-photos style="margin-bottom:var(--space-3)">
      {#each recentStarredPhotos as p (p.id)}
        <PhotoThumb photo={p} size={104} />
      {/each}
    </div>
  {/if}

  <ReadGate read={counterevidenceQuery} variant="card" count={2}>
    {#snippet rows()}
      {#each counterevidence as e (e.id)}
        <EntryCard entry={e} />
      {/each}
      <button type="button" class="btn btn-soft btn-block press" onclick={saveSnapshot}>
        <Icon name="heart" size={18} /> <span>{m.doubt_save_snapshot()}</span>
      </button>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="sparkle"
        key="no-counterevidence"
        title={m.doubt_no_counterevidence_title()}
        text={m.doubt_no_counterevidence_body()}
      />
    {/snippet}
  </ReadGate>

  {#if snapshots.length}
    <SectionHeading text={m.doubt_snapshots_title()} />
    <div class="stack-3">
      {#each snapshots as snap (snap.id)}
        <div class="card" data-kit-surface {...roleAttrs(roleAt(activeFlag.roles, 3))}>
          <div class="spread">
            <span class="kit-row-title">{dayLabel(snap.epochDay)} · {fmtTime(snap.timestamp)}</span>
            <button
              type="button"
              class="icon-btn"
              aria-label={m.doubt_snapshot_delete_sheet()}
              onclick={() => (snapshotDeleteTarget = snap)}
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
          {#each snap.items as item, i (i)}
            <p class="kit-entry-note">
              {#if item.mood != null}<strong>{moodName(item.mood)}</strong> · {/if}{dayLabel(item.epochDay)}: {item.note}
            </p>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  <ConfirmDeleteSheet
    open={snapshotDeleteTarget !== null}
    title={m.doubt_snapshot_delete_sheet()}
    question={m.doubt_snapshot_delete_q()}
    hint={m.doubt_snapshot_delete_hint()}
    confirmLabel={m.doubt_snapshot_delete()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm-delete-doubt-snapshot': '' }}
    onConfirm={deleteSnapshot}
    onCancel={() => (snapshotDeleteTarget = null)}
  />

  <SectionHeading text={m.comfort_list_title()} />
  {#if comfortItems.length}
    <ListCard role={roleAt(activeFlag.roles, 4)}>
      {#each comfortItems as item, i (item.id)}
        <ListRow
          key={item.id}
          data-comfort-item={item.id}
          title={item.text}
          chevron={false}
          onclick={() => comfortRecord.openEditor(item)}
          action={{
            icon: 'chevronLeft',
            label: m.comfort_list_move_up_aria({ text: item.text }),
            onclick: () => moveComfortItemUp(i),
            attrs: i === 0 ? { 'data-up': '', disabled: 'true' } : { 'data-up': '' }
          }}
        />
      {/each}
    </ListCard>
    <button
      type="button"
      class="btn btn-soft btn-block press"
      data-add-comfort-item
      onclick={() => comfortRecord.openEditor(null)}
    >
      <Icon name="plus" size={18} /> <span>{m.comfort_list_add()}</span>
    </button>
  {:else}
    <Notice
      icon="heart"
      key="comfort-list-empty"
      role={roleAt(activeFlag.roles, 4)}
      title={m.comfort_list_empty_title()}
      text={m.comfort_list_empty_body()}
      action={{ label: m.comfort_list_add(), primary: true, onclick: () => comfortRecord.openEditor(null) }}
    />
  {/if}

  <RecordSheet
    record={comfortRecord}
    handle="comfort-item"
    newTitle={m.comfort_list_new_sheet()}
    editTitle={m.comfort_list_edit_sheet()}
    saveLabel={m.comfort_list_save()}
    deleteLabel={m.comfort_list_delete()}
    confirm={{
      title: m.comfort_list_delete_sheet(),
      question: (item) => m.comfort_list_delete_q({ text: item.text }),
      hint: () => m.comfort_list_delete_hint(),
      confirmLabel: m.comfort_list_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.comfort_list_item_label()} id="comfort-item-text" hidden>
        {#snippet children(id)}
          <textarea
            class="input"
            {id}
            name="comfort-item-text"
            rows="2"
            placeholder={m.comfort_list_item_placeholder()}
            bind:value={editor.text}
          ></textarea>
        {/snippet}
      </Field>
    {/snippet}
  </RecordSheet>
</div>
