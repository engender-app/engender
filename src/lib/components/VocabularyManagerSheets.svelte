<script lang="ts">
  /* Modes and entry templates, raised as sheets over whatever screen is
     showing (audit item 6) - mounted once here, at the app root beside
     QuickAdd, rather than inside Settings, so the entry editor's own
     "manage" links (EntryEditor.svelte) can raise the same sheet without
     navigating anywhere. `ui.raisedManager` is the one flag both the links
     and the two old standalone-screen addresses (settings/presentations,
     settings/entry-templates - now redirect stubs handing off which sheet
     to raise) drive. */
  import { m } from '$lib/paraglide/messages';
  import { ui } from '$lib/stores/ui.svelte';
  import Sheet from './Sheet.svelte';
  import PresentationsManager from './PresentationsManager.svelte';
  import EntryTemplatesManager from './EntryTemplatesManager.svelte';
</script>

<Sheet
  open={ui.raisedManager === 'modes'}
  title={m.presentations_title()}
  onClose={() => (ui.raisedManager = null)}
>
  <PresentationsManager />
</Sheet>

<Sheet
  open={ui.raisedManager === 'templates'}
  title={m.entry_templates_title()}
  onClose={() => (ui.raisedManager = null)}
>
  <EntryTemplatesManager />
</Sheet>
