import { describe, expect, it } from 'vitest';
import { readReserve, rememberReserve, reserveKey } from './homeReserve';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value))
  };
}

describe('the home reserve', () => {
  it('keeps its key under the prefix reset clears', () => {
    expect(reserveKey('above')).toMatch(/^engender-/);
    expect(reserveKey('measurements-now')).toMatch(/^engender-/);
  });

  it('reads nothing as zero, which reserves no space', () => {
    expect(readReserve('above', memoryStorage())).toBe(0);
  });

  it('gives back the height it was told, per slot', () => {
    const store = memoryStorage();
    rememberReserve('above', 412.6, store);
    rememberReserve('below', 90, store);
    expect(readReserve('above', store)).toBe(413);
    expect(readReserve('below', store)).toBe(90);
  });

  it('treats a corrupt or absurd value as nothing rather than a height', () => {
    const store = memoryStorage();
    store.setItem(reserveKey('above'), 'tall');
    expect(readReserve('above', store)).toBe(0);
    store.setItem(reserveKey('above'), '-40');
    expect(readReserve('above', store)).toBe(0);
    store.setItem(reserveKey('above'), '99999');
    expect(readReserve('above', store)).toBe(0);
  });

  it('survives a storage that throws', () => {
    const throwing = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      }
    } as Storage;
    expect(() => rememberReserve('above', 100, throwing)).not.toThrow();
    expect(readReserve('above', throwing)).toBe(0);
  });
});
