import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const check = (className: string, method: string) => {
  const java = read(`android/app/src/androidTest/java/${className.replaceAll('.', '/')}.java`);
  expect(java, `${className}#${method} must select a JUnit test`).toMatch(
    new RegExp(`@Test\\s+public\\s+void\\s+${method}\\s*\\(`)
  );
};

test('literal Android instrumentation selectors name existing JUnit methods', () => {
  let count = 0;
  for (const path of readdirSync(new URL('tests/android-tier/', root), { recursive: true, encoding: 'utf8' })) {
    if (!path.endsWith('.mjs')) continue;
    for (const [, className, method] of read(`tests/android-tier/${path}`).matchAll(/(dev\.engender\.[\w.]+)#(\w+)/g)) {
      check(className, method);
      count++;
    }
  }
  expect(count).toBeGreaterThan(0);
});

for (const [helper, constant] of [['stage', 'PIN_WAIT_TEST'], ['backupStage', 'BACKUP_TEST']]) {
  test(`${helper} selectors name existing JUnit methods`, () => {
    const source = read('tests/android-tier/run.mjs');
    const className = new RegExp(`const ${constant} = '([^']+)'`).exec(source)![1];
    const defaultMethod = new RegExp(`const ${helper} = \\(name, method = '([^']+)'`).exec(source)![1];
    check(className, defaultMethod);
    for (const [, method] of source.matchAll(new RegExp(`\\b${helper}\\('[^']+', '([^']+)'\\)`, 'g'))) {
      check(className, method);
    }
  });
}

test('locked-process-death selectors name existing JUnit methods', () => {
  const source = read('tests/android-tier/locked-process-death.mjs');
  const className = /(dev\.engender\.[\w.]+)#\$\{method\}/.exec(source)![1];
  const methods = [...source.matchAll(/\bstage\('([^']+)'\)/g)];
  expect(methods.length).toBeGreaterThan(0);
  for (const [, method] of methods) check(className, method);
});
