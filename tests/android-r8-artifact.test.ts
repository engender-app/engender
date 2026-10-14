import { expect, it } from 'vitest';
import { verifyR8Mapping } from './android-r8-artifact.mjs';

const plugins = [{ name: 'dev.engender.app.fixture.FixturePlugin', methods: ['open', 'permissionResult'] }];
const mapping = `# compiler: R8
# compiler_version: 9.9.9-synthetic
 dev.engender.app.fixture.FixturePlugin -> dev.engender.app.fixture.FixturePlugin:
    1:2:void open(com.getcapacitor.PluginCall):3:4 -> open
    void permissionResult(com.getcapacitor.PluginCall) -> permissionResult
 dev.engender.app.fixture.Helper -> a.b:
    void work() -> a
`.replace(/^ /gm, '');

it('accepts preserved bridge methods alongside obfuscated helpers', () => {
  expect(verifyR8Mapping(mapping, plugins)).toEqual({ compiler: 'R8', version: '9.9.9-synthetic', plugins: 1, renamedHelpers: 1 });
});

it.each([
  [mapping.replace('# compiler: R8', '# compiler: D8'), 'artifact has no R8 compiler stamp'],
  [mapping.replace('FixturePlugin -> dev.engender.app.fixture.FixturePlugin', 'FixturePlugin -> a.c'), 'bridge plugin removed or renamed'],
  [mapping.replace(' -> open', ' -> a'), 'reflective bridge method removed or renamed'],
  [mapping.replace(' -> permissionResult', ' -> b'), 'reflective bridge method removed or renamed'],
  [mapping.replace('Helper -> a.b', 'Helper -> dev.engender.app.fixture.Helper'), 'R8 did not obfuscate any app helpers']
])('rejects an artifact that loses its R8 or bridge contract', (artifact, error) => {
  expect(() => verifyR8Mapping(artifact, plugins)).toThrow(error);
});
