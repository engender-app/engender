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
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createReporter } from '../browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const androidDir = join(repo, 'android');
const { ok, fail, finish } = createReporter();

/* The emulator segfaults on this machine when started with -no-window, so
   it is started windowed even in an automated run. Set ANDROID_TIER_HEADLESS=1
   on a machine where that is not true. */
const HEADLESS = process.env.ANDROID_TIER_HEADLESS === '1';
const AVDS = (process.env.ANDROID_TIER_AVDS ?? 'gd26,tracker35').split(',').filter(Boolean);
const BOOT_TIMEOUT_MS = 300_000;

/** The AVDs whose WebView is too old to start the app, so only the native
    half is asked of them. See the header for why this is not a gap. */
const NATIVE_ONLY = new Set(['gd26']);
/* The two suites that need no WebView: what the native SQLite build has
   (ticket 11) and what Android Keystore does with the journal's data key
   (ticket 13). The Keystore one is worth having on the older emulator in
   particular - below API 30 the key is authorized by time rather than
   per-operation, and that branch exists nowhere else. */
const NATIVE_TESTS = [
  'dev.barankiewicz.genderdiary.sqlite.NativeSqliteCapabilitiesTest',
  'dev.barankiewicz.genderdiary.keystore.JournalKeystoreTest'
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

/** Waits for the emulator to finish booting, not merely to appear in `adb devices`. */
async function waitForBoot(deadline) {
  while (Date.now() < deadline) {
    const booted = run(adb, ['shell', 'getprop', 'sys.boot_completed']).stdout?.trim();
    if (booted === '1') return true;
    await sleep(2000);
  }
  return false;
}

async function startEmulator(avd) {
  const args = ['-avd', avd, '-no-snapshot', '-no-audio', '-wipe-data'];
  if (HEADLESS) args.push('-no-window');
  const child = spawn(emulatorBin, args, { env, detached: true, stdio: 'ignore' });
  child.unref();

  run(adb, ['wait-for-device'], { timeout: BOOT_TIMEOUT_MS });
  const booted = await waitForBoot(Date.now() + BOOT_TIMEOUT_MS);
  if (!booted) throw new Error(`${avd} did not finish booting within ${BOOT_TIMEOUT_MS / 1000}s`);

  // An emulator that is "booted" can still be showing the lock screen.
  run(adb, ['shell', 'input', 'keyevent', '82']);
  return child;
}

function stopEmulator() {
  run(adb, ['emu', 'kill']);
  run(adb, ['kill-server']);
}

const RESULTS_DIR = join(androidDir, 'app/build/outputs/androidTest-results/connected');

/** Gradle writes one XML per device and leaves earlier ones in place, so
    without this the second emulator inherits the first one's verdicts - and
    a run that skipped a test reports the last run's result for it. */
function clearResults() {
  rmSync(RESULTS_DIR, { recursive: true, force: true });
}

/** Parses `gradlew connectedAndroidTest` output into one line per test. */
function reportInstrumentation(avd, output) {
  /* Gradle prints a line per failing test and stays quiet about passing
     ones, so the XML report is what says which tests ran at all. */
  const resultsDir = RESULTS_DIR;

  let files = [];
  try {
    files = readdirSync(resultsDir, { recursive: true }).filter((f) => String(f).endsWith('.xml'));
  } catch {
    fail(
      `${avd}: instrumentation results`,
      `no result XML in ${resultsDir}; gradle said:\n${output.slice(-1500)}`
    );
    return;
  }

  let sawAny = false;
  for (const file of files) {
    const xml = readFileSync(join(resultsDir, String(file)), 'utf8');
    for (const [, attrs, body] of xml.matchAll(/<testcase([^>]*)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const name = /name="([^"]*)"/.exec(attrs)?.[1] ?? '?';
      const klass = (/classname="([^"]*)"/.exec(attrs)?.[1] ?? '').split('.').pop();
      const failure = body && /<(failure|error)[^>]*>([\s\S]*?)<\/\1>/.exec(body);
      sawAny = true;
      if (failure) fail(`${avd} ${klass}.${name}`, failure[2].trim().split('\n')[0]);
      else ok(`${avd} ${klass}.${name}`);
    }
  }

  if (!sawAny) fail(`${avd}: instrumentation results`, `no test cases in ${resultsDir}\n${output.slice(-800)}`);
}

// --- Build the probe bundles the instrumentation tests serve ---------------
for (const probe of ['contract', 'encryption']) {
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

for (const avd of AVDS) {
  try {
    clearResults();
    await startEmulator(avd);
    ok(`${avd} booted`);

    const nativeOnly = NATIVE_ONLY.has(avd);
    if (nativeOnly) {
      console.log(`  (${avd}: native checks only - its WebView predates the app's Chrome 87 floor)`);
    }

    /* :app: rather than the whole build. The empty capacitor-cordova-android-plugins
       module Capacitor generates has an androidTest variant of its own, and it
       fails to dex on a Kotlin stdlib clash between androidx.test's 1.8.22 and a
       transitive 1.6.21. Nothing of ours is in that module. */
    const test = run(
      './gradlew',
      [
        ':app:connectedDebugAndroidTest',
        '--console=plain',
        ...(nativeOnly ? [`-Pandroid.testInstrumentationRunnerArguments.class=${NATIVE_TESTS}`] : [])
      ],
      {
        cwd: androidDir,
        env: { ...env, ...gradleEnv },
        timeout: 900_000
      }
    );
    reportInstrumentation(avd, `${test.stdout ?? ''}${test.stderr ?? ''}`);
  } catch (e) {
    fail(`${avd}: emulator`, e.message ?? String(e));
  } finally {
    stopEmulator();
    await sleep(3000);
  }
}

const failures = finish('ALL ANDROID-TIER CHECKS PASS');
process.exit(failures ? 1 : 0);
