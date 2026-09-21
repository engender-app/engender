/* Browser-tier check for ticket 156: `blindEdge` reads the border box but
   used to subscribe to the content box, so a change to a field's padding
   alone never fired the observer callback. A real ResizeObserver's box
   semantics cannot be faked in a node-tier test - this drives the real
   API against a real element, changing only padding, and reads
   `--blind-edge` off the DOM before and after. */
import { blindEdge } from '../../src/lib/motion/stepBlind.ts';
import { publish } from '../probe-handshake.mjs';

const NAME = 'blind-edge-probe';

function edgeVar(host: HTMLElement) {
  return getComputedStyle(host).getPropertyValue('--blind-edge').trim();
}

function nextObserverTick() {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

async function run() {
  const host = document.createElement('div');
  const field = document.createElement('div');
  field.style.boxSizing = 'border-box';
  field.style.width = '200px';
  field.style.whiteSpace = 'nowrap';
  field.style.paddingTop = '10px';
  field.style.paddingBottom = '10px';
  field.textContent = 'question';
  host.appendChild(field);
  document.body.appendChild(host);

  const action = blindEdge(field);
  await nextObserverTick();
  const before = { edge: edgeVar(host), height: field.getBoundingClientRect().height };

  /* Vertical padding only: it cannot re-wrap the text (nowrap, and only
     top/bottom change), so the content box's height is untouched while
     the border box grows - the exact shape of the ticket's defect. A
     shorthand `padding` change would also touch left/right and could
     re-wrap the text, which would move the content box too and mask the
     bug this probe exists to catch. */
  field.style.paddingTop = '40px';
  field.style.paddingBottom = '40px';
  await nextObserverTick();
  const afterPaddingChange = { edge: edgeVar(host), height: field.getBoundingClientRect().height };

  (action as { destroy?: () => void } | undefined)?.destroy?.();
  publish(NAME, { before, afterPaddingChange });
}

run();
