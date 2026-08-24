<script lang="ts">
  /* A notice: one outline, an icon, a line or two, and at most one action.

     No coloured bar down its side. A 4px accent border-left is named
     outright in the craft floor as the most recognisable AI-UI tell there
     is, and the slop audit took it off the backup notice this replaces. The
     weight comes from --outline-strong instead, which is the card's own
     line one step darker.

     The dismiss is a drawn icon, not a multiplication sign standing in for
     one - the same audit, the same list. */
  import Icon from '../Icon.svelte';
  import { roleStyle } from './role';
  import type { Role } from '$lib/theme/roles';

  let {
    title,
    text,
    icon = 'info',
    role,
    key,
    action,
    dismiss
  }: {
    title?: string;
    text: string;
    icon?: string;
    role?: Role;
    key?: string;
    /** The one thing the notice asks for, if it asks for anything. */
    action?: { label: string; onclick: () => void };
    /** The label travels with the handler rather than beside it: an icon
        button with no accessible name is unusable by voice and
        unannounceable by a screen reader, and two optional props let one
        arrive without the other. */
    dismiss?: { label: string; onclick: () => void };
  } = $props();
</script>

<div class="kit-notice" data-notice={key} style={roleStyle(role)}>
  <span class="kit-notice-ico"><Icon name={icon} size={20} /></span>
  <div class="kit-notice-body">
    {#if title}<strong class="kit-notice-title">{title}</strong>{/if}
    <p class="kit-notice-text">{text}</p>
    {#if action}
      <button type="button" class="kit-notice-act" data-notice-action onclick={action.onclick}>
        {action.label}
      </button>
    {/if}
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
</div>
