/* NAV-005: `smartBack` is the fix for Search and Day hardcoding where "back"
   goes, landing on a screen the user never visited. `goto` is mocked here
   because this Node tier has no SvelteKit alias configured for `$app/*` (it
   runs plain `.ts` modules, not routes) - the two branches below are the
   whole of the decision `smartBack` makes, so they are what a unit test can
   usefully isolate without a real browser. The end-to-end case - does the
   button actually land on the right screen in the running app - belongs to
   `tests/walkthrough.test.mjs`, which drives a real build. */
import { afterEach, describe, expect, it, vi } from 'vitest';

const goto = vi.fn();
vi.mock('$app/navigation', () => ({ goto }));

const { smartBack } = await import('./smart-back.ts');

afterEach(() => {
  goto.mockClear();
  vi.unstubAllGlobals();
});

describe('smartBack', () => {
  it('goes back through history when there is an in-app entry behind this one', () => {
    const back = vi.fn();
    vi.stubGlobal('history', { state: { 'sveltekit:index': 1 }, back });

    smartBack('/calendar');

    expect(back).toHaveBeenCalledOnce();
    expect(goto).not.toHaveBeenCalled();
  });

  it('falls back to the given route on the first in-app entry (a deep link or a reload)', () => {
    const back = vi.fn();
    vi.stubGlobal('history', { state: { 'sveltekit:index': 0 }, back });

    smartBack('/calendar');

    expect(goto).toHaveBeenCalledWith('/calendar');
    expect(back).not.toHaveBeenCalled();
  });

  it('falls back when there is no SvelteKit history state at all', () => {
    const back = vi.fn();
    vi.stubGlobal('history', { state: null, back });

    smartBack('/calendar');

    expect(goto).toHaveBeenCalledWith('/calendar');
    expect(back).not.toHaveBeenCalled();
  });
});
