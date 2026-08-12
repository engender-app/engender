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
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

const DEFAULT_ROOT = '/home/journal/releases';
const DEFAULT_CURRENT = '/home/journal/current';

function die(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  node scripts/journal-release.mjs deploy <source-dir> [--root DIR] [--current LINK]
  node scripts/journal-release.mjs rollback <release-name> [--root DIR] [--current LINK] [--force]
  node scripts/journal-release.mjs rollback --previous [--root DIR] [--current LINK] [--force]
  node scripts/journal-release.mjs list [--root DIR] [--current LINK]`);
}

function parseOptions(argv) {
  const options = {
    root: DEFAULT_ROOT,
    current: DEFAULT_CURRENT,
    force: false,
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
  const name = releaseName(metadata);

  mkdirSync(options.root, { recursive: true });
  const targetPath = join(options.root, name);
  if (existsSync(targetPath)) {
    die(`Release ${name} already exists at ${targetPath}`);
  }

  const staging = join(options.root, `.staging-${name}-${Date.now()}-${process.pid}`);
  const previous = currentTarget(options.current);

  try {
    cpSync(sourcePath, staging, { recursive: true, errorOnExist: true, force: false });
    renameSync(staging, targetPath);
    switchCurrent(options.current, targetPath);
  } finally {
    rmSync(staging, { recursive: true, force: true });
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

  switchCurrent(options.current, target);
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
