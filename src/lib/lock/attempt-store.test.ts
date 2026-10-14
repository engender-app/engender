import { afterEach, expect, test, vi } from 'vitest';
import { localStorageAttempts } from './attempt-store';

const key = 'engender-pin-attempts';
afterEach(() => vi.unstubAllGlobals());

function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => void values.set(name, value),
    removeItem: (name: string) => void values.delete(name)
  });
  return values;
}

test('attempts round-trip through the owned key and clear only that key', () => {
  const values = storage();
  values.set('unrelated', 'keep');
  const attempts = localStorageAttempts();
  expect(attempts.read()).toBeNull();
  attempts.write({ wrongAttempts: 3, acceptingFrom: 99 });
  expect(values.get(key)).toBe('{"wrongAttempts":3,"acceptingFrom":99}');
  expect(localStorageAttempts().read()).toEqual({ wrongAttempts: 3, acceptingFrom: 99 });
  attempts.clear();
  expect(values.has(key)).toBe(false);
  expect(values.get('unrelated')).toBe('keep');
  expect(attempts.read()).toBeNull();
});

test('a negative stored count is clamped without changing its pending marker', () => {
  const values = storage();
  values.set(key, '{"wrongAttempts":-5,"acceptingFrom":7}');
  expect(localStorageAttempts().read()).toEqual({ wrongAttempts: 0, acceptingFrom: 7 });
  values.set(key, '{"wrongAttempts":0,"acceptingFrom":0}');
  expect(localStorageAttempts().read()).toEqual({ wrongAttempts: 0, acceptingFrom: 0 });
});

test.each([
  '', 'not json', 'null', '{}',
  '{"wrongAttempts":"3","acceptingFrom":1}',
  '{"wrongAttempts":null,"acceptingFrom":1}',
  '{"wrongAttempts":1e999,"acceptingFrom":1}',
  '{"wrongAttempts":1}',
  '{"wrongAttempts":1,"acceptingFrom":"1"}',
  '{"wrongAttempts":1,"acceptingFrom":null}',
  '{"wrongAttempts":1,"acceptingFrom":1e999}'
])('malformed stored attempts are absent: %s', (raw) => {
  storage().set(key, raw);
  expect(localStorageAttempts().read()).toBeNull();
});

test('unavailable storage does not throw while reading, writing or clearing attempts', () => {
  vi.stubGlobal('localStorage', {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); },
    removeItem() { throw new Error('storage unavailable'); }
  });
  const attempts = localStorageAttempts();
  expect(attempts.read()).toBeNull();
  expect(() => attempts.write({ wrongAttempts: 1, acceptingFrom: 1 })).not.toThrow();
  expect(() => attempts.clear()).not.toThrow();
});
