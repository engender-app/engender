/* Deploy and roll back immutable web releases on the VPS (phase 2 ticket 05).

   Deploy copies one complete release directory under a stable name and then
   switches the `current` symlink with one rename, so no request can see a half
   copied release. Rollback uses the same switch in reverse, with one guard:
   unless forced, it refuses a target whose schemaMax is lower than the
   currently deployed release.

   Commands:
     node scripts/journal-release.mjs deploy <source-dir> [--root DIR] [--current LINK]
     node scripts/journal-release.mjs rollback <release-name> [--root DIR] [--current LINK] [--force]
     node scripts/journal-release.mjs rollback --previous [--root DIR] [--current LINK] [--force]
     node scripts/journal-release.mjs list [--root DIR] [--current LINK] */
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isReleaseVersion } from './app-version.mjs';

const DEFAULT_ROOT = '/home/journal/releases';
const DEFAULT_CURRENT = '/home/journal/current';

function die(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  node scripts/journal-release.mjs deploy <source-dir> [--root DIR] [--current LINK] [--allow-development-version]
  node scripts/journal-release.mjs rollback <release-name> [--root DIR] [--current LINK] [--force]
  node scripts/journal-release.mjs rollback --previous [--root DIR] [--current LINK] [--force]
  node scripts/journal-release.mjs list [--root DIR] [--current LINK]`);
}

function parseOptions(argv) {
  const options = {
    root: DEFAULT_ROOT,
    current: DEFAULT_CURRENT,
    force: false,
    allowDevelopmentVersion: false,
    previous: false,
    positional: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') {
      options.root = argv[i + 1] ?? die('Missing value after --root');
      i += 1;
      continue;
    }
    if (arg === '--current') {
      options.current = argv[i + 1] ?? die('Missing value after --current');
      i += 1;
      continue;
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--allow-development-version') {
      options.allowDevelopmentVersion = true;
      continue;
    }
    if (arg === '--previous') {
      options.previous = true;
      continue;
    }
    options.positional.push(arg);
  }

  return options;
}

function requiredFilesPresent(directory) {
  const required = ['index.html', 'service-worker.js', '_app/version.json', 'release.json'];
  return required.filter((path) => !existsSync(join(directory, path)));
}

function readReleaseMetadata(directory) {
  const path = join(directory, 'release.json');
  if (!existsSync(path)) die(`No release.json in ${directory}`);
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const missing = ['version', 'buildId', 'schemaMax'].filter((key) => parsed[key] === undefined);
  if (missing.length) die(`release.json in ${directory} misses: ${missing.join(', ')}`);
  if (!Number.isInteger(parsed.schemaMax) || parsed.schemaMax <= 0) {
    die(`release.json in ${directory} has invalid schemaMax: ${parsed.schemaMax}`);
  }
  return parsed;
}

function releaseName(metadata) {
  return `${metadata.version}--${metadata.buildId}`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function listReleases(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((name) => ({ name, path: join(root, name) }))
    .filter((entry) => {
      try {
        return statSync(entry.path).isDirectory() && existsSync(join(entry.path, 'release.json'));
      } catch {
        return false;
      }
    })
    .sort((a, b) => statSync(b.path).mtimeMs - statSync(a.path).mtimeMs);
}

function currentTarget(current) {
  if (!existsSync(current)) return null;
  if (!lstatSync(current).isSymbolicLink()) {
    die(`${current} exists but is not a symlink`);
  }
  return realpathSync(current);
}

function switchCurrent(current, targetPath) {
  mkdirSync(resolve(current, '..'), { recursive: true });
  const next = `${current}.next-${process.pid}`;
  rmSync(next, { force: true });
  symlinkSync(targetPath, next);
  renameSync(next, current);
}

/** A first PDF can request its old worker after either deploy or rollback.
    Keep only the selected and previously active releases' original workers;
    the fallback never becomes part of either immutable release tree. */
function preparePdfNamespace(previous, target, root) {
  const namespaces = join(root, '.pdf-workers');
  mkdirSync(namespaces, { recursive: true });
  chmodSync(namespaces, 0o755);
  const namespace = mkdtempSync(join(namespaces, 'generation-'));
  chmodSync(namespace, 0o755);
  try {
    for (const release of [previous, target]) {
      if (!release) continue;
      const workers = join(release, '_app/immutable/workers');
      if (!existsSync(workers)) continue;
      for (const entry of readdirSync(workers, { withFileTypes: true })) {
        if (!entry.isFile() || !/^pdf-worker-[A-Za-z0-9_-]+\.js(?:\.br|\.gz)?$/.test(entry.name)) continue;
        const bytes = readFileSync(join(workers, entry.name));
        const destination = join(namespace, entry.name);
        if (existsSync(destination) && !bytes.equals(readFileSync(destination))) {
          throw new Error(`PDF worker identity collision: ${entry.name}`);
        }
        writeFileSync(destination, bytes);
        chmodSync(destination, 0o644);
      }
    }
    return namespace;
  } catch (error) {
    rmSync(namespace, { recursive: true, force: true });
    throw error;
  }
}

function switchRelease(current, target, root, pdfNamespace) {
  const pdfCurrent = join(root, '.pdf-current');
  try {
    // The union includes the outgoing release, so publishing it first is safe.
    switchCurrent(pdfCurrent, pdfNamespace);
    switchCurrent(current, target);
  } finally {
    if (!existsSync(pdfCurrent) || realpathSync(pdfCurrent) !== pdfNamespace) {
      rmSync(pdfNamespace, { recursive: true, force: true });
    }
  }
  for (const entry of readdirSync(join(root, '.pdf-workers'))) {
    const obsolete = join(root, '.pdf-workers', entry);
    if (obsolete !== pdfNamespace) rmSync(obsolete, { recursive: true, force: true });
  }
}

/** Keep exact OCR generations reachable after the release symlink switches.
    Root URLs belong to pre-generation pages and keep their original bytes. */
function retainOcrAssets(previous, staging) {
  const manifest = join(staging, 'tesseract/assets.json');
  const legacy = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).legacyRuntime ?? [] : [];
  for (const asset of legacy) {
    if (!/^\/_app\/immutable\/chunks\/[A-Za-z0-9_-]+\.js$/.test(asset.path) || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      throw new Error('Invalid legacy OCR identity');
    }
    const target = join(staging, asset.path);
    const prior = previous ? join(previous, asset.path) : undefined;
    const source = prior && existsSync(prior) ? prior : target;
    if (!existsSync(source)) throw new Error(`Missing legacy OCR runtime: ${asset.path}`);
    for (const path of new Set([source, ...(existsSync(target) ? [target] : [])])) {
      if (createHash('sha256').update(readFileSync(path)).digest('hex') !== asset.sha256) {
        throw new Error(`Legacy OCR identity mismatch: ${asset.path}`);
      }
    }
    if (source !== target) {
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target);
    }
  }
  if (!previous) return;
  const oldRoot = join(previous, 'tesseract');
  if (!existsSync(oldRoot)) return;
  const nextRoot = join(staging, 'tesseract');
  mkdirSync(nextRoot, { recursive: true });
  for (const entry of readdirSync(oldRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
    const source = join(oldRoot, entry.name);
    const target = join(nextRoot, entry.name);
    if (existsSync(target)) {
      for (const name of readdirSync(source, { recursive: true })) {
        const oldFile = join(source, name);
        if (!statSync(oldFile).isFile()) continue;
        const nextFile = join(target, name);
        if (!existsSync(nextFile) || !readFileSync(oldFile).equals(readFileSync(nextFile))) {
          throw new Error(`OCR generation collision: ${entry.name}/${name}`);
        }
      }
    } else cpSync(source, target, { recursive: true });
  }
  for (const name of ['worker.min.js', 'tesseract-core.wasm.js', 'tesseract-core.wasm',
    'lang-data/eng.traineddata', 'lang-data/pol.traineddata']) {
    const plain = join(oldRoot, name);
    const source = existsSync(plain) ? plain : plain + '.gz';
    if (!existsSync(source)) continue;
    const target = join(nextRoot, name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
}

function deploy(source, options) {
  const sourcePath = resolve(source);
  if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) {
    die(`Source ${sourcePath} is not a directory`);
  }

  const missing = requiredFilesPresent(sourcePath);
  if (missing.length) {
    die(`Source ${sourcePath} is not a complete release; missing: ${missing.join(', ')}`);
  }

  const metadata = readReleaseMetadata(sourcePath);
  if (!options.allowDevelopmentVersion && !isReleaseVersion(metadata.version)) {
    die(
      `Refusing to deploy development version ${metadata.version}. ` +
        'Use --allow-development-version only for local checks or explicit incidents.'
    );
  }
  const name = releaseName(metadata);
  const previous = currentTarget(options.current);
  if (previous) {
    const currentMeta = readReleaseMetadata(previous);
    if (metadata.schemaMax < currentMeta.schemaMax) {
      die(`Refusing deploy: schemaMax ${metadata.schemaMax} is lower than current ${currentMeta.schemaMax}`);
    }
    const stable = /^\d+\.\d+\.\d+$/;
    if (stable.test(metadata.version) && stable.test(currentMeta.version)) {
      const candidate = metadata.version.split('.').map(Number);
      const currentVersion = currentMeta.version.split('.').map(Number);
      const difference = candidate.map((value, index) => value - currentVersion[index]).find((value) => value !== 0);
      if (difference < 0) die(`Refusing deploy of ${metadata.version} over newer ${currentMeta.version}`);
    }
  }

  mkdirSync(options.root, { recursive: true });
  const targetPath = join(options.root, name);
  if (existsSync(targetPath)) {
    die(`Release ${name} already exists at ${targetPath}`);
  }

  const staging = join(options.root, `.staging-${name}-${Date.now()}-${process.pid}`);
  let pdfNamespace;

  try {
    cpSync(sourcePath, staging, { recursive: true, errorOnExist: true, force: false });
    retainOcrAssets(previous, staging);
    pdfNamespace = preparePdfNamespace(previous, staging, options.root);
    renameSync(staging, targetPath);
    switchRelease(options.current, targetPath, options.root, pdfNamespace);
  } finally {
    rmSync(staging, { recursive: true, force: true });
    const pdfCurrent = join(options.root, '.pdf-current');
    if (pdfNamespace && (!existsSync(pdfCurrent) || realpathSync(pdfCurrent) !== pdfNamespace)) {
      rmSync(pdfNamespace, { recursive: true, force: true });
    }
  }

  console.log(`Deployed ${name}`);
  console.log(`Current -> ${targetPath}`);
  if (previous) console.log(`Previous kept at ${previous}`);
}

function resolveRollbackTarget(options) {
  const releases = listReleases(options.root);
  if (releases.length === 0) die(`No releases in ${options.root}`);

  const current = currentTarget(options.current);

  if (options.previous) {
    if (!current) die('No current symlink to roll back from');
    const previous = releases.find((entry) => realpathSync(entry.path) !== current);
    if (!previous) die('No previous release found');
    return previous.path;
  }

  const name = options.positional[0];
  if (!name) die('Rollback needs a release name, or --previous');
  const path = join(options.root, basename(name));
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    die(`Release ${name} does not exist under ${options.root}`);
  }
  if (!existsSync(join(path, 'release.json'))) {
    die(`Release ${name} has no release.json`);
  }
  return path;
}

function rollback(options) {
  const current = currentTarget(options.current);
  if (!current) die('No current release is selected');

  const target = resolveRollbackTarget(options);
  const currentMeta = readReleaseMetadata(current);
  const targetMeta = readReleaseMetadata(target);

  if (!options.force && targetMeta.schemaMax < currentMeta.schemaMax) {
    die(
      `Refusing rollback to ${basename(target)}: schemaMax ${targetMeta.schemaMax} is lower than ` +
        `current ${currentMeta.schemaMax}. Use --force only if you are certain no deployed journal needs it.`
    );
  }

  const pdfNamespace = preparePdfNamespace(current, target, options.root);
  switchRelease(options.current, target, options.root, pdfNamespace);
  console.log(`Rolled back to ${basename(target)}`);
  console.log(`Current -> ${target}`);
}

function list(options) {
  const current = currentTarget(options.current);
  const releases = listReleases(options.root);
  if (releases.length === 0) {
    console.log(`No releases in ${options.root}`);
    return;
  }

  for (const entry of releases) {
    const marker = current && realpathSync(entry.path) === current ? '*' : ' ';
    const metadata = readReleaseMetadata(entry.path);
    console.log(`${marker} ${entry.name}  schemaMax=${metadata.schemaMax}  version=${metadata.version}`);
  }
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') {
  usage();
  process.exit(command ? 0 : 1);
}

const options = parseOptions(rest);

if (command === 'deploy') {
  if (!options.positional[0]) die('Deploy needs a source directory');
  deploy(options.positional[0], options);
} else if (command === 'rollback') {
  rollback(options);
} else if (command === 'list') {
  list(options);
} else {
  usage();
  die(`Unknown command: ${command}`);
}
