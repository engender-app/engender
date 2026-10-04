<script lang="ts">
  /* The comfort list (phase 6 ticket 14, CONTEXT: "Comfort list"), lifted
     out of Safe space by phase 10 redesign ticket 47.

     Who to text, which walk, which playlist, entirely the person's own
     words. Nothing seeds it, nothing offers it, and nothing anywhere else
     in the app triggers it - the only route in is Safe space's own row,
     which is the same single tap it always was, now from a screen that
     opens on the breath instead of scrolling past it.

     This is the one surface Safe space holds that writes. ADR-0037 makes
     the counterevidence check a read; the comfort list is the person's own
     list and always could be edited, and moving it to its own screen
     changes nothing about that. */
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import type { ComfortItem } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { crossfade, disclose, discloseWidth } from '$lib/motion/reveal';
  import { isReducedMotion, motionDuration } from '$lib/motion/tokens';

  let comfortItemsQuery = liveList((j) => j.comfortItems.getItems());

  /* The order a drop or an arrow key just wrote, held until the read says
     the same: the write is a worker round trip, and drawing the read's old
     order in between would put every moved row back for a frame or two and
     then move it again. */
  let pendingOrder = $state<string[] | null>(null);
  let comfortItems = $derived.by(() => {
    const rows = comfortItemsQuery.rows;
    if (!pendingOrder) return rows;
    const byId = new Map(rows.map((item) => [item.id, item]));
    const ordered = pendingOrder.map((id) => byId.get(id)).filter((item) => item !== undefined);
    return ordered.length === rows.length ? ordered : rows;
  });
  $effect(() => {
    const read = comfortItemsQuery.rows.map((item) => item.id).join(' ');
    if (pendingOrder && pendingOrder.join(' ') === read) pendingOrder = null;
  });

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

  /* **Arranging** (release audit U10). The list used to carry a "move up"
     control on every row: a chevron turned on its side, which read as a
     row that folds open, and sat disabled but visible on the first row.
     Now a row opens its editor (the chevron says so, as on every other
     list that opens something) and the order is its own mode, with a
     handle per row - the shape the Today editor already uses, and the
     shape the report's references (Evernote, Beli) use. Pointer events
     on the handle rather than the whole row, so the list still scrolls
     under a thumb; the arrow keys on the handle are the keyboard's whole
     equivalent, one place per press. */
  let arranging = $state(false);

  /* The chevron closing and the handle opening, over --dur-med rather than
     discloseWidth's --dur-fast: on 150ms of quint-out the first frame took
     43% of the 48px handle at once (21px, sampled), on 240ms it takes 14. */
  const trailWidth = (node: Element) => ({ ...discloseWidth(node), duration: motionDuration('--dur-med') });

  let listEl: HTMLElement | undefined = $state();
  /** The row being dragged, how far the pointer has taken it, and the row
      it is over. Null the rest of the time. */
  let drag = $state<{ id: string; dy: number; overId: string } | null>(null);
  /** The rows' boxes when the grab started, measured once: the rows move
      under the pointer as it travels. */
  let boxes: { id: string; top: number; height: number }[] = [];
  let grabbedAt = 0;

  const rowElements = () => [...(listEl?.querySelectorAll<HTMLElement>('[data-comfort-item]') ?? [])];
  const rowId = (el: HTMLElement) => el.dataset.comfortItem ?? '';

  function measure(): { key: string; top: number }[] {
    return rowElements().map((el) => ({ key: rowId(el), top: el.getBoundingClientRect().top }));
  }

  /** Write an order and let every row travel from where it stood on screen
      to where the order puts it: measure, write, measure, start each row
      at the difference and release it on the next frame (a FLIP, the
      Journal door's and the Today editor's). Measured from the painted
      boxes, so a row a drag left standing aside or under the pointer
      starts exactly there. */
  async function writeOrder(ids: string[]) {
    const before = measure();
    drag = null;
    pendingOrder = ids;
    void journal.comfortItems.reorder(ids);
    await tick();
    if (isReducedMotion()) return;
    /* Every row, a zero difference included, and each one's transition
       off before it is measured: a row that stood aside during the drag
       lost its translate in the same update, and with its transition left
       on it was still painted 48px away when measured and then played that
       loss as a trip the wrong way. */
    const rows = rowElements();
    for (const el of rows) {
      el.style.transition = 'none';
      el.style.translate = '';
    }
    const from = new Map(before.map((box) => [box.key, box.top]));
    for (const el of rows) {
      const top = from.get(rowId(el));
      if (top !== undefined) el.style.translate = `0 ${top - el.getBoundingClientRect().top}px`;
    }
    requestAnimationFrame(() => {
      for (const el of rowElements()) {
        el.style.transition = '';
        el.style.translate = '';
      }
    });
  }

  function moved(id: string, targetId: string): string[] {
    const ids = comfortItems.map((item) => item.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    return ids;
  }

  function grab(event: PointerEvent, id: string) {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    boxes = rowElements().map((el) => {
      const box = el.getBoundingClientRect();
      return { id: rowId(el), top: box.top, height: box.height };
    });
    grabbedAt = event.clientY;
    drag = { id, dy: 0, overId: id };
  }

  function travel(event: PointerEvent) {
    if (!drag) return;
    const from = boxes.find((box) => box.id === drag?.id);
    if (!from) return;
    const dy = event.clientY - grabbedAt;
    /* The row under the dragged row's middle; off either end, the first
       or the last, so an overshoot still lands. */
    const middle = from.top + from.height / 2 + dy;
    const over =
      boxes.find((box) => middle >= box.top && middle <= box.top + box.height) ??
      (middle < boxes[0].top ? boxes[0] : boxes[boxes.length - 1]);
    drag = { id: drag.id, dy, overId: over.id };
  }

  function drop() {
    if (!drag) return;
    const { id, overId } = drag;
    if (overId === id) {
      /* Put back where it was picked up: the row travels home on the
         list's own translate transition. */
      drag = null;
      return;
    }
    void writeOrder(moved(id, overId));
  }

  /** How far a row stands aside while another is dragged past it. */
  function shift(id: string): number {
    if (!drag || id === drag.id) return 0;
    const from = boxes.findIndex((box) => box.id === drag?.id);
    const to = boxes.findIndex((box) => box.id === drag?.overId);
    const at = boxes.findIndex((box) => box.id === id);
    if (from === -1 || to === -1 || at === -1) return 0;
    const height = boxes[from].height;
    if (at > from && at <= to) return -height;
    if (at < from && at >= to) return height;
    return 0;
  }

  async function moveWithKeys(event: KeyboardEvent, id: string) {
    const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!by) return;
    event.preventDefault();
    const at = comfortItems.findIndex((item) => item.id === id);
    const neighbour = comfortItems[at + by];
    if (at === -1 || !neighbour) return;
    await writeOrder(moved(id, neighbour.id));
    /* The handle keeps the focus across the write, so a second press moves
       the same row again. */
    listEl?.querySelector<HTMLElement>(`[data-comfort-grip="${id}"]`)?.focus();
  }
</script>

<div class="screen">
  <ScreenHeader title={m.comfort_list_title()} back="/doubt" screen="safe-space-comfort" />

  <ReadGate read={comfortItemsQuery} variant="line" count={3}>
    {#snippet rows()}
      {#if arranging}
        <p class="comfort-hint" id="comfort-arrange-hint" transition:disclose>{m.home_edit_hint()}</p>
      {/if}
      <div class="comfort-list" class:is-arranging={arranging} class:is-dragging={drag !== null} bind:this={listEl}>
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each comfortItems as item (item.id)}
            <!-- The kit's split row written out, because the two modes are
                 one row: the main half and its text never change, and only
                 the trailing end does - the chevron closes as the handle
                 opens beside it, so nothing is redrawn and nothing cuts. -->
            <div
              class="kit-row is-split"
              data-list-row={item.id}
              data-comfort-item={item.id}
              data-lifted={drag?.id === item.id ? 'true' : undefined}
              style:translate={drag ? `0 ${drag.id === item.id ? drag.dy : shift(item.id)}px` : undefined}
            >
              <button
                type="button"
                class="kit-row-main"
                data-row-main={item.id}
                data-no-press
                disabled={arranging}
                onclick={() => comfortRecord.openEditor(item)}
              >
                <span class="kit-row-text"><span class="kit-row-title" data-row-title>{item.text}</span></span>
                {#if !arranging}
                  <span class="kit-row-trail" transition:trailWidth><Icon name="chevronRight" size={22} /></span>
                {/if}
              </button>
              {#if arranging}
                <button
                  type="button"
                  class="kit-row-act comfort-grip"
                  data-comfort-grip={item.id}
                  data-no-press
                  aria-label={m.home_edit_move({ row: item.text })}
                  aria-describedby="comfort-arrange-hint"
                  transition:trailWidth
                  onpointerdown={(event) => grab(event, item.id)}
                  onpointermove={travel}
                  onpointerup={drop}
                  onpointercancel={drop}
                  onkeydown={(event) => moveWithKeys(event, item.id)}
                >
                  <Icon name="grip" size={22} />
                </button>
              {/if}
            </div>
          {/each}
        </ListCard>
      </div>
      <button
        type="button"
        class="btn btn-soft btn-block press"
        data-add-comfort-item
        onclick={() => comfortRecord.openEditor(null)}
      >
        <Icon name="plus" size={18} /> <span>{m.comfort_list_add()}</span>
      </button>
      {#if comfortItems.length > 1}
        <!-- One button, two words: the label crossfades in place, so the
             control a person just pressed is still under their finger. -->
        <button
          type="button"
          class="btn btn-ghost btn-block comfort-arrange"
          data-comfort-arrange
          aria-pressed={arranging}
          onclick={() => (arranging = !arranging)}
        >
          {#key arranging}
            <span transition:crossfade>{arranging ? m.done() : m.comfort_list_arrange()}</span>
          {/key}
        </button>
      {/if}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="heart"
        key="comfort-list-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.comfort_list_empty_title()}
        text={m.comfort_list_empty_body()}
        action={{ label: m.comfort_list_add(), primary: true, onclick: () => comfortRecord.openEditor(null) }}
      />
    {/snippet}
  </ReadGate>

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

<style>
  .comfort-hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  /* A row stands aside, or travels to a new place, on its translate; the
     row under the pointer has none, so it sits exactly where the finger
     is. */
  .comfort-list :global(.kit-row) {
    background: var(--bg);
    transition: translate var(--dur-med) var(--ease-out);
  }

  .comfort-list.is-dragging :global(.kit-row[data-lifted]) {
    transition: none;
    z-index: 2;
    /* Picked up, said by an edge rather than the shadow the kit refuses. */
    outline: 1px solid var(--outline);
  }

  /* Arranging, the main half is not a way into the editor: the handle is
     the one thing on the row that does anything. Its text keeps its ink. */
  .comfort-list.is-arranging :global(.kit-row-main:disabled) {
    cursor: default;
    color: inherit;
    opacity: 1;
  }

  .comfort-grip {
    /* No button padding: its 12px stayed behind when the handle closed
       its width, and went in the last frame, moving the chevron 12px. */
    padding: 0;
    /* The gesture is vertical, so the browser keeps the horizontal axis. */
    touch-action: none;
    cursor: grab;
  }

  .comfort-grip:active {
    cursor: grabbing;
  }

  .comfort-arrange {
    position: relative;
  }
</style>
