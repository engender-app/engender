<script lang="ts">
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { discloseWidth } from '$lib/motion/reveal';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { TagGroup } from '$lib/data/types';
  import { attempt, writer } from '$lib/stores/attempt.svelte';
  import { toast } from '$lib/stores/toasts.svelte';

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
    attempt(() => journal.tags.reorder(g.key, ids), m.write_failed());
  }

  /* Each sheet closes once its write lands, and stays open with a toast
     when it does not (after-release 06). */
  const sheetWrite = writer();
  async function saveFromSheet(write: (() => unknown) | null, close: () => void) {
    if (write && !(await sheetWrite.run(write, m.write_failed()))) return;
    close();
    if (write) toast(m.saved(), { kind: 'record-saved' });
  }
  let customGroups = $derived(vocabulary.tagGroups.filter((g) => !g.builtIn));
  let builtInGroups = $derived(vocabulary.tagGroups.filter((g) => g.builtIn));

  /* A group's `open` used to read straight off `!g.builtIn`. That looks
     like a one-time default but is not: `g` is a fresh object every time
     the tag list re-queries (any hide/show write does this), so the
     expression re-runs and writes the DOM property again, closing a
     built-in group right back up the moment its own hide button is used
     inside it (ticket 272). Tracked here instead, seeded from the same
     default and updated only by the element's own toggle. */
  let openGroups = $state<Record<string, boolean>>({});

  let addTarget = $state<string | null>(null);
  let newLabel = $state('');
  let groupSheet = $state(false);
  let newGroupName = $state('');

  /* Latched: the mirror re-arms `ready` on a journal re-open, and a reserve
     must not put its placeholder back over settled groups. */
  let tagsRevealed = $state(false);
  $effect.pre(() => {
    if (vocabulary.ready) tagsRevealed = true;
  });
  const tagsEstimate = readReserve('tags');
  const tagsRemember = (px: number) => rememberReserve('tags', px);
</script>

<div class="screen">
  <ScreenHeader title={m.manage_tags()} back="/settings" subtitle={m.tags_intro()} />

  {#snippet groupSection(g: TagGroup)}
    <details
      class="managed-group"
      data-tag-group={g.key}
      open={openGroups[g.key] ?? !g.builtIn}
      ontoggle={(e) => (openGroups[g.key] = e.currentTarget.open)}
    >
      <summary>{g.name}{#if !g.builtIn} · {m.custom_suffix()}{/if}</summary>
      <div class="tag-group-action">
        <button class="btn btn-soft" data-add-tag aria-label={m.tags_add_to_group({ group: g.name })} onclick={() => { addTarget = g.key; newLabel = ''; }}>
          <Icon name="plus" size={20} /><span>{m.tags_new_tag()}</span>
        </button>
      </div>
      <div class="managed-tags">
        {#each g.tags as tg, i (tg.id)}
          <div class="rows-divide managed-tag" class:is-hidden={tg.hidden}>
            <span class="managed-label" data-managed-tag-label={tg.id}>{tg.label}</span>
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
                  onclick={() => attempt(() => journal.tags.setTagHidden(tg.id, !tg.hidden), m.write_failed())}>
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
    </details>
  {/snippet}

  <!-- Your own groups and the way to make one come before the built-in
       catalogue (phase 11 ticket 38): five built-in groups carry 28 tags
       between them, and both a custom group and the button that creates one
       used to sit under all of it. -->
  <button class="btn btn-soft" data-new-tag-group onclick={() => { groupSheet = true; newGroupName = ''; }}>
    <Icon name="plus" size={20} /><span>{m.tags_new_group()}</span>
  </button>

  <!-- Held at last visit's height and faded in once the vocabulary mirror
       answers (ux-carpet ticket 205; ticket 152 found the gap). Every
       built-in group is reconciled on every boot (ADR-0004), so this is
       never legitimately empty, but a cold navigation straight here reads
       the mirror empty for a few frames. The outer box carries the first
       heading's 16px while the placeholder stands: the button above is
       inline-level, so that margin adds to the button's 20 rather than
       collapsing into it (ticket 193). -->
  <div style:margin-top={tagsRevealed ? null : 'var(--space-4)'}>
    <ReadReserve ready={tagsRevealed} estimate={tagsEstimate} onrest={tagsRemember}>
      {#each customGroups as g (g.key)}{@render groupSection(g)}{/each}
      <SectionHeading text={m.tags_builtin_heading()} />
      {#each builtInGroups as g (g.key)}{@render groupSection(g)}{/each}
    </ReadReserve>
  </div>

  <Sheet busy={sheetWrite.busy} open={renameTarget !== null} title={m.tags_rename_sheet()} onClose={() => (renameTarget = null)}>
    {#if renameTarget}
      <h3>{m.tags_rename_sheet()}</h3>
      <Field label={m.tags_rename_sheet()} id="rename-input" hidden>
        {#snippet children(id)}
          <input class="input" {id} name="rename-input" readonly={sheetWrite.busy} bind:value={renameTarget!.label} />
        {/snippet}
      </Field>
      <button
        class="btn btn-primary"
        disabled={sheetWrite.busy}
        onclick={() => {
          const { id, label } = renameTarget!;
          saveFromSheet(label.trim() ? () => journal.tags.renameTag(id, label.trim()) : null, () => (renameTarget = null));
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

  <Sheet busy={sheetWrite.busy} open={addTarget !== null} title={m.tags_new_tag()} onClose={() => (addTarget = null)}>
    {#if addTarget}
      <h3>{m.tags_new_tag()}</h3>
      <Field label={m.tags_new_tag()} id="newtag-input" hidden>
        {#snippet children(id)}
          <input class="input" {id} name="newtag-input" placeholder={m.tags_tag_placeholder()} readonly={sheetWrite.busy} bind:value={newLabel} />
        {/snippet}
      </Field>
      <button
        class="btn btn-primary"
        data-save-new-tag
        disabled={sheetWrite.busy}
        onclick={() => {
          const group = addTarget!;
          const label = newLabel.trim();
          saveFromSheet(label ? () => journal.tags.addTag(group, label) : null, () => (addTarget = null));
        }}><span>{m.tags_add_tag()}</span></button
      >
    {/if}
  </Sheet>

  <Sheet busy={sheetWrite.busy} bind:open={groupSheet} title={m.tags_new_group()}>
    <h3>{m.tags_new_group()}</h3>
    <Field label={m.tags_new_group()} id="newgroup-input" hidden>
      {#snippet children(id)}
        <input class="input" {id} name="newgroup-input" placeholder={m.tags_group_placeholder()} readonly={sheetWrite.busy} bind:value={newGroupName} />
      {/snippet}
    </Field>
    <button
      class="btn btn-primary"
      data-save-new-tag-group
      disabled={sheetWrite.busy}
      onclick={() => {
        const name = newGroupName.trim();
        saveFromSheet(name ? () => journal.tags.addGroup(name) : null, () => (groupSheet = false));
      }}><span>{m.tags_add_group()}</span></button
    >
  </Sheet>
</div>

<style>
  .tag-group-action {
    margin: 0 0 var(--space-2);
  }
</style>
