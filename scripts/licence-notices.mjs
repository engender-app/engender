/* The licence notices the app carries for what it ships (phase 15
   release-blockers ticket 10).

   engender is GPL-3.0-only, and most of what it bundles is MIT, ISC, BSD or
   Apache-2.0. Each of those asks for the same small thing when its code is
   passed on: the copyright line and the licence text travel with it. Until
   this ticket the app carried none of them - About said "Source code is
   public" and stopped there - so every APK and every hosted copy fell short
   of terms that cost nothing to keep.

   What counts as shipped is read off the build, not off package.json. The
   Vite plugin in vite.config.ts collects every module the client bundle and
   its workers pulled in and hands their ids here; a package is in the
   notices because its code is in the bundle. The lockfile is then what
   check-licences.mjs already reads, for the name, version and licence of
   each. A bundled package that cannot be matched to the lockfile, or that
   ships no licence text when its licence asks for one, fails the build: that
   is the check that every shipped package appears in the notices.

   Three things reach the app without passing through the bundler, and are
   named here by hand: the OCR engine and language data prepare-vendor-assets
   copies into static/, the fonts, and the Android libraries the APK carries
   around the WebView. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lockfilePackages, READ_BY_HAND } from './check-licences.mjs';

/** The Apache-2.0 text, for everything under it that ships none of its own. */
const APACHE = 'scripts/licence-texts/Apache-2.0.txt';

/** Licences that ask for no text to travel with the code. Everything else
    needs a licence file, from the package or from LICENCE_TEXT_BY_HAND. */
const NO_TEXT_REQUIRED = new Set(['0BSD', 'Unlicense']);

/** Files in a package directory that hold its licence or its notice. */
const LICENCE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

/** Bundled packages that ship no licence file of their own, and the text
    that stands in for it. Read by hand, like READ_BY_HAND in
    check-licences.mjs, with what was read written down.

    @type {Record<string, { file: string, read: string }>} */
export const LICENCE_TEXT_BY_HAND = {
  '@evolu/sqlite-wasm': {
    file: APACHE,
    read: 'package.json says Apache-2.0 and the tarball has no LICENSE; the Apache text itself is what the licence asks to pass on.'
  },
  '@sqlite.org/sqlite-wasm': {
    file: APACHE,
    read: 'The copy SQLocal nests: package.json says Apache-2.0 and the tarball has no LICENSE. SQLite itself, inside it, is public domain.'
  },
  '@tesseract.js-data/eng': {
    file: 'scripts/licence-texts/tesseract-js-data.txt',
    read: 'package.json says MIT, author Balearica; no LICENSE in the tarball or in github.com/naptha/tessdata.'
  },
  '@tesseract.js-data/pol': {
    file: 'scripts/licence-texts/tesseract-js-data.txt',
    read: 'Same repository and author as @tesseract.js-data/eng.'
  }
};

/** Copied from node_modules into static/ by scripts/prepare-vendor-assets.mjs
    and loaded by URL, so the bundler never sees them. tests/licence-notices
    .test.ts checks this list against that script's `from:` paths. */
export const VENDORED_PACKAGES = [
  'node_modules/tesseract.js',
  'node_modules/tesseract.js-core',
  'node_modules/@tesseract.js-data/eng',
  'node_modules/@tesseract.js-data/pol',
  'node_modules/pdfjs-dist'
];

/** The npm packages whose native halves are compiled into the APK. */
export const ANDROID_PACKAGES = ['node_modules/@capacitor/android', 'node_modules/@capacitor/app'];

/** The Android libraries around the WebView, by Maven group. Gradle's
    release runtime graph is the authority on what ships, and
    scripts/check-android-dependencies.mjs fails when a group in it is not
    covered here.

    @type {{ name: string, groups: string[], licence: string, files: string[] }[]} */
export const ANDROID_LIBRARIES = [
  {
    name: 'AndroidX',
    groups: ['androidx.'],
    licence: 'Apache-2.0',
    files: [APACHE]
  },
  {
    name: 'Kotlin standard library and coroutines',
    groups: ['org.jetbrains.kotlin', 'org.jetbrains.kotlinx'],
    licence: 'Apache-2.0',
    files: [APACHE]
  },
  {
    name: 'JetBrains annotations',
    groups: ['org.jetbrains:annotations'],
    licence: 'Apache-2.0',
    files: [APACHE]
  },
  {
    name: 'JSpecify annotations',
    groups: ['org.jspecify'],
    licence: 'Apache-2.0',
    files: [APACHE]
  },
  {
    name: 'Guava ListenableFuture',
    groups: ['com.google.guava'],
    licence: 'Apache-2.0',
    files: [APACHE]
  },
  {
    name: 'Apache Cordova',
    groups: ['org.apache.cordova'],
    licence: 'Apache-2.0',
    files: [APACHE, 'scripts/licence-texts/cordova-notice.txt']
  },
  {
    name: 'SQLCipher for Android',
    groups: ['net.zetetic'],
    licence: 'BSD-3-Clause',
    files: ['scripts/licence-texts/sqlcipher.txt']
  },
  {
    /* Linked into libsqlcipher.so rather than declared anywhere Gradle can
       see: the arm64 library in sqlcipher-android 4.9.0 carries the version
       string "OpenSSL 3.0.16 11 Feb 2025". No group, so nothing in the
       graph has to match it. */
    name: 'OpenSSL (inside SQLCipher)',
    groups: [],
    licence: 'Apache-2.0',
    files: [APACHE]
  },
  {
    name: 'Bouncy Castle',
    groups: ['org.bouncycastle'],
    licence: 'MIT',
    files: ['scripts/licence-texts/bouncycastle.txt']
  }
];

/** The type the app draws with, and the faces pdf.js substitutes for the
    standard PDF fonts. */
export const FONTS = [
  { name: 'Nunito', licence: 'OFL-1.1', files: ['static/fonts/OFL-nunito.txt'] },
  { name: 'Outfit', licence: 'OFL-1.1', files: ['static/fonts/OFL-outfit.txt'] },
  { name: 'Liberation Sans', licence: 'OFL-1.1', files: ['static/pdf-fonts/LICENSE_LIBERATION'] },
  { name: 'Foxit PDF fonts', licence: 'BSD-3-Clause', files: ['static/pdf-fonts/LICENSE_FOXIT'] }
];

/** Where in the lockfile a bundled module's package sits, or null for a
    module that is not from a package. The key is the lockfile's own -
    `node_modules/a/node_modules/@s/b` for a nested copy - so a module is
    credited to the copy it actually came from.

    Three kinds of module come from a package without a node_modules path:
    Vite's own helpers, the CommonJS interop Vite bundles, and Paraglide's
    runtime, which the build generates into src/lib/paraglide from the
    package's templates.

    @param {string} id
    @returns {string | null} */
export function packagePathOf(id) {
  const path = id.replace(/^\0/, '').replace(/[?#].*$/, '').replaceAll('\\', '/');
  if (/^vite\/|^commonjsHelpers/.test(path)) return 'node_modules/vite';
  if (path.includes('/src/lib/paraglide/')) return 'node_modules/@inlang/paraglide-js';
  const at = path.indexOf('node_modules/');
  if (at === -1) return null;
  const segments = path.slice(at).split('/');
  const out = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] !== 'node_modules') break;
    const name = segments[i + 1]?.startsWith('@') ? [segments[i + 1], segments[i + 2]] : [segments[i + 1]];
    if (name.some((part) => !part)) break;
    out.push('node_modules', ...name);
    i += name.length;
  }
  return out.length ? out.join('/') : null;
}

/**
 * @typedef {{ name: string, version: string, licence: string, texts: number[] }} NoticeEntry
 * @typedef {{ id: 'app' | 'android' | 'fonts', entries: NoticeEntry[] }} NoticeSection
 * @typedef {{ texts: string[], sections: NoticeSection[] }} Notices
 * @typedef {{ name: string, path: string, version?: string | null, licence: string | null }} LockPackage
 */

/**
 * The notices for a set of shipped package paths, and what stops them being
 * complete. Pure over its inputs: `lock` is the lockfile's packages, `files`
 * lists a directory's file names, `read` reads a file, both relative to the
 * project root.
 *
 * @param {{
 *   app: Iterable<string>,
 *   android?: Iterable<string>,
 *   lock: LockPackage[],
 *   files: (dir: string) => string[],
 *   read: (path: string) => string,
 *   androidLibraries?: typeof ANDROID_LIBRARIES,
 *   fonts?: typeof FONTS
 * }} input
 * @returns {{ notices: Notices, problems: string[] }}
 */
export function buildNotices({ app, android = [], lock, files, read, androidLibraries = [], fonts = [] }) {
  const byPath = new Map(lock.map((entry) => [entry.path, entry]));
  /** @type {string[]} */
  const texts = [];
  const textIndex = new Map();
  /** @type {string[]} */
  const problems = [];

  /** @param {string} text */
  const keep = (text) => {
    const clean = text.replace(/\r\n?/g, '\n').trim();
    if (!textIndex.has(clean)) {
      textIndex.set(clean, texts.length);
      texts.push(clean);
    }
    return textIndex.get(clean);
  };

  /** @param {Iterable<string>} paths @returns {NoticeEntry[]} */
  const packageEntries = (paths) => {
    /** @type {Map<string, NoticeEntry>} */
    const entries = new Map();
    for (const path of [...new Set(paths)].sort()) {
      const pkg = byPath.get(path);
      if (!pkg) {
        problems.push(`${path} is shipped but is not in package-lock.json, so its licence is unknown.`);
        continue;
      }
      const licence = pkg.licence ?? READ_BY_HAND[pkg.name] ?? null;
      if (!licence) {
        problems.push(`${path} is shipped and declares no licence. Record it in scripts/check-licences.mjs.`);
        continue;
      }
      const own = files(path).filter((file) => LICENCE_FILE.test(file)).sort();
      let indices = own.map((file) => keep(read(join(path, file))));
      if (!indices.length && pkg.name in LICENCE_TEXT_BY_HAND) {
        indices = [keep(read(LICENCE_TEXT_BY_HAND[pkg.name].file))];
      }
      if (!indices.length && !NO_TEXT_REQUIRED.has(licence)) {
        problems.push(
          `${path} is shipped under ${licence} with no licence file. Read where its text lives and add it to LICENCE_TEXT_BY_HAND in scripts/licence-notices.mjs.`
        );
        continue;
      }
      // Two nested copies of one version are one notice.
      const key = `${pkg.name}@${pkg.version}`;
      entries.set(key, { name: pkg.name, version: pkg.version ?? '', licence, texts: indices });
    }
    return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  /** @param {{ name: string, licence: string, files: string[] }[]} items @returns {NoticeEntry[]} */
  const fixedEntries = (items) =>
    items.map(({ name, licence, files: paths }) => ({ name, version: '', licence, texts: paths.map((path) => keep(read(path))) }));

  const sections = /** @type {NoticeSection[]} */ ([
    { id: 'app', entries: packageEntries(app) },
    {
      id: 'android',
      entries: [...packageEntries(android), ...fixedEntries(androidLibraries)].sort((a, b) => a.name.localeCompare(b.name))
    },
    { id: 'fonts', entries: fixedEntries(fonts) }
  ]);
  return { notices: { texts, sections }, problems };
}

/** buildNotices over this checkout's own files, for the lockfile paths
    of the packages the bundle shipped (packagePathOf maps a module to one).
    @param {string} root @param {Iterable<string>} shipped */
export function noticesFromDisk(root, shipped) {
  return buildNotices({
    app: new Set([...VENDORED_PACKAGES, ...shipped]),
    android: ANDROID_PACKAGES,
    lock: lockfilePackages(root),
    files: (dir) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)) : []),
    read: (path) => readFileSync(join(root, path), 'utf8'),
    androidLibraries: ANDROID_LIBRARIES,
    fonts: FONTS
  });
}

/** Which Maven coordinates in a Gradle dependency report no entry in
    ANDROID_LIBRARIES covers. Project dependencies (`project :capacitor-...`)
    are the npm packages in ANDROID_PACKAGES and are not Maven coordinates.

    @param {string} graph the text of `gradlew :app:dependencies`
    @param {typeof ANDROID_LIBRARIES} [libraries]
    @returns {string[]} */
export function uncoveredAndroidLibraries(graph, libraries = ANDROID_LIBRARIES) {
  const missing = new Set();
  for (const match of graph.matchAll(/[-\\+|] +([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)(?::[^\s]+)?/g)) {
    const coordinate = `${match[1]}:${match[2]}`;
    const covered = libraries.some(({ groups }) =>
      groups.some((group) => (group.includes(':') ? coordinate === group : coordinate.startsWith(group)))
    );
    if (!covered) missing.add(coordinate);
  }
  return [...missing].sort();
}
