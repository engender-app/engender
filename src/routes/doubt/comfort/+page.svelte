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
  import { attempt } from '$lib/stores/attempt.svelte';
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
  import { motionDuration } from '$lib/motion/tokens';
  import { ListDrag, measureTops, travelFrom } from '$lib/motion/reorder.svelte';

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
  const rowElements = () => [...(listEl?.querySelectorAll<HTMLElement>('[data-comfort-item]') ?? [])];
  const rowId = (el: HTMLElement) => el.dataset.comfortItem ?? '';
  /* The handle's drag and the travel after it are the Today editor's,
     shared ($lib/motion/reorder.svelte.ts); what is this list's own is
     where an order goes - the journal, behind `pendingOrder`. */
  const reorder = new ListDrag(rowElements, rowId);

  /** Write an order and let every row travel from where it was painted to
      where the order puts it. Measured before the drag is cleared, so a
      row a drag left standing aside or under the pointer starts there. */
  async function writeOrder(ids: string[]) {
    const before = measureTops(rowElements(), rowId);
    reorder.release();
    pendingOrder = ids;
    const stored = attempt(() => journal.comfortItems.reorder(ids), m.write_failed());
    await tick();
    travelFrom(rowElements(), rowId, before);
    /* A refused order goes back to the stored one, travelling there rather
       than standing on screen as an order that was never kept. */
    if (await stored) return;
    const shown = measureTops(rowElements(), rowId);
    pendingOrder = null;
    await tick();
    travelFrom(rowElements(), rowId, shown);
  }

  function moved(id: string, targetId: string): string[] {
    const ids = comfortItems.map((item) => item.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    return ids;
  }

  function drop() {
    const drag = reorder.drag;
    if (!drag) return;
    if (drag.overKey === drag.key) {
      reorder.release();
      return;
    }
    void writeOrder(moved(drag.key, drag.overKey));
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
        <p class="comfort-hint" id="comfort-arrange-hint" transition:disclose>{m.comfort_list_arrange_hint()}</p>
      {/if}
      <div class="comfort-list" class:is-arranging={arranging} class:is-dragging={reorder.drag !== null} bind:this={listEl}>
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
              data-lifted={reorder.drag?.key === item.id ? 'true' : undefined}
              style:translate={reorder.drag ? `0 ${reorder.offset(item.id)}px` : undefined}
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
                  aria-label={m.comfort_list_move({ text: item.text })}
                  aria-describedby="comfort-arrange-hint"
                  transition:trailWidth
                  onpointerdown={(event) => reorder.grab(event, item.id)}
                  onpointermove={reorder.travel}
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
