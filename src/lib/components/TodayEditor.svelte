<script lang="ts">
  /* Arranging Today (phase 10 redesign ticket 14; ADR-0073, ADR-0067,
     ADR-0043).

     Ticket 05 made the front page a set the person put there and gave it a
     default. This is where they change it, which is the whole point of the
     feature: the app ranks nothing centrally and infers nothing, so the
     only way Today becomes theirs is a surface where they say so.

     One edit mode, four things in it, in the order somebody works through
     them: the rows they have, the rows they could add, the tiles Today may
     put above them, and the kinds of dated thing the agenda is allowed to
     draw. Then the two exits - back to the default set, and done.

     There is no per-row menu and no second reset (the ticket's own scope),
     and nothing here sorts, scores, suggests or highlights: every rule about what the arrangement becomes
     is `pinnedRows.ts`'s, and this file only says which gesture calls
     which of them.

     The tiles joined in phase 11 ticket 04. They were switched at
     /settings/live-tiles, which is two taps and a screen away from the row
     directly under them, so one front page was curated in two places - the
     tell, as the ticket puts it, that tiles and pins are one system. Same
     preferences, same registry, no migration: only the switches moved.

     **Why it is not a screen.** The rows being arranged are the rows on
     Today, so the arrangement happens where they are - the surface grows
     out of the block it edits, at the place in the page where that block
     sits. A route would have meant looking at a copy of the list somewhere
     else, and it would have owed a screen registry entry, a header and a
     back control for a mode that is two taps long.

     **The drag.** Pointer events rather than HTML5 drag-and-drop, which
     has no touch story at all, and a handle rather than the whole row:
     dragging from anywhere on a row makes a list you cannot scroll with a
     thumb. The gesture is measured against the rows' own boxes, so a
     one-line row and a two-line row are each their own height rather than
     a guessed constant, and the rows between the grab and the drop shift
     out of the way as it moves. Its keyboard equivalent is on the same
     handle - the arrow keys move a row one place, which is the whole of
     what the drag does - and that move animates through `travelFrom`
     ($lib/motion/reorder.svelte.ts, shared with Things that help), since a
     row that teleports is exactly what DIRECTION.md's motion brief rules
     out.

     **What the person can see is not the whole arrangement.** A pin whose
     area is hidden stays stored and draws nothing (`pinnedRows.ts`), so
     every write here is stated as row keys - "put this one where that one
     is" - and never as an index into what is on screen. */
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { cycleTrackingVisible } from '$lib/data/cycleTracking';
  import {
    addablePins,
    movedPin,
    pinArrangement,
    shownAgendaKinds,
    withAgendaKind,
    withoutPin,
    withPin,
    type PinnedRow
  } from '$lib/data/pinnedRows';
  import type { HubReading, HubRowKey } from '$lib/data/hubRows';
  import { DAY_AHEAD_MARK_KINDS, type DayAheadMarkKind } from '$lib/data/journal/dayAhead';
  import { LIVE_TILE_DRAW_ORDER, LIVE_TILE_PREF_KEY, type LiveTileKind } from '$lib/data/liveTiles';
  import { PREFERENCE_DEFAULTS } from '$lib/data/prefs/catalogue';
  import { UNPROMPTED_ROWS } from '$lib/unprompted/registry';
  import { hubRowLine, hubRowTitle } from '$lib/data/vocabulary/hubLabels';
  import { ListDrag, measureTops, travelFrom } from '$lib/motion/reorder.svelte';
  import { maskHeight } from '$lib/motion/reveal';
  import { isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import type { Role } from '$lib/theme/roles';
  import { dayAheadMarkLabel } from './dayAheadRows';
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
    /** Today's own second hand, handed down rather than started again here
        (ADR-0051): a wear session running while somebody is arranging their
        front page counts up in the list they are arranging. */
    nowMs: number;
    /** The stripe the pinned area of Today takes. The whole edit mode is
        that one area (DIRECTION.md 3), so its three lists share it. */
    role?: Role;
    onDone: () => void;
  } = $props();

  /* ADR-0043's gate, read here rather than by Today: it is only ever
     needed while somebody is looking at the add list, and this component
     is the only thing that mounts then. Today would have had to carry the
     query on every load to hand the answer down. */
  let episodesQuery = liveQuery((j) => j.regimen.getEpisodes());
  let cycleVisible = $derived(
    cycleTrackingVisible(episodesQuery.value ?? [], Date.now(), prefs.cycleTrackingEnabled, prefs.cycleTrackingChoice)
  );

  let addable = $derived(addablePins(prefs, reading, { cycleVisible }));
  let kindsOn = $derived(new Set(shownAgendaKinds(prefs)));

  /* Every write goes through the arrangement rather than through what is
     drawn, and materialises the default the first time (ADR-0073: the
     default is resolved, never stored). */
  function arrangement(): HubRowKey[] {
    return pinArrangement(prefs);
  }

  async function unpin(key: string) {
    const before = beforeWrite();
    prefs.pinnedRows = withoutPin(arrangement(), key);
    await afterWrite(before);
  }

  async function pin(key: HubRowKey) {
    const before = beforeWrite();
    prefs.pinnedRows = withPin(arrangement(), key);
    await afterWrite(before);
  }

  function move(key: string, targetKey: string) {
    prefs.pinnedRows = movedPin(arrangement(), key, targetKey);
  }

  function toggleKind(kind: DayAheadMarkKind, on: boolean) {
    prefs.agendaKinds = withAgendaKind(prefs, kind, on);
  }

  /* The tiles' own titles and lines, off the registry that already carries
     them for every other surface - the switch here and the tile on the page
     have to be the same words, and the registry is where that is declared
     once. */
  const TILE_LABEL = new Map(
    UNPROMPTED_ROWS.map((row) => [row.key, { title: row.title, line: row.surface?.subtitle }])
  );

  function toggleTile(kind: LiveTileKind, on: boolean) {
    prefs[LIVE_TILE_PREF_KEY[kind]] = on;
  }

  /** Back to what onboarding was told, which is null rather than a list:
      an arrangement written back as the default set would be a set nobody
      chose, and the next answer to onboarding's question would not reach
      it. The switches go with it, both kinds - one edit mode, one reset.

      The tiles come back from `PREFERENCE_DEFAULTS` rather than from a
      null, because each of the thirteen is its own boolean in the catalogue
      and has no unset state to resolve. Read from that file rather than
      written as `true` thirteen times: what the app ships with is that
      file's to say, and a default changed there would otherwise leave this
      one handing back the old answer.

      Behind a question, unlike every other write on this surface. The rest
      are each one row and each undone by one tap; this is the only one that
      throws away work, and what it throws away is somebody's own curation -
      the row they took off because an anniversary is painful, the kind they
      switched off during a taper. A stray tap on the button under Done may
      not cost that silently. Unpinning stays unconfirmed for the same
      reason read the other way: a row somebody wants gone should go the
      moment they say so. */
  let resetAsked = $state(false);

  function reset() {
    resetAsked = false;
    prefs.pinnedRows = null;
    prefs.agendaKinds = null;
    for (const kind of LIVE_TILE_DRAW_ORDER) {
      const key = LIVE_TILE_PREF_KEY[kind];
      prefs[key] = PREFERENCE_DEFAULTS[key];
    }
  }

  /* ---------- the drag ---------- */

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

  /* ---------- a row arriving and leaving ----------

     Neither list may cut. A pin added and a pin taken off are the two state
     changes this surface makes most, and DIRECTION.md's motion brief is
     that a list row leaves by closing its own height with the rows below
     closing up after it. So a write is bracketed: measure both lists and
     the rows in them, write, then clip each list from the height it had to
     the height it now has (`maskHeight`, the primitive the Journal door's
     month already uses) while every row that survived travels from where it
     stood (`travelFrom`, the reorder module's FLIP). */

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

<div class="today-editor" data-today-editor>
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

  <!-- The tiles, in the order Home draws them: the three bands outside and
       the kinds inside each one (`LIVE_TILE_DRAW_ORDER`), so the list reads
       down the page the way the page does rather than alphabetically or in
       the order the tiles were written. No icon on the row, unlike the pins
       and the agenda kinds above: a tile has none on Today either, and
       inventing thirteen of them here would name each tile a second way in
       the one place both names would be read at once.

       Each row keeps the registry's line, for the reason the add list above
       keeps its own and the pinned list drops them: a line under a row being
       dragged is in the way, and a line under a row being decided about is
       the decision. "Revisit" and "Active tryout" are not self-evident, and
       the screen these switches came from stated what each one puts in front
       of you (the impeccable critique's own first finding, 2026-09-16).

       Every kind, including one whose area is hidden or finished. The
       switch means "never show me this kind" rather than "hide the instance
       that is true today" (ADR-0039's amendment), so it answers a different
       question from the area's own state, and a list that dropped rows
       would make somebody turn an area back on to find the switch they came
       for. -->
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
              checked={prefs[LIVE_TILE_PREF_KEY[kind]]}
              label={title}
              onChange={(on) => toggleTile(kind, on)}
            />
          {/snippet}
        </ListRow>
      {/each}
    </ListCard>
  </div>

  <!-- The agenda's five kinds (ADR-0067), each named the way the agenda
       itself names it, so a switch says exactly which rows it stops. A
       switch rather than a dismissal is the point: a kind somebody does not
       want is otherwise one they dismiss every week for the life of the
       journal. -->
  <SectionHeading text={m.home_edit_agenda_heading()} />
  <ListCard {role}>
    {#each DAY_AHEAD_MARK_KINDS as kind (kind)}
      {@const label = dayAheadMarkLabel(kind)}
      <ListRow
        static
        key={kind}
        icon={label.icon}
        title={label.title}
        data-edit-kind={kind}
      >
        {#snippet trailing()}
          <Switch
            checked={kindsOn.has(kind)}
            label={label.title}
            onChange={(on) => toggleKind(kind, on)}
          />
        {/snippet}
      </ListRow>
    {/each}
  </ListCard>

  <div class="today-editor-exits">
    <button type="button" class="btn btn-primary" data-edit-done onclick={onDone}>
      <span>{m.home_edit_done()}</span>
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

  /* Under 350px the icon block goes. At 320 the title column left over is
     about 100px and "measurements" is 118, so the word broke into
     "measurement" and a stranded "s"; the block names the area a second
     time and the title already does that, and dropping it hands the title
     the 48px it needs to stay on one line. */
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

     A row is 48 one line and 60 with a subtitle (DIRECTION.md 6). This is
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

  /* 20 between two blocks of one section (DIRECTION.md 1); the two exits
     are one block, 8 apart inside it. */
  .today-editor-exits {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-5);
  }
</style>
