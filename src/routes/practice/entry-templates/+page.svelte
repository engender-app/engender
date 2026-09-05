<script lang="ts">
  /* Entry templates, editable and hideable (phase 6 ticket 07). The six
     original templates and the eight folded-in guided prompts are built-in
     rows the same way a tag or a gender dimension is: edited into the
     person's own or hidden, never deleted (CONTEXT: "Hidden") - the shared
     record editor's `remove` handle is wired to throw rather than ever
     being reachable from this screen, the same shape /transition/presentations
     already gives a hide-only area.

     No empty state: reconcile seeds every `ENTRY_TEMPLATES` built-in on
     every boot, so the list is never empty the way a fresh presentations
     list can be. */
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { EntryTemplate } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import TagPicker from '$lib/components/TagPicker.svelte';
  import DimensionSlider from '$lib/components/DimensionSlider.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';

  let templates = $derived(vocabulary.entryTemplates);

  interface TemplateDraft {
    id?: string;
    name: string;
    tags: string[];
    dims: Record<string, number>;
    noteScaffold: string;
    presentationId: string | null;
  }

  const record = recordEditor<EntryTemplate, TemplateDraft>({
    blank: () => ({ name: '', tags: [], dims: {}, noteScaffold: '', presentationId: null }),
    fromRecord: (t) => ({
      id: t.id,
      name: t.name,
      tags: [...t.tags],
      dims: { ...t.dims },
      noteScaffold: t.noteScaffold,
      presentationId: t.presentationId
    }),
    async upsert(draft) {
      const name = draft.name.trim();
      if (!name) return false;
      const input = {
        name,
        tags: draft.tags,
        dims: draft.dims,
        noteScaffold: draft.noteScaffold,
        presentationId: draft.presentationId
      };
      if (draft.id) {
        await journal.entryTemplates.updateEntryTemplate(draft.id, input);
      } else {
        await journal.entryTemplates.addEntryTemplate(input);
      }
    },
    // Unreachable: RecordSheet only offers a delete button when `deleteLabel`
    // is passed below, and it is not - a template hides, never deletes.
    remove() {
      throw new Error('entry templates hide, not delete');
    },
    findById: (id) => templates.find((t) => t.id === id)
  });

  async function toggleHidden(t: EntryTemplate) {
    await journal.entryTemplates.setEntryTemplateHidden(t.id, !t.hidden);
  }
</script>

<div class="screen">
  <ScreenHeader title={m.entry_templates_title()} back="/more" subtitle={m.entry_templates_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.entry_templates_add()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <div class="screen-part">
    <ListCard role={roleAt(activeFlag.roles, 0)}>
      {#each templates as t (t.id)}
        <ListRow
          key={t.id}
          data-entry-template={t.id}
          title={t.name}
          subtitle={t.hidden ? m.tags_hidden() : undefined}
          chevron={false}
          onclick={() => record.openEditor(t)}
          action={{
            icon: t.hidden ? 'eye' : 'eyeOff',
            label: t.hidden
              ? m.entry_template_show_aria({ name: t.name })
              : m.entry_template_hide_aria({ name: t.name }),
            onclick: () => toggleHidden(t)
          }}
        />
      {/each}
    </ListCard>
  </div>

  <RecordSheet
    {record}
    handle="entry-template"
    newTitle={m.entry_template_new_sheet()}
    editTitle={m.entry_template_edit_sheet()}
    saveLabel={m.entry_template_save()}
    canSave={(draft) => draft.name.trim().length > 0}
    confirm={{
      // Unreachable, the same reason presentations' own confirm block is:
      // required by the shared component regardless of whether a screen
      // offers deletion at all.
      title: '',
      question: () => '',
      confirmLabel: '',
      cancelLabel: ''
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.entry_template_name_label()} id="entry-template-name">
        {#snippet children(id)}
          <input
            class="input"
            {id}
            name="entry-template-name"
            placeholder={m.entry_template_name_placeholder()}
            bind:value={editor.name}
          />
        {/snippet}
      </Field>

      {#if vocabulary.visiblePresentations.length > 0}
        <SectionHeading text={m.presentation_label()} />
        <div class="contextual-chips" role="radiogroup" aria-label={m.presentation_label()}>
          {#each vocabulary.visiblePresentations as p (p.id)}
            {@const role = roleAt(activeFlag.roles, p.roleIndex)}
            <button
              type="button"
              class="contextual-chip presentation-chip press"
              class:is-active={editor.presentationId === p.id}
              {...roleAttrs(role)}
              role="radio"
              aria-checked={editor.presentationId === p.id}
              onclick={() => (editor.presentationId = editor.presentationId === p.id ? null : p.id)}
            >
              {p.name}
            </button>
          {/each}
        </div>
      {/if}

      <SectionHeading text={m.gender_label()} />
      {#each vocabulary.visibleDimensions as dim (dim.key)}
        <DimensionSlider {dim} value={editor.dims[dim.key] ?? null} onInput={(v) => (editor.dims = { ...editor.dims, [dim.key]: v })} />
      {/each}

      <SectionHeading text={m.tags_label()} />
      <TagPicker
        groups={vocabulary.visibleTagGroups}
        selected={editor.tags}
        onToggle={(id) =>
          (editor.tags = editor.tags.includes(id) ? editor.tags.filter((x) => x !== id) : [...editor.tags, id])}
      />

      <Field label={m.note_label()} id="entry-template-note-scaffold">
        {#snippet children(id)}
          <textarea
            class="input"
            {id}
            name="entry-template-note-scaffold"
            placeholder={m.entry_template_note_scaffold_placeholder()}
            bind:value={editor.noteScaffold}
          ></textarea>
        {/snippet}
      </Field>
    {/snippet}
  </RecordSheet>
</div>

<style>
  /* The presentation chip row, copied from EntryEditor.svelte rather than
     shared with it: both are the app's only two presentation pickers, and
     neither is a component the third caller that would justify extracting
     one has ever shown up for. */
  .contextual-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .contextual-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    min-height: 36px;
    box-sizing: border-box;
    border-radius: var(--radius-pill);
    border: 1.5px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease-out),
      border-color var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out);
  }

  .contextual-chip:hover {
    border-color: var(--accent-border, var(--outline));
  }

  .contextual-chip.is-active {
    background: var(--accent-soft, var(--accent));
    color: var(--on-accent-soft, var(--accent-fg));
    border-color: var(--accent);
  }

  /* A presentation's own colour rather than the app's accent (ADR-0048) -
     the tokens [data-kit-role] derives from roleAttrs() on this button. */
  .presentation-chip[data-kit-role] {
    border: var(--role-hairline);
  }

  .presentation-chip.is-active[data-kit-role] {
    background: var(--role-tint);
    border-color: var(--role-draw);
  }
</style>
