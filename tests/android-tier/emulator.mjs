/** @typedef {import('node:child_process').ChildProcess} Child */
/** @typedef {import('./instrumentation.mjs').Invocation} Invocation */
/** @typedef {(args: string[]) => Invocation} Query */

/** @param {Child} child */
function alive(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return false;
  try { process.kill(child.pid, 0); return true; } catch { return false; }
}

/** @param {Child} child @param {string} name @param {Query} query */
export function assertOwnedEmulator(child, name, query) {
  if (!alive(child)) throw new Error('owned emulator process exited');
  const identity = query(['emu', 'avd', 'name']);
  if (identity.status !== 0 || identity.stdout?.replaceAll('\r', '').trim() !== `${name}\nOK`) {
    throw new Error(`serial does not belong to disposable AVD ${name}: ${JSON.stringify(identity.stdout)} (exit ${identity.status})`);
  }
  if (!alive(child)) throw new Error('owned emulator process exited');
}

/** @param {{ launch: () => Child, query: Query, name: string, timeout: number }} options */
export async function startOwnedEmulator({ launch, query, name, timeout }) {
  if (query(['get-state']).status === 0) throw new Error('emulator serial already occupied');
  const child = launch();
  let startupError;
  child.on('error', (error) => { startupError = error; });
  const deadline = Date.now() + timeout;
  try {
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (!alive(child)) throw new Error('owned emulator exited before boot');
      if (query(['get-state']).status === 0) {
        assertOwnedEmulator(child, name, query);
        if (query(['shell', 'getprop', 'sys.boot_completed']).stdout?.trim() === '1') return child;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`disposable AVD ${name} did not boot within ${timeout / 1000}s`);
  } catch (error) {
    await stopOwnedEmulator(child, name, query);
    throw error;
  }
}

/** @param {Child} child @param {string} name @param {Query} query */
export async function stopOwnedEmulator(child, name, query) {
  if (!alive(child)) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  try { assertOwnedEmulator(child, name, query); query(['emu', 'kill']); }
  catch { /* A replaced serial must never receive a shutdown command. */ }
  if (alive(child)) child.kill('SIGTERM');
  let timer;
  await Promise.race([closed, new Promise((resolve) => { timer = setTimeout(resolve, 10_000); })]);
  clearTimeout(timer);
  if (alive(child)) {
    child.kill('SIGKILL');
    throw new Error('owned emulator did not shut down');
  }
}
