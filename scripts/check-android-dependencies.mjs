/* Ticket 18's Android dependency policy in code rather than a one-time read:
   no Firebase, Play Services, analytics or proprietary runtime SDK families in
   the runtime graph we actually ship. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { uncoveredAndroidLibraries } from './licence-notices.mjs';

const FORBIDDEN = [
  /com\.google\.firebase:/,
  /com\.google\.android\.gms:/,
  /com\.google\.android\.play:/,
  /com\.google\.android\.datatransport:/,
  /com\.google\.android\.ads:/,
  /com\.google\.analytics:/,
  /com\.mixpanel\.android:/,
  /com\.amplitude:/,
  /io\.sentry:/,
  /com\.segment\.analytics\.android:/
];

/**
 * @param {string} text
 */
export function forbiddenDependencies(text) {
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    for (const pattern of FORBIDDEN) {
      if (pattern.test(line)) {
        const dep = line.match(/[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+/)?.[0] ?? line.trim();
        seen.add(dep);
      }
    }
  }
  return [...seen].sort();
}

/** `:app:dependencies` for what the release APK actually ships against. */
function readRuntimeGraph() {
  return execFileSync(
    './gradlew',
    [':app:dependencies', '--configuration', 'releaseRuntimeClasspath', '--console=plain'],
    {
      cwd: 'android',
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit']
    }
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const graph = readRuntimeGraph();
  const blocked = forbiddenDependencies(graph);
  for (const dep of blocked) console.log(`FAIL forbidden dependency: ${dep}`);
  /* And every library that does ship has its notice in the app's licences
     screen (phase 15 release-blockers ticket 10): the list there is written
     by hand, so a dependency arriving through an upgrade is caught here. */
  const unlisted = uncoveredAndroidLibraries(graph);
  for (const dep of unlisted) console.log(`FAIL ${dep} ships with no notice: add it to ANDROID_LIBRARIES in scripts/licence-notices.mjs`);
  if (blocked.length || unlisted.length) {
    console.log(`\n${blocked.length + unlisted.length} problem(s) in Android runtime graph.`);
    process.exit(1);
  }
  console.log('PASS Android runtime graph contains no Firebase, Play Services, analytics or blocked SDK families, and every library in it has a notice.');
}
