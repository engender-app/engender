<script lang="ts">
  /* A row of the list card: an icon disc, a title, an optional subtitle and
     a chevron.

     The subtitle is optional because subtitles are earned, not standard
     (DIRECTION.md 3b). Plenty of rows have nothing to put there. The More
     hub used to be the example of that and is now the example of earning
     it: every one of its rows carries a second line, either a reading of
     when its area was last written to or a short line about what is behind
     it (phase 8 UX ticket 02, and the spec's user story 13 - "each row to
     tell me what is behind it, so that navigating is also reading").

     Renders as a link where it navigates and as a button where it acts, so
     a destination is a destination to the keyboard and to the screen reader
     as well as to the eye. */
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import Check from './Check.svelte';

  /* Falsy is a line the row does not have, so a conditional subtitle is
     written as the condition rather than filtered at the call site. */
  type RowLine = string | false | null | undefined;

  type RowAction = {
    icon: string;
    label: string;
    onclick: () => void;
    /** The control's own walkthrough handle, where the row's `key` is not
        it: a delete button on a photo row is `data-delete-hair-photo`, and
        the name is the screen's, not the kit's (ADR-0029). */
    attrs?: Record<string, string>;
  };

  let {
    title,
    subtitle,
    icon,
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
    /** A name from $lib/components/icons.ts. */
    icon?: string;
    href?: string;
    onclick?: () => void;
    /** The row's own identity for the walkthrough's handle (ADR-0029) -
        a stable key, never the title, which is copy. */
    key?: string;
    /** Set, and the row is a checkbox: it announces itself as one, carries
        its state, and draws its own box at the trailing edge (phase 5
        ticket 35). The row is the control rather than holding one, so the
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
        a letter away, dropping a tryout (phase 5 UX ticket 25).

        It changes the row's markup rather than sitting inside it: a button
        nested in a link is not something a browser or a screen reader can
        resolve, so the row becomes a plain container holding the two real
        controls side by side. The label travels with the handler for the
        same reason Notice's dismiss does - an icon button with no
        accessible name cannot be reached by voice or announced at all. */
    action?: RowAction;
    /** The caller's own attributes, landing on the row itself - the same
        contract Tile and Notice already have. `data-list-row` names the
        slot and the handle beside it names the thing in it, which is what
        lets a screen keep the walkthrough handle it has had since phase 4
        while the container underneath it changes (ADR-0029). */
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
</script>

{#snippet body()}
  {#if leading}
    {@render leading()}
  {:else if icon}
    <span class="kit-row-ico"><Icon name={icon} size={22} /></span>
  {/if}
  <span class="kit-row-text">
    {#if title}<span class="kit-row-title">{title}</span>{/if}
    {#each subtitles as line}<span class="kit-row-sub">{line}</span>{/each}
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
    data-row-action={key}
    aria-label={a.label}
    onclick={a.onclick}
    {...a.attrs}
  >
    <Icon name={a.icon} size={18} />
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
  <!-- The split shape names both halves: `data-row-action` has always been
       on the control, and `data-row-main` is here for the same reason
       (ADR-0029, and the test that holds it). A row that acts in place from
       its main half - the return surface's two offers - is otherwise only
       reachable by its class, which is structure and exactly what the
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
