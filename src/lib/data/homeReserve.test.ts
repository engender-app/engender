import { describe, expect, it } from 'vitest';
import { foldLegacyReserves, readReserve, rememberReserve, reserveKey, type ReserveStore } from './homeReserve';

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
    expect(reserveKey('hosted-care')).toMatch(/^engender-/);
  });

  it('keeps Home the keys its reserves were first remembered under', () => {
    expect(reserveKey('above')).toBe('engender-home-reserve-above');
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

  /* A screen's own height named the screen, in plaintext, so it lives in the encrypted
     journal now. */
  it('keeps every screen but Home out of Web Storage', () => {
    const storage = memoryStorage();
    let value: Record<string, number> = {};
    const store: ReserveStore = { read: () => value, write: (next) => (value = next) };
    rememberReserve('dilation', 321.4, storage, store);
    rememberReserve('hosted-care', 88, storage, store);
    expect(storage.length).toBe(0);
    expect(value).toEqual({ dilation: 321, 'hosted-care': 88 });
    expect(readReserve('dilation', storage, store)).toBe(321);
  });

  it('reserves nothing for a screen before the journal holds its heights', () => {
    expect(readReserve('dilation', memoryStorage(), null)).toBe(0);
    expect(() => rememberReserve('dilation', 10, memoryStorage(), null)).not.toThrow();
  });

  it('moves the old screen keys into the journal and names them for deletion, Home left alone', () => {
    const storage = memoryStorage();
    storage.setItem('engender-reserve-dilation', '444');
    storage.setItem('engender-reserve-wear', 'tall');
    storage.setItem('engender-reserve-doses', '120');
    storage.setItem('engender-home-reserve-above', '200');
    const { next, keys } = foldLegacyReserves(storage, { doses: 90 });
    expect(next).toEqual({ dilation: 444, doses: 90 });
    expect(keys.sort()).toEqual(['engender-reserve-dilation', 'engender-reserve-doses', 'engender-reserve-wear']);
  });
});
