import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChromium } from '../../browser-harness.mjs';
import { reportStage } from '../instrumentation.mjs';
import { browserRecoverySource, browserRecoveryDestination, assertRecoveryResult } from '../../browser-tier/archive-recovery.mjs';

/** Uses only the caller's owned disposable emulator. Ciphertext crosses the boundary. */
export async function installationRecovery({ device, repo, evidenceDir, avd, reporter }) {
  const { ok } = reporter;
  const required = (result, label) => {
    if (result.status !== 0 || result.error || result.signal) throw new Error(`${label}: ${result.stderr ?? result.error ?? result.status}`);
    return result.stdout;
  };
  const destroy = () => {
    required(device(['shell', 'pm', 'clear', 'dev.engender.app']), 'destroy source app-private storage and keys');
    const absent = device(['shell', 'pidof', 'dev.engender.app']);
    if (absent.stdout?.trim()) throw new Error('source process survived installation destruction');
  };
  const phase = (name, input) => {
    if (input) required(device(['shell', 'run-as', 'dev.engender.app', 'mkdir', '-p', 'files']), 'create destination artifact directory');
    if (input) required(device(['exec-out', 'run-as', 'dev.engender.app', 'tee', 'files/recovery-input.json'], { input: JSON.stringify(input), maxBuffer: 4 * 1024 * 1024 }), 'deliver Archive-only input');
    const result = device(['shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
      'dev.engender.app.backup.ArchiveInstallationRecoveryTest#recoveryPhase', '-e', 'recoveryPhase', name,
      'dev.engender.app.test/androidx.test.runner.AndroidJUnitRunner'], { timeout: 300000, maxBuffer: 4 * 1024 * 1024 });
    writeFileSync(join(evidenceDir, `${avd}-recovery-${name}-${Date.now()}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}\nexit=${result.status}\n`);
    if (!reportStage(`${avd}: Archive installation recovery ${name}`, result, reporter)) throw new Error(`required recovery phase failed: ${name}`);
    const output = JSON.parse(required(device(['shell', 'run-as', 'dev.engender.app', 'cat', 'files/recovery-output.json'], { maxBuffer: 4 * 1024 * 1024 }), 'read executed recovery evidence'));
    if (output.error || !output.identity) throw new Error(`missing recovery execution: ${JSON.stringify(output)}`);
    return output;
  };
  const server = await createServer({ configFile: join(repo, 'tests/browser-tier/browser-tier.vite.config.ts'), server: { port: 0 } });
  await server.listen();
  const browser = await launchChromium({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const origin = `http://localhost:${server.config.server.port}`;
  const rows = [];
  try {
    const web = await browserRecoverySource(browser, origin);
    destroy();
    const native = phase('restore', web);
    assertRecoveryResult(native);
    if (native.identity === web.identity) throw new Error('web/native installation identities match');
    rows.push({ source: 'web', destination: 'android', producer: 'manual', sourceDestroyed: true, sourceIdentity: web.identity, result: native });
    destroy();
    const android = phase('source');
    destroy();
    const destination = await browserRecoveryDestination(browser, origin, android);
    assertRecoveryResult(destination);
    rows.push({ source: 'android', destination: 'web', producer: 'manual', sourceDestroyed: true, sourceIdentity: android.identity, result: destination });
    destroy();
    const automatic = phase('automatic');
    if (!automatic.archive || !automatic.nativeDeliveredWithoutPage) throw new Error('automatic Archive did not execute native delivery');
    destroy();
    const automaticWeb = await browserRecoveryDestination(browser, origin, automatic);
    assertRecoveryResult(automaticWeb);
    rows.push({ source: 'android', destination: 'web', producer: 'automatic ticket08', sourceDestroyed: true, nativeDeliveredWithoutPage: true, sourceIdentity: automatic.identity, result: automaticWeb });
    const automaticNative = phase('restore', automatic);
    assertRecoveryResult(automaticNative);
    rows.push({ source: 'android', destination: 'android', producer: 'automatic ticket08', sourceDestroyed: true, sourceIdentity: automatic.identity, result: automaticNative });
    const version = required(device(['shell', 'dumpsys', 'webviewupdate']), 'WebView runtime');
    writeFileSync(join(evidenceDir, `${avd}-installation-recovery.json`), JSON.stringify({ revision: execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: Boolean(execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' }).trim()), browser: browser.version(), androidWebView: version, fixture: 'complete Archive journal with encoded JPEG/Opus/VP8', rows }, null, 2));
    for (const row of rows) ok(`${avd}: ${row.source}->${row.destination} ${row.producer} password-only recovery after source destruction: 54 sections and usable restored media`);
  } finally { destroy(); await browser.close(); await server.close(); }
}
