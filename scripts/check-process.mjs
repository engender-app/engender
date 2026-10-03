import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/** @param {string} command @param {string[]} args @param {NodeJS.ProcessEnv} env @param {string} [cwd] @returns {Promise<number>} */
export function execute(command, args, env, cwd = process.cwd()) {
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env }, cwd });
    child.on('error', (error) => { console.error(error.message); done(1); });
    child.on('exit', (code, signal) => {
      if (signal) console.error(`${command} stopped by ${signal}`);
      done(code ?? 1);
    });
  });
}

/** @param {string[]} lines */
export function writeSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
