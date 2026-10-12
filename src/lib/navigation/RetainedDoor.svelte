<script module lang="ts">
  import Today from '../../routes/+page.svelte';
  import Calendar from '../../routes/calendar/+page.svelte';
  import LookBack from '../../routes/stats/+page.svelte';
  import More from '../../routes/more/+page.svelte';

  const pages = {
    '/': Today,
    '/calendar': Calendar,
    '/stats': LookBack,
    '/more': More
  };
  export type DoorPath = keyof typeof pages;
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { provideDoorActivity } from './doorActivity.svelte';

  let { path, active }: { path: DoorPath; active: boolean } = $props();
  provideDoorActivity(() => active);
  const Page = untrack(() => pages[path]);
</script>

<div
  data-retained-door={path}
  data-retained-active={active ? '' : undefined}
  inert={!active}
  style:display={active ? 'contents' : 'none'}
>
  <Page />
</div>
