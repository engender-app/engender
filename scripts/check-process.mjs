import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/** @param {string} command @param {string[]} args @param {NodeJS.ProcessEnv} env @param {string} [cwd] @param {string} [logFile] @returns {Promise<number>} */
export function execute(command, args, env, cwd = process.cwd(), logFile) {
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: logFile ? ['inherit', 'pipe', 'pipe'] : 'inherit', env: { ...process.env, ...env }, cwd });
    if (logFile) {
      child.stdout?.on('data', (chunk) => { process.stdout.write(chunk); appendFileSync(logFile, chunk); });
      child.stderr?.on('data', (chunk) => { process.stderr.write(chunk); appendFileSync(logFile, chunk); });
    }
    child.on('error', (error) => {
      console.error(error.message);
      if (logFile) appendFileSync(logFile, error.message + '\n');
    });
    child.on('close', (code, signal) => {
      if (signal) {
        const message = `${command} stopped by ${signal}`;
        console.error(message);
        if (logFile) appendFileSync(logFile, message + '\n');
      }
      done(code ?? 1);
    });
  });
}

/** @param {string[]} lines */
export function writeSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
