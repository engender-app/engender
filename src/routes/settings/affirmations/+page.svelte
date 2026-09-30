<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { journal } from '$lib/data/live/journal.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import type { Affirmation } from '$lib/data/types';

  let language = $state<'en' | 'pl'>(getLocale() === 'pl' ? 'pl' : 'en');

  let addLabel = $derived(language === 'pl' ? m.affirmations_add_pl() : m.affirmations_add_en());
  let builtIns = $derived(vocabulary.affirmations.filter((a) => a.builtIn));
  let customs = $derived(vocabulary.customAffirmations(language));
  const reserve = readReserve('affirmations');
  /* Latched: the mirror re-arms `ready` on a journal re-open, and a reserve
     must not put its placeholder back over settled lists. */
  let listsReady = $state(false);
  $effect.pre(() => {
    if (vocabulary.ready) listsReady = true;
  });
  const rememberHeight = (px: number) => rememberReserve('affirmations', px);

  let addOpen = $state(false);
  let newText = $state('');
  let editTarget = $state<Affirmation | null>(null);
  let editText = $state('');

  const record = recordEditor<Affirmation>({
    remove: (id) => journal.affirmations.deleteLine(id),
    findById: (id) => vocabulary.affirmations.find((a) => a.id === id)
  });
</script>

<div class="screen">
  <ScreenHeader title={m.affirmations_row_title()} back="/settings" subtitle={m.affirmations_intro()} />

  <!-- Your own lines and the way to write one come before the built-in pool
       (phase 11 ticket 38): fourteen built-in lines are a screenful, and the
       add button under them was the last thing on the screen - the person's
       own vocabulary read as an appendix to the app's. -->
  <SectionHeading text={m.affirmations_custom_heading()} />

  <Field label={m.affirmations_language_label()} legend>
    {#snippet children()}
      <Segmented
        name={m.affirmations_language_label()}
        options={[
          { value: 'en', label: 'English' },
          { value: 'pl', label: 'Polski' }
        ]}
        value={language}
        onChange={(v) => (language = v as 'en' | 'pl')}
      />
    {/snippet}
  </Field>

  <button
    class="btn btn-soft"
    data-add-affirmation
    onclick={() => {
      addOpen = true;
      newText = '';
    }}
  >
    <Icon name="plus" size={20} /><span>{addLabel}</span>
  </button>

  <!-- Gated on the vocabulary mirror, ticket 152's gap: a cold open paints
       before the mirror fills, so this said "none of your own yet" and then
       swapped it for the lines, pushing the built-in pool 14px in one frame
       (ux-carpet ticket 193). Held at last visit's height, faded in. -->
  <ReadReserve ready={listsReady} estimate={reserve} onrest={rememberHeight}>
    {#if customs.length === 0}
      <p class="muted small">{m.affirmations_custom_empty()}</p>
    {/if}
    <div class="managed-tags">
      {#each customs as a (a.id)}
        <div class="rows-divide managed-tag">
          <span class="managed-label">{a.text}</span>
          <span class="managed-actions">
            <button
              class="icon-btn"
              aria-label={m.affirmations_edit_aria({ line: a.text })}
              onclick={() => {
                editTarget = a;
                editText = a.text;
              }}
            >
              <Icon name="pencil" size={16} />
            </button>
            <button
              class="icon-btn"
              data-del
              aria-label={m.affirmations_delete_aria({ line: a.text })}
              onclick={() => record.askToDelete(a)}
            >
              <Icon name="trash" size={16} />
            </button>
          </span>
        </div>
      {/each}
    </div>

    <details class="managed-group">
      <summary>{m.affirmations_builtin_heading()}</summary>
      <div class="managed-tags">
        {#each builtIns as a (a.id)}
          <div class="rows-divide managed-tag" class:is-hidden={a.hidden}>
            <span class="managed-label">{a.text}</span>
            {#if a.hidden}<span class="muted small">{m.affirmations_hidden()}</span>{/if}
            <span class="managed-actions">
              <button
                class="icon-btn"
                data-affirmation-hide={a.id}
                aria-label={a.hidden ? m.affirmations_show_aria({ line: a.text }) : m.affirmations_hide_aria({ line: a.text })}
                onclick={() => journal.affirmations.setHidden(a.id, !a.hidden)}
              >
                <Icon name={a.hidden ? 'eye' : 'eyeOff'} size={16} />
              </button>
            </span>
          </div>
        {/each}
      </div>
    </details>
  </ReadReserve>

  <Sheet bind:open={addOpen} title={addLabel}>
    <h3>{addLabel}</h3>
    <Field label={addLabel} hidden>
      {#snippet children(id)}
        <textarea class="input" {id} rows="3" placeholder={m.affirmations_placeholder()} bind:value={newText}></textarea>
      {/snippet}
    </Field>
    <button
      class="btn btn-primary"
      onclick={() => {
        if (newText.trim()) journal.affirmations.addLine(language, newText.trim());
        addOpen = false;
      }}><span>{m.affirmations_save()}</span></button
    >
  </Sheet>

  <Sheet open={editTarget !== null} title={m.affirmations_edit_sheet()} onClose={() => (editTarget = null)}>
    {#if editTarget}
      <h3>{m.affirmations_edit_sheet()}</h3>
      <Field label={m.affirmations_edit_sheet()} hidden>
        {#snippet children(id)}
          <textarea class="input" {id} rows="3" bind:value={editText}></textarea>
        {/snippet}
      </Field>
      <button
        class="btn btn-primary"
        onclick={() => {
          if (editText.trim()) journal.affirmations.editLine(editTarget!.id, editText.trim());
          editTarget = null;
        }}><span>{m.affirmations_save()}</span></button
      >
    {/if}
  </Sheet>

  <RecordSheet
    {record}
    handle="affirmation"
    confirm={{
      title: m.affirmations_delete_sheet(),
      question: () => m.affirmations_delete_q(),
      confirmLabel: m.affirmations_delete_confirm(),
      cancelLabel: m.keep_it()
    }}
  />
</div>
