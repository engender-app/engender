import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseStringPromise } from 'xml2js';

/**
 * @typedef {{ status: number | null, stdout?: string | null, stderr?: string | null, signal?: string | null, error?: Error }} Invocation
 * @typedef {{ ok: (name: string) => void, fail: (name: string, detail: string) => void }} Reporter
 * @typedef {string | { _?: string, $?: { message?: string } }} ResultBody
 * @typedef {{ $?: { name?: string, classname?: string }, failure?: ResultBody[], error?: ResultBody[], skipped?: ResultBody[] }} TestCase
 */

/**
 * @param {string} label
 * @param {Invocation} invocation
 * @param {string} resultsDir
 * @param {Reporter} reporter
 */
export async function reportInstrumentation(label, invocation, resultsDir, reporter, { required = false } = {}) {
  const { ok, fail } = reporter;
  const output = `${invocation.stdout ?? ''}${invocation.stderr ?? ''}`;
  let failures = 0;
  /** @type {Reporter["fail"]} */
  const reject = (name, detail) => { failures++; fail(name, detail); };
  if (invocation.status !== 0 || invocation.signal || invocation.error) {
    reject(`${label}: instrumentation invocation`, invocation.error?.message ??
      `exit ${invocation.status}, signal ${invocation.signal ?? 'none'}\n${output.slice(-1500)}`);
  }
  /** @type {TestCase[]} */
  let cases = [];
  try {
    const files = readdirSync(resultsDir, { recursive: true }).filter((file) => String(file).endsWith('.xml'));
    if (!files.length) throw new Error('no result XML');
    for (const file of files) {
      const document = await parseStringPromise(readFileSync(join(resultsDir, String(file)), 'utf8'), { strict: true });
      const suites = document.testsuite ? [document.testsuite] : document.testsuites?.testsuite;
      if (!suites?.length) throw new Error(`no test suites in ${file}`);
      for (const suite of suites) {
        /** @type {TestCase[]} */
        const found = suite.testcase ?? [];
        if (Number(suite.$?.tests) !== found.length) throw new Error(`incomplete test suite in ${file}`);
        if (found.some((testcase) => !testcase.$?.name || !testcase.$?.classname)) throw new Error(`unnamed test case in ${file}`);
        cases.push(...found);
      }
    }
    if (!cases.length) throw new Error('no test cases');
  } catch (error) {
    reject(`${label}: instrumentation results`, `${error instanceof Error ? error.message : String(error)} in ${resultsDir}\n${output.slice(-800)}`);
    return false;
  }
  for (const testcase of cases) {
    const name = `${label} ${testcase.$?.classname ?? '?'}.${testcase.$?.name ?? '?'}`;
    const failure = testcase.failure?.[0] ?? testcase.error?.[0];
    if (failure !== undefined) reject(name, typeof failure === 'string' ? failure : failure._ ?? failure.$?.message ?? 'test failed');
    else if (testcase.skipped) {
      const reason = testcase.skipped[0];
      console.log('SKIP', name, typeof reason === 'string' ? reason : reason._ ?? reason.$?.message ?? 'assumption not met');
      if (required) reject(name, 'required test skipped');
    } else ok(name);
  }
  return failures === 0;
}

/** @param {{ invoke: () => Invocation, label: string, resultsDir: string, reporter: Reporter, required?: boolean }} options */
export async function runInstrumentation({ invoke, label, resultsDir, reporter, required = false }) {
  rmSync(resultsDir, { recursive: true, force: true });
  let invocation;
  try { invocation = invoke(); }
  catch (error) { invocation = { status: null, error: error instanceof Error ? error : new Error(String(error)) }; }
  return reportInstrumentation(label, invocation, resultsDir, reporter, { required });
}

/** @param {string} label @param {Invocation} invocation @param {Reporter} reporter */
export function reportStage(label, invocation, reporter) {
  const output = `${invocation.stdout ?? ''}${invocation.stderr ?? ''}`;
  if (invocation.status !== 0 || invocation.signal || invocation.error ||
      !/^OK \(1 test\)/m.test(output) || /INSTRUMENTATION_(?:FAILED|ABORTED)|FAILURES!!!|INSTRUMENTATION_STATUS_CODE: -[34]/.test(output)) {
    reporter.fail(label, invocation.error?.message ?? `exit ${invocation.status}, signal ${invocation.signal ?? 'none'}\n${output}`);
    return false;
  }
  reporter.ok(label);
  return true;
}
