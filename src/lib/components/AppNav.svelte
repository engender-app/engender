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
  import { boxesMatch, squash, stretch, type Axis, type Box } from '$lib/motion/indicator';
  import Icon from './Icon.svelte';

  const NAV = [
    { href: '/', key: 'home', icon: 'home', label: () => m.nav_home() },
    { href: '/calendar', key: 'calendar', icon: 'calendar', label: () => m.nav_calendar() },
    { href: '/stats', key: 'stats', icon: 'stats', label: () => m.nav_stats() },
    /* ADR-0036: the tab opens the More hub, not Settings directly, but
       `key` stays 'settings' - it is what the walkthrough's data-nav-item
       selector and active-tab.ts's own table already key off, and Settings
       is still what this tab leads to, one hop further in. */
    { href: '/more', key: 'settings', icon: 'grid', label: () => m.nav_more() }
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

  /* The lit tab, as one shape that travels rather than four backgrounds that
     switch (phase 5 ticket 31). The arithmetic - when two measurements are
     the same place, and how far the shape deforms on the way - is in
     $lib/motion/indicator.ts with its own tests; what has to live here is the
     measuring, because only the DOM knows where a tab actually is.

     One table over both shapes rather than a block each. The first pass had
     two of everything - two effects, two pills, two sets of five attributes -
     and the cost showed up immediately as divergence: only the bar got a
     ResizeObserver, on the reasoning that the rail's rows stack from the top
     and stay put whatever the window does. Which is true, and irrelevant,
     because the rail is `display: none` below the shell's breakpoint. Every
     rail tab measures 0 on a phone, so the pill recorded {0, 0, 0, 0} as a
     real position and, with nothing to re-measure it, held that forever -
     widen the window and the rail's active row had no fill at all, because
     this same commit took the background off `.rail-item.is-active`. The
     `laidOut` guard below is the fix for the measurement and observing both
     navs is the fix for the recovery; one table is what stops the next
     divergence. */
  type Shape = { key: 'bar' | 'rail'; axis: Axis };

  const SHAPES: Shape[] = [
    { key: 'bar', axis: 'x' },
    { key: 'rail', axis: 'y' }
  ];

  type Pill = { box: Box; sx: number; sy: number; shown: boolean };

  const HIDDEN: Pill = { box: { x: 0, y: 0, w: 0, h: 0 }, sx: 1, sy: 1, shown: false };

  let pill = $state<Record<string, Pill>>({ bar: HIDDEN, rail: HIDDEN });
  let sliding = $state<Record<string, boolean>>({ bar: false, rail: false });
  let navs = $state<Record<string, HTMLElement | undefined>>({});
  let tabs = $state<Record<string, Record<string, HTMLElement | undefined>>>({ bar: {}, rail: {} });

  /* A tab that is not laid out has no position to travel to or from. Both
     navs are in the DOM at every width and one of them is always display:
     none (app.css), so this is the normal state of one of them rather than an
     edge case, and 0 is not a place. */
  function laidOut(el: HTMLElement | undefined): el is HTMLElement {
    return !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  /* offsetLeft/offsetTop rather than getBoundingClientRect: both navs are the
     offsetParent of their own tabs, so these already are the numbers the
     pill's own `translate` wants, with no scroll position or ancestor
     transform mixed in. A rect would have to be subtracted from the nav's own
     rect to get back here, and the rail scrolls. */
  function place(prev: Pill, el: HTMLElement | undefined, axis: Axis, animate: boolean) {
    if (!laidOut(el)) return { next: prev.shown ? { ...prev, shown: false } : prev, moved: false };
    const box = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    if (prev.shown && boxesMatch(prev.box, box)) return { next: prev, moved: false };
    /* Two placements that are not slides. The first one, because the app does
       not slide the pill into the tab you opened it on - it starts there. And
       a re-measure after a nav changed size, because a rotation is not a
       navigation: the tab under the pill never changed, so replaying the
       travel would be the app claiming something happened. That second case
       is also how a nav that was display: none arrives at a real position. */
    if (!prev.shown || !animate) return { next: { box, sx: 1, sy: 1, shown: true }, moved: false };
    const peak = stretch(prev.box, box, axis);
    const thin = squash(peak);
    const across = axis === 'x';
    return {
      next: { box, sx: across ? peak : thin, sy: across ? thin : peak, shown: true },
      moved: true
    };
  }

  function measure(shape: Shape, animate: boolean) {
    const { next, moved } = place(pill[shape.key], tabs[shape.key][activeKey], shape.axis, animate);
    if (next !== pill[shape.key]) pill[shape.key] = next;
    /* Cleared as well as set. A pill that goes unshown mid-slide never gets
       its animationend, because a display: none element fires none, and the
       class would otherwise still be on it when the nav came back. */
    if (moved) sliding[shape.key] = true;
    else if (!next.shown && sliding[shape.key]) sliding[shape.key] = false;
  }

  $effect(() => {
    for (const shape of SHAPES) measure(shape, true);
  });

  /* Both navs, and the rail is the one that needs it most: it goes from
     display: none to laid out when the window crosses the shell's breakpoint,
     which changes its size from nothing to something and is the only signal
     that its rows now have positions worth reading. */
  $effect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      for (const shape of SHAPES) measure(shape, false);
    });
    for (const shape of SHAPES) {
      const nav = navs[shape.key];
      if (nav) observer.observe(nav);
    }
    return () => observer.disconnect();
  });
</script>

<!-- Behind the tabs in source order and in paint order, so a tab's icon and
     its label sit on top of the shape that lights them. -->
{#snippet lit(shape: 'bar' | 'rail')}
  <span
    class="nav-pill"
    class:is-shown={pill[shape].shown}
    class:is-sliding={sliding[shape]}
    aria-hidden="true"
    data-nav-pill={shape}
    style:--pill-x="{pill[shape].box.x}px"
    style:--pill-y="{pill[shape].box.y}px"
    style:--pill-w="{pill[shape].box.w}px"
    style:--pill-h="{pill[shape].box.h}px"
    style:--pill-sx={pill[shape].sx}
    style:--pill-sy={pill[shape].sy}
    onanimationend={() => (sliding[shape] = false)}
  ></span>
{/snippet}

<nav bind:this={navs.rail} class="app-rail" data-app-rail aria-label={m.nav_main()}>
  <!-- The disguised name, same as the tab title and the launcher entry
       (F24): the rail is the one piece of chrome that says the app's name
       out loud, so it follows the preference like every other surface that
       does. -->
  <div class="rail-brand">
    <span class="brand-mark"><Icon name="brand" size={22} /></span><span translate="no"
      >{prefs.disguise ? 'Notes' : m.app_name()}</span
    >
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
        <span
          class="nav-add-glyph"
          class:is-shown={mark === name}
          data-add-mark={name}
          data-shown={mark === name ? '' : undefined}><Icon {name} size={20} /></span
        >
      {/each}
    </span>
    <span>{m.quick_add_title()}</span>
  </button>
  {@render lit('rail')}
  {#each NAV as item (item.key)}
    <a
      bind:this={tabs.rail[item.key]}
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
    bind:this={tabs.bar[item.key]}
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

<nav
  bind:this={navs.bar}
  class="app-nav"
  class:is-fan-open={ui.chooserOpen}
  data-app-nav
  aria-label={m.nav_main()}
>
  {@render lit('bar')}
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
        <span
          class="nav-add-glyph"
          class:is-shown={mark === name}
          data-add-mark={name}
          data-shown={mark === name ? '' : undefined}><Icon {name} size={26} /></span
        >
      {/each}
    </span>
  </button>
  {#each TRAILING as item (item.key)}{@render tab(item)}{/each}
</nav>
