import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

describe('release publication contract', () => {
  it('publishes verified GitHub artifacts before an optional draft Play upload', () => {
    const github = workflow.indexOf('gh release create');
    const play = workflow.indexOf('- name: Upload App Bundle to Google Play internal');
    expect(workflow.indexOf('node scripts/check-release-artifacts.mjs')).toBeLessThan(github);
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
