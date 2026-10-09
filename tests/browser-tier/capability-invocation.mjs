import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

/** @typedef {{ code: number | null, signal: NodeJS.Signals | null, timedOut: boolean, startupError: string | null, output: string }} Invocation */
/** Keep process completion separate from individual case facts.
 * @param {string} script
 * @param {{env?: NodeJS.ProcessEnv, log: string, resultsFile: string, timeoutMs?: number, killGraceMs?: number}} options
 */
export async function runCapabilityInvocation(script, { env = {}, log, resultsFile, timeoutMs = 600000, killGraceMs = 1000 }) {
  await writeFile(log, '');
  const invocation = await /** @type {Promise<Invocation>} */ (new Promise(resolve => {
    const child = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    /** @type {string | null} */
    let startupError = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let forceKill;
    /** @param {string | Buffer} bytes @param {NodeJS.WriteStream} stream */
    const capture = (bytes, stream) => {
      output += bytes;
      stream.write(bytes);
      appendFileSync(log, bytes);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      capture(`\nRunner timeout after ${timeoutMs}ms\n`, process.stderr);
      child.kill('SIGTERM');
      forceKill = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
    }, timeoutMs);
    child.stdout.on('data', bytes => capture(bytes, process.stdout));
    child.stderr.on('data', bytes => capture(bytes, process.stderr));
    child.on('error', error => { startupError = error.message; capture(error.stack ?? error.message, process.stderr); });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      resolve({ code, signal, timedOut, startupError, output });
    });
  }));
  let cases = [];
  try { cases = JSON.parse(await readFile(resultsFile, 'utf8')); } catch { /* Missing results leave cases unexecuted. */ }
  return { ...invocation, cases };
}

/** @param {Pick<Invocation, "code" | "signal" | "timedOut" | "startupError">} invocation */
export function invocationFailed(invocation) {
  return invocation.code !== 0 || invocation.signal !== null || invocation.timedOut || invocation.startupError != null;
}
