<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { TagGroup } from '$lib/data/types';

  let renameTarget = $state<{ id: string; label: string } | null>(null);

  const record = recordEditor<{ id: string; label: string }>({
    remove: (id) => journal.tags.deleteTag(id),
    findById: (id) => {
      const tg = vocabulary.tagGroups.flatMap((g) => g.tags).find((t) => t.id === id);
      return tg && { id: tg.id, label: tg.label };
    }
  });
  let deleteTarget = $derived(record.deleteTarget);

  /* The journal speaks whole orders (a drag), so the up-button builds
     the order it wants and hands it over. */
  function moveUp(g: TagGroup, index: number) {
    const ids = g.tags.map((t) => t.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    journal.tags.reorder(g.key, ids);
  }
  let addTarget = $state<string | null>(null);
  let newLabel = $state('');
  let groupSheet = $state(false);
  let newGroupName = $state('');
</script>

<div class="screen">
  <ScreenHeader title={m.manage_tags()} back="/settings" subtitle={m.tags_intro()} />

  {#each vocabulary.tagGroups as g (g.key)}
    <section class="card" style="margin-bottom:var(--space-4)">
      <div class="spread" style="margin-bottom:var(--space-3)">
        <h2 class="editor-heading">{g.name} {#if !g.builtIn}<span class="muted small">· {m.custom_suffix()}</span>{/if}</h2>
        <button class="icon-btn" aria-label={m.tags_add_to_group({ group: g.name })} onclick={() => { addTarget = g.key; newLabel = ''; }}>
          <Icon name="plus" size={20} />
        </button>
      </div>
      <div class="managed-tags">
        {#each g.tags as tg, i (tg.id)}
          <div class="managed-tag" class:is-hidden={tg.hidden}>
            <span class="drag-dots" aria-hidden="true"><Icon name="dots" size={14} /></span>
            <span class="managed-label">{tg.label}</span>
            {#if tg.hidden}<span class="muted small">{m.tags_hidden()}</span>{/if}
            <span class="managed-actions">
              <button class="icon-btn" data-up aria-label={m.tags_move_up({ label: tg.label })} disabled={i === 0}
                onclick={() => moveUp(g, i)}>
                <Icon name="chevronLeft" size={16} />
              </button>
              <button class="icon-btn" aria-label={m.tags_rename_aria({ label: tg.label })}
                onclick={() => (renameTarget = { id: tg.id, label: tg.label })}>
                <Icon name="pencil" size={16} />
              </button>
              {#if tg.builtIn}
                <button class="icon-btn" data-tag-hide={tg.id} aria-label={tg.hidden ? m.tags_show_aria({ label: tg.label }) : m.tags_hide_aria({ label: tg.label })}
                  onclick={() => journal.tags.setTagHidden(tg.id, !tg.hidden)}>
                  <Icon name={tg.hidden ? 'eye' : 'eyeOff'} size={16} />
                </button>
              {:else}
                <button class="icon-btn" data-del aria-label={m.tags_delete_aria({ label: tg.label })}
                  onclick={() => record.askToDelete({ id: tg.id, label: tg.label })}>
                  <Icon name="trash" size={16} />
                </button>
              {/if}
            </span>
          </div>
        {/each}
      </div>
    </section>
  {/each}

  <button class="btn btn-soft" onclick={() => { groupSheet = true; newGroupName = ''; }}>
    <Icon name="plus" size={20} /><span>{m.tags_new_group()}</span>
  </button>

  <Sheet open={renameTarget !== null} title={m.tags_rename_sheet()} onClose={() => (renameTarget = null)}>
    {#if renameTarget}
      <h3>{m.tags_rename_sheet()}</h3>
      <div class="field">
        <input class="input" id="rename-input" name="rename-input" bind:value={renameTarget.label} />
      </div>
      <button
        class="btn btn-primary"
        onclick={() => {
          if (renameTarget!.label.trim()) journal.tags.renameTag(renameTarget!.id, renameTarget!.label.trim());
          renameTarget = null;
        }}><span>{m.tags_save()}</span></button
      >
    {/if}
  </Sheet>

  <ConfirmDeleteSheet
    open={deleteTarget !== null}
    title={m.tags_delete_sheet()}
    question={deleteTarget ? m.tags_delete_q({ label: deleteTarget.label }) : ''}
    hint={m.tags_delete_hint()}
    confirmLabel={m.tags_delete_confirm()}
    cancelLabel={m.keep_it()}
    confirmAttrs={{ 'data-confirm': '' }}
    onConfirm={record.confirmDelete}
    onCancel={record.cancelDelete}
  />

  <Sheet open={addTarget !== null} title={m.tags_new_tag()} onClose={() => (addTarget = null)}>
    {#if addTarget}
      <h3>{m.tags_new_tag()}</h3>
      <div class="field">
        <input class="input" id="newtag-input" name="newtag-input" placeholder={m.tags_tag_placeholder()} bind:value={newLabel} />
      </div>
      <button
        class="btn btn-primary"
        onclick={() => {
          if (newLabel.trim()) journal.tags.addTag(addTarget!, newLabel.trim());
          addTarget = null;
        }}><span>{m.tags_add_tag()}</span></button
      >
    {/if}
  </Sheet>

  <Sheet bind:open={groupSheet} title={m.tags_new_group()}>
    <h3>{m.tags_new_group()}</h3>
    <div class="field">
      <input class="input" id="newgroup-input" name="newgroup-input" placeholder={m.tags_group_placeholder()} bind:value={newGroupName} />
    </div>
    <button
      class="btn btn-primary"
      onclick={() => {
        if (newGroupName.trim()) journal.tags.addGroup(newGroupName.trim());
        groupSheet = false;
      }}><span>{m.tags_add_group()}</span></button
    >
  </Sheet>
</div>
