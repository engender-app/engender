import { expect, it } from 'vitest';
import { verifyR8Mapping } from '../../tools/android-r8-artifact.mjs';

const plugins = [{ name: 'dev.engender.app.fixture.FixturePlugin', methods: ['open', 'permissionResult'] }];
const mapping = `# compiler: R8
# compiler_version: 9.9.9-synthetic
 com.getcapacitor.PluginMethod -> com.getcapacitor.PluginMethod:
    java.lang.String returnType() -> returnType
 com.getcapacitor.annotation.CapacitorPlugin -> com.getcapacitor.annotation.CapacitorPlugin:
    java.lang.String name() -> name
    com.getcapacitor.annotation.Permission[] permissions() -> permissions
    int[] requestCodes() -> requestCodes
 com.getcapacitor.annotation.Permission -> com.getcapacitor.annotation.Permission:
    java.lang.String alias() -> alias
    java.lang.String[] strings() -> strings
 com.getcapacitor.annotation.ActivityCallback -> com.getcapacitor.annotation.ActivityCallback:
 com.getcapacitor.annotation.PermissionCallback -> com.getcapacitor.annotation.PermissionCallback:
 dev.engender.app.fixture.FixturePlugin -> dev.engender.app.fixture.FixturePlugin:
    1:2:void open(com.getcapacitor.PluginCall):3:4 -> open
    void permissionResult(com.getcapacitor.PluginCall) -> permissionResult
 dev.engender.app.fixture.Helper -> a.b:
    void work() -> a
`.replace(/^ /gm, '');

it('accepts preserved bridge methods alongside obfuscated helpers', () => {
  expect(verifyR8Mapping(mapping, plugins)).toEqual({ compiler: 'R8', version: '9.9.9-synthetic', plugins: 1, renamedHelpers: 1 });
});

it('accepts an unchanged abstract annotation member omitted from mapping', () => {
  expect(() => verifyR8Mapping(mapping.replace('    java.lang.String returnType() -> returnType\n', ''), plugins)).not.toThrow();
});

it.each([
  [mapping.replace('# compiler: R8', '# compiler: D8'), 'artifact has no R8 compiler stamp'],
  [mapping.replace('CapacitorPlugin -> com.getcapacitor.annotation.CapacitorPlugin', 'CapacitorPlugin -> a.d'), 'runtime annotation removed or renamed'],
  [mapping.replace('permissions() -> permissions', 'permissions() -> a'), 'runtime annotation member renamed'],
  [mapping.replace('strings() -> strings', 'strings() -> b'), 'runtime annotation member renamed'],
  [mapping.replace('FixturePlugin -> dev.engender.app.fixture.FixturePlugin', 'FixturePlugin -> a.c'), 'bridge plugin removed or renamed'],
  [mapping.replace(' -> open', ' -> a'), 'reflective bridge method removed or renamed'],
  [mapping.replace(' -> permissionResult', ' -> b'), 'reflective bridge method removed or renamed'],
  [mapping.replace('Helper -> a.b', 'Helper -> dev.engender.app.fixture.Helper'), 'R8 did not obfuscate any app helpers']
])('rejects an artifact that loses its R8 or bridge contract', (artifact, error) => {
  expect(() => verifyR8Mapping(artifact, plugins)).toThrow(error);
});
