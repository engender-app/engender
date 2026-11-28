import assert from 'node:assert/strict';

/**
 * Retry only the observed UiAutomation teardown crash, never its XML output.
 * @param {{ adb: (...args: string[]) => string, path: string, packageName: string,
 * onRetry: (receipt: object) => Promise<void> }} options
 */
export async function dumpHierarchy({ adb, path, packageName, onRetry }) {
  const identity = () => ({
    pid: adb('shell', 'pidof', packageName).trim(),
    focus: adb('shell', 'dumpsys', 'window').split('\n').find((line) => line.includes('mCurrentFocus='))
  });
  const before = identity();
  assert.ok(before.pid && before.focus?.includes(packageName), 'The isolated app owns the focused window');
  const baseline = adb('logcat', '-b', 'crash', '-d');
  for (let attempt = 0; attempt < 2; attempt++) {
    adb('shell', 'rm', '-f', path);
    try {
      adb('shell', 'uiautomator', 'dump', '--compressed', path);
    } catch (error) {
      if (attempt !== 0 || !(error instanceof Error) || !('status' in error)
        || error.status !== 137 || !('signal' in error) || error.signal !== null) throw error;
      const crashes = adb('logcat', '-b', 'crash', '-d');
      const recent = crashes.startsWith(baseline) ? crashes.slice(baseline.length) : '';
      const after = identity();
      const crashPid = recent.match(/AndroidRuntime: PID: (\d+)/)?.[1];
      if ((recent.match(/FATAL EXCEPTION:/g) ?? []).length !== 1
        || !recent.includes('FATAL EXCEPTION: UiAutomation')
        || !recent.includes('java.lang.RuntimeException: Bad file descriptor')
        || !recent.includes('android.os.BinderProxy.transactNative')
        || !crashPid || before.pid.split(/\s+/).includes(crashPid)
        || after.pid !== before.pid || after.focus !== before.focus) throw error;
      await onRetry({ attempt: 1, status: error.status, stdout: 'stdout' in error ? error.stdout : null, crash: recent, before, after });
      continue;
    }
    assert.deepEqual(identity(), before, 'The same app process and window own the fresh hierarchy');
    return adb('shell', 'cat', path);
  }
}
