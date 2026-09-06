/* Browser-tier check for phase 8 features ticket 66: a long list renders a
   batch at a time and grows as it is scrolled.

   Here rather than in the Node tier because what has to be shown is an
   IntersectionObserver firing against a real scroll region under a real
   layout - the one part of this feature no arithmetic test can reach. The
   counting itself is node-tested in
   src/lib/components/kit/batchedList.test.ts, and this asserts the two
   things that only exist in a browser: that scrolling grows the list without
   anything being pressed, and that the control at the end grows it too.

   The stylesheets are imported the way gates-mount.ts imports them, in
   +layout.svelte's order, because a row with no height makes a scroll region
   that never scrolls and an observer that fires immediately - the fixture
   would pass while measuring nothing. */
import { mountInto, publishFixture } from './mount.ts';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/styles/kit.css';
import Fixture from './batched-list-fixture.svelte';

const TOTAL = 100;
const items = Array.from({ length: TOTAL }, (_, index) => ({
  id: `row-${index}`,
  title: `Row ${index}`
}));

/** Waits for `predicate` to hold, up to `timeoutMs`, and answers whether it
    did. Polled on a timer rather than on animation frames: a backgrounded
    page never runs rAF, and this tier's browser is headless. */
async function until(predicate: () => boolean, timeoutMs = 4000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return predicate();
}

publishFixture('batched-list', async () => {
  const target = document.createElement('div');
  document.body.append(target);
  mountInto(Fixture, { items }, target);

  const rendered = () => target.querySelectorAll('[data-probe-row]').length;
  const control = () => target.querySelector<HTMLButtonElement>('[data-batched-more]');
  const region = () => target.querySelector<HTMLElement>('[data-app-scroll-region]');

  await until(() => rendered() > 0);
  const onArrival = rendered();

  /* Scrolled to the end of what is rendered, which is where somebody
     reading down the list ends up. Nothing is pressed. */
  const scroller = region();
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  const grewOnScroll = await until(() => rendered() > onArrival);
  const afterScroll = rendered();

  /* And the control does the same job for a keyboard, or for anyone whose
     next row the browser's own find cannot see yet. */
  control()?.click();
  const grewOnPress = await until(() => rendered() > afterScroll);
  const afterPress = rendered();

  /* Kept scrolling to the end until the list runs out, so the exhausted
     state is a state this actually reaches rather than one nobody checks. */
  for (let attempt = 0; attempt < 12 && rendered() < TOTAL; attempt += 1) {
    const el = region();
    if (el) el.scrollTop = el.scrollHeight;
    await until(() => rendered() >= TOTAL, 500);
  }

  /* Ticket 67: a deep link's row, past the first batch, rendered in one step
     rather than by growing a batch at a time. A second, independent mount -
     the fixture's own `key` keeps its remembered count apart from the one
     above, the same way a screen with two batched lists does. */
  const FOCUS_INDEX = 47; // second batch of thirty: rows 30-59.
  const focusTarget = document.createElement('div');
  document.body.append(focusTarget);
  const focusRendered = () => focusTarget.querySelectorAll('[data-probe-row]').length;
  const focusMount = mountInto(Fixture, { items, key: 'probe-focus', focusIndex: FOCUS_INDEX }, focusTarget);
  await until(() => focusRendered() > 0);
  const onFocusArrival = focusRendered();
  await focusMount.remove();
  focusTarget.remove();

  /* Left that screen and come back with no link in hand - the count a link
     expanded to must not have stuck around for this, only whatever was
     actually grown and remembered. */
  const returnTarget = document.createElement('div');
  document.body.append(returnTarget);
  const returnRendered = () => returnTarget.querySelectorAll('[data-probe-row]').length;
  const returnMount = mountInto(Fixture, { items, key: 'probe-focus' }, returnTarget);
  await until(() => returnRendered() > 0);
  const onReturnAfterFocus = returnRendered();
  await returnMount.remove();
  returnTarget.remove();

  return {
    total: TOTAL,
    onArrival,
    grewOnScroll,
    afterScroll,
    grewOnPress,
    afterPress,
    exhaustedCount: rendered(),
    controlGoneWhenExhausted: control() === null,
    onFocusArrival,
    onReturnAfterFocus
  };
});
