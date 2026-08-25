<script lang="ts">
  /* The app's navigation, both of its shapes (phase 5 ticket 18).

     One component rather than two blocks in +layout.svelte, which is what
     the layout carried before: a bottom bar and a left rail, each with its
     own copy of the same four destinations and its own `activeKey ===` test
     against the same table. Two copies of a list is how the fourth tab's
     href and its internal key drift apart, and ADR-0036 is specifically
     about those two disagreeing on purpose - `href` is /more and `key` is
     'settings' - which is exactly the kind of deliberate oddity a second
     copy quietly normalises away.

     Which shape renders is a container query in app.css, not a branch here.
     Both are in the DOM at every width and one of them is display:none, so
     there is no resize handler, no measurement, and no flash of the wrong
     navigation on a slow first paint. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { activeTabKey } from '$lib/navigation/active-tab';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import Icon from './Icon.svelte';

  const NAV = [
    { href: '/', key: 'home', icon: 'home', label: () => m.nav_home() },
    { href: '/calendar', key: 'calendar', icon: 'calendar', label: () => m.nav_calendar() },
    { href: '/stats', key: 'stats', icon: 'stats', label: () => m.nav_stats() },
    /* ADR-0036: the tab opens the More hub, not Settings directly, but
       `key` stays 'settings' - it is what the walkthrough's data-nav-item
       selector and active-tab.ts's own table already key off, and Settings
       is still what this tab leads to, one hop further in. */
    { href: '/more', key: 'settings', icon: 'dots', label: () => m.nav_more() }
  ];

  /* The bar splits its four tabs around the add button, so the button sits
     in the middle of five cells rather than floating over a gap. */
  const MARKS = ['plus', 'check', 'alert'];

  const LEADING = NAV.slice(0, 2);
  const TRAILING = NAV.slice(2);

  let activeKey = $derived(activeTabKey(page.url.pathname));

  /* Which mark the add control is wearing. All three are rendered and
     stacked rather than swapped, because swapping one <Icon> for another is
     a cut: the alert vanished and the plus was simply there, which is the
     one moment in this whole sequence that had no motion in it at all.
     Stacked, the outgoing mark can fade and shrink while the incoming one
     arrives, and CSS does the tween with no keyed block or JS transition. */
  let mark = $derived(ui.chooserFailed ? 'alert' : ui.chooserCaught ? 'check' : 'plus');

  /* Quick add opens on the way down, not on click, because the press and
     the tap are the same gesture: holding it and sliding onto a target is
     one continuous move, and a fan that waited for the click would not be
     under the finger yet when the finger started moving. QuickAdd.svelte
     listens on the window from there and resolves whatever the pointer is
     over when it comes up.

     The click that follows a pointer sequence is then swallowed, or the
     control would toggle twice per tap. A keyboard Enter fires a click with
     no pointer sequence in front of it, which is why the click handler is
     still what opens the fan for a keyboard. */
  let openedByPointer = false;

  function addPointerDown() {
    openedByPointer = true;
    if (ui.chooserOpen) {
      ui.chooserOpen = false;
      return;
    }
    ui.chooserOpen = true;
    ui.chooserPressing = true;
  }

  function addClick() {
    if (openedByPointer) {
      openedByPointer = false;
      return;
    }
    ui.chooserOpen = !ui.chooserOpen;
  }
</script>

<nav class="app-rail" data-app-rail aria-label={m.nav_main()}>
  <!-- The disguised name, same as the tab title and the launcher entry
       (F24): the rail is the one piece of chrome that says the app's name
       out loud, so it follows the preference like every other surface that
       does. -->
  <div class="rail-brand">
    <span class="brand-mark"></span><span translate="no">{prefs.disguise ? 'Notes' : m.app_name()}</span>
  </div>
  <button
    class="rail-add press-add"
    class:is-catching={ui.chooserConfirming}
    class:is-refusing={ui.chooserFailed}
    data-rail-add
    aria-expanded={ui.chooserOpen}
    onpointerdown={addPointerDown}
    onclick={addClick}
  >
    <span class="nav-add-mark" class:is-open={ui.chooserOpen && mark === 'plus'}>
      {#each MARKS as name (name)}
        <span class="nav-add-glyph" class:is-shown={mark === name}><Icon {name} size={20} /></span>
      {/each}
    </span>
    <span>{m.quick_add_title()}</span>
  </button>
  {#each NAV as item (item.key)}
    <a
      class="rail-item press"
      class:is-active={activeKey === item.key}
      data-rail-item={item.key}
      href={item.href}
      aria-current={activeKey === item.key ? 'page' : undefined}
    >
      <Icon name={item.icon} size={22} /><span>{item.label()}</span>
    </a>
  {/each}
</nav>

<!-- The indicator is on the anchor, not on a wrapper inside it, so it covers
     the icon and the label as one shape (DIRECTION.md). A pill behind the
     icon alone leaves the label sitting outside the lit area, which reads as
     two elements rather than one tab. -->
{#snippet tab(item: (typeof NAV)[number])}
  <a
    class="nav-item press"
    class:is-active={activeKey === item.key}
    data-nav-item={item.key}
    href={item.href}
    aria-current={activeKey === item.key ? 'page' : undefined}
  >
    <span class="nav-icon"><Icon name={item.icon} size={24} /></span>
    <span class="nav-label" data-nav-label>{item.label()}</span>
  </a>
{/snippet}

<nav class="app-nav" class:is-fan-open={ui.chooserOpen} data-app-nav aria-label={m.nav_main()}>
  {#each LEADING as item (item.key)}{@render tab(item)}{/each}
  <!-- The add action's own animation (spec 04), and it names its tier
       rather than inventing a curve. The button does not explode: it
       becomes the thing it opened. The plus turns 45 degrees into a cross
       while the fan is up, which is tier 2 - the control the fan came out
       of is the control that puts it away, and the turn is what says so.
       Transform only. Under reduced motion the turn stops being a turn and
       the cross is simply there, which is the substitution: what goes is
       the movement, not the cue that this button now closes what it
       opened. -->
  <button
    class="nav-add press-add"
    class:is-catching={ui.chooserConfirming}
    class:is-refusing={ui.chooserFailed}
    data-nav-fab
    aria-label={m.quick_add_title()}
    aria-expanded={ui.chooserOpen}
    onpointerdown={addPointerDown}
    onclick={addClick}
  >
    <span class="nav-add-mark" class:is-open={ui.chooserOpen && mark === 'plus'}>
      {#each MARKS as name (name)}
        <span class="nav-add-glyph" class:is-shown={mark === name}><Icon {name} size={26} /></span>
      {/each}
    </span>
  </button>
  {#each TRAILING as item (item.key)}{@render tab(item)}{/each}
</nav>
