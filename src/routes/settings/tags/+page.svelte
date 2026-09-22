<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade, discloseWidth, resize } from '$lib/motion/reveal';
  import Skeleton from '$lib/components/Skeleton.svelte';
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

  /* The journal speaks whole orders (a drag), so the up-button builds
     the order it wants and hands it over. */
  function moveUp(g: TagGroup, index: number) {
    const ids = g.tags.map((t) => t.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    journal.tags.reorder(g.key, ids);
  }
  let customGroups = $derived(vocabulary.tagGroups.filter((g) => !g.builtIn));
  let builtInGroups = $derived(vocabulary.tagGroups.filter((g) => g.builtIn));

  let addTarget = $state<string | null>(null);
  let newLabel = $state('');
  let groupSheet = $state(false);
  let newGroupName = $state('');
</script>

<div class="screen">
  <ScreenHeader title={m.manage_tags()} back="/settings" subtitle={m.tags_intro()} />

  {#snippet groupSection(g: TagGroup)}
    <SectionHeading text={g.builtIn ? g.name : `${g.name} · ${m.custom_suffix()}`}>
      {#snippet action()}
        <button class="icon-btn" aria-label={m.tags_add_to_group({ group: g.name })} onclick={() => { addTarget = g.key; newLabel = ''; }}>
          <Icon name="plus" size={20} />
        </button>
      {/snippet}
    </SectionHeading>
    <div class="managed-tags">
      {#each g.tags as tg, i (tg.id)}
        <div class="rows-divide managed-tag" class:is-hidden={tg.hidden}>
          <span class="managed-label">{tg.label}</span>
          {#if tg.hidden}<span class="muted small" transition:discloseWidth>{m.tags_hidden()}</span>{/if}
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
  {/snippet}

  <!-- Your own groups and the way to make one come before the built-in
       catalogue (phase 11 ticket 38): five built-in groups carry 28 tags
       between them, and both a custom group and the button that creates one
       used to sit under all of it. -->
  <button class="btn btn-soft" data-new-tag-group onclick={() => { groupSheet = true; newGroupName = ''; }}>
    <Icon name="plus" size={20} /><span>{m.tags_new_group()}</span>
  </button>

  <div use:resize>
    {#if !vocabulary.ready}
      <!-- Every built-in tag group is reconciled on every boot (ADR-0004),
           so this is never legitimately empty - but on a cold navigation
           straight here, `vocabulary.tagGroups` reads empty for a few
           frames before the mirror behind it hydrates, and with no gate
           that painted nothing at all where five groups of tags belong
           (ticket 152). -->
      <div out:crossfade><Skeleton variant="line" count={4} /></div>
    {:else}
      {#each customGroups as g (g.key)}{@render groupSection(g)}{/each}
      {#each builtInGroups as g (g.key)}{@render groupSection(g)}{/each}
    {/if}
  </div>

  <Sheet open={renameTarget !== null} title={m.tags_rename_sheet()} onClose={() => (renameTarget = null)}>
    {#if renameTarget}
      <h3>{m.tags_rename_sheet()}</h3>
      <Field label={m.tags_rename_sheet()} id="rename-input" hidden>
        {#snippet children(id)}
          <input class="input" {id} name="rename-input" bind:value={renameTarget!.label} />
        {/snippet}
      </Field>
      <button
        class="btn btn-primary"
        onclick={() => {
          if (renameTarget!.label.trim()) journal.tags.renameTag(renameTarget!.id, renameTarget!.label.trim());
          renameTarget = null;
        }}><span>{m.tags_save()}</span></button
      >
    {/if}
  </Sheet>

  <RecordSheet
    {record}
    handle="tag"
    confirm={{
      title: m.tags_delete_sheet(),
      question: (tag) => m.tags_delete_q({ label: tag.label }),
      hint: () => m.tags_delete_hint(),
      confirmLabel: m.tags_delete_confirm(),
      cancelLabel: m.keep_it()
    }}
  />

  <Sheet open={addTarget !== null} title={m.tags_new_tag()} onClose={() => (addTarget = null)}>
    {#if addTarget}
      <h3>{m.tags_new_tag()}</h3>
      <Field label={m.tags_new_tag()} id="newtag-input" hidden>
        {#snippet children(id)}
          <input class="input" {id} name="newtag-input" placeholder={m.tags_tag_placeholder()} bind:value={newLabel} />
        {/snippet}
      </Field>
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
    <Field label={m.tags_new_group()} id="newgroup-input" hidden>
      {#snippet children(id)}
        <input class="input" {id} name="newgroup-input" placeholder={m.tags_group_placeholder()} bind:value={newGroupName} />
      {/snippet}
    </Field>
    <button
      class="btn btn-primary"
      onclick={() => {
        if (newGroupName.trim()) journal.tags.addGroup(newGroupName.trim());
        groupSheet = false;
      }}><span>{m.tags_add_group()}</span></button
    >
  </Sheet>
</div>
