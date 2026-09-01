<script lang="ts">
  /* The fluidity engine's presentations, managed (phase 5 deepening ticket
     17, ADR-0048): list, add, rename, recolour and hide - there is no
     delete (CONTEXT: "Hidden"), so the shared record editor's `remove`
     handle is wired to throw rather than ever being reachable from this
     screen. A surface under /more, not a preference under Settings
     (ADR-0036): the chip it feeds only ever appears once a row exists here.

     Read through the mirrored vocabulary rather than a live query: a
     presentation is reference data the same way a tag is (reference.svelte.ts),
     and `vocabulary.presentations` already comes back most-recently-used
     first (presentations.ts) - a mode used yesterday wants to be nearer the
     top of its own list here too, not just the entry editor's chip. */
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { Presentation } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';

  let presentations = $derived(vocabulary.presentations);

  /** The next role not already in use, wrapping through the active flag's
      roles once every one of them is taken - the same modulo `roleAt`
      resolves any stored index by, so a picker never lands on an index it
      cannot show. The person can still pick a different one before saving
      (ADR-0048). */
  function nextRoleIndex(): number {
    const roleCount = activeFlag.roles.length;
    if (roleCount === 0) return 0;
    const used = new Set(presentations.map((p) => p.roleIndex % roleCount));
    for (let i = 0; i < roleCount; i++) {
      if (!used.has(i)) return i;
    }
    return presentations.length % roleCount;
  }

  const record = recordEditor<Presentation, { id?: string; name: string; roleIndex: number }>({
    blank: () => ({ name: '', roleIndex: nextRoleIndex() }),
    fromRecord: (p) => ({ id: p.id, name: p.name, roleIndex: p.roleIndex }),
    async upsert(draft) {
      const name = draft.name.trim();
      if (!name) return false;
      if (draft.id) {
        await journal.presentations.renamePresentation(draft.id, name);
        await journal.presentations.setPresentationColour(draft.id, draft.roleIndex);
      } else {
        await journal.presentations.addPresentation(name, draft.roleIndex);
      }
    },
    // Unreachable: RecordSheet only offers a delete button when `deleteLabel`
    // is passed below, and it is not - a presentation hides, never deletes.
    remove() {
      throw new Error('presentations hide, not delete');
    },
    findById: (id) => presentations.find((p) => p.id === id)
  });

  async function toggleHidden(p: Presentation) {
    await journal.presentations.setPresentationHidden(p.id, !p.hidden);
  }
</script>

<div class="screen">
  <ScreenHeader title={m.presentations_title()} back="/more" subtitle={m.presentations_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.presentations_add()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  {#if presentations.length > 0}
    <div class="screen-part">
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        {#each presentations as p (p.id)}
          {@const role = roleAt(activeFlag.roles, p.roleIndex)}
          <ListRow
            key={p.id}
            data-presentation={p.id}
            title={p.name}
            subtitle={p.hidden ? m.tags_hidden() : undefined}
            chevron={false}
            onclick={() => record.openEditor(p)}
            action={{
              icon: p.hidden ? 'eye' : 'eyeOff',
              label: p.hidden
                ? m.presentation_show_aria({ name: p.name })
                : m.presentation_hide_aria({ name: p.name }),
              onclick: () => toggleHidden(p)
            }}
          >
            {#snippet leading()}
              <span class="presentation-dot" {...roleAttrs(role)}></span>
            {/snippet}
          </ListRow>
        {/each}
      </ListCard>
    </div>
  {:else}
    <div class="screen-part">
      <Notice
        icon="palette"
        key="presentations-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.presentations_empty_title()}
        text={m.presentations_empty_body()}
        action={{ label: m.presentations_add(), primary: true, onclick: () => record.openEditor(null) }}
      />
    </div>
  {/if}

  <RecordSheet
    {record}
    handle="presentation"
    newTitle={m.presentation_new_sheet()}
    editTitle={m.presentation_edit_sheet()}
    saveLabel={m.presentation_save()}
    canSave={(draft) => draft.name.trim().length > 0}
    confirm={{
      // Unreachable: RecordSheet's own delete-confirm sheet only opens
      // through askToDelete, and nothing on this screen ever calls it -
      // there is no deleteLabel, so no button on the editor can reach it
      // either. Required by the shared component regardless of whether a
      // screen offers deletion at all.
      title: '',
      question: () => '',
      confirmLabel: '',
      cancelLabel: ''
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.presentation_name_label()} id="presentation-name">
        {#snippet children(id)}
          <input
            class="input"
            {id}
            name="presentation-name"
            placeholder={m.presentation_name_placeholder()}
            bind:value={editor.name}
          />
        {/snippet}
      </Field>
      <Field label={m.presentation_colour_label()} legend>
        {#snippet children()}
          <div class="presentation-swatches" role="radiogroup" aria-label={m.presentation_colour_label()}>
            {#each activeFlag.roles as role, i (i)}
              <button
                type="button"
                class="presentation-swatch press"
                class:is-selected={editor.roleIndex === i}
                role="radio"
                aria-checked={editor.roleIndex === i}
                aria-label={m.presentation_colour_swatch_aria({ index: i + 1 })}
                {...roleAttrs(role)}
                onclick={() => (editor.roleIndex = i)}
              ></button>
            {/each}
          </div>
        {/snippet}
      </Field>
    {/snippet}
  </RecordSheet>
</div>

<style>
  .presentation-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--role-draw);
    flex-shrink: 0;
  }

  .presentation-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  /* 48px, the app's own touch-target floor, rather than a smaller dot with
     a bigger hit area layered under it - the swatch's own visible size is
     the target, so nothing has to be taken on faith about where the tap
     lands. */
  .presentation-swatch {
    width: var(--touch-target);
    height: var(--touch-target);
    border-radius: 50%;
    border: 3px solid transparent;
    background: var(--role-draw);
    cursor: pointer;
    padding: 0;
  }

  .presentation-swatch.is-selected {
    border-color: var(--role-mark);
    box-shadow: 0 0 0 2px var(--bg);
    outline: 2px solid var(--role-draw);
    outline-offset: 1px;
  }
</style>
