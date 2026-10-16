// Inject measured outcomes into the real guard scripts, retaining their reporter.
import { registerHooks } from 'node:module';
import { EventEmitter } from 'node:events';
export { createReporter } from '../browser-harness.mjs';

const outcome = process.env.GUARD_OUTCOME;
const fixture = import.meta.url;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/\/(care-lane-labels|debrief-offer-check)\.mjs$/.test(context.parentURL ?? '') &&
      ['vite', './browser-harness.mjs', 'node:child_process'].includes(specifier)) {
      return { url: fixture, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

export const preview = async () => ({
  httpServer: { address: () => ({ port: 1234 }) },
  close: async () => console.log('fixture server closed')
});
export function spawn() {
  const child = new EventEmitter();
  queueMicrotask(() => child.emit('exit', 0));
  return child;
}
export async function fillDate() {}
export async function launchChromium() {
  return {
    close: async () => console.log('fixture browser closed'),
    newPage: async () => ({
      on(name, handler) {
        if (name === 'pageerror' && outcome === 'page-error') queueMicrotask(() => handler(new Error('injected page error')));
      },
      goto: async () => {},
      waitForURL: async () => {},
      waitForTimeout: async () => {},
      waitForSelector: async () => { if (outcome === 'boot-error') throw new Error('injected boot error'); },
      close: async () => console.log('fixture page closed'),
      screenshot: async () => {},
      evaluate: async () => [{
        lane: 'synthetic', width: 330,
        labels: [0, 1].map(i => ({
          kind: 'taken', what: 'synthetic', when: 'today', row: 0,
          whatWidth: 20, whenWidth: 20,
          left: i * (outcome === 'failed' ? 10 : 30),
          right: i * (outcome === 'failed' ? 10 : 30) + 20
        }))
      }],
      locator: selector => ({
        count: async () => ['[data-leave-setup]', '[data-debrief-offer]'].includes(selector) ? 0 : 1,
        click: async () => { if (outcome === 'selector-error') throw new Error('injected selector error'); },
        fill: async () => { if (outcome === 'selector-error') throw new Error('injected selector error'); },
        waitFor: async () => {},
        isVisible: async () => outcome !== 'failed',
        getAttribute: async () => '/entry/new/today?debriefFor=synthetic-id',
        inputValue: async () => 'synthetic debrief'
      })
    })
  };
}
