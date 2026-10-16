import { afterEach, expect, test, vi } from 'vitest';
import type { Journal } from '../journal/journal';
import { admitHiddenReads, pendingAdmissions, promoteDoorReads } from './hiddenReadAdmission';

afterEach(() => vi.useRealTimers());

test('visible reads run immediately while hidden reads wait at most 75 ms', async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue([]);
  const journal = { entries: { noteEntries: read } } as unknown as Journal;
  const visible = admitHiddenReads(journal, () => true, () => true);
  const hidden = admitHiddenReads(journal, () => false, () => true);
  await visible.entries.noteEntries();
  const waiting = hidden.entries.noteEntries();
  expect(read).toHaveBeenCalledTimes(1);
  expect(pendingAdmissions()).toBe(1);
  await vi.advanceTimersByTimeAsync(74);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await waiting;
  expect(read).toHaveBeenCalledTimes(2);
  expect(pendingAdmissions()).toBe(0);
});

test('a newly visible door releases its reads without waiting for the timer', async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue([]);
  const journal = { entries: { noteEntries: read } } as unknown as Journal;
  let visible = false;
  const active = () => visible;
  const hidden = admitHiddenReads(journal, active, () => true);
  const waiting = hidden.entries.noteEntries();
  visible = true;
  promoteDoorReads(active);
  await waiting;
  expect(read).toHaveBeenCalledTimes(1);
  expect(pendingAdmissions()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

test('a superseded generation never starts delayed repository reads', async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue([]);
  const journal = { entries: { noteEntries: read } } as unknown as Journal;
  let current = true;
  const hidden = admitHiddenReads(journal, () => false, () => current);
  const waiting = expect(hidden.entries.noteEntries()).rejects.toThrow('superseded hidden read');
  current = false;
  await vi.advanceTimersByTimeAsync(75);
  await waiting;
  expect(read).not.toHaveBeenCalled();
  expect(pendingAdmissions()).toBe(0);
});


test('all operations in one attempt share a single admission bound', async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue([]);
  const journal = { entries: { noteEntries: read } } as unknown as Journal;
  const hidden = admitHiddenReads(journal, () => false, () => true);
  const first = hidden.entries.noteEntries();
  await vi.advanceTimersByTimeAsync(50);
  const second = hidden.entries.noteEntries();
  expect(pendingAdmissions()).toBe(1);
  await vi.advanceTimersByTimeAsync(25);
  await Promise.all([first, second]);
  await hidden.entries.noteEntries();
  expect(read).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});

test('activation releases only the owning door', async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue([]);
  const journal = { entries: { noteEntries: read } } as unknown as Journal;
  let visible = false;
  const active = () => visible;
  const first = admitHiddenReads(journal, active, () => true).entries.noteEntries();
  const other = admitHiddenReads(journal, () => false, () => true).entries.noteEntries();
  visible = true;
  promoteDoorReads(active);
  await first;
  expect(read).toHaveBeenCalledTimes(1);
  expect(pendingAdmissions()).toBe(1);
  await vi.advanceTimersByTimeAsync(75);
  await other;
  expect(read).toHaveBeenCalledTimes(2);
  expect(pendingAdmissions()).toBe(0);
});

test('a later operation from a superseded attempt cannot dispatch after admission', async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue([]);
  const journal = { entries: { noteEntries: read } } as unknown as Journal;
  let current = true;
  const hidden = admitHiddenReads(journal, () => false, () => current);
  const first = hidden.entries.noteEntries();
  await vi.advanceTimersByTimeAsync(75);
  await first;
  current = false;
  await expect(hidden.entries.noteEntries()).rejects.toThrow('superseded hidden read');
  expect(read).toHaveBeenCalledTimes(1);
});
