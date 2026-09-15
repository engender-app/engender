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
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import type { ComfortItem } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

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
  <ScreenHeader title={m.comfort_list_title()} back="/doubt" screen="safe-space-comfort" />

  <ReadGate read={comfortItemsQuery} variant="line" count={3}>
    {#snippet rows()}
      <ListCard role={roleAt(activeFlag.roles, 0)}>
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
