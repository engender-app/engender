import { expect, test, vi } from 'vitest';
import { restoredFileDelivery } from './restored-file-delivery';

const identity = { processId: 'process', resetEpoch: 1 };
const saved = { pluginId: 'FileDelivery', methodName: 'finishFile', success: true,
  data: { ...identity, transferId: 'owned', saved: true, recordBackup: true, savedAt: 1234 } };
const status = () => ({ ...identity, interrupted: false, cleanupPending: false });

test('restored completion waits for journal gates and reports one backup timestamp', async () => {
  let visible = false;
  const report = vi.fn();
  const native = { recoveryStatus: vi.fn(async () => status()) };
  const owner = restoredFileDelivery(native, () => visible, report, () => identity);
  owner.accept(saved);
  await owner.flush();
  expect(native.recoveryStatus).not.toHaveBeenCalled();
  visible = true;
  await owner.flush();
  expect(report.mock.calls).toEqual([[{ outcome: 'saved', backupAt: 1234 }]]);
  owner.accept(saved);
  await vi.waitFor(() => expect(native.recoveryStatus).toHaveBeenCalledTimes(2));
  expect(report).toHaveBeenCalledTimes(1);
});

test('late results from a reset or an older process never report success', async () => {
  for (const changed of [{ resetEpoch: 2 }, { processId: 'new' }]) {
    let visible = false;
    const report = vi.fn();
    const native = { recoveryStatus: vi.fn(async () => ({ ...status(), ...changed })) };
    const owner = restoredFileDelivery(native, () => visible, report, () => identity);
    owner.accept(saved);
    visible = true;
    await owner.flush();
    expect(native.recoveryStatus).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  }
});

test('locking during status lookup retains the outcome until the gate clears', async () => {
  let visible = true;
  let answer!: (value: ReturnType<typeof status>) => void;
  const report = vi.fn();
  const native = { recoveryStatus: vi.fn().mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }))
    .mockResolvedValue(status()) };
  const owner = restoredFileDelivery(native, () => visible, report, () => identity);
  owner.accept(saved);
  visible = false;
  answer(status());
  await vi.waitFor(() => expect(native.recoveryStatus).toHaveBeenCalledTimes(1));
  expect(report).not.toHaveBeenCalled();
  visible = true;
  await owner.flush();
  expect(report).toHaveBeenCalledTimes(1);
});

test('interrupted cleanup reports its limit and never marks a backup', async () => {
  const report = vi.fn();
  const owner = restoredFileDelivery({ recoveryStatus: async () => ({ ...status(), interrupted: true, cleanupPending: true }) }, () => true, report, () => identity);
  await owner.flush();
  await owner.flush();
  expect(report.mock.calls).toEqual([[{ outcome: 'cleanup-pending' }]]);
});


test('a status snapshot held across reset cannot report into the replacement journal', async () => {
  let journal = {};
  let answer!: (value: ReturnType<typeof status>) => void;
  const report = vi.fn();
  const native = { recoveryStatus: vi.fn().mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }))
    .mockResolvedValue({ ...status(), resetEpoch: 2 }) };
  const owner = restoredFileDelivery(native, () => true, report, () => journal);
  owner.accept(saved);
  journal = {};
  answer(status());
  await vi.waitFor(() => expect(native.recoveryStatus).toHaveBeenCalledTimes(2));
  expect(report).not.toHaveBeenCalled();
  const next = { ...saved, data: { ...saved.data, transferId: 'new', resetEpoch: 2, savedAt: 5678 } };
  owner.accept(next);
  await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(1));
  owner.accept(next);
  await owner.flush();
  expect(report.mock.calls).toEqual([[{ outcome: 'saved', backupAt: 5678 }]]);
});

test('cancelled, failed and non-journal saves report once without a backup timestamp', async () => {
  for (const [event, outcome] of [
    [{ ...saved, data: { ...saved.data, saved: false } }, 'cancelled'],
    [{ ...saved, success: false, error: { data: saved.data } }, 'failed'],
    [{ ...saved, data: { ...saved.data, recordBackup: false } }, 'saved']
  ] as const) {
    const report = vi.fn();
    const owner = restoredFileDelivery({ recoveryStatus: async () => status() }, () => true, report, () => identity);
    owner.accept(event);
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    owner.accept(event);
    await owner.flush();
    expect(report.mock.calls).toEqual([[{ outcome, backupAt: undefined }]]);
  }
});

test('an old status failure cannot report after journal replacement', async () => {
  let journal = {};
  let reject!: (error: Error) => void;
  const report = vi.fn();
  const native = { recoveryStatus: vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }))
    .mockResolvedValue({ ...status(), resetEpoch: 2 }) };
  const owner = restoredFileDelivery(native, () => true, report, () => journal);
  owner.accept(saved);
  journal = {};
  reject(new Error('old lookup failed'));
  await vi.waitFor(() => expect(native.recoveryStatus).toHaveBeenCalledTimes(2));
  expect(report).not.toHaveBeenCalled();
});
