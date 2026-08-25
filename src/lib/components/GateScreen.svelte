<script lang="ts">
  /* The shell the five pre-unlock gates and the lock setup screen are built
     from (phase 5 ticket 26).

     They were six copies of the same fourteen lines - `.screen` wrapping
     `.applock` wrapping a badge, a centred `.ob-title` and a centred
     `.ob-text` - and the copies had already drifted: three different inline
     `text-align:center` styles, two different badge icon sizes, and the
     onboarding classes doing duty on screens that are not onboarding. A
     gate is the same object every time, so it is one object here.

     What the shell owns is the frame: the chromeless column, its vertical
     centring, the mark and the title. What it deliberately does not own is
     the line under the title. Every gate puts different attributes on that
     line - a `role="status"` on the conversion's progress, an `aria-live` on
     the Android prompt's outcome, a walkthrough handle on each - and folding
     it into a prop would mean a second prop for the attributes and a third
     for the ones that are markup rather than a string. So the gate writes
     its own `<p class="gate-body">` and everything below it, which is also
     what makes the conversion screen's progress rail and the PIN pad fit in
     the same shell without either being a special case.

     No entrance. A gate is what a cold start or a lock lands on, and
     DIRECTION.md's tier 2 already answers that: a navigation with nothing to
     come from is an instant cut. Its motion is all response and state - the
     PIN dots filling, the shake on a wrong one, the wait draining - which is
     the half of the motion system that belongs on a screen someone meets
     under stress. */

  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    icon = 'lock',
    tone = 'calm',
    title,
    children,
    ...rest
  }: {
    /** A name from $lib/components/icons.ts. */
    icon?: string;
    /** `alert` where something has gone wrong and the screen is about to
        say what, which is the difference between "type your PIN" and "this
        journal cannot be opened on this device any more". It colours the
        mark and nothing else: the gates say what happened in words, and a
        red disc is not one of them. */
    tone?: 'calm' | 'alert';
    title: string;
    children: Snippet;
    /** The gate's own attributes: its walkthrough handle, mostly. */
    [attribute: string]: unknown;
  } = $props();
</script>

<div class="screen">
  <div class="gate" class:is-alert={tone === 'alert'} {...rest}>
    <span class="gate-mark" aria-hidden="true"><Icon name={icon} size={26} /></span>
    <h1 class="gate-title">{title}</h1>
    {@render children()}
  </div>
</div>
