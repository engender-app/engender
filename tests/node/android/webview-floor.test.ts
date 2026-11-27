/* The Vite build target follows minWebViewVersion (ADR-0023). Syntax
   transpilation leaves runtime APIs, computed CSS and DOM selectors
   untouched, so guard common usages above Chrome 87. Add missing
   patterns here. src/lib/data/documents/pdf-floor.ts can mention .at
   because it provides pdf.js's polyfill. */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test } from 'vitest';
import ts from 'typescript';
import capacitorConfig from '../../../capacitor.config.ts';

const src = fileURLToPath(new URL('../../../src/', import.meta.url));

/** The floor itself, read where Android reads it rather than written down
    a third time. */
const FLOOR = capacitorConfig.android?.minWebViewVersion ?? 0;

/** What each one costs, so a failure says which Chrome it would break. */
const ABOVE_THE_FLOOR: [pattern: RegExp, api: string, since: number][] = [
  [/\.at\(\s*[-\w]/g, 'Array.prototype.at', 92],
  [/\bObject\.hasOwn\(/g, 'Object.hasOwn', 93],
  [/\.toReversed\(/g, 'Array.prototype.toReversed', 110],
  [/\.toSorted\(/g, 'Array.prototype.toSorted', 110],
  [/\.findLast(Index)?\(/g, 'Array.prototype.findLast', 97],
  [/\bstructuredClone\(/g, 'structuredClone', 98],
  [/\bObject\.groupBy\(/g, 'Object.groupBy', 117],
  [/\bPromise\.withResolvers\(/g, 'Promise.withResolvers', 119]
];

/** The one file that patches an API rather than avoiding it, for a
    dependency that needs it (documents/pdf.ts's header says why). */
const POLYFILL = 'lib/data/documents/pdf-floor.ts';

/** The code with its comments taken out, because this repo's comments
    discuss these APIs by name - pdf-worker.ts's header is about the very
    `.at(-1)` it exists to survive, and a rule that read comments would
    have to be argued with rather than fixed. Crude on purpose: block
    comments, then line comments whose `//` is not part of a `https://`.
    A call hiding after a URL on one line would be missed, which is a
    trade worth making against a rule nobody can write a comment near. */
const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Read computed styles through their direct call, a local alias or a small
    reader function. Unrelated data properties named scale do not set a CSS
    requirement. Svelte script blocks use the same TypeScript parser. */
function cssPropertiesRead(code: string): string[] {
  const source = ts.createSourceFile('floor.ts', code, ts.ScriptTarget.Latest, true);
  const styles = new Set<string>();
  const readers = new Set<string>();
  const properties: string[] = [];
  const transforms = new Set(['translate', 'scale', 'rotate']);
  const isStyle = (node: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(node)) return isStyle(node.expression);
    if (ts.isIdentifier(node)) return styles.has(node.text);
    if (ts.isPropertyAccessExpression(node)) return node.name.text === 'style';
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    return (ts.isIdentifier(callee) && (callee.text === 'getComputedStyle' || readers.has(callee.text)))
      || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'getComputedStyle');
  };
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isStyle(node.initializer)) styles.add(node.name.text);
      if (ts.isArrowFunction(node.initializer) && !ts.isBlock(node.initializer.body)
        && isStyle(node.initializer.body)) readers.add(node.name.text);
    }
    if (ts.isPropertyAccessExpression(node) && transforms.has(node.name.text) && isStyle(node.expression)) {
      properties.push(node.name.text);
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)
      && transforms.has(node.argumentExpression.text) && isStyle(node.expression)) {
      properties.push(node.argumentExpression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return properties;
}

/** Selector definitions may be shared constants or template fragments, so
    inspect their source too, rather than just literal DOM call arguments. */
function selectorFeatures(code: string): string[] {
  const features: string[] = [];
  for (const name of ['is', 'where']) {
    if (new RegExp(`:${name}\\(`).test(code)) features.push(`:${name}()`);
  }
  for (const match of code.matchAll(/:not\(/g)) {
    let depth = 1;
    let argument = '';
    for (let index = match.index + match[0].length; index < code.length && depth; index++) {
      const character = code[index];
      if (character === '(') depth++;
      if (character === ')') depth--;
      if (depth) argument += character;
    }
    const simple = argument.trim().replace(/\[[^\]]*\]/g, '')
      .replace(/:[\w-]+\([^()]*\)/g, '');
    if (/:not\(/.test(argument) || /[,>+~\s]/.test(simple)) {
      features.push('selector-list or complex :not()');
      break;
    }
  }
  return features;
}

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, found);
    else if (/\.(ts|svelte)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) found.push(path);
  }
  return found;
}

test('nothing the app ships requires a feature newer than the WebView floor', () => {
  assert.ok(FLOOR > 0, 'capacitor.config.ts names no minWebViewVersion for this rule to be about');
  const offences: string[] = [];

  for (const file of sources(src)) {
    const relative = file.slice(src.length);
    if (relative === POLYFILL) continue;
    if (relative.startsWith('lib/paraglide/')) continue; // generated, not written here
    const code = withoutComments(readFileSync(file, 'utf8'));

    for (const [pattern, api, since] of ABOVE_THE_FLOOR) {
      if (since <= FLOOR) continue;
      const hits = code.match(pattern);
      if (hits) offences.push(`${relative}: ${hits.length}x ${api} (Chrome ${since})`);
    }

    const script = file.endsWith('.svelte')
      ? [...code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n')
      : code;
    if (FLOOR < 104) {
      for (const property of cssPropertiesRead(script)) {
        offences.push(`${relative}: CSS ${property} read from JavaScript (Chrome 104)`);
      }
    }
    if (FLOOR < 88) {
      for (const selector of selectorFeatures(code)) {
        offences.push(`${relative}: selector ${selector} (Chrome 88)`);
      }
    }
  }

  assert.deepEqual(
    offences,
    [],
    `these run above the WebView floor of ${FLOOR} that capacitor.config.ts promises:\n${offences.join('\n')}`
  );
});

/* The positive control. A rule written as a grep can pass because the
   grep is wrong, so this proves the pattern actually finds what it is
   looking for - in a string that never reaches a browser. */
test('the rule finds what it is looking for', () => {
  /* Both spellings, because the first version of this rule only matched a
     numeric literal and would have let `rows.at(i)` ship past a header
     that claims nothing does. */
  const [pattern] = ABOVE_THE_FLOOR[0];
  assert.equal('const last = rows.at(-1);'.match(pattern)?.length, 1);
  assert.equal('const item = rows.at(index);'.match(pattern)?.length, 1);
  assert.equal('const sliced = rows.slice(1);'.match(pattern), null);
});

test('the CSS rule finds direct, aliased and bracket property reads', () => {
  assert.deepEqual(cssPropertiesRead(`
    getComputedStyle(findElement()).translate;
    const style = window.getComputedStyle(el);
    style.scale;
    style['rotate'];
    const read = (pseudo: string) => getComputedStyle(el, pseudo);
    read('::before').scale;
    data.scale;
  `), ['translate', 'scale', 'rotate', 'scale']);
});

test('the selector rule finds DOM literals and shared template fragments', () => {
  assert.deepEqual(selectorFeatures(`
    document.querySelector(':is(.screen, .field)');
    element.matches(':where(.visible)');
    const active = ':not(.hidden, .outgoing)';
  `), [':is()', ':where()', 'selector-list or complex :not()']);
  assert.deepEqual(selectorFeatures("const active = ':not([data-door]:not([data-active]) *)';"),
    ['selector-list or complex :not()']);
  assert.deepEqual(selectorFeatures("element.matches(':not([data-name=\"a,b\"])');"), []);
  assert.deepEqual(selectorFeatures("element.matches(':not(:nth-child(2n + 1))');"), []);
  assert.deepEqual(selectorFeatures("element.matches(':not(.hidden)');"), []);
});
