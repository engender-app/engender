import { afterEach, expect, test, vi } from 'vitest';
import { journalTextAutocomplete } from './platform';

afterEach(() => vi.unstubAllGlobals());

test('journal text disables browser form history, including mobile browsers', () => {
  expect(journalTextAutocomplete()).toBe('off');
  vi.stubGlobal('window', {});
  expect(journalTextAutocomplete()).toBe('off');
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'web' } });
  expect(journalTextAutocomplete()).toBe('off');
});

test('the Android shell keeps its existing journal field and keyboard behavior', () => {
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });
  expect(journalTextAutocomplete()).toBeUndefined();
});
