import { describe, expect, it } from 'vitest';

import { openApp } from './appOpening';

/** The blind's own element, as the carry treats it: a style bag. */
const el = () => {
  const props = new Map<string, string>();
  const style: any = {
    props,
    setProperty(name: string, value: string) {
      props.set(name, value);
    },
    removeProperty(name: string) {
      props.delete(name);
    }
  };
  return { style };
};

/** A document with one field, a root that records what is stamped on it, and
    a `startViewTransition` that hands back the callback so a test can drive
    the frames itself. */
function fakeDocument({ present = true } = {}) {
  const blind = el();
  const field = {
    ...el(),
    getBoundingClientRect: () => ({ height: 78 }),
    querySelector: () => blind,
    querySelectorAll: () => []
  };
  const root = {
    dataset: {} as Record<string, string>,
    style: {
      props: new Map<string, string>(),
      setProperty(name: string, value: string) {
        this.props.set(name, value);
      },
      removeProperty(name: string) {
        this.props.delete(name);
      }
    }
  };
  let settle: (() => void) | null = null;
  let reject: (() => void) | null = null;
  const started: Array<() => Promise<void>> = [];
  const doc = {
    documentElement: root,
    querySelectorAll: () => [field],
    querySelector: () => ({ scrollTop: 0 }),
    ...(present
      ? {
          startViewTransition(update: () => Promise<void>) {
            started.push(update);
            return {
              finished: new Promise<void>((resolve, no) => {
                settle = resolve;
                reject = () => no(new Error('superseded'));
              })
            };
          }
        }
      : {})
  };
  return {
    blind,
    root,
    as: doc as unknown as Document,
    /** One frame of the transition: the browser calling the update callback. */
    async update() {
      await started[0]();
    },
    started,
    finish: () => settle?.(),
    supersede: () => reject?.()
  };
}

describe('the app opening', () => {
  it('commits inside the transition, never before it', async () => {
    const doc = fakeDocument();
    let committed = false;
    openApp(() => (committed = true), doc.as);
    /* The point of the whole module: the gate is still on screen when the
       browser takes its photograph, so the commit cannot have run yet. */
    expect(committed).toBe(false);
    expect(doc.started).toHaveLength(1);
    await doc.update();
    expect(committed).toBe(true);
  });

  it('names the gate\'s blind before the old side is captured', () => {
    const doc = fakeDocument();
    openApp(() => {}, doc.as);
    expect(doc.blind.style.viewTransitionName).toBe('blind');
  });

  it('publishes --blind-from before capture and the settle delta once the app has mounted', async () => {
    const doc = fakeDocument();
    openApp(() => {}, doc.as);
    /* Published before the outgoing capture so the blind-slide keyframe
       does not fallback to 0px (Alicja, 2026-09-10). The delta between the
       two heights is published in swap() once the incoming screen has mounted. */
    expect(doc.root.style.props.get('--blind-from')).toBe('78px');
    expect(doc.root.style.props.get('--blind-delta')).toBeUndefined();
    await doc.update();
    expect(doc.root.style.props.get('--blind-delta')).toBeDefined();
  });

  it('stamps the pattern for app.css and takes it off at the end', async () => {
    const doc = fakeDocument();
    openApp(() => {}, doc.as);
    expect(doc.root.dataset.nav).toBe('open');
    await doc.update();
    doc.finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(doc.root.dataset.nav).toBeUndefined();
    expect(doc.blind.style.viewTransitionName).toBe('');
  });

  it('gives the blind back when the transition is superseded, not only when it settles', async () => {
    /* Lock-on-leave landing on the frame the app opened is a real way to
       reach this, and a name left on an element makes it a stacking context
       for the rest of the session. */
    const doc = fakeDocument();
    openApp(() => {}, doc.as);
    await doc.update();
    doc.supersede();
    await Promise.resolve();
    await Promise.resolve();
    expect(doc.root.dataset.nav).toBeUndefined();
    expect(doc.blind.style.viewTransitionName).toBe('');
  });

  it('commits straight through where the browser has no view transitions', () => {
    const doc = fakeDocument({ present: false });
    let committed = false;
    openApp(() => (committed = true), doc.as);
    expect(committed).toBe(true);
    expect(doc.root.dataset.nav).toBeUndefined();
  });

  it('commits with no document at all, which is what the server has', () => {
    let committed = false;
    openApp(() => (committed = true), undefined);
    expect(committed).toBe(true);
  });
});
