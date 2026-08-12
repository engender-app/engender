/* What a signed tag turns into (phase 2 ticket 06): a web bundle, a source
   archive, checksums over both, and the proof that the bundle can be rebuilt
   from the same tag byte for byte.

   The version comes from scripts/app-version.mjs, which reads the signed tag,
   and this script refuses to package anything else. A development version in
   a release artifact is the failure ADR-0022 exists to prevent, and it is
   cheaper to refuse here than to unpublish a release later.

   Reproducibility is checked rather than claimed: the build runs twice and the
   two bundles have to have the same digest. A checksum over a bundle nobody
   can rebuild says only that the download was not corrupted, which is the
   smaller half of what a checksum is for. Two builds also cost two minutes,
   and a release happens rarely.

   Everything in the output directory is checksummed, including files this
   script did not write. That is how ticket 18's signed Android artifacts join
   a release: put them in the directory before this runs.

   Run `node scripts/package-release.mjs [--out dist/release]`. On a checkout
   with no signed tag, GENDER_DIARY_VERSION=<version> is the deliberate way in
   (ADR-0022) and a dry run of the whole path. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appVersion, isReleaseVersion } from './app-version.mjs';

/** Text that must never reach a downloadable artifact, whatever holds it. */
const SECRETS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/,
  // Gradle's signing block, which ticket 18 will have the credentials for.
  /storePassword\s*=/,
  /keyPassword\s*=/
];

/** File names that are a private key or a store holding one. */
const SECRET_NAMES = /\.(jks|keystore|p12|pfx|pem|key)$/i;

const out = (() => {
  const flag = process.argv.indexOf('--out');
  return flag === -1 ? 'dist/release' : process.argv[flag + 1];
})();

const version = appVersion();
if (!isReleaseVersion(version)) {
  console.error(
    `Refusing to package ${version}. A release needs a signed v<semver> tag on an ` +
      'unedited tree, or GENDER_DIARY_VERSION set deliberately (ADR-0022).'
  );
  process.exit(1);
}

const run = (command, args, env) =>
  execFileSync(command, args, { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...env } });

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Every file under `path`, recursively, as paths. */
function walk(path, files = []) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

/** `npm run build`, told which version it is building. */
function build() {
  run('npm', ['run', 'build'], { GENDER_DIARY_VERSION: version });
}

/**
 * `build/` as one file, with every field tar records about the filesystem
 * either sorted or flattened - names in order, no owner, one fixed
 * timestamp - and gzip told not to stamp the time either. Left to itself, tar
 * writes the moment of the build into the archive and no two runs agree.
 */
function packWebBundle(path) {
  run('sh', [
    '-c',
    `tar --create --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 --format=gnu ` +
      `--directory=build . | gzip --no-name --best > ${JSON.stringify(path)}`
  ]);
}

/** The tagged tree as `git archive` writes it, which is the commit's contents
    and nothing a working tree may have added. */
function packSource(path) {
  run('sh', [
    '-c',
    `git archive --format=tar --prefix=gender-diary-${version}/ HEAD | gzip --no-name --best > ${JSON.stringify(path)}`
  ]);
}

/** Anything in the artifacts that looks like a key, a password or a store. */
function secretsIn(directory) {
  const problems = [];
  for (const file of walk(directory)) {
    if (SECRET_NAMES.test(file)) {
      problems.push(`${file} is named like a private key or a keystore`);
      continue;
    }
    // Compressed artifacts are read as bytes; a PEM header survives as text
    // in anything uncompressed and is what an accident looks like.
    const text = readFileSync(file, 'latin1');
    for (const pattern of SECRETS) {
      if (pattern.test(text)) problems.push(`${file} contains ${pattern.source}`);
    }
  }
  return problems;
}

mkdirSync(out, { recursive: true });
const webBundle = join(out, `gender-diary-web-${version}.tar.gz`);
const sourceArchive = join(out, `gender-diary-src-${version}.tar.gz`);

console.log(`\n=== Building ${version} ===`);
build();
packWebBundle(webBundle);
packSource(sourceArchive);

console.log('\n=== Building it again, to see whether the tag is enough to rebuild it ===');
const second = join(out, `.reproducibility-check.tar.gz`);
build();
packWebBundle(second);
const [once, twice] = [sha256(webBundle), sha256(second)];
rmSync(second);
if (once !== twice) {
  console.error(
    `\nThe two builds of ${version} differ (${once.slice(0, 12)} vs ${twice.slice(0, 12)}).\n` +
      'Something in the build is reading the clock or the filesystem order. A checksum\n' +
      'over a bundle that cannot be rebuilt is worth less than it looks, so this stops here.'
  );
  process.exit(1);
}
console.log(`Both builds: ${once}`);

const leaked = secretsIn(out);
if (leaked.length) {
  console.error('\nRefusing to publish. Found in the artifacts:');
  for (const problem of leaked) console.error(`  ${problem}`);
  process.exit(1);
}

/* Last, so it covers whatever else is in the directory - a signed APK from
   ticket 18 included - and never itself. */
const sums = readdirSync(out)
  .filter((name) => name !== 'SHA256SUMS' && statSync(join(out, name)).isFile())
  .sort()
  .map((name) => `${sha256(join(out, name))}  ${name}`);
writeFileSync(join(out, 'SHA256SUMS'), `${sums.join('\n')}\n`);

console.log(`\n=== ${version} ===`);
for (const line of sums) console.log(line);
console.log(`\nIn ${out}, with SHA256SUMS. No key, password or keystore in any of it.`);
