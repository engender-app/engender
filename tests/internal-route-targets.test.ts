import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import ts from 'typescript';
import { parse } from 'svelte/compiler';

const root = join(import.meta.dirname, '..', 'src');
const routes = join(root, 'routes');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const screens = files(routes)
  .filter((file) => file.endsWith('/+page.svelte'))
  .map((file) => '/' + relative(routes, file).replace(/(?:^|\/)\+page\.svelte$/, ''))
  .map((path) => path === '/' ? path : path.replace(/\/$/, ''));
const routeHeads = new Set(screens.map((screen) => screen.split('/')[1]));
const unknown = '__route_value__';
const routeWrappers = new Set(['$derived', '$state', 'withListReturn', 'withEntryListReturn', 'withSourceReturn', 'resolve']);
const destinationProperties = new Set(['href', 'route', 'back']);

function matchesScreen(path: string): boolean {
  return screens.some((screen) => {
    const pattern = screen.replace(/\[([^/]+)\]/g, '[^/]+');
    return new RegExp(`^${pattern}$`).test(path);
  });
}

type Definition = ts.Expression | ts.FunctionDeclaration;

function expression(source: string): ts.Expression {
  const parsed = ts.createSourceFile('target.ts', `const target = ${source};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return (parsed.statements[0] as ts.VariableStatement).declarationList.declarations[0].initializer!;
}

function returns(node: ts.Node): ts.Expression[] {
  const found: ts.Expression[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isReturnStatement(child) && child.expression) found.push(child.expression);
    else ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

/** Resolve route shaped expressions without executing application code. */
function values(node: ts.Expression, definitions: Map<string, Definition>, parameters = new Map<string, string[]>(), seen = new Set<string>()): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isIdentifier(node)) {
    if (parameters.has(node.text)) return parameters.get(node.text)!;
    const definition = definitions.get(node.text);
    if (!definition || seen.has(node.text) || ts.isFunctionDeclaration(definition)) return [];
    return values(definition, definitions, parameters, new Set([...seen, node.text]));
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return values(node.expression, definitions, parameters, seen);
  }
  if (ts.isTemplateExpression(node)) {
    let routes = [node.head.text];
    for (const span of node.templateSpans) {
      const parts = values(span.expression, definitions, parameters, seen);
      routes = routes.flatMap((route) => (parts.length ? parts : [unknown]).map((part) => route + part + span.literal.text));
    }
    return routes;
  }
  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = values(node.left, definitions, parameters, seen);
      const right = values(node.right, definitions, parameters, seen);
      return (left.length ? left : [unknown]).flatMap((start) =>
        (right.length ? right : [unknown]).map((end) => start + end));
    }
    if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
      return [...values(node.left, definitions, parameters, seen), ...values(node.right, definitions, parameters, seen)];
    }
  }
  if (ts.isConditionalExpression(node)) {
    return [...values(node.whenTrue, definitions, parameters, seen), ...values(node.whenFalse, definitions, parameters, seen)];
  }
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const definition = definitions.get(name);
      if (definition && !seen.has(name) && (ts.isFunctionDeclaration(definition) || ts.isArrowFunction(definition) || ts.isFunctionExpression(definition))) {
        const next = new Map(parameters);
        definition.parameters.forEach((parameter, index) => {
          if (ts.isIdentifier(parameter.name) && node.arguments[index]) {
            next.set(parameter.name.text, values(node.arguments[index], definitions, parameters, seen));
          }
        });
        const body = definition.body;
        if (!body) return [];
        const result = ts.isArrowFunction(definition) && !ts.isBlock(body)
          ? [body] : returns(body);
        return result.flatMap((branch) => values(branch, definitions, next, new Set([...seen, name])));
      }
    }
    if (ts.isIdentifier(node.expression) && routeWrappers.has(node.expression.text) && node.arguments[0]) {
      return values(node.arguments[0], definitions, parameters, seen);
    }
    return [];
  }
  return [];
}

function constructedTargets(source: string, file: string): string[] {
  const definitions = new Map<string, Definition>();
  const targets: ts.Expression[] = [];
  const constructions: ts.Expression[] = [];
  const scripts: string[] = [];
  if (file.endsWith('.svelte')) {
    const svelte = parse(source, { modern: true });
    const scriptBody = (content: unknown) => {
      const { start, end } = content as { start: number; end: number };
      return source.slice(start, end);
    };
    if (svelte.instance) scripts.push(scriptBody(svelte.instance.content));
    if (svelte.module) scripts.push(scriptBody(svelte.module.content));
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      const node = value as { type?: string; name?: string; value?: unknown; expression?: { start: number; end: number } };
      if (node.type === 'Attribute' && (node.name === 'href' || node.name === 'back')) {
        const parts = node.value;
        if (Array.isArray(parts)) {
          if (parts.length === 1 && parts[0]?.type === 'ExpressionTag') {
            targets.push(expression(source.slice(parts[0].expression.start, parts[0].expression.end)));
          } else {
            const route = parts.map((part) => part.type === 'Text' ? part.data : unknown).join('');
            targets.push(expression(JSON.stringify(route)));
          }
        } else if (parts && typeof parts === 'object' && (parts as { type?: string }).type === 'ExpressionTag') {
          const part = parts as { expression: { start: number; end: number } };
          targets.push(expression(source.slice(part.expression.start, part.expression.end)));
        }
      }
      if (node.type === 'ExpressionTag' && node.expression) scripts.push(source.slice(node.expression.start, node.expression.end));
      for (const child of Object.values(node)) if (child && typeof child === 'object') visit(child);
    };
    visit(svelte.fragment);
  } else scripts.push(source);

  for (const script of scripts) {
    const ast = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
        constructions.push(node);
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        definitions.set(node.name.text, node.initializer);
        constructions.push(node.initializer);
      }
      if (ts.isFunctionDeclaration(node) && node.name) definitions.set(node.name.text, node);
      if (ts.isReturnStatement(node) && node.expression) constructions.push(node.expression);
      if (ts.isPropertyAssignment(node)) {
        constructions.push(node.initializer);
        if (destinationProperties.has(node.name.getText(ast).replace(/['"]/g, ''))) targets.push(node.initializer);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'goto' && node.arguments[0]) {
        targets.push(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }

  const candidates = targets.flatMap((target) => values(target, definitions).map((route) => ({ route, target: true })));
  candidates.push(...constructions.flatMap((construction) => values(construction, definitions).map((route) => ({ route, target: false }))));
  return candidates.filter(({ route, target }) => {
    if (!route.startsWith('/') || route.startsWith('//')) return false;
    const path = route.split(/[?#]/, 1)[0];
    const concrete = path.replaceAll(unknown, 'value');
    if (!target && !routeHeads.has(path.split('/')[1])) return false;
    if (!target && (path.endsWith('/') || path.endsWith('/*') || screens.some((screen) => screen.startsWith(path + '/')))) return false;
    return !matchesScreen(concrete) && !(path.endsWith(unknown) && matchesScreen(path.slice(0, -unknown.length)));
  }).map(({ route }) => `${relative(root, file)}: ${route}`);
}

function missesIn(source: string, file: string): string[] {
  return [...new Set(constructedTargets(source, file))];
}

it('keeps internal href and goto targets on rendered routes', () => {
  const misses = files(root)
    .filter((path) => /\.(?:ts|svelte)$/.test(path) && !path.endsWith('.test.ts'))
    .flatMap((file) => missesIn(readFileSync(file, 'utf8'), file));
  expect(misses).toEqual([]);
});

it('checks computed href values', () => {
  const file = join(root, 'route-probe.svelte');
  expect(missesIn(`<script lang="ts">
    const body = '/body';
    let returnHref = $derived(body + '/sizes');
  </script>
  <a href={returnHref}>Return</a>`, file)).toContain('route-probe.svelte: /body/sizes');
});

it('checks routes returned through nested helpers', () => {
  const file = join(root, 'route-probe.svelte');
  expect(missesIn(`<script lang="ts">
    const body = '/body';
    function oldTarget() { return body + '/sizes'; }
    function withReturn(href: string) { return withListReturn(href, page.url); }
  </script>
  <button onclick={() => goto(withReturn(oldTarget()))}>Open</button>`, file))
    .toContain('route-probe.svelte: /body/sizes');
});

it('accepts computed targets that resolve to rendered routes', () => {
  const file = join(root, 'route-probe.svelte');
  expect(missesIn(`<script lang="ts">
    const health = '/health';
    let returnHref = $derived(health + '/appointments');
    function entry() { return withListReturn(\`/entry/\${id}\`, page.url); }
  </script>
  <a href={returnHref}>Return</a>
  <button onclick={() => goto(entry())}>Open</button>`, file)).toEqual([]);
});
