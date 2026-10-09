import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

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
  it('deploys stable web releases only after publication, with isolated credentials and serialized switches', () => {
    const deploy = workflow.slice(workflow.indexOf('\n  deploy-web:'));
    expect(deploy).toContain('needs: publish');
    expect(deploy).toContain("if: ${{ !contains(github.ref_name, '-') }}");
    expect(deploy).toContain('environment: release');
    expect(deploy).toContain('group: journal-production');
    expect(deploy).toContain('cancel-in-progress: false');
    expect(deploy).toContain('contents: read');
    expect(deploy).toContain('bash scripts/deploy-web.sh');
    expect(deploy).not.toContain('continue-on-error:');
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
      'release', 'create', 'v1.0.0', '--title', 'engender 1.0.0',
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
    expect(signing[0]).toContain('apksigner sign');
    expect(signing[0]).toContain('jarsigner');
    expect(signing[0]).not.toMatch(/npm|npx|gradlew/);
    expect(workflow).not.toContain('ANDROID_REQUIRE_SIGNING=true');
    expect(workflow).not.toMatch(/echo.*ANDROID_KEYSTORE.*GITHUB_ENV/);
    const build = steps.find((step) => step.includes('./gradlew'));
    expect(build).toBeDefined();
    expect(build).not.toContain('secrets.');
    expect(build).toContain('app-release-unsigned.apk');
    expect(workflow).toMatch(/build-tools[\s\S]*GITHUB_PATH/);
  });

  it('validates the trigger tag and main ancestry without interpolating the tag into shell code', () => {
    expect(workflow).toContain('RELEASE_TAG: ${{ github.ref_name }}');
    expect(workflow).toContain('[[ "$RELEASE_TAG" == "v$version" ]]');
    expect(workflow).toContain('git merge-base --is-ancestor HEAD origin/main');
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

const checks = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

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
