/* Android tier (ticket 11): the checks that need a real Android runtime.

   Neither the Node tier nor the browser tier can answer what this asks.
   Whether the native SQLite has FTS5 and window functions is a property of
   the build that ships in the APK, and ticket 08 measured the framework
   SQLite on API 35 to have no FTS5 at all - which is one of the two reasons
   the journal is on SQLCipher (ADR-0020). So it is asserted here, on a
   device, rather than assumed anywhere.

   Two emulators, because the spec asks for API 26 and a current Android.
   They do not run the same set, and the reason is worth knowing.

   The native checks run on both. That is the half that varies with the
   platform: the framework, the linker and what the app process can load -
   and, since ticket 13, what Android Keystore does with the journal's data
   key, whose authorization model changed at API 30.

   The WebView suites - the contract suite and the encryption claim gate -
   run only on the current Android. They need a WebView,
   and Android updates its WebView separately from the OS, so an API level
   says nothing about what the app runs in. The API 26 emulator image ships
   Chrome 69 from 2018, which has no OPFS - capacitor.config.ts puts the
   floor at Chrome 87 for exactly that reason - so the app cannot start
   there at all. A real API 26 phone with a current WebView runs the same
   bundle as an API 35 one, and that is what the API 35 run covers.

   Set ANDROID_TIER_AVDS to a comma-separated list to run others; an AVD
   whose name is not known here gets the full set.

   Run with `npm run test:android`.

   It prints PASS/FAIL lines like the browser tier's run.mjs. The tests
   themselves live in android/app/src/androidTest/; this script builds the
   probe bundle they serve, brings the emulators up and turns the
   instrumentation output into those lines. */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, mkdtempSync, openSync, closeSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createReporter } from '../browser-harness.mjs';
import { runInstrumentation, reportStage } from './instrumentation.mjs';
import { startOwnedEmulator, assertOwnedEmulator, stopOwnedEmulator } from './emulator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const androidDir = join(repo, 'android');
const { ok, fail, finish } = createReporter();

/* Headless runs use software graphics with Vulkan disabled. */
const HEADLESS = process.env.ANDROID_TIER_HEADLESS === '1';
const BACKUP_ONLY = process.env.ANDROID_TIER_BACKUP_ONLY === '1';
const BACKUP_TEST = 'dev.engender.app.backup.NativeBackupSchedulingTest';
const BACKUP_STAGES = new Set((process.env.ANDROID_TIER_BACKUP_STAGES ?? '').split(',').filter(Boolean));
const KNOWN_BACKUP_STAGES = new Set(['defer', 'verify-deferred', 'catch-up', 'cleanup', 'prepare',
  'prepare-interrupted', 'resume-interrupted', 'verify', 'mounted-status', 'ownership-and-destination',
  'activity-destruction', 'bounded-retries', 'existing-manual']);
for (const stage of BACKUP_STAGES) if (!KNOWN_BACKUP_STAGES.has(stage)) throw new Error(`Unknown Android backup stage: ${stage}`);
const executedBackupStages = new Set();
if (BACKUP_STAGES.size) console.log(`Selected Android backup stages: ${[...BACKUP_STAGES].join(', ')}`);
const AVDS = (process.env.ANDROID_TIER_AVDS ?? 'gd26,tracker35').split(',').filter(Boolean);
const BOOT_TIMEOUT_MS = 300_000;

/** The AVDs whose WebView is too old to start the app, so only the native
    half is asked of them. See the header for why this is not a gap. */
const NATIVE_ONLY = new Set(['gd26']);
/* The three suites that need no WebView: what the native SQLite build has
   (ticket 11), what Android Keystore does with the journal's data key
   (ticket 13), and which authenticators BiometricManager reports available
   (ticket 09). The photo initialization checks also run without a WebView,
   and so does the capture-on-leave check, which needs an Android below 13
   to reach the FLAG_SECURE path. These are worth having on the older emulator
   in particular - below API 30 the Keystore key is authorized by time
   rather than per-operation, and androidx.biometric's device-credential
   fallback exists specifically for that floor. */
const NATIVE_TESTS = [
  'dev.engender.app.sqlite.NativeSqliteCapabilitiesTest',
  'dev.engender.app.keystore.JournalKeystoreTest',
  'dev.engender.app.keystore.BiometricAuthenticatorAvailabilityTest',
  'dev.engender.app.photos.PhotoDirectoryInitializationTest',
  'dev.engender.app.screencapture.CaptureChoiceOnLeaveTest'
].join(',');

const sdkRoot =
  process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.HOME ?? '', 'Android/Sdk');
const adb = join(sdkRoot, 'platform-tools/adb');
const emulatorBin = join(sdkRoot, 'emulator/emulator');

/* Capacitor 8 needs a JDK 21 toolchain. JAVA_HOME wins if it already points
   at one; otherwise this looks where sdkman puts them, so the common setup
   works without the caller exporting anything. */
const REQUIRED_JDK = 21;

/** The major version of a JDK, from the `release` file every JDK ships. */
function javaMajor(home) {
  try {
    return Number(/JAVA_VERSION="(\d+)/.exec(readFileSync(join(home, 'release'), 'utf8'))?.[1]);
  } catch {
    return NaN;
  }
}

function javaHome() {
  /* An existing JAVA_HOME is only good enough if it is new enough. Checking
     that it exists is not the same question, and getting it wrong turns into
     "error: invalid source release: 21" from deep inside Capacitor's own
     module - a JDK problem wearing a Java-language-level costume. */
  if (process.env.JAVA_HOME && javaMajor(process.env.JAVA_HOME) >= REQUIRED_JDK) {
    return process.env.JAVA_HOME;
  }
  const sdkman = join(process.env.HOME ?? '', '.sdkman/candidates/java');
  if (!existsSync(sdkman)) return undefined;
  const found = readdirSync(sdkman)
    .map((name) => join(sdkman, name))
    .find((path) => javaMajor(path) >= REQUIRED_JDK);
  return found;
}

const env = { ...process.env, ANDROID_HOME: sdkRoot, ANDROID_SDK_ROOT: sdkRoot };

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', env, ...options });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ownedEmulator;
let disposableName;
const queryDevice = (args) => run(adb, ['-s', serial, ...args], { timeout: 10_000 });
function device(args, options = {}) {
  assertOwnedEmulator(ownedEmulator, disposableName, queryDevice);
  return run(adb, ['-s', serial, ...args], { timeout: 10_000, ...options });
}

async function startEmulator(avd, port) {
  const avdHome = mkdtempSync(join(evidenceDir, `${avd}-`));
  disposableName = `tier-${avd}-${avdHome.split('/').pop()}`;
  const source = join(process.env.ANDROID_AVD_HOME ?? join(process.env.HOME, '.android/avd'), `${avd}.avd`);
  const clone = join(avdHome, `${disposableName}.avd`);
  mkdirSync(clone);
  const config = readFileSync(join(source, 'config.ini'), 'utf8')
    .replace(/^disk.dataPartition.path=.*$/m, `disk.dataPartition.path=${join(clone, 'userdata-qemu.img')}`)
    .replace(/^sdcard.path=.*\n?/m, '');
  writeFileSync(join(clone, 'config.ini'), config);
  writeFileSync(join(avdHome, `${disposableName}.ini`), `avd.ini.encoding=UTF-8\npath=${clone}\n`);
  const args = ['-avd', disposableName, '-port', String(port), '-no-snapshot', '-no-audio', '-wipe-data'];
  if (HEADLESS) args.push('-no-window', '-gpu', 'swiftshader', '-feature', '-Vulkan');
  ownedEmulator = await startOwnedEmulator({
    name: disposableName, query: queryDevice, timeout: BOOT_TIMEOUT_MS,
    launch: () => {
      const log = openSync(join(avdHome, 'emulator.log'), 'w');
      const child = spawn(emulatorBin, args, { env: { ...env, ANDROID_AVD_HOME: avdHome }, stdio: ['ignore', log, log] });
      closeSync(log);
      return child;
    }
  });
  device(['shell', 'input', 'keyevent', '82']);
}

async function stopEmulator() {
  if (!ownedEmulator) return;
  await stopOwnedEmulator(ownedEmulator, disposableName, queryDevice);
  ownedEmulator = undefined;
}

const RESULTS_DIR = join(androidDir, 'app/build/outputs/androidTest-results/connected');

// --- Build the probe bundles the instrumentation tests serve ---------------
for (const probe of (BACKUP_ONLY ? ['auto-export'] : ['contract', 'encryption', 'archive', 'auto-export', 'long-journal'])) {
  const probeBuild = run('npx', ['vite', 'build', '--config', 'tests/android-tier/android-tier.vite.config.ts'], {
    cwd: repo,
    env: { ...env, ANDROID_TIER_PROBE: probe }
  });
  if (probeBuild.status !== 0) {
    fail(`build the android-tier ${probe} probe bundle`, probeBuild.stderr || probeBuild.stdout);
    finish('');
    process.exit(1);
  }
  ok(`the android-tier ${probe} probe bundle builds`);
}

// --- Sync the app's web assets so the APK carries the real bundle ----------
const appBuild = run('npm', ['run', 'build'], { cwd: repo });
if (appBuild.status !== 0) {
  fail('build the web bundle the Android app wraps', appBuild.stderr || appBuild.stdout);
  process.exit(1);
}
const sync = run('npx', ['cap', 'sync', 'android'], { cwd: repo });
if (sync.status !== 0) {
  fail('cap sync android', sync.stderr || sync.stdout);
  process.exit(1);
}
ok('the Android project carries the same static bundle the web release does');

// --- Run the instrumentation tests on each emulator ------------------------
const home = javaHome();
if (!home) {
  fail(
    `a JDK ${REQUIRED_JDK} or newer`,
    `Capacitor 8 needs one and neither JAVA_HOME nor ~/.sdkman/candidates/java has it. ` +
      `Install one (sdk install java ${REQUIRED_JDK}.0.12-tem) or point JAVA_HOME at it.`
  );
  finish('');
  process.exit(1);
}
const gradleEnv = { JAVA_HOME: home };

/* The long-journal benchmark test: generates ten years of journal data and
  measures twenty-three operations (startup + read/write paths) against timing budgets. It takes ten or more
   minutes on a real device and far longer on an emulator, so it is excluded
   from the regular test:android run. Run it separately on a real device:
     npx cap sync android
     cd android && ./gradlew :app:connectedDebugAndroidTest \
       -Pandroid.testInstrumentationRunnerArguments.class=dev.engender.app.longjournal.LongJournalBenchmarkTest
   Then copy the logged JSON block into android-budgets.json and commit it. */
const PIN_WAIT_TEST = 'dev.engender.app.lock.PinAttemptWaitPersistenceTest';
const evidenceRoot = resolve(process.env.ANDROID_TIER_LOG_DIR ?? join(repo, '.claude/android-tier'));
mkdirSync(evidenceRoot, { recursive: true });
const evidenceDir = mkdtempSync(join(evidenceRoot, 'run-'));
console.log(`Android evidence: ${evidenceDir}`);
const port = Number(process.env.ANDROID_TIER_PORT ?? 5580);
const serial = `emulator-${port}`;
if (!Number.isInteger(port) || port % 2 !== 0 || port < 5554 || port > 5682) throw new Error('ANDROID_TIER_PORT must be an even port from 5554 to 5682');
const BENCHMARK_TEST = 'dev.engender.app.longjournal.LongJournalBenchmarkTest';

for (const avd of AVDS) {
  try {
    await startEmulator(avd, port);
    ok(`${avd} booted`);

    const nativeOnly = NATIVE_ONLY.has(avd);
    if (nativeOnly) {
      console.log(`  (${avd}: native checks only - its WebView predates the app's Chrome 87 floor)`);
    }

    /* :app: rather than the whole build. The empty capacitor-cordova-android-plugins
       module Capacitor generates has an androidTest variant of its own, and it
       fails to dex on a Kotlin stdlib clash between androidx.test's 1.8.22 and a
       transitive 1.6.21. Nothing of ours is in that module. */
    if (BACKUP_ONLY) {
      const built = run('./gradlew', [':app:assembleDebug', ':app:assembleDebugAndroidTest', '--max-workers=2'], {
        cwd: androidDir, env: { ...env, ...gradleEnv }, timeout: 600_000
      });
      writeFileSync(join(evidenceDir, `${avd}-backup-assemble.log`), `${built.stdout ?? ''}${built.stderr ?? ''}\nexit=${built.status}\n`);
      if (built.status !== 0 || built.signal || built.error) throw new Error('backup APK build failed');
    } else await runInstrumentation({
      label: avd,
      resultsDir: RESULTS_DIR,
      reporter: { ok, fail },
      invoke: () => {
        assertOwnedEmulator(ownedEmulator, disposableName, queryDevice);
        const result = run(
          './gradlew',
          [
            ':app:connectedDebugAndroidTest',
            '--console=plain',
            ...(nativeOnly
              ? [`-Pandroid.testInstrumentationRunnerArguments.class=${NATIVE_TESTS}`]
              : [`-Pandroid.testInstrumentationRunnerArguments.notClass=${BENCHMARK_TEST},${PIN_WAIT_TEST},${BACKUP_TEST}`])
          ],
          {
            cwd: androidDir,
            env: { ...env, ...gradleEnv, ANDROID_SERIAL: serial },
            timeout: 900_000
          }
        );
        writeFileSync(join(evidenceDir, `${avd}-instrumentation.log`),
          `${result.stdout ?? ''}${result.stderr ?? ''}\nexit=${result.status} signal=${result.signal} error=${result.error ?? ''}\n`);
        return result;
      }
    });
    if (existsSync(RESULTS_DIR)) cpSync(RESULTS_DIR, join(evidenceDir, `${avd}-results`), { recursive: true });
    {
      // connectedDebugAndroidTest removes both packages when its invocation ends.
      for (const [name, apk] of [
        ['app', 'debug/app-debug.apk'],
        ['test', 'androidTest/debug/app-debug-androidTest.apk']
      ]) {
        const installed = device(['install', '-r', join(androidDir, 'app/build/outputs/apk', apk)], { timeout: 120_000 });
        writeFileSync(join(evidenceDir, `${avd}-pin-wait-install-${name}.log`),
          `${installed.stdout ?? ''}${installed.stderr ?? ''}\nexit=${installed.status} signal=${installed.signal} error=${installed.error ?? ''}\n`);
        if (installed.status !== 0 || installed.signal || installed.error) {
          throw new Error(`could not install ${name} APK for required PIN wait stages: ${installed.error?.message ?? installed.stderr}`);
        }
        ok(`${avd}: install ${name} APK for PIN wait stages`);
      }
      const stage = (name, method = 'deadlineSurvivesActualProcessDeath') => {
        const result = device(['shell', 'am', 'instrument', '-w', '-r',
          '-e', 'class', `${PIN_WAIT_TEST}#${method}`, '-e', 'pinWaitStage', name,
          'dev.engender.app.test/androidx.test.runner.AndroidJUnitRunner'], { timeout: 120_000 });
        writeFileSync(join(evidenceDir, `${avd}-pin-wait-${name}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}\nexit=${result.status} signal=${result.signal} error=${result.error ?? ''}\n`);
        const proofLog = device(['logcat', '-d', '-s', 'PinWaitProof:I', '*:S']);
        writeFileSync(join(evidenceDir, `${avd}-pin-wait-${name}-process.log`), `${proofLog.stdout ?? ''}${proofLog.stderr ?? ''}`);
        return reportStage(`${avd}: PIN wait ${name}`, result, { ok, fail });
      };
      if (!BACKUP_ONLY) try {
        stage('preferences', 'preferenceDeadlineSurvivesANewOwnerAndNewBoot');
        if (stage('seed')) {
          const killed = device(['shell', 'am', 'force-stop', 'dev.engender.app']);
          const pid = device(['shell', 'pidof', 'dev.engender.app']);
          writeFileSync(join(evidenceDir, `${avd}-pin-wait-termination.log`), `force-stop exit=${killed.status}\npidof exit=${pid.status} stdout=${pid.stdout}\n`);
          if (killed.status !== 0 || pid.status !== 1 || pid.stdout.trim()) {
            fail(`${avd}: PIN wait process termination`, 'force-stop did not leave the app process absent');
          } else {
            ok(`${avd}: PIN wait process termination`);
            stage('restore');
          }
        }
      } finally { stage('cleanup'); }
      const backupStage = (name, method = 'persistentDeliverySurvivesLifecycle') => {
        if (BACKUP_STAGES.size && !BACKUP_STAGES.has(name)) { console.log(`SKIP ${avd}: native backup ${name} (selected stages)`); return false; }
        executedBackupStages.add(name);
        const result = device(['shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
          `${BACKUP_TEST}#${method}`, '-e', 'backupStage', name,
          'dev.engender.app.test/androidx.test.runner.AndroidJUnitRunner'], { timeout: 180_000 });
        writeFileSync(join(evidenceDir, `${avd}-backup-${name}-${Date.now()}.log`),
          `${result.stdout ?? ''}${result.stderr ?? ''}\nexit=${result.status} signal=${result.signal} error=${result.error ?? ''}\n`);
        return reportStage(`${avd}: native backup ${name}`, result, { ok, fail });
      };
      try {
        if (backupStage('defer')) {
          const killed = device(['shell', 'am', 'kill', 'dev.engender.app']);
          const absent = device(['shell', 'pidof', 'dev.engender.app']);
          writeFileSync(join(evidenceDir, `${avd}-backup-deferred-process-death.log`),
            `${killed.stdout ?? ''}${killed.stderr ?? ''}\nexit=${killed.status}\npidof exit=${absent.status} pid=${absent.stdout}\n`);
          if (killed.status !== 0 || absent.status !== 1 || absent.stdout.trim()) {
            fail(`${avd}: native backup deferred process death`, 'process death not established');
          } else {
            await sleep(50000);
            let state, deferredAt = 0;
            const deadline = Date.now() + 120000;
            do {
              state = device(['shell', 'run-as', 'dev.engender.app', 'cat', 'shared_prefs/engender-auto-export.xml']);
              deferredAt = Number(/name="deferredAt" value="(\d+)"/.exec(state.stdout ?? '')?.[1] ?? 0);
              if (deferredAt) break;
              await sleep(1000);
            } while (Date.now() < deadline);
            writeFileSync(join(evidenceDir, `${avd}-backup-deferred-headless-result.json`),
              JSON.stringify({ deferredAt, encryptedStage: /name="encryptedStage"/.test(state.stdout ?? '') }, null, 2));
            if (state.status !== 0 || !deferredAt || /name="encryptedStage"/.test(state.stdout ?? '')) {
              fail(`${avd}: native backup headless deferral`, 'no durable deferred state before restart instrumentation');
            } else {
              ok(`${avd}: native backup headless deferral`);
              backupStage('verify-deferred');
              if (!nativeOnly) backupStage('catch-up');
            }
          }
        }
        backupStage('cleanup');
        if (!nativeOnly) {
          for (const lifecycle of ['process-death', 'reboot', 'interrupted-write']) {
            if (!backupStage(lifecycle === 'interrupted-write' ? 'prepare-interrupted' : 'prepare')) continue;
            const state = device(['shell', 'dumpsys', 'jobscheduler']);
            writeFileSync(join(evidenceDir, `${avd}-backup-${lifecycle}-jobs-before.log`), state.stdout ?? '');
            if (!/dev\.engender\.app\/androidx\.work\.impl\.background\.systemjob\.SystemJobService/.test(state.stdout ?? '')) {
              fail(`${avd}: native backup persistent work`, 'no WorkManager job in JobScheduler');
              continue;
            }
            if (lifecycle === 'interrupted-write') {
              let partial;
              const deadline = Date.now() + 120000;
              do {
                const marker = device(['shell', 'run-as', 'dev.engender.app.test', 'cat', 'files/backup-partial-state.json']);
                try { partial = JSON.parse(marker.stdout); } catch {}
                if (partial?.writtenBytes > 0) break;
                await sleep(250);
              } while (Date.now() < deadline);
              if (!(partial?.writtenBytes > 0)) {
                fail(`${avd}: interrupted native write`, 'provider never recorded written bytes');
                continue;
              }
              const writerPid = device(['shell', 'pidof', 'dev.engender.app']).stdout.trim();
              if (!/^\d+$/.test(writerPid)) {
                fail(`${avd}: interrupted native write`, 'no single writer process');
                continue;
              }
              const killed = device(['shell', 'run-as', 'dev.engender.app', 'kill', '-9', writerPid]);
              await sleep(250);
              const absent = device(['shell', 'pidof', 'dev.engender.app']);
              writeFileSync(join(evidenceDir, `${avd}-backup-interrupted-write.json`),
                JSON.stringify({ ...partial, writerPid, signal: 'SIGKILL', killExit: killed.status, pidExit: absent.status, pid: absent.stdout.trim() }, null, 2));
              if (killed.status !== 0 || absent.status !== 1 || absent.stdout.trim()) {
                fail(`${avd}: interrupted native write`, 'writer process death not established');
                continue;
              }
              backupStage('resume-interrupted');
            } else if (lifecycle === 'process-death') {
              const previousPid = device(['shell', 'pidof', 'dev.engender.app']).stdout?.trim();
              writeFileSync(join(evidenceDir, `${avd}-backup-process-before.log`), `pid=${previousPid}\n`);
              device(['shell', 'am', 'kill', 'dev.engender.app']);
              const pid = device(['shell', 'pidof', 'dev.engender.app']);
              writeFileSync(join(evidenceDir, `${avd}-backup-${lifecycle}-absence.log`), `exit=${pid.status} pid=${pid.stdout}\n`);
              if (pid.status !== 1 || pid.stdout.trim()) {
                fail(`${avd}: native backup ordinary process death`, 'app process remained alive');
                continue;
              }
            } else {
              const before = device(['shell', 'cat', '/proc/sys/kernel/random/boot_id']).stdout?.trim();
              const reboot = device(['reboot']);
              if (reboot.status !== 0) throw new Error('backup proof reboot failed');
              await sleep(5000);
              const deadline = Date.now() + BOOT_TIMEOUT_MS;
              let after;
              while (Date.now() < deadline) {
                if (queryDevice(['shell', 'getprop', 'sys.boot_completed']).stdout?.trim() === '1') {
                  assertOwnedEmulator(ownedEmulator, disposableName, queryDevice);
                  after = device(['shell', 'cat', '/proc/sys/kernel/random/boot_id']).stdout?.trim();
                  if (after && after !== before) break;
                }
                await sleep(1000);
              }
              writeFileSync(join(evidenceDir, `${avd}-backup-reboot.log`), `before=${before} after=${after}\n`);
              if (!after || after === before) throw new Error('backup proof did not observe a new boot');
              device(['shell', 'input', 'keyevent', '82']);
            }
            // Give Android real elapsed time; no fake clock drives native execution.
            await sleep(50000);
            const activities = device(['shell', 'dumpsys', 'activity', 'activities']);
            writeFileSync(join(evidenceDir, `${avd}-backup-${lifecycle}-activities.log`), activities.stdout ?? '');
            if (/mResumedActivity:.*dev\.engender\.app/.test(activities.stdout ?? '')) {
              fail(`${avd}: native backup page absence`, 'MainActivity resumed during delivery proof');
              continue;
            }
            // Read only non-secret state via the debug test package, before instrumentation can start it.
            let delivered;
            const deadline = Date.now() + 120000;
            do {
              const metadata = device(['shell', 'run-as', 'dev.engender.app', 'cat', 'shared_prefs/engender-auto-export.xml']);
              const xml = metadata.stdout ?? '';
              const snapshotAt = Number(/name="lastSnapshotAt" value="(\d+)"/.exec(xml)?.[1] ?? 0);
              const deliveredAt = Number(/name="lastSuccessAt" value="(\d+)"/.exec(xml)?.[1] ?? 0);
              if (metadata.status === 0 && snapshotAt && deliveredAt > snapshotAt && !xml.includes('name="encryptedStage"')) {
                delivered = { snapshotAt, deliveredAt, pid: device(['shell', 'pidof', 'dev.engender.app']).stdout?.trim() };
                break;
              }
              await sleep(1000);
            } while (Date.now() < deadline);
            writeFileSync(join(evidenceDir, `${avd}-backup-${lifecycle}-headless-result.json`), JSON.stringify(delivered ?? { failure: 'no native delivery before verification instrumentation' }, null, 2));
            if (!delivered) fail(`${avd}: native backup ${lifecycle} headless delivery`, 'no verified native result before instrumentation startup');
            else {
              ok(`${avd}: native backup ${lifecycle} headless delivery`);
              backupStage('verify');
            }
            backupStage('cleanup');
          }
          // Force-stop is a separate platform limitation, never process-death evidence.
          if (backupStage('prepare')) {
            device(['shell', 'am', 'force-stop', 'dev.engender.app']);
            await sleep(50000);
            const state = device(['shell', 'dumpsys', 'package', 'dev.engender.app']);
            const pid = device(['shell', 'pidof', 'dev.engender.app']);
            writeFileSync(join(evidenceDir, `${avd}-backup-force-stop.log`), `${state.stdout}\npidof exit=${pid.status} pid=${pid.stdout}\n`);
            if (!/stopped=true/.test(state.stdout ?? '') || pid.status !== 1 || pid.stdout.trim()) {
              fail(`${avd}: native backup force-stop limitation`, 'package did not remain stopped with process absent');
            } else ok(`${avd}: native backup force-stop limitation`);
          }
          backupStage('cleanup');
          backupStage('mounted-status', 'mountedScreenRefreshesNativeDeliveryInBothLocales');
          backupStage('cleanup');
          backupStage('ownership-and-destination', 'failuresRetentionAndCancellationUseTheNativeOwner');
          backupStage('cleanup');
          backupStage('activity-destruction', 'activityDestructionDoesNotWaitForNativeDelivery');
          backupStage('cleanup');
          backupStage('bounded-retries', 'nativeFailuresStopAfterThreeAttemptsUntilNextDay');
          backupStage('cleanup');
          if (!BACKUP_STAGES.size || BACKUP_STAGES.has('existing-manual')) {
          executedBackupStages.add('existing-manual');
          const manual = device(['shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
            'dev.engender.app.backup.AutoExportDeliveryTest#completeLargeBackupRoundTripsAndFailuresPreserveRecovery',
            'dev.engender.app.test/androidx.test.runner.AndroidJUnitRunner'], { timeout: 1_200_000 });
          writeFileSync(join(evidenceDir, `${avd}-backup-existing-manual.log`),
            `${manual.stdout ?? ''}${manual.stderr ?? ''}\nexit=${manual.status} signal=${manual.signal} error=${manual.error ?? ''}\n`);
          reportStage(`${avd}: existing large manual backup`, manual, { ok, fail });
          }
        } else console.log(`SKIP ${avd}: staged Archive production needs a supported WebView`);
      } finally { backupStage('cleanup'); }
    }
  } catch (e) {
    fail(`${avd}: emulator`, e.message ?? String(e));
  } finally {
    await stopEmulator();
    await sleep(3000);
  }
}

for (const stage of BACKUP_STAGES) if (!executedBackupStages.has(stage)) fail(`selected Android backup stage ${stage}`, 'selected stage never executed');
const failures = finish(BACKUP_STAGES.size ? 'ALL SELECTED ANDROID BACKUP STAGES PASS' : 'ALL ANDROID-TIER CHECKS PASS');
process.exit(failures ? 1 : 0);
