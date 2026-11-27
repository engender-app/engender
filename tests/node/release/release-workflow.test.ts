import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8');

function replayPublish(version: string): string[] {
  const step = workflow.split('      - name: Publish\n')[1].split('\n      # First upload')[0];
  const script = step.split('        run: |\n')[1].split('\n').map((line) => line.slice(10)).join('\n');
  const root = mkdtempSync(join(tmpdir(), 'engender-publish-test-'));
  try {
    mkdirSync(join(root, 'dist/release'), { recursive: true });
    writeFileSync(join(root, 'dist/release-notes.md'), 'Synthetic release notes\n');
    writeFileSync(join(root, 'dist/release/SHA256SUMS'), 'synthetic checksums\n');
    const recorder = join(root, 'gh');
    writeFileSync(recorder, '#!/bin/sh\nprintf "%s\\0" "$@"\n');
    chmodSync(recorder, 0o755);
    const output = execFileSync('bash', ['--noprofile', '--norc', '-e', '-u', '-o', 'pipefail', '-c', script], {
      cwd: root,
      env: { PATH: `${root}:/usr/bin:/bin`, RELEASE_TAG: `v${version}`, ENGENDER_VERSION: version },
      encoding: 'utf8'
    });
    return output.split('\0').slice(0, -1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('release publication contract', () => {
  it('requires explicit candidate evidence before building or publishing either release kind', () => {
    const gate = workflow.indexOf('- name: Require evidence for this candidate before publication');
    expect(gate).toBeGreaterThan(workflow.indexOf('- run: npm ci'));
    expect(gate).toBeLessThan(workflow.indexOf('- name: Build unsigned Android release artifacts'));
    const step = workflow.slice(gate).split('\n      # Before anything')[0];
    expect(step).toContain('target=stable');
    expect(step).toContain('if [[ "$ENGENDER_VERSION" == *-* ]]; then');
    expect(step).toContain('target=stage2');
    expect(step).toContain('node scripts/check-progressive-release.mjs --target "$target" --publication-version "$ENGENDER_VERSION"');
    expect(step).not.toContain('continue-on-error:');
    expect(step).not.toContain('if:');
  });

  it('warns about reviewed content past its limit before anything is built or published', () => {
    const check = workflow.indexOf('node scripts/check-reviewed-content.mjs');
    expect(check).toBeGreaterThan(workflow.indexOf('- run: npm ci'));
    expect(check).toBeLessThan(workflow.indexOf('- name: Build unsigned Android release artifacts'));
    const step = workflow.slice(workflow.lastIndexOf('\n      - ', check), workflow.indexOf('\n      - ', check));
    expect(step).not.toContain('if:');
  });

  it('deploys stable web releases only after publication, with isolated credentials and serialized switches', () => {
    const deploy = workflow.slice(workflow.indexOf('\n  deploy-web:'));
    expect(deploy).toContain('needs: [resolve, package, publish]');
    expect(deploy).toContain("if: ${{ !contains(inputs.tag, '-') }}");
    expect(deploy).toContain('environment: release');
    expect(deploy).toContain('group: journal-production');
    expect(deploy).toContain('cancel-in-progress: false');
    expect(deploy).toContain('contents: read');
    expect(deploy).toContain('bash scripts/deploy-web.sh');
    // The bytes and their digest come from this run, never from a release asset.
    expect(deploy).toContain('WEB_SHA256: ${{ needs.package.outputs.web_sha256 }}');
    expect(deploy).toContain('name: release');
    expect(deploy).not.toMatch(/gh release|SHA256SUMS|GH_TOKEN/);
    expect(deploy).not.toMatch(/WEB_SHA256: \$\{\{ (?!needs\.package\.outputs\.)/);
    expect(deploy).not.toContain('continue-on-error:');
    const pkg = workflow.slice(workflow.indexOf('\n  package:'), workflow.indexOf('\n  publish:'));
    expect(pkg).toContain('web_sha256: ${{ steps.web.outputs.web_sha256 }}');
    expect(workflow.slice(0, workflow.indexOf('\n  deploy-web:'))).not.toContain('secrets.VPS_');
  });

  it.each(['1.0.0-rc.1', '1.0.0-beta.2', '1.0.0-preview.7', '1.0.0-0'])('excludes %s from stable release discovery', (version) => {
    const args = replayPublish(version);
    expect(args.slice(0, 3)).toEqual(['release', 'create', `v${version}`]);
    expect(args).toContain('--prerelease');
    expect(args).toContain('--latest=false');
    expect(args).toContain('dist/release/SHA256SUMS');
  });

  it('keeps stable publication ordinary with default Latest behavior', () => {
    expect(replayPublish('1.0.0')).toEqual([
      'release', 'create', 'v1.0.0', '--verify-tag', '--title', 'engender 1.0.0',
      '--notes-file', 'dist/release-body.md', 'dist/release/SHA256SUMS'
    ]);
  });

  it('publishes verified GitHub artifacts before an optional draft Play upload', () => {
    const github = workflow.indexOf('gh release create');
    const play = workflow.indexOf('- name: Upload App Bundle to Google Play internal');
    const verify = workflow.indexOf('node scripts/check-release-artifacts.mjs');
    expect(workflow.indexOf('node scripts/package-release.mjs')).toBeLessThan(verify);
    expect(verify).toBeLessThan(github);
    expect(workflow.indexOf('node scripts/package-release.mjs')).toBeLessThan(github);
    expect(github).toBeGreaterThan(-1);
    expect(play).toBeGreaterThan(github);
    const upload = workflow.slice(play);
    expect(workflow).toContain("PLAY_UPLOAD_ENABLED: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON != '' }}");
    expect(upload).toContain("if: env.PLAY_UPLOAD_ENABLED == 'true'");
    expect(upload).toContain('continue-on-error: true');
    expect(upload).toContain('status: draft');
    expect(upload).not.toContain('status: completed');
  });

  it('keeps signing secrets out of every dependency build and disables persisted credentials', () => {
    expect(workflow).toContain('persist-credentials: false');
    const steps = workflow.split(/\n      - /).slice(1);
    const signing = steps.filter((step) => step.includes('secrets.ANDROID_KEYSTORE_PASSWORD'));
    expect(signing).toHaveLength(1);
    expect(signing[0]).toContain('"$build_tools/apksigner" sign');
    expect(signing[0]).toContain('jarsigner');
    expect(signing[0]).not.toMatch(/npm|npx|gradlew/);
    expect(workflow).not.toContain('ANDROID_REQUIRE_SIGNING=true');
    expect(workflow).not.toMatch(/echo.*ANDROID_KEYSTORE.*GITHUB_ENV/);
    const build = steps.find((step) => step.includes('./gradlew'));
    expect(build).toBeDefined();
    expect(build).not.toContain('secrets.');
    expect(build).toContain('app-release-unsigned.apk');
  });

  it('validates the trigger tag and main ancestry without interpolating the tag into shell code', () => {
    expect(workflow).toContain('RELEASE_TAG: ${{ inputs.tag }}');
    expect(workflow).not.toContain('github.ref_name');
    expect(workflow).toContain('gh release create "$RELEASE_TAG"');
    for (const step of workflow.split(/\n      - /).slice(1)) {
      const script = step.slice(step.indexOf('run:'));
      if (step.includes('run:')) expect(script).not.toContain('${{ github.ref_name }}');
    }
    for (const action of workflow.matchAll(/uses: (actions\/[^@]+)@([^\s]+)/g)) {
      expect(action[2]).toMatch(/^[a-f0-9]{40}$/);
    }
  });
});

const checks = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('walkthrough CI coverage', () => {
  it('requires every isolated group without cancelling siblings after failure', () => {
    const browser = checks.slice(checks.indexOf('\n  browser:'), checks.indexOf('\n  guards:'));
    for (const group of ['journal', 'setup', 'features', 'actions']) {
      expect(browser).toContain(`name: walkthrough-${group}`);
      expect(browser).toContain(`args: --group ${group}`);
    }
    expect(browser).toContain('fail-fast: false');
    expect(browser).toContain("startsWith(matrix.name, 'walkthrough-') && '1'");
    expect(browser).toContain("startsWith(matrix.name, 'walkthrough-') && '9.9.9-walkthrough'");
    expect(checks).toMatch(/needs: \[node, android, browser, guards, benchmark\]/);
    expect(checks).toContain("if (job.result !== 'success') failed = true");
    expect(workflow).toContain('uses: ./.github/workflows/ci.yml');
  });
});

/* The structure that keeps a release honest. The workflow files are read as text, so these
   helpers slice them by job. */
function jobsOf(text: string): Record<string, string> {
  const body = text.split('\njobs:\n')[1] ?? '';
  const heads = [...body.matchAll(/^  ([a-z][a-z0-9-]*):\n/gm)];
  return Object.fromEntries(
    heads.map((head, i) => [head[1], body.slice(head.index, heads[i + 1]?.index ?? body.length)])
  );
}

const jobs = jobsOf(workflow);

/** Job names this job waits for, directly. */
function needsOf(job: string): string[] {
  const line = /^    needs: (.+)$/m.exec(job)?.[1] ?? '';
  return line.replace(/[[\]]/g, '').split(',').map((name) => name.trim()).filter(Boolean);
}

describe('release trigger', () => {
  it('runs only from workflow_dispatch, so the workflow file is the default branch\'s', () => {
    const on = workflow.slice(workflow.indexOf('\non:\n'), workflow.indexOf('\npermissions:'));
    expect(on).toContain('workflow_dispatch:');
    expect(on).toContain('tag:');
    expect(on).not.toMatch(/\bpush:|\btags:|pull_request|schedule:|workflow_call:/);
  });

  it('refuses to start anywhere but the default branch, before anything else', () => {
    expect(jobs.resolve).toContain("if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)");
    expect(jobs.resolve).not.toMatch(/^    needs:/m);
    expect(jobs.resolve).not.toContain('environment:');
  });

  it('puts every other job behind the tag verification', () => {
    const reaches = (name: string, seen = new Set<string>()): boolean => {
      if (name === 'resolve') return true;
      if (seen.has(name)) return false;
      seen.add(name);
      return needsOf(jobs[name] ?? '').some((n) => reaches(n, seen));
    };
    for (const name of Object.keys(jobs)) expect(reaches(name), name).toBe(true);
  });

  it('verifies the tag with the default branch\'s own script, never one from the tagged commit', () => {
    expect(jobs.resolve).toContain('node scripts/resolve-release-tag.mjs "$RELEASE_TAG"');
    expect(jobs.resolve).toContain('RELEASE_TAG: ${{ inputs.tag }}');
    // The checkout is the dispatch ref (the default branch): no `ref:` pointing at the tag.
    expect(jobs.resolve).not.toMatch(/^\s+ref:/m);
    expect(jobs.resolve).not.toContain('npm');
  });

  it('builds the commit the tag names, tested by the same checks as a pull request', () => {
    expect(jobs.checks).toContain('uses: ./.github/workflows/ci.yml');
    expect(jobs.checks).toContain('ref: ${{ needs.resolve.outputs.sha }}');
    expect(jobs.build).toContain('ref: ${{ needs.resolve.outputs.sha }}');
    expect(jobs.package).toContain('ref: ${{ needs.resolve.outputs.sha }}');
    expect(needsOf(jobs.build)).toContain('checks');
  });
});

describe('the job that holds the signing key', () => {
  const holders = Object.entries(jobs).filter(([, job]) => /secrets\.ANDROID_KEY/.test(job));

  it('is the only job that reads the keystore, and it needs the release environment', () => {
    expect(holders.map(([name]) => name)).toEqual(['sign']);
    expect(jobs.sign).toContain('environment: release');
  });

  it('runs no repository code and installs nothing', () => {
    const job = jobs.sign;
    expect(job).not.toMatch(/\bnpm\b|\bnpx\b|gradlew|\bnode\b|actions\/checkout|actions\/setup-node/);
    expect(job).not.toMatch(/run:.*\bbash scripts\/|\.\/scripts\//);
    expect(job).not.toContain('GITHUB_PATH');
  });

  it('takes the unsigned artifacts by digest from the job that built them', () => {
    expect(jobs.sign).toContain('actions/download-artifact@');
    expect(jobs.sign).toContain('UNSIGNED_APK_SHA256: ${{ needs.build.outputs.apk_sha256 }}');
    expect(jobs.sign).toContain('UNSIGNED_AAB_SHA256: ${{ needs.build.outputs.aab_sha256 }}');
    expect(jobs.sign).toContain('sha256sum -c');
    expect(jobs.sign.indexOf('sha256sum -c')).toBeLessThan(jobs.sign.indexOf('ANDROID_KEYSTORE_BASE64'));
    expect(jobs.build).toMatch(/apk_sha256: \$\{\{ steps\.\w+\.outputs\.apk_sha256 \}\}/);
  });

  it('calls the signing tools by absolute path with a clean PATH', () => {
    const step = jobs.sign.slice(jobs.sign.indexOf('- name: Sign'));
    expect(step).toMatch(/export PATH="\$JAVA_HOME\/bin:\/usr\/bin:\/bin"/);
    for (const tool of ['zipalign', 'apksigner']) expect(step).toContain(`"$build_tools/${tool}"`);
    expect(step).toContain('"$JAVA_HOME/bin/jarsigner"');
    expect(step).not.toMatch(/^\s+(zipalign|apksigner|jarsigner)\b/m);
  });

  it('is the only place a signature is made, and the build job holds no secret at all', () => {
    expect(jobs.build).not.toMatch(/secrets\.|environment:/);
    expect(jobs.package).not.toMatch(/secrets\.|environment:/);
    for (const [name, job] of Object.entries(jobs)) {
      if (name !== 'sign') expect(job, name).not.toMatch(/apksigner sign|jarsigner|zipalign/);
    }
  });

  it('hands signed artifacts on by digest as well', () => {
    expect(jobs.sign).toMatch(/apk_sha256: \$\{\{ steps\.\w+\.outputs\.apk_sha256 \}\}/);
    expect(jobs.package).toContain('SIGNED_APK_SHA256: ${{ needs.sign.outputs.apk_sha256 }}');
    expect(jobs.package).toContain('sha256sum -c');
    expect(jobs.publish).toContain('SIGNED_APK_SHA256: ${{ needs.sign.outputs.apk_sha256 }}');
    expect(jobs.publish).toContain('sha256sum -c');
  });
});

describe('pinned actions (GD-055)', () => {
  const files = ['release.yml', 'ci.yml'];
  it.each(files)('pins every non-local action in %s to a full commit SHA', (file) => {
    const text = readFileSync(new URL(`../../../.github/workflows/${file}`, import.meta.url), 'utf8');
    const uses = [...text.matchAll(/^\s*(?:- )?uses: (\S+)(.*)$/gm)].map((m) => ({ ref: m[1], rest: m[2] }));
    expect(uses.length).toBeGreaterThan(0);
    for (const { ref, rest } of uses) {
      if (ref.startsWith('./')) continue;
      expect(ref, ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
      expect(rest, ref).toMatch(/# v?\d/);
    }
  });

  it('covers every local workflow release.yml calls', () => {
    const called = [...workflow.matchAll(/uses: \.\/\.github\/workflows\/(\S+)/g)].map((m) => m[1]);
    expect(called.length).toBeGreaterThan(0);
    for (const name of called) expect(files).toContain(name);
  });
});
