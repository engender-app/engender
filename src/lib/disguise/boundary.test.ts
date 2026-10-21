import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'svelte/compiler';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = join(process.env.FA42_SOURCE_ROOT ?? process.cwd(), 'src');
const outsideOwners = new Set([
  'src/app.html',
  'src/lib/android/platform-sync.ts',
  'src/lib/components/AndroidKeyGate.svelte',
  'src/lib/components/BootFailureNotice.svelte',
  'src/lib/components/DeviceBoundRecovery.svelte',
  'src/lib/components/DisguisePreview.svelte',
  'src/lib/components/DisguiseSetting.svelte',
  'src/lib/components/GateScreen.svelte',
  'src/lib/components/LauncherIconPreview.svelte',
  'src/lib/components/JournalGate.svelte',
  'src/lib/components/PrintLetterhead.svelte',
  'src/lib/components/SessionUnlock.svelte',
  'src/lib/data/archive/android-auto-export.ts',
  'src/lib/data/archive/backup.ts',
  'src/lib/data/prefs/documentChrome.ts',
  'src/lib/disguise/identity.ts',
  'src/routes/onboarding/+page.svelte'
]);
const nonPreferenceDisguiseReads = new Map([
  ['src/lib/android/plugin-registry.ts', 'androidPluginOwners.disguise'],
  ['src/lib/disguise/android-bridge.ts', 'androidPluginOwners.disguise'],
  ['src/lib/onboarding/complete.ts', 'completion.disguise']
]);

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function scanDisguise(name: string, sourceCode: string): { reads: boolean; outsideCalls: number } {
  const otherProperty = nonPreferenceDisguiseReads.get(name);
  const allowed = (start: number, end: number) => sourceCode.slice(start, end) === otherProperty;
  let reads = false;
  let outsideCalls = 0;

  if (name.endsWith('.svelte')) {
    const propertyName = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false;
      const node = value as Record<string, unknown>;
      if (node.type === 'Identifier') return node.name === 'disguise';
      if (node.type === 'Literal') return node.value === 'disguise';
      if (node.type === 'TemplateLiteral' && Array.isArray(node.expressions) && node.expressions.length === 0) {
        const first = (node.quasis as { value: { cooked: string } }[])[0];
        return first?.value.cooked === 'disguise';
      }
      return false;
    };
    const seen = new WeakSet<object>();
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const node = value as Record<string, unknown>;
      if (node.type === 'MemberExpression' && propertyName(node.property) &&
          !allowed(node.start as number, node.end as number)) reads = true;
      if (node.type === 'ObjectPattern' && Array.isArray(node.properties) &&
          node.properties.some((part) => propertyName((part as Record<string, unknown>).key))) reads = true;
      if (node.type === 'CallExpression') {
        const callee = node.callee as Record<string, unknown>;
        const args = node.arguments as Record<string, unknown>[];
        if (callee?.type === 'Identifier' && callee.name === 'outsideDisguise' &&
            args?.length === 1 && args[0]?.type === 'Identifier' && args[0].name === 'prefs') outsideCalls++;
      }
      Object.values(node).forEach(visit);
    };
    visit(parse(sourceCode, { modern: true }));
    return { reads, outsideCalls };
  }

  const file = ts.createSourceFile(name, sourceCode, ts.ScriptTarget.Latest, true);
  const propertyName = (node: ts.Node | undefined): boolean => node !== undefined &&
    ((ts.isIdentifier(node) && node.text === 'disguise') ||
      (ts.isStringLiteralLike(node) && node.text === 'disguise'));
  const visit = (node: ts.Node): void => {
    const member = (ts.isPropertyAccessExpression(node) && propertyName(node.name)) ||
      (ts.isElementAccessExpression(node) && propertyName(node.argumentExpression));
    const binding = ts.isObjectBindingPattern(node) && node.elements.some((part) =>
      propertyName(part.propertyName ?? part.name));
    const assignment = ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isObjectLiteralExpression(node.left) && node.left.properties.some((part) =>
        (ts.isShorthandPropertyAssignment(part) || ts.isPropertyAssignment(part)) && propertyName(part.name));
    if ((member || binding || assignment) && !allowed(node.getStart(file), node.end)) reads = true;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'outsideDisguise' &&
        node.arguments.length === 1 && ts.isIdentifier(node.arguments[0]) && node.arguments[0].text === 'prefs') outsideCalls++;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { reads, outsideCalls };
}

function readsDisguise(name: string, sourceCode: string): boolean {
  return scanDisguise(name, sourceCode).reads;
}

describe('disguise boundary', () => {
  it.each([
    ['TS URL string', 'src/routes/probe.ts', 'const url = "https://example.com";', 'const x = prefs.disguise;'],
    ['aliased TS URL', 'src/routes/probe.ts', 'const url = "https://example.com";', 'const currentPrefs = prefs; const x = currentPrefs.disguise;'],
    ['Svelte URL attribute', 'src/routes/probe.svelte', '<a href="https://example.com">Link</a>', '<span>{prefs.disguise}</span>'],
    ['escaped quotes', 'src/routes/probe.ts', 'const text = "quote \\"//\\"";', 'const x = prefs["disguise"];'],
    ['comment and URL', 'src/routes/probe.ts', '/* prefs.disguise */ const url = "https://example.com";', 'const { disguise } = prefs;'],
    ['assignment destructuring', 'src/routes/probe.ts', 'const url = "https://example.com";', '({ disguise } = prefs);'],
    ['property text in a string', 'src/routes/probe.ts', 'const text = "prefs.disguise // https://example.com";', 'const x = prefs.disguise;']
  ])('separates %s from a real disguise read', (_case, name, safe, read) => {
    expect(readsDisguise(name, safe)).toBe(false);
    expect(readsDisguise(name, `${safe} ${read}`)).toBe(true);
  });

  it.each([
    ['TS URL string', 'src/routes/probe.ts', 'const url = "https://example.com";', 'outsideDisguise(prefs);'],
    ['Svelte URL attribute', 'src/routes/probe.svelte', '<a href="https://example.com">Link</a>', '<span>{outsideDisguise(prefs)}</span>']
  ])('counts outside adapter after %s', (_case, name, safe, call) => {
    expect(scanDisguise(name, safe).outsideCalls).toBe(0);
    expect(scanDisguise(name, `${safe} ${call}`).outsideCalls).toBe(1);
  });

  it('reads disguise only in outside-surface owners', () => {
    const readers = files(source)
      .filter((path) => /\.(svelte|ts|html)$/.test(path) && !/\.test\.ts$/.test(path))
      .filter((path) => !outsideOwners.has(`src/${relative(source, path)}`))
      .filter((path) => readsDisguise(`src/${relative(source, path)}`, readFileSync(path, 'utf8')))
      .map((path) => `src/${relative(source, path)}`);
    expect(readers).toEqual([]);
  });

  it('uses the outside-only adapter only for tab, launcher and file names', () => {
    const uses = files(source).flatMap((path) => {
      if (!/\.(svelte|ts)$/.test(path) || /\.test\.ts$/.test(path)) return [];
      const code = readFileSync(path, 'utf8');
      const name = `src/${relative(source, path)}`;
      return Array.from({ length: scanDisguise(name, code).outsideCalls }, () => name);
    });
    expect(uses.sort()).toEqual([
      'src/routes/+layout.svelte',
      'src/routes/+layout.svelte',
      'src/routes/+layout.svelte',
      'src/routes/media/photos/export/+page.svelte',
    ].sort());
  });

  it('keeps the outside adapter on outside operations in mixed routes', () => {
    const read = (path: string) => readFileSync(join(source, path), 'utf8');
    const layout = read('routes/+layout.svelte');
    expect(layout).toContain('disguised: outsideDisguise(prefs),');
    expect(layout).toContain("apple-touch-icon${outsideDisguise(prefs) ? '-notes' : ''}.png");
    expect(layout).toContain('const disguise = outsideDisguise(prefs);');
    expect(layout).not.toMatch(/class:disguised|refreshActiveFlag\(document,|if \(disguise\) untrack/);
    expect(read('routes/media/photos/export/+page.svelte')).toContain('journeyFileName(prefs.name, output, undefined, outsideDisguise(prefs))');
  });

  it('does not neutralize unlocked surfaces through CSS or flag publication', () => {
    const css = files(join(source, 'lib')).filter((path) => path.endsWith('.css'))
      .map((path) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
      .join('\n');
    expect(css).not.toMatch(/\[data-disguised\]|\.disguised\b/);
    expect(readFileSync(join(source, 'lib/theme/activeFlag.svelte.ts'), 'utf8'))
      .toContain('refreshActiveFlag(doc: Document = document): void');
  });
});
