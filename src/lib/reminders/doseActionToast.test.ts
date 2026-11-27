/* What the app says for each kept Taken or Skip tap it applied on unlock. */

import { beforeEach, expect, test, vi } from 'vitest';

const toast = vi.fn();
vi.mock('$lib/stores/toasts.svelte', () => ({ toast }));
// The module's own `$lib/paraglide/messages` import, pointed at the real
// compiled catalogue.
vi.mock('$lib/paraglide/messages', async () => await import('../paraglide/messages.js'));

const { confirmDoseAction } = await import('./doseActionToast');
const { m } = await import('../paraglide/messages.js');

const base = { id: 'a-1', drug: 'Progesterone', slotEpochDay: 20400 };

beforeEach(() => toast.mockReset());

test('a logged Taken says so and opens the dose it wrote', () => {
  const open = vi.fn();
  confirmDoseAction({ ...base, action: 'taken', result: 'logged', doseId: 'd-1' }, open);
  const [message, options] = toast.mock.calls[0];
  expect(message).toBe(m.dose_reminder_taken({ drug: 'Progesterone' }));
  expect(options.kind).toBe('dose-reminder-logged');
  options.onAction();
  expect(open).toHaveBeenCalledWith('/care/doses?dose=d-1');
});

test('a logged Skip says it was logged as skipped', () => {
  confirmDoseAction({ ...base, action: 'skipped', result: 'logged', doseId: 'd-2' }, vi.fn());
  expect(toast.mock.calls[0][0]).toBe(m.dose_reminder_skipped({ drug: 'Progesterone' }));
});

test.each([
  ['already', 'dose_reminder_already', 'dose-reminder-already'],
  ['nothingDue', 'dose_reminder_nothing_due', 'dose-reminder-nothing-due'],
  ['noRegimen', 'dose_reminder_no_regimen', 'dose-reminder-no-regimen'],
  ['multipleRegimens', 'dose_reminder_multiple_regimens', 'dose-reminder-multiple-regimens']
] as const)('an outcome that wrote nothing (%s) says why, with nothing to open', (result, key, kind) => {
  confirmDoseAction({ ...base, action: 'taken', result }, vi.fn());
  expect(toast).toHaveBeenCalledTimes(1);
  const [message, options] = toast.mock.calls[0];
  expect(message).toBe(m[key]({ drug: 'Progesterone' }));
  expect(options).toEqual({ kind, duration: 6000 });
});
