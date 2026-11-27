<script lang="ts">
  /* A notice sits between hairlines with a 40px icon square. The separate
     action row keeps the icon aligned with the text, even when the action
     is a 48px button. Render a link for a destination and a button for
     an action. Use the text action for ordinary notices and the primary
     button when the notice is the screen's empty state.

     The props require a title or body. A title-only notice keeps the
     main text weight. Body text uses --text-2. Forward attributes to
     the root so a caller can add its walkthrough handle beside
     data-notice (ADR-0029). */
  import { focusAfterRemoval } from '$lib/navigation/arrivalFocus';
  import { navigating } from '$app/state';
  import Icon from '../Icon.svelte';
  import { roleAttrs } from './role';
  import { collapse, resize } from '$lib/motion/reveal';
  import type { Role } from '$lib/theme/roles';

  let {
    title,
    text,
    icon = 'info',
    role,
    key,
    action,
    dismiss,
    ...rest
  }: {
    /** One of these, or both. A title alone is a statement; a text alone is
        a remark; the two together are a notice with a heading. */
    title?: string;
    text?: string;
    icon?: string;
    role?: Role;
    key?: string;
    /** The one thing the notice asks for, if it asks for anything. Exactly
        one of `href` and `onclick`: where it navigates it is a link.

        `primary` draws it as the app's primary button instead of a text
        action - for an empty state, where it is the screen's only call to
        action rather than an aside on a remark. */
    action?:
      | { label: string; href: string; onclick?: never; primary?: boolean }
      | { label: string; onclick: () => void; href?: never; primary?: boolean };
    /** The label travels with the handler rather than beside it: an icon
        button with no accessible name is unusable by voice and
        unannounceable by a screen reader, and two optional props let one
        arrive without the other. */
    dismiss?: { label: string; onclick: () => void };
    /** The caller's own attributes - a handle, a role, an aria-live. */
    [attribute: string]: unknown;
  } = $props();
</script>

<!-- Use collapse for mount and unmount. It measures the box and moves the
     rows below it. Its arrival window keeps initial screen assembly still.
     The global modifier lets the transition run when a caller's condition
     unmounts the notice. skip suppresses it when the page itself leaves.

     use:resize on the body covers changes to a notice that stays mounted,
     such as switching its text with a segmented control. -->
<div
  class="kit-notice"
  data-kit-surface
  data-notice={key}
  transition:collapse|global={{ skip: navigating.to !== null }}
  {...roleAttrs(role)}
  {...rest}
>
  <span class="kit-notice-ico"><Icon name={icon} size={22} /></span>
  <!-- Not the root: `collapse`'s own out-transition animates the root's
       height too, on the way out, and ResizeObserver cannot tell that
       apart from a genuine content change - the two fought over the same
       property, and the height oscillated rather than settling. The body
       is the one thing that actually varies with title/text, so watching
       it instead is both the fix and the more precise place for this to
       live. -->
  <div class="kit-notice-body" use:resize>
    {#if title}<strong class="kit-notice-title" data-notice-title>{title}</strong>{/if}
    {#if text}<p class="kit-notice-text" data-notice-text>{text}</p>{/if}
  </div>
  {#if dismiss}
    <button
      type="button"
      class="kit-notice-x press"
      data-notice-dismiss
      aria-label={dismiss.label}
      onclick={(event) => {
        const returnFocus = focusAfterRemoval(event.currentTarget, '[data-notice]');
        dismiss?.onclick();
        returnFocus();
      }}
    >
      <Icon name="x" size={20} />
    </button>
  {/if}
  {#if action?.href}
    <a
      class={action.primary ? 'kit-notice-cta btn btn-primary' : 'kit-notice-act'}
      data-notice-action
      href={action.href}>{action.label}</a
    >
  {:else if action}
    <button
      type="button"
      class={action.primary ? 'kit-notice-cta btn btn-primary' : 'kit-notice-act'}
      data-notice-action
      onclick={action.onclick}
    >
      {action.label}
    </button>
  {/if}
</div>
