/* The release notes for one version, read out of CHANGELOG.md (phase 2 ticket
   06). The release pipeline calls this before it builds anything, so a tag
   with no notes fails while nothing has been published yet.

   Four call-outs are required, and they are the four a person needs before
   installing: whether the database schema moved, whether the Archive format
   moved, whether anything about encryption has to migrate, and how old a
   version this release can still update from. "none" is a fine answer.
   Nothing at all is not, because a skipped line reads like an answered one.

   Run it directly - `node scripts/release-notes.mjs [version]` - to print
   what the release would say. Without an argument it asks
   scripts/app-version.mjs what this checkout is, the same way the pipeline
   does, so the notes and the bundle cannot end up describing different
   versions. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appVersion } from './app-version.mjs';

/** The lines a release section has to answer, exactly as they are written. */
export const REQUIRED_CALL_OUTS = [
  'Schema changes',
  'Archive format changes',
  'Security migrations',
  'Minimum supported version'
];

/**
 * The body of the section a release names, without its heading.
 *
 * @param {string} changelog  the whole CHANGELOG.md
 * @param {string} version    the public version name being released
 * @returns {string}
 * @throws when there is no section for that version, or it skips a call-out
 */
export function extractReleaseNotes(changelog, version) {
  const lines = changelog.split('\n');
  // The first token of the heading is the version; anything after it, a date
  // most likely, is the author's business.
  const start = lines.findIndex((line) => line.startsWith('## ') && line.slice(3).trim().split(/\s+/)[0] === version);
  if (start === -1) {
    throw new Error(
      `CHANGELOG.md has no section for ${version}. Add a "## ${version}" heading, ` +
        'or rename the Unreleased one if that is what this tag releases.'
    );
  }

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const notes = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();

  const unanswered = REQUIRED_CALL_OUTS.filter((label) => {
    const line = notes.split('\n').find((text) => text.trim().toLowerCase().startsWith(`- ${label.toLowerCase()}:`));
    return !line || !line.slice(line.indexOf(':') + 1).trim();
  });
  if (unanswered.length) {
    throw new Error(
      `The ${version} notes in CHANGELOG.md answer nothing for: ${unanswered.join(', ')}. ` +
        'Write "none" where that is the answer.'
    );
  }

  return notes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2] ?? appVersion();
  try {
    console.log(extractReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
