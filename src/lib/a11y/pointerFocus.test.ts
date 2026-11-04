import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { trackPointerFocus } from './pointerFocus';

function fakeDocument() {
  const handlers = new Map<string, (e: unknown) => void>();
  const doc = {
    documentElement: { dataset: {} as Record<string, string | undefined> },
    addEventListener: (type: string, fn: (e: unknown) => void) => void handlers.set(type, fn),
    removeEventListener: (type: string) => void handlers.delete(type),
  };
  return { doc: doc as unknown as Document, root: doc.documentElement, fire: (type: string, e: object = {}) => handlers.get(type)?.(e), handlers };
}

describe('trackPointerFocus', () => {
  it('marks the document as pointer-driven after a press, so a tapped field wears no ring', () => {
    const { doc, root, fire } = fakeDocument();
    trackPointerFocus(doc);
    expect(root.dataset.input).toBeUndefined();
    fire('pointerdown');
    expect(root.dataset.input).toBe('pointer');
  });

  it('typing after a tap keeps the field ringless, only Tab brings the ring back', () => {
    const { doc, root, fire } = fakeDocument();
    trackPointerFocus(doc);
    fire('pointerdown');
    fire('keydown', { key: 'a' });
    expect(root.dataset.input).toBe('pointer');
    fire('keydown', { key: 'Tab' });
    expect(root.dataset.input).toBeUndefined();
  });

  it('stops listening when torn down', () => {
    const { doc, handlers } = fakeDocument();
    trackPointerFocus(doc)();
    expect(handlers.size).toBe(0);
  });
});

describe('pointer focus wiring', () => {
  const read = (p: string) => readFileSync(new URL('../../../' + p, import.meta.url), 'utf8');
  it('the shell tracks it and the stylesheet drops the field ring for it', () => {
    expect(read('src/routes/+layout.svelte')).toContain('trackPointerFocus()');
    expect(read('src/lib/styles/components.css')).toContain(":root[data-input='pointer'] :is(input, textarea):focus-visible { outline: none; }");
  });
});
