/* Shared by tests proving key material is never logged (ticket 12's
   acceptance) - patches console.log/warn/error for the duration of `fn`
   and returns every argument list passed to any of them, joined to text. */

const PATCHED_METHODS = ['log', 'warn', 'error', 'debug', 'info', 'trace'] as const;

export async function capturedConsoleOutput(fn: () => Promise<void>): Promise<string[]> {
  const calls: string[] = [];
  const record = (...args: unknown[]) => calls.push(args.map(String).join(' '));
  const original = Object.fromEntries(PATCHED_METHODS.map((m) => [m, console[m]])) as Record<
    (typeof PATCHED_METHODS)[number],
    (...args: unknown[]) => void
  >;

  for (const method of PATCHED_METHODS) console[method] = record;
  try {
    await fn();
  } finally {
    for (const method of PATCHED_METHODS) console[method] = original[method];
  }

  return calls;
}
