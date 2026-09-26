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
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import Sheet from './Sheet.svelte';
  import PresentationsManager from './PresentationsManager.svelte';
  import EntryTemplatesManager from './EntryTemplatesManager.svelte';

  /* Ticket 254: Sheet measures its rise the instant it mounts. Raising
     either sheet before `vocabulary.ready` mounted its manager holding
     only a heading and a skeleton, so the rise travelled to that height,
     then the row list resolved underneath it and the sheet lurched to fit.
     Waiting for `vocabulary.ready` here means the manager never mounts
     until its rows already can, so the one rise Sheet plays is already
     measuring the sheet's real, final height. In the ordinary tap path
     (Settings row, warm app) `vocabulary.ready` is already true, so this
     adds nothing to wait for; it only holds the true cold path - a raise
     landed on before boot has hydrated the mirror - back the same beat the
     row data itself takes. */
  let templatesOpen = $derived(ui.raisedManager === 'templates' && vocabulary.ready);
  let modesOpen = $derived(ui.raisedManager === 'modes' && vocabulary.ready);
</script>

<Sheet
  open={modesOpen}
  title={m.presentations_title()}
  onClose={() => (ui.raisedManager = null)}
  globalTransitions
>
  <PresentationsManager />
</Sheet>

<Sheet
  open={templatesOpen}
  title={m.entry_templates_title()}
  onClose={() => (ui.raisedManager = null)}
  globalTransitions
>
  <EntryTemplatesManager />
</Sheet>
