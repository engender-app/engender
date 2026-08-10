<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { db } from '$lib/data/db.svelte';
  import { addTag, renameTag, moveTagUp, setTagHidden, deleteTag, addGroup } from '$lib/data/repositories/tags';
  import Icon from '$lib/components/Icon.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  let renameTarget = $state<{ groupKey: string; index: number; label: string } | null>(null);
  let deleteTarget = $state<{ groupKey: string; index: number; label: string } | null>(null);
  let addTarget = $state<string | null>(null);
  let newLabel = $state('');
  let groupSheet = $state(false);
  let newGroupName = $state('');
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.manage_tags()}</h1>
    <div class="header-action"></div>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">
    Built-in tags can be hidden — their history stays. Your own tags can be renamed or deleted.
  </p>

  {#each db.tagGroups as g (g.key)}
    <section class="card" style="margin-bottom:var(--space-4)">
      <div class="spread" style="margin-bottom:var(--space-3)">
        <h2 class="editor-heading">{g.name} {#if !g.builtIn}<span class="muted small">· {m.custom_suffix()}</span>{/if}</h2>
        <button class="icon-btn" aria-label="Add tag to {g.name}" onclick={() => { addTarget = g.key; newLabel = ''; }}>
          <Icon name="plus" size={20} />
        </button>
      </div>
      <div class="managed-tags">
        {#each g.tags as tg, i (tg.id)}
          <div class="managed-tag" class:is-hidden={tg.hidden}>
            <span class="drag-dots" aria-hidden="true"><Icon name="dots" size={14} /></span>
            <span class="managed-label">{tg.label}</span>
            {#if tg.hidden}<span class="muted small">hidden</span>{/if}
            <span class="managed-actions">
              <button class="icon-btn" data-up aria-label="Move {tg.label} up" disabled={i === 0}
                style={i === 0 ? 'opacity:.3' : ''} onclick={() => moveTagUp(g.key, i)}>
                <Icon name="chevronLeft" size={16} />
              </button>
              <button class="icon-btn" aria-label="Rename {tg.label}"
                onclick={() => (renameTarget = { groupKey: g.key, index: i, label: tg.label })}>
                <Icon name="pencil" size={16} />
              </button>
              {#if tg.builtIn}
                <button class="icon-btn" aria-label="{tg.hidden ? 'Show' : 'Hide'} {tg.label}"
                  onclick={() => setTagHidden(g.key, i, !tg.hidden)}>
                  <Icon name={tg.hidden ? 'eye' : 'eyeOff'} size={16} />
                </button>
              {:else}
                <button class="icon-btn" data-del aria-label="Delete {tg.label}"
                  onclick={() => (deleteTarget = { groupKey: g.key, index: i, label: tg.label })}>
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
    <Icon name="plus" size={20} /><span>New group</span>
  </button>

  <Sheet open={renameTarget !== null} title="Rename tag" onClose={() => (renameTarget = null)}>
    {#if renameTarget}
      <h3>Rename tag</h3>
      <div class="field">
        <input class="input" id="rename-input" name="rename-input" bind:value={renameTarget.label} />
      </div>
      <button
        class="btn btn-primary"
        onclick={() => {
          if (renameTarget!.label.trim()) renameTag(renameTarget!.groupKey, renameTarget!.index, renameTarget!.label.trim());
          renameTarget = null;
        }}><span>Save</span></button
      >
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title="Delete tag" onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>Delete “{deleteTarget.label}”?</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">
        This removes the tag from every entry that uses it. Entries themselves are untouched. This cannot be undone.
      </p>
      <div class="stack-3">
        <button
          class="btn btn-danger"
          data-confirm
          onclick={() => {
            deleteTag(deleteTarget!.groupKey, deleteTarget!.index);
            deleteTarget = null;
          }}><span>Delete tag</span></button
        >
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>

  <Sheet open={addTarget !== null} title="New tag" onClose={() => (addTarget = null)}>
    {#if addTarget}
      <h3>New tag</h3>
      <div class="field">
        <input class="input" id="newtag-input" name="newtag-input" placeholder="Tag name" bind:value={newLabel} />
      </div>
      <button
        class="btn btn-primary"
        onclick={() => {
          if (newLabel.trim()) addTag(addTarget!, newLabel.trim());
          addTarget = null;
        }}><span>Add tag</span></button
      >
    {/if}
  </Sheet>

  <Sheet bind:open={groupSheet} title="New group">
    <h3>New group</h3>
    <div class="field">
      <input class="input" id="newgroup-input" name="newgroup-input" placeholder="Group name" bind:value={newGroupName} />
    </div>
    <button
      class="btn btn-primary"
      onclick={() => {
        if (newGroupName.trim()) addGroup(newGroupName.trim());
        groupSheet = false;
      }}><span>Add group</span></button
    >
  </Sheet>
</div>
