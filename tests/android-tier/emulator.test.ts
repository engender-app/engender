import { expect, test, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { assertOwnedEmulator, startOwnedEmulator, stopOwnedEmulator } from './emulator.mjs';

const absent = { status: 1, stdout: '' };
const occupied = { status: 0, stdout: 'device' };

test('occupied serial prevents launch', async () => {
  const launch = vi.fn();
  await expect(startOwnedEmulator({ launch, query: () => occupied, name: 'disposable', timeout: 100 })).rejects.toThrow('occupied');
  expect(launch).not.toHaveBeenCalled();
});

test('failed startup never kills another emulator on the serial', async () => {
  const commands: string[][] = [];
  let checks = 0;
  await expect(startOwnedEmulator({ launch: () => spawn('/no-such-emulator', []), name: 'disposable', timeout: 1000,
    query: (args: string[]) => { commands.push(args); return ++checks === 1 ? absent : occupied; }
  })).rejects.toThrow();
  expect(commands).not.toContainEqual(['emu', 'kill']);
});

test('exited child cannot adopt booted replacement or shut it down', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(1)']);
  await new Promise((resolve) => child.once('close', resolve));
  const query = vi.fn(() => ({ status: 0, stdout: 'disposable\nOK' }));
  expect(() => assertOwnedEmulator(child, 'disposable', query)).toThrow('exited');
  await stopOwnedEmulator(child, 'disposable', query);
  expect(query).not.toHaveBeenCalled();
});

test('live child with wrong AVD identity cannot adopt or kill replacement', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  const query = vi.fn(() => ({ status: 0, stdout: 'unrelated\nOK' }));
  expect(() => assertOwnedEmulator(child, 'disposable', query)).toThrow('does not belong');
  await stopOwnedEmulator(child, 'disposable', query);
  expect(query).not.toHaveBeenCalledWith(['emu', 'kill']);
});

test('child exit during boot fails before device operations', async () => {
  const commands: string[][] = [];
  await expect(startOwnedEmulator({ name: 'disposable', timeout: 1000,
    launch: () => spawn(process.execPath, ['-e', 'process.exit(1)']),
    query: (args: string[]) => { commands.push(args); return absent; }
  })).rejects.toThrow('exited');
  expect(commands.every((args) => args[0] === 'get-state')).toBe(true);
});

test('verified owned emulator boots and shutdown waits for its exit', async () => {
  let initial = true;
  const query = vi.fn((args: string[]) => {
    if (args[0] === 'get-state') { if (initial) { initial = false; return absent; } return occupied; }
    if (args[0] === 'emu' && args[1] === 'avd') return { status: 0, stdout: 'disposable\r\nOK\r\n' };
    return { status: 0, stdout: '1' };
  });
  const child = await startOwnedEmulator({ name: 'disposable', query, timeout: 1000,
    launch: () => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']) });
  await stopOwnedEmulator(child, 'disposable', query);
  expect(query).toHaveBeenCalledWith(['emu', 'kill']);
  expect(child.signalCode).toBe('SIGTERM');
});
