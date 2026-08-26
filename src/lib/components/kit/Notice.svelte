<script lang="ts">
  /* A notice: one outline, an icon, a line or two, and at most one action.

     No coloured bar down its side. A 4px accent border-left is named
     outright in the craft floor as the most recognisable AI-UI tell there
     is, and the slop audit took it off the backup notice this replaces. The
     weight comes from --outline-strong instead, which is the card's own
     line one step darker.

     The dismiss is a drawn icon, not a multiplication sign standing in for
     one - the same audit, the same list.

     The action sits on its own row under the text rather than inside the
     column beside the icon. With it in the column, the icon centred against
     the text plus a 48px button and so sat visibly below the line it
     belongs to.

     It is a link where it goes somewhere and a button where it acts, the
     same split ListRow.svelte makes and for the same reasons: the two carry
     different keyboard behaviour and different announcements, and "back up
     now" is a destination however it is drawn.

     And it can be the app's own primary button rather than a text action,
     because a notice and an empty state are the same surface at two
     different weights. A notice remarks - the backup is old, here is the way
     to fix it - and a text action is the right size for a remark. An empty
     state asks: it is the whole of what a first-run Home has to say, and the
     one thing to do about it is the screen's only call to action. That is
     what `.btn .btn-primary` is (phase 5 ticket 30's control inventory), and
     without this Home shipped no instance of the app's primary control at
     all. One flag rather than a second component, because everything else
     about the two is identical.

     Title and text are both optional, and a notice with only a title is the
     shape a one-line statement wants: the text is --text-2 by design,
     because a notice usually has a bold thing to say and a quieter
     explanation under it, and an anniversary that reads "that day matters"
     in the quiet half is the wrong emphasis. At least one of the two, which
     the types below say by making the pair a union rather than by asking a
     caller to remember.

     Anything else the caller puts on the notice lands on its root, which is
     how a screen stamps its own walkthrough handle without the kit learning
     what a backup is - `data-notice` names the surface and the handle beside
     it names the thing being said (ADR-0029). */
  import Icon from '../Icon.svelte';
  import { roleAttrs } from './role';
  import { disclose, resize } from '$lib/motion/reveal';
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

<!-- out: only, never in:. A notice arrives with tier 4's "content is simply
     there" - no entrance animation is DIRECTION.md's own rule, and every
     other kit surface already follows it. Leaving is different: whatever
     unmounts this - the dismiss button, or a caller's own condition going
     false, the same shape a dismiss produces - used to drop the space it
     held in one frame and throw the content below up to meet it (phase 5
     ticket 32.17, "clicking 'x' on a panel should close it with a nice
     animation, the content below shouldnt just jump up immediately").
     `disclose` already shrinks a box to nothing by measuring its own
     height rather than guessing at one; it runs the same way backwards
     for a leaving node as it does forwards for an arriving one.

     `use:resize` on the body below, not here, for the other half of the
     same finding: a notice that stays mounted and changes size under its
     own title/text (the measurements screen's protocol tip, switched with
     the segmented control) used to jump the same way on the way in. One
     primitive per shape - `resize` cannot see a node arriving or leaving,
     which is `disclose`'s job, and `disclose` cannot see a node's own
     content changing size while it stays put, which is `resize`'s. -->
<div class="kit-notice" data-notice={key} out:disclose {...roleAttrs(role)} {...rest}>
  <span class="kit-notice-ico"><Icon name={icon} size={22} /></span>
  <!-- Not the root: `disclose`'s own out-transition animates the root's
       height too, on the way out, and ResizeObserver cannot tell that
       apart from a genuine content change - the two fought over the same
       property, and the height oscillated rather than settling. The body
       is the one thing that actually varies with title/text, so watching
       it instead is both the fix and the more precise place for this to
       live. -->
  <div class="kit-notice-body" use:resize>
    {#if title}<strong class="kit-notice-title" data-notice-title>{title}</strong>{/if}
    {#if text}<p class="kit-notice-text">{text}</p>{/if}
  </div>
  {#if dismiss}
    <button
      type="button"
      class="kit-notice-x press"
      data-notice-dismiss
      aria-label={dismiss.label}
      onclick={dismiss.onclick}
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
