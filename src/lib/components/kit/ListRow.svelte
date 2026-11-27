<script lang="ts">
  /* A list row has an icon, title and chevron. A subtitle can show the
     latest reading or describe the destination. Render a link for
     navigation and a button for an action. */
  import type { Snippet } from 'svelte';
  import { crossfade, resize } from '$lib/motion/reveal';
  import Icon from '../Icon.svelte';
  import Check from './Check.svelte';

  /* Falsy is a line the row does not have, so a conditional subtitle is
     written as the condition rather than filtered at the call site. */
  type RowLine = string | false | null | undefined;

  type RowAction = {
    /** Optional where `text` carries the control instead: an icon beside
        words says the same thing twice. */
    icon?: string;
    /** Words in the button rather than a glyph, for a control whose meaning
        no icon carries - "I skipped this" on an auto-logged dose. The square target widens to fit them; `label` stays the
        accessible name either way, so the two can differ where the visible
        words only make sense next to the row they sit on. */
    text?: string;
    label: string;
    onclick: () => void;
    /** The control's own walkthrough handle, where the row's `key` is not it: a delete
        button on a photo row is `data-delete-hair-photo`, and the name is the screen's, not
        the kit's. */
    attrs?: Record<string, string>;
  };

  let {
    title,
    subtitle,
    fadeSwap = false,
    icon,
    maskImage,
    href,
    onclick,
    key,
    checked,
    static: isStatic = false,
    chevron = true,
    leading,
    trailing,
    action,
    ...rest
  }: {
    /** Optional, because a static row can be a photograph and a control
        with nothing to say between them. */
    title?: string;
    /** An array where the row states several things under its title - a
        procedure's date, its consults, its checklist. */
    subtitle?: RowLine | RowLine[];
    /** Set where the row's words come from a read that lands once while the
        row is on screen - the hub's lines, a day's drug names - so the
        swap fades the previous words off instead of cutting (the same
        asymmetry the skeleton's crossfade keeps: what replaces them is
        simply there). Off by default, and a row whose
        words tick must never set it: a fading swap on a clock is a pulse. */
    fadeSwap?: boolean;
    /** A name from $lib/components/icons.ts. */
    icon?: string;
    maskImage?: string;
    href?: string;
    onclick?: () => void;
    /** The row's own identity for the walkthrough's handle - a stable key, never the title,
        which is copy. */
    key?: string;
    /** Set, and the row is a checkbox: it announces itself as one, carries
        its state, and draws its own box at the trailing edge. The row is the control rather than holding one, so the
        whole width of it is the target and a keyboard gets one stop per
        row - which is what a list of things to tick wants, and what a row
        holding a switch deliberately does not do. */
    checked?: boolean;
    /** A row that states something and goes nowhere - the exposure counters,
        a clinician summary's lines, a Wrapped figure. It renders as a plain
        container rather than a link or a button, so it neither takes the
        press nor promises a screen that is not there. */
    static?: boolean;
    /** Off for a row that acts in place rather than going somewhere - a
        row carrying a switch, say, where a chevron would promise a screen
        that is not there. */
    chevron?: boolean;
    /** What sits where the icon disc would: a milestone's own photograph,
        a thumbnail. The disc is the default because most rows have no
        picture of themselves; a row that does should show it rather than a
        glyph standing in for it. */
    leading?: Snippet;
    /** Anything that sits before the chevron: a count, a date, a switch. */
    trailing?: Snippet;
    /** One control of the row's own, beside what the row opens - throwing
        a letter away, dropping a tryout.

        It changes the row's markup rather than sitting inside it: a button
        nested in a link is not something a browser or a screen reader can
        resolve, so the row becomes a plain container holding the two real
        controls side by side. The label travels with the handler for the
        same reason Notice's dismiss does - an icon button with no
        accessible name cannot be reached by voice or announced at all. */
    action?: RowAction;
    /** The caller's own attributes, landing on the row itself - the same contract Tile and
        Notice already have. `data-list-row` names the slot and the handle beside it names
        the thing in it, which is what lets a screen keep the walkthrough handle it has had
        in older versions while the container underneath it changes. */
    [attribute: string]: unknown;
  } = $props();

  /* Passing `checked` at all is what makes the row a checkbox; its value is
     then what the box shows. Two facts in one prop, so the discriminator is
     named once here rather than being re-derived at each of the two places
     that ask. */
  let isCheckbox = $derived(checked !== undefined);

  let subtitles = $derived(
    (Array.isArray(subtitle) ? subtitle : [subtitle]).filter(Boolean) as string[]
  );

  /* Read at the moment a line leaves, so a row that never opts in (or one
     whose words tick) pays nothing but the function call. */
  const lineOut = (node: Element) => {
    if (!fadeSwap) return { duration: 0 };
    const transition = crossfade(node);
    // Keep the outgoing words at the start of their own line slot.
    const style = (node as HTMLElement).style;
    style.top = '0';
    style.left = '0';
    return transition;
  };

  /* The arriving words fade in over the leaving ones. `crossfade` alone is the leaving
     half, so with only that the new line was painted at full opacity in the frame the words
     changed (Look back's "Femininity, 3 to 7" line on a span change). */
  const lineIn = (node: Element) =>
    fadeSwap ? crossfade(node, undefined, { direction: 'in' }) : { duration: 0 };

  /* And a row whose words cross also travels its height: the old line leaves
     out of flow, so a new line shorter or longer than it resized the row in
     one frame and moved every row under it. The More hub's lines land
     together once its reads answer, and each row gave back 9-19px at once,
     37px down the door by the second group. */
  const textTravel = (node: HTMLElement) => (fadeSwap ? resize(node) : undefined);
</script>

{#snippet body()}
  {#if leading}
    {@render leading()}
  {:else if icon}
    <span class="kit-row-ico">
      {#if maskImage}
        <span class="kit-row-icon-mask" style:mask-image={maskImage} aria-hidden="true"></span>
      {:else}
        <Icon name={icon} size={22} />
      {/if}
    </span>
  {/if}
  <span class="kit-row-text" class:fade-swap={fadeSwap} use:textTravel>
    {#if title}
      <span class="kit-row-title" data-row-title>
        {#key title}<span in:lineIn out:lineOut>{title}</span>{/key}
      </span>
    {/if}
    {#each subtitles as line, i (i)}
      <span class="kit-row-sub">
        {#key line}<span in:lineIn out:lineOut>{line}</span>{/key}
      </span>
    {/each}
  </span>
  <!-- A static row with nothing at its trailing edge gets no trailing edge:
       an empty flex item would still spend the row's gap and take that width
       off the text. Every other row has a chevron, a box or a switch there. -->
  {#if trailing || !isStatic}
    <span class="kit-row-trail">
      {#if trailing}{@render trailing()}{/if}
      {#if isCheckbox}<Check checked={checked ?? false} />{/if}
      {#if chevron && !isStatic}<Icon name="chevronRight" size={22} />{/if}
    </span>
  {/if}
{/snippet}

{#snippet rowAction(a: RowAction)}
  <button
    type="button"
    class="kit-row-act press"
    class:has-text={a.text}
    data-row-action={key}
    aria-label={a.label}
    onclick={a.onclick}
    {...a.attrs}
  >
    {#if a.icon}<Icon name={a.icon} size={18} />{/if}
    {#if a.text}<span class="kit-row-act-text">{a.text}</span>{/if}
  </button>
{/snippet}

<!-- A link where it navigates and a button where it acts, written out
     rather than resolved through <svelte:element>: the two carry different
     keyboard behaviour and different announcements, and the tag has to be
     legible to the compiler for it to check either. -->
{#if isStatic}
  <!-- Nothing to press, so nothing that announces itself as pressable. The
       action beside it, where there is one, sits directly in the row rather
       than in the split shape: there is no main half to split away from,
       and `.kit-row-act` stretches to the row's own height. -->
  <div class="kit-row is-static" data-list-row={key} {...rest}>
    {@render body()}
    {#if action}{@render rowAction(action)}{/if}
  </div>
{:else if action}
  <!-- The split shape names both halves: `data-row-action` has always been on the control,
       and `data-row-main` is here for the same reason (and the test that holds it). A row
       that acts in place from its main half - the return surface's two offers - is
       otherwise only reachable by its class, which is structure and exactly what the
       walkthrough may not grip. -->
  <div class="kit-row is-split" data-list-row={key} {...rest}>
    {#if href}
      <a class="kit-row-main" data-row-main={key} data-no-press {href} {onclick}>{@render body()}</a>
    {:else}
      <button type="button" class="kit-row-main" data-row-main={key} data-no-press {onclick}
        >{@render body()}</button
      >
    {/if}
    {@render rowAction(action)}
  </div>
{:else if href}
  <a class="kit-row" data-list-row={key} data-no-press {href} {onclick} {...rest}>{@render body()}</a>
{:else if isCheckbox}
  <!-- role="checkbox" on the button rather than a real input, which is the
       same contract Switch.svelte already carries for role="switch": the
       state is a prop, the announcement is aria-checked, and there is no
       hidden input whose :checked could disagree with either. -->
  <button
    type="button"
    class="kit-row"
    role="checkbox"
    aria-checked={checked}
    data-list-row={key}
    data-no-press
    {onclick}
    {...rest}
  >{@render body()}</button>
{:else}
  <button type="button" class="kit-row" data-list-row={key} data-no-press {onclick} {...rest}>{@render body()}</button>
{/if}

<style>
  /* Positioned line slots contain fading words; resize clips them while
     the text column travels to its replacement height. */
  .kit-row-text,
  .kit-row-title,
  .kit-row-sub {
    position: relative;
  }

  .kit-row-text.fade-swap {
    overflow: clip;
  }

  .kit-row-icon-mask {
    width: 22px;
    height: 22px;
    background: currentColor;
    mask-size: 22px 22px;
    mask-repeat: no-repeat;
  }

  .kit-row-act.has-text {
    width: auto;
    min-width: var(--touch-target);
    grid-auto-flow: column;
    gap: var(--space-1);
    padding-inline: var(--space-3);
  }

  .kit-row-act-text {
    padding: 4px 10px;
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    white-space: nowrap;
  }
</style>
