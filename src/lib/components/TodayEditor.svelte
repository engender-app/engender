<script lang="ts">
  /* Arrange Today in place (ADR-0073, ADR-0067, ADR-0043). The editor grows
     from the block it changes and offers current pins, available pins, tile
     switches, reset and Done. pinnedRows.ts owns all arrangement rules.

     Drag from the handle so the rest of the row still scrolls. Pointer moves
     measure each row's box and shift intervening rows aside. The same handle
     accepts arrow keys and moves one place through travelFrom.

     Pins for hidden areas remain stored. Write reorders against row keys
     because the visible positions omit those pins. */
  import { onMount, tick } from 'svelte';
  import { focusNamedTarget } from '$lib/navigation/arrivalFocus';
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { cycleTrackingVisible } from '$lib/data/cycleTracking';
  import {
    addablePins,
    movedPin,
    pinArrangement,
    withoutPin,
    withPin,
    type PinnedRow
  } from '$lib/data/pinnedRows';
  import type { HubReading, HubRowKey } from '$lib/data/hubRows';
  import { LIVE_TILE_DRAW_ORDER, type LiveTileKind } from '$lib/data/liveTiles';
  import { UNPROMPTED_ROWS, surfaceOn, withSurface } from '$lib/unprompted/registry';
  import { hubRowLine, hubRowTitle } from '$lib/data/vocabulary/hubLabels';
  import { ListDrag, measureTops, travelFrom } from '$lib/motion/reorder.svelte';
  import { maskHeight } from '$lib/motion/reveal';
  import { announce } from '$lib/stores/announcer.svelte';
  import { isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import type { Role } from '$lib/theme/roles';
  import Icon from './Icon.svelte';
  import Switch from './Switch.svelte';
  import ConfirmDeleteSheet from './kit/ConfirmDeleteSheet.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';

  let {
    pinned,
    reading,
    nowMs,
    role,
    onDone
  }: {
    /** The rows Today draws, in the person's order - the same resolution
        the screen itself renders, so what is being arranged is what they
        were looking at a tap ago. */
    pinned: PinnedRow[];
    /** The hub's one assembled read, for the add list's own lines. */
    reading: HubReading;
    /** Today's own second hand, handed down rather than started again here:
        a wear session running while somebody is arranging their
        front page counts up in the list they are arranging. */
    nowMs: number;
    /** The stripe the pinned area of Today takes. The whole edit mode is
        one area across its three lists. */
    role?: Role;
    onDone: () => void;
  } = $props();

  /* ADR-0043's gate, read here rather than by Today: it is only ever
     needed while somebody is looking at the add list, and this component
     is the only thing that mounts then. Today would have had to carry the
     query on every load to hand the answer down. */
  let episodesQuery = liveQuery((j) => j.regimen.getEpisodes());
  let cycleVisible = $derived(
    cycleTrackingVisible(episodesQuery.value ?? [], Date.now(), prefs.cycleTrackingChoice)
  );

  let addable = $derived(addablePins(prefs, reading, { cycleVisible }));

  /* Every write goes through the arrangement rather than through what is
     drawn, and materialises the default the first time (ADR-0073: the
     default is resolved, never stored). */
  function arrangement(): HubRowKey[] {
    return pinArrangement(prefs);
  }

  async function unpin(key: string) {
    const next = pinned[pinned.findIndex((row) => row.spec.key === key) + 1]?.spec.key;
    const before = beforeWrite();
    prefs.pinnedRows = withoutPin(arrangement(), key);
    await afterWrite(before);
    focusNamedTarget(next ? listEl?.querySelector(`[data-edit-unpin="${next}"]`) : editor?.querySelector('h2'));
  }

  async function pin(key: HubRowKey) {
    const before = beforeWrite();
    prefs.pinnedRows = withPin(arrangement(), key);
    await afterWrite(before);
    focusNamedTarget(listEl?.querySelector(`[data-edit-unpin="${key}"]`));
  }

  function move(key: string, targetKey: string) {
    prefs.pinnedRows = movedPin(arrangement(), key, targetKey);
  }

  /* The tiles' own titles and lines, off the registry that already carries
     them for every other surface - the switch here and the tile on the page
     have to be the same words, and the registry is where that is declared
     once. */
  const TILE_LABEL = new Map(
    UNPROMPTED_ROWS.map((row) => [row.key, { title: row.title, line: row.surface?.subtitle }])
  );

  function toggleTile(kind: LiveTileKind, on: boolean) {
    prefs.surfaceOverrides = withSurface(prefs.surfaceOverrides, kind, on);
  }

  /**
    * Reset pins to null so future onboarding choices still determine
    * defaults. Remove the displayed tile kinds' surfaceOverrides so
    * they follow the registry again. Preserve other overrides.
    *
    * Ask before resetting because this discards someone's curation.
    * Individual changes remain immediate and reversible.
    */
  let resetAsked = $state(false);

  function reset() {
    resetAsked = false;
    prefs.pinnedRows = null;
    let overrides = prefs.surfaceOverrides;
    for (const kind of LIVE_TILE_DRAW_ORDER) overrides = withSurface(overrides, kind, surfaceOn({}, kind));
    prefs.surfaceOverrides = overrides;
  }

  /* ---------- the drag ---------- */

  let editor: HTMLElement;
  onMount(() => focusNamedTarget(editor.querySelector('h2')));

  let listEl: HTMLElement | undefined = $state();
  /** The add list's own box, so a row leaving it closes the same way one
      arriving in the pinned list opens. */
  let addEl: HTMLElement | undefined = $state();
  const rowElements = () =>
    [...(listEl?.querySelectorAll<HTMLElement>('[data-edit-pinned-row]') ?? [])];

  function rowKey(el: HTMLElement): string {
    return el.dataset.editPinnedRow ?? '';
  }

  /* The handle's gesture and the travel after a write are shared with
     Things that help ($lib/motion/reorder.svelte.ts). While a row is held
     it sits under the pointer and the rows it has passed stand aside;
     the drop writes the move and every row travels from where it was
     painted. */
  const dragger = new ListDrag(rowElements, rowKey);

  async function drop() {
    const drag = dragger.drag;
    if (!drag) return;
    if (drag.overKey === drag.key) {
      dragger.release();
      return;
    }
    const before = measureTops(rowElements(), rowKey);
    dragger.release();
    move(drag.key, drag.overKey);
    await tick();
    travelFrom(rowElements(), rowKey, before);
  }

  /* Animate a pinned row's arrival or departure. Measure both lists and
     their rows before the write. Then maskHeight clips each list from its
     old height to its new one and travelFrom moves surviving rows from
     their old positions. */

  /** Where both lists and the pinned rows stand, taken before a write. */
  function beforeWrite() {
    const lists = [listEl, addEl].filter((el): el is HTMLElement => el !== undefined);
    return {
      rows: measureTops(rowElements(), rowKey),
      heights: lists.map((el) => ({ el, height: el.getBoundingClientRect().height }))
    };
  }

  /** The same two lists after it, animated from there. */
  async function afterWrite(before: ReturnType<typeof beforeWrite>) {
    await tick();
    if (isReducedMotion()) return;
    const duration = motionDuration('--dur-med');
    /* A list that went away with the write - unpinning the last row takes
       the whole pinned list with it - has nothing left to clip. */
    for (const { el, height } of before.heights) if (el.isConnected) maskHeight(el, height, duration);
    travelFrom(rowElements(), rowKey, before.rows);
  }

  /** Move a row one place with the keyboard, and let it travel there.

      The arrow keys are the drag's whole content - a row goes one place up
      or one place down - so the neighbour is named off what is drawn and
      the write is the same `movedPin` the drop makes. The animation is
      `travelFrom`: measure, write, start each row where it was painted and
      release it on the next frame. */
  async function moveWithKeys(key: string, delta: -1 | 1) {
    const at = pinned.findIndex((row) => row.spec.key === key);
    const neighbour = pinned[at + delta];
    if (at === -1 || !neighbour) return;

    const before = measureTops(rowElements(), rowKey);
    move(key, neighbour.spec.key);
    await tick();

    /* The handle keeps the focus across the write, so a second press moves
       the same row again rather than the one that took its place. */
    const handle = listEl?.querySelector<HTMLElement>(`[data-edit-grip="${key}"]`);
    handle?.focus();
    travelFrom(rowElements(), rowKey, before);
    /* The row travels where it can be seen; this says where it went to
       somebody who cannot see it (after-release 21, audit L05-08). */
    announce(m.home_edit_moved({ position: String(at + delta + 1), total: String(pinned.length) }));
  }

  function onGripKeydown(event: KeyboardEvent, key: string) {
    if (event.key === 'ArrowUp') delta(event, key, -1);
    else if (event.key === 'ArrowDown') delta(event, key, 1);
  }

  function delta(event: KeyboardEvent, key: string, by: -1 | 1) {
    event.preventDefault();
    void moveWithKeys(key, by);
  }
</script>

<div class="today-editor" data-today-editor bind:this={editor}>
  <SectionHeading text={m.home_edit_heading()} />
  <p class="today-editor-hint" id="today-editor-hint">{m.home_edit_hint()}</p>

  {#if pinned.length > 0}
    <div class="today-editor-list" class:is-dragging={dragger.drag !== null} bind:this={listEl}>
      <ListCard {role}>
        {#each pinned as row (row.spec.key)}
          <!-- The title alone, without the row's reading. What a row says
               about its area is what it says on the page; while it is being
               moved, the name is the thing being moved, and five two-line
               rows make a list you drag through rather than across. The add
               list below keeps its lines, where they are what tells you
               which row you are picking. -->
          <ListRow
            static
            key={row.spec.key}
            icon={row.spec.icon}
            title={hubRowTitle(row.spec.key)}
            data-edit-pinned-row={row.spec.key}
            data-lifted={dragger.drag?.key === row.spec.key ? 'true' : undefined}
            style={`translate: 0 ${dragger.offset(row.spec.key)}px`}
            action={{
              icon: 'x',
              label: m.home_edit_unpin({ row: hubRowTitle(row.spec.key) }),
              onclick: () => unpin(row.spec.key),
              attrs: { 'data-edit-unpin': row.spec.key }
            }}
          >
            {#snippet trailing()}
              <!-- The handle, and the keyboard's own way to do what it does.
                   A button rather than a decoration: a drag nobody can
                   reach with a keyboard is a feature half the people who
                   need this surface cannot use. -->
              <button
                type="button"
                class="today-editor-grip"
                data-edit-grip={row.spec.key}
                data-no-press
                aria-label={m.home_edit_move({ row: hubRowTitle(row.spec.key) })}
                aria-describedby="today-editor-hint"
                onpointerdown={(event) => dragger.grab(event, row.spec.key)}
                onpointermove={dragger.travel}
                onpointerup={drop}
                onpointercancel={drop}
                onkeydown={(event) => onGripKeydown(event, row.spec.key)}
              >
                <Icon name="grip" size={22} />
              </button>
            {/snippet}
          </ListRow>
        {/each}
      </ListCard>
    </div>
  {:else}
    <p class="today-editor-none" data-edit-none>{m.home_edit_none()}</p>
  {/if}

  <!-- What is left to add, in the hub's order, each saying what it says
       there. A list to pick from is not a ranking and is not folded: the
       person is looking for one particular area, and a fold would hide the
       one they came for. -->
  {#if addable.length > 0}
    <SectionHeading text={m.home_edit_add_heading()} />
    <div bind:this={addEl}>
      <ListCard {role}>
        {#each addable as row (row.spec.key)}
          <ListRow
            key={row.spec.key}
            icon={row.spec.icon}
            title={hubRowTitle(row.spec.key)}
            subtitle={hubRowLine(row.spec.key, row.line, reading.todayEpochDay, nowMs)}
            chevron={false}
            onclick={() => pin(row.spec.key)}
            data-edit-add={row.spec.key}
            aria-label={m.home_edit_add({ row: hubRowTitle(row.spec.key) })}
          >
            {#snippet trailing()}
              <span class="today-editor-add" aria-hidden="true"><Icon name="plus" size={22} /></span>
            {/snippet}
          </ListRow>
        {/each}
      </ListCard>
    </div>
  {/if}

  <!-- Match Home's band and tile order through LIVE_TILE_DRAW_ORDER.
       Keep the registry's explanatory line next to each switch. Include
       hidden and finished areas because a switch disables a kind
       independently of its area's current state (ADR-0039). -->
  <SectionHeading text={m.home_edit_tiles_heading()} />
  <p class="today-editor-hint">{m.home_edit_tiles_hint()}</p>
  <div class="today-editor-tiles">
    <ListCard {role}>
      {#each LIVE_TILE_DRAW_ORDER as kind (kind)}
        {@const label = TILE_LABEL.get(kind)}
        {@const title = label?.title() ?? kind}
        <ListRow static key={kind} {title} subtitle={label?.line?.()} data-edit-tile={kind}>
          {#snippet trailing()}
            <Switch
              checked={surfaceOn(prefs.surfaceOverrides, kind)}
              label={title}
              onChange={(on) => toggleTile(kind, on)}
            />
          {/snippet}
        </ListRow>
      {/each}
    </ListCard>
  </div>

  <div class="today-editor-exits">
    <button type="button" class="btn btn-primary" data-edit-done onclick={onDone}>
      <span>{m.done()}</span>
    </button>
    <button type="button" class="btn btn-ghost" data-edit-reset onclick={() => (resetAsked = true)}>
      <span>{m.home_edit_reset()}</span>
    </button>
  </div>

  <ConfirmDeleteSheet
    open={resetAsked}
    title={m.home_edit_reset()}
    question={m.home_edit_reset_question()}
    hint={m.home_edit_reset_hint()}
    confirmLabel={m.home_edit_reset()}
    cancelLabel={m.not_now()}
    onConfirm={reset}
    onCancel={() => (resetAsked = false)}
    confirmAttrs={{ 'data-confirm-edit-reset': '' }}
  />
</div>

<style>
  /* The pinned section owns the space above this editor. A first heading's
     margin collapses through both wrappers at rest, but the opening
     transition's negative margin holds it inside until cleanup. */
  .today-editor > :global(.kit-heading:first-child) {
    margin-top: 0;
  }

  /* One line under the heading, at the hint size the rest of the app uses
     for the sentence that explains a control rather than labels it. */
  .today-editor-hint,
  .today-editor-none {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  /* The list is its own layer while a row is up, so the dragged row draws
     over its neighbours rather than under whichever one the source order
     happens to put later. */
  .today-editor-list :global(.kit-row) {
    position: relative;
    background: var(--bg);
    transition: translate var(--dur-med) var(--ease-out);
  }

  /* Nothing transitions during the gesture: the dragged row has to sit
     exactly where the pointer is, and a row standing aside has already got
     its own transition from the rule above - which would fight the pointer
     if it applied to the row being held. */
  .today-editor-list.is-dragging :global(.kit-row[data-lifted]) {
    transition: none;
    z-index: 2;
    /* A held row reads as picked up by its edge going hard, since the kit
       bans the shadow that would otherwise say so. */
    outline: 1px solid var(--outline);
  }

  /* Under 350px the icon block goes. It repeats the area's title and takes
     48px from text that may already need to wrap. */
  @media (max-width: 350px) {
    .today-editor-list :global(.kit-row-ico) {
      display: none;
    }
  }

  /* And at 200% zoom on a 390px phone - 195px - even that is not enough:
     the pinned row is 155px inside the screen's inset and the two controls
     are 96 of it, and the tiles list has the same argument with one control
     and a word: "Appointment today" set solid is wider than the ~107px left
     beside a switch, and it broke into "Appointme" and a stranded "nt
     today". So both rows become two lines, the text across the whole of the
     row and the controls under it at the trailing edge.

     A list row is 48px with one line or 60px with a subtitle. This is
     neither: it is one row wearing its controls at the accessibility floor,
     and 200% zoom is where the floor and the row disagree. */
  @media (max-width: 260px) {
    .today-editor-list :global(.kit-row),
    .today-editor-tiles :global(.kit-row) {
      flex-wrap: wrap;
    }

    .today-editor-list :global(.kit-row-text),
    .today-editor-tiles :global(.kit-row-text) {
      flex-basis: 100%;
    }

    .today-editor-list :global(.kit-row-trail),
    .today-editor-tiles :global(.kit-row-trail) {
      margin-left: auto;
    }
  }

  .today-editor-grip,
  .today-editor-add {
    display: grid;
    place-items: center;
    /* The touch floor, from the one token that holds it - 48, Android's
       floor rather than iOS's 44 (accessibility-audit.test.ts) - on a
       control whose whole job is to be grabbed. */
    width: var(--touch-target);
    height: var(--touch-target);
    color: var(--text-2);
    background: none;
    border: 0;
  }

  .today-editor-grip {
    /* The gesture is vertical, so the browser keeps the horizontal axis and
       gives up trying to scroll the page with it. */
    touch-action: none;
    cursor: grab;
  }

  .today-editor-grip:active {
    cursor: grabbing;
  }

  .today-editor-grip:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--r-block);
  }

  /* Leave 20px between blocks. The two exits
     are one block, 8 apart inside it. */
  .today-editor-exits {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-5);
  }
</style>
