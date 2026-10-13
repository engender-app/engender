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

  /* Shown again, the door's CSS animations start over: display none cancels
     them and display contents starts them from their first frame, so a
     revisit replayed every tile's entrance into the tab's arrival. They
     played on the first visit, and a warm revisit shows what it showed
     before in its first frame (ReadGroup does the same for a remounted
     one), so they are finished before it paints. Loops go on, and script
     animations never restarted. */
  let node: HTMLDivElement;
  let hidden = false;
  $effect(() => {
    if (!active) {
      hidden = true;
      return;
    }
    if (!hidden) return;
    hidden = false;
    for (const animation of node.getAnimations({ subtree: true })) {
      if (animation instanceof CSSAnimation && animation.effect?.getComputedTiming().iterations !== Infinity) {
        animation.finish();
      }
    }
  });
</script>

<div
  bind:this={node}
  data-retained-door={path}
  data-retained-active={active ? '' : undefined}
  inert={!active}
  style:display={active ? 'contents' : 'none'}
>
  <Page />
</div>
