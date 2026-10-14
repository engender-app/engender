/* What a release is allowed to say about itself (phase 2 ticket 06). The four
   call-outs are the ones a person needs before installing: whether the
   database schema moved, whether the Archive format moved, whether anything
   about encryption has to migrate, and how old a version this release can
   still update from. A release with an empty answer to one of those is a
   release nobody can decide about, so the pipeline refuses it rather than
   publishing notes that quietly skip it. */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { migrations } from '../src/lib/data/sqlite/migrations.ts';
import { REQUIRED_CALL_OUTS, extractReleaseNotes, validateStableReleaseNotes } from '../scripts/release-notes.mjs';

/** A changelog section with every call-out answered. */
const complete = (version: string, answer = 'none') =>
  [
    `## ${version}`,
    '',
    'Prose a person reads first.',
    '',
    ...REQUIRED_CALL_OUTS.map((label) => `- ${label}: ${answer}`),
    ''
  ].join('\n');

const changelog = (...sections: string[]) => ['# Changelog', '', ...sections].join('\n');

describe('extractReleaseNotes', () => {
  it('returns the section for the version being released', () => {
    const notes = extractReleaseNotes(changelog(complete('1.2.3')), '1.2.3');
    expect(notes).toContain('Prose a person reads first.');
    expect(notes).toContain('- Schema changes: none');
  });

  it('stops at the next release and does not carry its notes along', () => {
    const notes = extractReleaseNotes(changelog(complete('1.2.3', 'the new one'), complete('1.2.2', 'the old one')), '1.2.3');
    expect(notes).toContain('the new one');
    expect(notes).not.toContain('the old one');
  });

  it('leaves the heading out, since the release already carries the version', () => {
    expect(extractReleaseNotes(changelog(complete('1.2.3')), '1.2.3')).not.toContain('## 1.2.3');
  });

  it('reads a heading with a date after the version', () => {
    const dated = complete('1.2.3').replace('## 1.2.3', '## 1.2.3 - 2026-09-01');
    expect(extractReleaseNotes(changelog(dated), '1.2.3')).toContain('Prose a person reads first.');
  });

  it('refuses a version with no section of its own', () => {
    // Including the case the tag was cut before the Unreleased heading was
    // renamed, which is the way this fails in practice.
    const unreleased = complete('1.2.3').replace('## 1.2.3', '## Unreleased');
    expect(() => extractReleaseNotes(changelog(unreleased), '1.2.3')).toThrow(/no section for 1\.2\.3/i);
  });

  it('refuses a section that skips a call-out', () => {
    const missing = complete('1.2.3').replace('- Archive format changes: none\n', '');
    expect(() => extractReleaseNotes(changelog(missing), '1.2.3')).toThrow(/Archive format changes/);
  });

  it('refuses a call-out with nothing after the colon', () => {
    // An unanswered call-out reads as an answered one at a glance, which is
    // worse than a missing line.
    const blank = complete('1.2.3').replace('- Security migrations: none', '- Security migrations:');
    expect(() => extractReleaseNotes(changelog(blank), '1.2.3')).toThrow(/Security migrations/);
  });

  it('accepts a call-out answered at length rather than with "none"', () => {
    const real = complete('1.2.3', 'schema 4 adds the lab-result table; the migration runs on first open');
    expect(extractReleaseNotes(changelog(real), '1.2.3')).toContain('lab-result table');
  });

  it('names every missing call-out at once rather than one per attempt', () => {
    const bare = ['## 1.2.3', '', 'Prose only.', ''].join('\n');
    const error = (() => {
      try {
        extractReleaseNotes(changelog(bare), '1.2.3');
      } catch (e) {
        return (e as Error).message;
      }
    })();
    for (const label of REQUIRED_CALL_OUTS) expect(error).toContain(label);
  });
});

describe('published stable release notes', () => {
  it('renders the actual candidate schema in the section used by publication', () => {
    const output = execFileSync(process.execPath, ['scripts/release-notes.mjs', '1.0.0'], { encoding: 'utf8' });
    const schema = Math.max(...migrations.map((migration) => migration.version));
    validateStableReleaseNotes(output.trim(), schema);
    expect(output).not.toContain('{{schema}}');
    expect(output).toContain(`this release uses schema ${schema}.`);
    expect(output).toContain('1.0.0-rc.1 start at schema 88');
  });

  it('rejects stale schema and minimum-version facts in published output', () => {
    const output = extractReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), '1.0.0');
    const schema = Math.max(...migrations.map((migration) => migration.version));
    expect(() => validateStableReleaseNotes(output.replace(`uses schema ${schema}`, 'uses schema 86'), schema))
      .toThrow(/candidate schema/);
    expect(() => validateStableReleaseNotes(output.replace('- Minimum supported version: 1.0.0-rc.1.', '- Minimum supported version: 1.0.0.'), schema))
      .toThrow(/support updates/);
    expect(() => validateStableReleaseNotes(output, schema + 1)).toThrow(/candidate schema/);
  });

  it('refuses stale facts in the actual published section even when Unreleased is correct', () => {
    const changelog = readFileSync('CHANGELOG.md', 'utf8');
    expect(() => extractReleaseNotes(changelog.replace('this release uses schema {{schema}}', 'this release uses schema 86'), '1.0.0'))
      .toThrow(/candidate schema/);
    expect(() => extractReleaseNotes(changelog.replace('## 1.0.0\n', '## 1.0.1\n'), '1.0.0'))
      .toThrow(/no section for 1\.0\.0/);
  });
});
