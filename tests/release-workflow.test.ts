import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

describe('release publication contract', () => {
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
