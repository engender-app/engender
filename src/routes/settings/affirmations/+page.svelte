<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { journal } from '$lib/data/live/journal.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import type { Affirmation } from '$lib/data/types';

  let language = $state<'en' | 'pl'>(getLocale() === 'pl' ? 'pl' : 'en');

  let builtIns = $derived(vocabulary.affirmations.filter((a) => a.builtIn));
  let customs = $derived(vocabulary.customAffirmations(language));

  let addOpen = $state(false);
  let newText = $state('');
  let editTarget = $state<Affirmation | null>(null);
  let editText = $state('');
  let deleteTarget = $state<Affirmation | null>(null);
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.affirmations_row_title()}</h1>
    <div class="header-action"></div>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.affirmations_intro()}</p>

  <section class="card" style="margin-bottom:var(--space-4)">
    <h2 class="editor-heading" style="margin-bottom:var(--space-3)">{m.affirmations_builtin_heading()}</h2>
    <div class="managed-tags">
      {#each builtIns as a (a.id)}
        <div class="managed-tag" class:is-hidden={a.hidden}>
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
  </section>

  <section class="card" style="margin-bottom:var(--space-4)">
    <div class="spread" style="margin-bottom:var(--space-3)">
      <h2 class="editor-heading">{m.affirmations_custom_heading()}</h2>
      <Segmented
        name={m.language()}
        options={[
          { value: 'en', label: 'English' },
          { value: 'pl', label: 'Polski' }
        ]}
        value={language}
        onChange={(v) => (language = v as 'en' | 'pl')}
      />
    </div>
    {#if customs.length === 0}
      <p class="muted small">{m.affirmations_custom_empty()}</p>
    {/if}
    <div class="managed-tags">
      {#each customs as a (a.id)}
        <div class="managed-tag">
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
              onclick={() => (deleteTarget = a)}
            >
              <Icon name="trash" size={16} />
            </button>
          </span>
        </div>
      {/each}
    </div>
  </section>

  <button
    class="btn btn-soft"
    onclick={() => {
      addOpen = true;
      newText = '';
    }}
  >
    <Icon name="plus" size={20} /><span>{m.affirmations_add()}</span>
  </button>

  <Sheet bind:open={addOpen} title={m.affirmations_new_sheet()}>
    <h3>{m.affirmations_new_sheet()}</h3>
    <div class="field">
      <textarea class="input" rows="3" placeholder={m.affirmations_placeholder()} bind:value={newText}></textarea>
    </div>
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
      <div class="field">
        <textarea class="input" rows="3" bind:value={editText}></textarea>
      </div>
      <button
        class="btn btn-primary"
        onclick={() => {
          if (editText.trim()) journal.affirmations.editLine(editTarget!.id, editText.trim());
          editTarget = null;
        }}><span>{m.affirmations_save()}</span></button
      >
    {/if}
  </Sheet>

  <Sheet open={deleteTarget !== null} title={m.affirmations_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.affirmations_delete_q()}</h3>
      <div class="stack-3">
        <button
          class="btn btn-danger"
          data-confirm
          onclick={() => {
            journal.affirmations.deleteLine(deleteTarget!.id);
            deleteTarget = null;
          }}><span>{m.affirmations_delete_confirm()}</span></button
        >
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
