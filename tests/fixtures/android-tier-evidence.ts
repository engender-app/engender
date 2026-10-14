// Synthetic release-gate input. This does not assert that Android tests ran.
export function androidTierFixture(revision: string) {
  return {
    revision, startedAt: '2026-08-17T09:00:00Z', passedAt: '2026-08-17T09:30:00Z',
    optionalStages: { installedUpgrade: null, lockedProcessDeath: null },
    runs: [26, 35].map((api) => ({
      revision, startedAt: '2026-08-17T09:00:00Z', passedAt: '2026-08-17T09:30:00Z',
      kind: 'core', avd: `fixture-api${api}`, serial: 'emulator-5580', api, nativeOnly: api === 26,
      build: { apkSha256: 'a'.repeat(64), testApkSha256: 'b'.repeat(64) },
      completedStages: ['instrumentation', 'pin-wait', 'native-backup', ...(api === 35 ? ['archive-recovery'] : [])],
      completedChecks: ['fixture completed check']
    }))
  };
}
