/* Decide Android Back behavior without Capacitor or SvelteKit (NAV-002).
   Use the same `navigationDepth()` as web Back controls. Browser history
   counts the boot entry and does not shrink when a user goes back.

   Home minimizes even with nonzero depth because it is the task root.
   Platform sync gives onboarding's mounted stepper first refusal.
   Welcome minimizes when its stepper declines Back. */

type AndroidBackAction = 'minimize' | 'history-back' | 'go-home';

export function resolveAndroidBackAction(currentPath: string, depth: number): AndroidBackAction {
  if (currentPath === '/' || currentPath === '' || currentPath === '/onboarding') return 'minimize';
  if (depth > 0) return 'history-back';
  return 'go-home';
}
