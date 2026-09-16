<script lang="ts">
  /* Arranging Today (phase 10 redesign ticket 14; ADR-0073, ADR-0067,
     ADR-0043).

     Ticket 05 made the front page a set the person put there and gave it a
     default. This is where they change it, which is the whole point of the
     feature: the app ranks nothing centrally and infers nothing, so the
     only way Today becomes theirs is a surface where they say so.

     One edit mode, three things in it, in the order somebody works through
     them: the rows they have, the rows they could add, and the kinds of
     dated thing the agenda is allowed to draw. Then the two exits - back to
     the default set, and done. There is no per-row menu and no second
     reset (the ticket's own scope), and nothing here sorts, scores,
     suggests or highlights: every rule about what the arrangement becomes
     is `pinnedRows.ts`'s, and this file only says which gesture calls
     which of them.

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
     what the drag does - and that move animates through `regroupSteps`,
     the FLIP arithmetic the Journal door already uses, since a row that
     teleports is exactly what DIRECTION.md's motion brief rules out.

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
  import { hubRowLine, hubRowTitle } from '$lib/data/vocabulary/hubLabels';
  import { regroupSteps, type CellBox } from '$lib/motion/regroup';
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
    cycleTrackingVisible(episodesQuery.value ?? [], Date.now(), prefs.cycleTrackingEnabled)
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

  /** Back to what onboarding was told, which is null rather than a list:
      an arrangement written back as the default set would be a set nobody
      chose, and the next answer to onboarding's question would not reach
      it. The switches go with it - one edit mode, one reset.

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
  }

  /* ---------- the drag ---------- */

  let listEl: HTMLElement | undefined = $state();
  /** The add list's own box, so a row leaving it closes the same way one
      arriving in the pinned list opens. */
  let addEl: HTMLElement | undefined = $state();
  /** The row being dragged, how far the pointer has taken it, and the row
      it is currently over. Null the rest of the time, which is also what
      takes the lift off the row and the transitions back on. */
  let drag = $state<{ key: string; dy: number; overKey: string } | null>(null);
  /** The rows' boxes as they stood when the grab started. Measured once:
      the rows move under the pointer as it travels, so measuring again
      mid-gesture would compare the pointer against boxes the gesture
      itself had already displaced. */
  let boxes: { key: string; top: number; height: number }[] = [];
  let grabbedAt = 0;

  const rowElements = () =>
    [...(listEl?.querySelectorAll<HTMLElement>('[data-edit-pinned-row]') ?? [])];

  function rowKey(el: HTMLElement): string {
    return el.dataset.editPinnedRow ?? '';
  }

  function grab(event: PointerEvent, key: string) {
    if (event.button !== 0) return;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    boxes = rowElements().map((el) => {
      const box = el.getBoundingClientRect();
      return { key: rowKey(el), top: box.top, height: box.height };
    });
    grabbedAt = event.clientY;
    drag = { key, dy: 0, overKey: key };
  }

  function travel(event: PointerEvent) {
    if (!drag) return;
    const from = boxes.find((box) => box.key === drag?.key);
    if (!from) return;

    const dy = event.clientY - grabbedAt;
    /* Which row the dragged one is over: the box holding the middle of it
       where it now sits. Off either end it is the first or the last, so a
       drag that overshoots the list still lands rather than stalling on the
       row it started from. */
    const middle = from.top + from.height / 2 + dy;
    const over =
      boxes.find((box) => middle >= box.top && middle <= box.top + box.height) ??
      (middle < boxes[0].top ? boxes[0] : boxes[boxes.length - 1]);
    drag = { key: drag.key, dy, overKey: over.key };
  }

  function drop() {
    if (!drag) return;
    const { key, overKey } = drag;
    /* The rows are already standing where the gesture put them - the
       dragged one under the pointer, the ones it passed shifted by its
       height - so the write lands on a layout that matches, and clearing
       the drag needs no transition of its own. */
    drag = null;
    if (overKey !== key) move(key, overKey);
  }

  /** How far a row has to stand aside while another is dragged over it:
      the dragged row's own height, in the direction it came from, for every
      row between where it was picked up and where it is now. */
  function shift(key: string): number {
    if (!drag || key === drag.key) return 0;
    const from = boxes.findIndex((box) => box.key === drag?.key);
    const to = boxes.findIndex((box) => box.key === drag?.overKey);
    const at = boxes.findIndex((box) => box.key === key);
    if (from === -1 || to === -1 || at === -1) return 0;
    const height = boxes[from].height;
    if (at > from && at <= to) return -height;
    if (at < from && at >= to) return height;
    return 0;
  }

  /* ---------- a row arriving and leaving ----------

     Neither list may cut. A pin added and a pin taken off are the two state
     changes this surface makes most, and DIRECTION.md's motion brief is
     that a list row leaves by closing its own height with the rows below
     closing up after it. So a write is bracketed: measure both lists and
     the rows in them, write, then clip each list from the height it had to
     the height it now has (`maskHeight`, the primitive the Journal door's
     month already uses) while every row that survived travels from where it
     stood (`regroupSteps`, the same file's FLIP). */

  /** The rows as FLIP wants them, keyed by the row so a pair can be made
      across the write that reorders them. */
  function measure(): CellBox[] {
    return rowElements().map((el) => {
      const box = el.getBoundingClientRect();
      return { key: rowKey(el), left: box.left, top: box.top, width: box.width, height: box.height };
    });
  }

  /** Where both lists and the pinned rows stand, taken before a write. */
  function beforeWrite() {
    const lists = [listEl, addEl].filter((el): el is HTMLElement => el !== undefined);
    return {
      rows: measure(),
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
    travelRows(before.rows);
  }

  /** Start every row at the difference between where it was and where it
      now is, then release it on the next frame. */
  function travelRows(before: CellBox[]) {
    const elements = new Map(rowElements().map((el) => [rowKey(el), el]));
    for (const step of regroupSteps(before, measure())) {
      const el = elements.get(String(step.key));
      if (!el) continue;
      /* The jump back to where the row was is not a transition, and the
         travel forwards is the list's own CSS one - so both inline
         properties come off again on the way out. A left-behind inline
         `transition` would still be there during the next drag, where the
         held row has to sit exactly under the pointer with no easing at
         all. */
      el.style.transition = 'none';
      el.style.translate = `0 ${step.dy}px`;
      requestAnimationFrame(() => {
        el.style.transition = '';
        el.style.translate = '';
      });
    }
  }

  /** Move a row one place with the keyboard, and let it travel there.

      The arrow keys are the drag's whole content - a row goes one place up
      or one place down - so the neighbour is named off what is drawn and
      the write is the same `movedPin` the drop makes. The animation is
      `regroupSteps`: measure, write, measure again, start each row at the
      difference and release it on the next frame. */
  async function moveWithKeys(key: string, delta: -1 | 1) {
    const at = pinned.findIndex((row) => row.spec.key === key);
    const neighbour = pinned[at + delta];
    if (at === -1 || !neighbour) return;

    const before = measure();
    move(key, neighbour.spec.key);
    await tick();

    /* The handle keeps the focus across the write, so a second press moves
       the same row again rather than the one that took its place. */
    const handle = listEl?.querySelector<HTMLElement>(`[data-edit-grip="${key}"]`);
    handle?.focus();
    if (isReducedMotion()) return;
    travelRows(before);
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
    <div class="today-editor-list" class:is-dragging={drag !== null} bind:this={listEl}>
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
            data-lifted={drag?.key === row.spec.key ? 'true' : undefined}
            style={`translate: 0 ${drag?.key === row.spec.key ? drag.dy : shift(row.spec.key)}px`}
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
                onpointerdown={(event) => grab(event, row.spec.key)}
                onpointermove={travel}
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
     the row is 155px inside the screen's inset and the two controls are 96
     of it. So the row becomes two lines, the title across the whole of it
     and the handle and the unpin under it at the trailing edge.

     A row is 48 one line and 60 with a subtitle (DIRECTION.md 6). This is
     neither: it is one row wearing two controls at the accessibility
     floor, and 200% zoom is where the floor and the row disagree. */
  @media (max-width: 260px) {
    .today-editor-list :global(.kit-row) {
      flex-wrap: wrap;
    }

    .today-editor-list :global(.kit-row-text) {
      flex-basis: 100%;
    }

    .today-editor-list :global(.kit-row-trail) {
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
