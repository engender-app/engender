/* F-Droid rebuild attempt for ticket 18: build the public-source Android
   release path twice, compare bytes, and write a report whether or not the
   bytes match. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPORT_DIR = 'ci-logs';
const REPORT_PATH = join(REPORT_DIR, 'fdroid-rebuild.md');
const APK = 'android/app/build/outputs/apk/release/app-release-unsigned.apk';

function run(command, args, cwd = process.cwd()) {
  execFileSync(command, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function buildUnsignedRelease() {
  run('./gradlew', [':app:assembleRelease'], 'android');
}

function cleanAndroid() {
  run('./gradlew', [':app:clean'], 'android');
}

mkdirSync(REPORT_DIR, { recursive: true });

let digestOne = null;
let digestTwo = null;
let status = 'attempt-failed';
let notes = '';

try {
  cleanAndroid();
  buildUnsignedRelease();
  digestOne = sha256(APK);

  cleanAndroid();
  buildUnsignedRelease();
  digestTwo = sha256(APK);

  status = digestOne === digestTwo ? 'reproducible' : 'not-reproducible';
  notes =
    status === 'reproducible'
      ? 'Both unsigned APK builds are byte-identical.'
      : 'Unsigned APK builds differ. This is recorded for F-Droid metadata and release communication.';
} catch (error) {
  notes = error instanceof Error ? error.message : String(error);
}

const lines = [
  '# F-Droid rebuild report',
  '',
  `- Status: ${status}`,
  `- First build SHA256: ${digestOne ?? 'n/a'}`,
  `- Second build SHA256: ${digestTwo ?? 'n/a'}`,
  `- Note: ${notes}`,
  '',
  'F-Droid signs rebuilt artifacts with its own key, so update compatibility',
  'with APKs signed by this repository is not expected.'
];

writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
console.log(`Wrote ${REPORT_PATH}`);
