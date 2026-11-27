<script lang="ts">
  /* Modes, raised as a sheet over whatever screen is showing - mounted once here, at the
     app root beside QuickAdd, rather than inside Settings, so the entry editor's own
     "manage" links (EntryEditor.svelte) can raise the same sheet without navigating
     anywhere. `ui.raisedManager` is the one flag both launchers drive. */
  import { onMount } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { ui } from '$lib/stores/ui.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { focusArrivedScreen } from '$lib/navigation/arrivalFocus';
  import Sheet from './Sheet.svelte';
  import PresentationsManager from './PresentationsManager.svelte';

  /* Sheet measures its rise the instant it mounts. Raising the sheet before
     `vocabulary.ready` mounted its manager holding only a heading and a skeleton, so the
     rise travelled to that height, then the row list resolved underneath it and the sheet
     lurched to fit. Waiting for `vocabulary.ready` here means the manager never mounts
     until its rows already can, so the one rise Sheet plays is already measuring the
     sheet's real, final height. In the ordinary tap path (Settings row, warm app)
     `vocabulary.ready` is already true, so this adds nothing to wait for; it only holds the
     true cold path - a raise landed on before boot has hydrated the mirror - back the same
     beat the row data itself takes. */
  // Open after mounting so local transitions animate the first opening too.
  let mounted = $state(false);
  onMount(() => { mounted = true; });
  let modesOpen = $derived(mounted && ui.raisedManager === 'modes' && vocabulary.ready);
</script>

<Sheet
  open={modesOpen}
  title={m.presentations_title()}
  onClose={() => (ui.raisedManager = null)}
  onClosed={() => focusArrivedScreen(document.getElementById('app-main'))}
>
  <PresentationsManager />
</Sheet>
