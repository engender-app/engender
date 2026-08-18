<script lang="ts">
  /* The decoy home screen (phase 4 features ticket 30): what quick exit
     puts over the tab when the app is disguised. Where the undisguised
     blank pretends to be an empty tab, this pretends to be the app the
     disguise already claims to be - a plain notes app, matching the
     "Notes" name and icon the tab shows.

     One screen and nothing behind it, per the ticket's scoping: the notes
     are static catalogue copy, the search bar is paint, and no tap leads
     anywhere but back. Behaviour is the blank's, unchanged: the whole
     thing is one button, and dismissing it does not unlock anything -
     with a PIN set, what is underneath is the lock screen.

     Styled in system colours and the system font rather than the app's
     tokens, same reasoning as .quick-exit-blank: a page in the app's
     palette is exactly what it is trying not to look like. */

  import { m } from '$lib/paraglide/messages';
  import { lockState } from '$lib/stores/lock.svelte';

  const notes = [
    { title: m.decoy_note_groceries_title, body: m.decoy_note_groceries_body },
    { title: m.decoy_note_todo_title, body: m.decoy_note_todo_body },
    { title: m.decoy_note_books_title, body: m.decoy_note_books_body },
    { title: m.decoy_note_recipes_title, body: m.decoy_note_recipes_body }
  ];
</script>

<button class="decoy" data-decoy aria-label={m.quick_exit_back()} onclick={() => (lockState.blanked = false)}>
  <!-- Decoration, not UI: a screen reader meets one button, "Back to the
       app", never a list of notes that do not exist. -->
  <span class="decoy-page" aria-hidden="true">
    <!-- An expression, not a text node: the disguise name is "Notes" in
         every language, and check-copy counts bare text as untranslated. -->
    <span class="decoy-brand" translate="no">{'Notes'}</span>
    <span class="decoy-search">{m.decoy_search()}</span>
    {#each notes as note (note.title)}
      <span class="decoy-note">
        <span class="decoy-note-title">{note.title()}</span>
        <span class="decoy-note-body">{note.body()}</span>
      </span>
    {/each}
  </span>
</button>

<style>
  /* Same slot as .quick-exit-blank: above everything, demo bar included. */
  .decoy {
    position: fixed;
    inset: 0;
    z-index: 100;
    border: none;
    padding: 0;
    text-align: left;
    cursor: default;
    font-family: system-ui, sans-serif;
    background: #fff;
    background: Canvas;
    color: #000;
    color: CanvasText;
  }
  .decoy-page {
    display: block;
    max-width: 40rem;
    margin: 0 auto;
    padding: 1.25rem 1rem;
  }
  .decoy-brand {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 0.75rem;
  }
  .decoy-search {
    display: block;
    padding: 0.5rem 1rem;
    border-radius: 1.25rem;
    margin-bottom: 1rem;
    background: color-mix(in srgb, CanvasText 8%, Canvas);
    color: color-mix(in srgb, CanvasText 55%, Canvas);
  }
  .decoy-note {
    display: block;
    padding: 0.75rem 0.25rem;
    border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, Canvas);
  }
  .decoy-note-title {
    display: block;
    font-weight: 600;
  }
  .decoy-note-body {
    display: block;
    font-size: 0.875rem;
    color: color-mix(in srgb, CanvasText 60%, Canvas);
  }
</style>
