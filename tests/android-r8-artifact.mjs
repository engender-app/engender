import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Inspect the artifact, rather than assuming minifyEnabled ran R8.
 * @param {string} mapping
 * @param {{ name: string, methods: string[] }[]} plugins
 */
export function verifyR8Mapping(mapping, plugins) {
  assert.match(mapping, /^# compiler: R8$/m, 'artifact has no R8 compiler stamp');
  const version = /^# compiler_version: (.+)$/m.exec(mapping)?.[1];
  assert(version, 'artifact has no R8 version');
  /** @type {Map<string, { target: string, members: string[] }>} */
  const classes = new Map();
  /** @type {{ target: string, members: string[] } | undefined} */
  let current;
  for (const line of mapping.split('\n')) {
    const header = /^(\S+) -> (\S+):$/.exec(line);
    if (header) {
      current = { target: header[2], members: [] };
      classes.set(header[1], current);
    } else if (current && /^\s/.test(line)) current.members.push(line);
  }
  for (const { name, methods } of plugins) {
    const plugin = classes.get(name);
    assert.equal(plugin?.target, name, `bridge plugin removed or renamed: ${name}`);
    for (const method of methods) {
      assert(plugin.members.some((line) => line.includes(` ${method}(`) && line.endsWith(` -> ${method}`)),
        `reflective bridge method removed or renamed: ${name}.${method}`);
    }
  }
  const renamedHelpers = [...classes].filter(([name, entry]) => name.startsWith('dev.engender.app.') && name !== entry.target).length;
  assert(renamedHelpers > 0, 'R8 did not obfuscate any app helpers');
  return { compiler: 'R8', version, plugins: plugins.length, renamedHelpers };
}

/** @param {string} repo */
function registeredPlugins(repo) {
  const java = join(repo, 'android/app/src/main/java');
  const registry = readFileSync(join(java, 'dev/engender/app/AndroidPluginRegistry.java'), 'utf8');
  const imports = new Map([...registry.matchAll(/^import ([\w.]+);$/gm)].map((match) => [match[1].split('.').at(-1), match[1]]));
  return [...registry.matchAll(/new PluginEntry\("[^"]+", (\w+)\.class\)/g)].map((match) => {
    const name = imports.get(match[1]);
    assert(name, `plugin has no import: ${match[1]}`);
    const source = name.startsWith('dev.engender.app.')
      ? join(java, `${name.replaceAll('.', '/')}.java`)
      : join(repo, 'node_modules/@capacitor/app/android/src/main/java', `${name.replaceAll('.', '/')}.java`);
    const text = readFileSync(source, 'utf8');
    const methods = [...text.matchAll(/@(?:PluginMethod|ActivityCallback|PermissionCallback)(?:\([^)]*\))?\s+(?:public|protected|private)\s+(?:(?:synchronized|final|static)\s+)*void\s+(\w+)\s*\(/g)].map((method) => method[1]);
    assert(methods.length, `plugin has no discovered bridge methods: ${name}`);
    return { name, methods };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const repo = resolve(import.meta.dirname, '..');
  const mapping = readFileSync(process.argv[2] ?? join(repo, 'android/app/build/outputs/mapping/release/mapping.txt'), 'utf8');
  console.log(JSON.stringify(verifyR8Mapping(mapping, registeredPlugins(repo)), null, 2));
}
