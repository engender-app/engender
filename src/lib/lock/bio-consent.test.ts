import { test, expect } from 'vitest';
import { bioGateDecision } from './bio-consent.ts';

test('never answered means ask, not auto and not manual', () => {
  expect(bioGateDecision(null)).toBe('ask');
});

test('an explicit yes means auto', () => {
  expect(bioGateDecision(true)).toBe('auto');
});

test('an explicit no means manual, never auto', () => {
  expect(bioGateDecision(false)).toBe('manual');
});
