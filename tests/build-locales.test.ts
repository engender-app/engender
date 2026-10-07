import { describe, expect, it } from 'vitest';
import { composeShell, selectLocale } from '../scripts/build-locales.mjs';

function shell(locale: string, version = '123') {
  return `<html><head><script>/* boot preferences */</script><meta http-equiv="content-security-policy" content="script-src 'self'; object-src 'none'"><link rel="x-modulepreload" href="/_app/immutable/chunks/${locale}.js"><link href="/_app/immutable/assets/style.css" rel="stylesheet"></head><body><div><script>{ __sveltekit_${version} = { base: "" }; const element = document.currentScript.parentElement; Promise.all([import("/_app/immutable/entry/start.${locale}.js"),import("/_app/immutable/entry/app.${locale}.js")]).then(([kit, app]) => { kit.start(app, element); }); }</script></div></body></html>`;
}

describe('locale shell selection', () => {
  it('matches saved locale before ordered browser language negotiation', () => {
    expect(selectLocale('PL', ['en-US'])).toBe('pl');
    expect(selectLocale('invalid', ['fr', 'pl-PL', 'en-US'])).toBe('pl');
    expect(selectLocale(null, ['EN-gb', 'pl'])).toBe('en');
    expect(selectLocale(null, ['fr'])).toBe('en');
  });
  it('keeps startup graphs separate and selects before imports', () => {
    const result = composeShell(shell('en'), shell('pl'));
    expect(result.graph.en).toContain('/_app/immutable/chunks/en.js');
    expect(result.graph.en).not.toContain('/_app/immutable/chunks/pl.js');
    expect(result.graph.pl).toContain('/_app/immutable/chunks/pl.js');
    expect(result.html).toContain('import(engenderLocaleGraph.entries[0])');
    expect(result.html).toContain('const engenderLocaleGraphs');
    expect(result.html).toContain("object-src 'none'");
    expect(result.selectorGzipBytes).toBeGreaterThan(0);
  });
  it('refuses version, stylesheet and bootstrap changes', () => {
    expect(() => composeShell(shell('en'), shell('pl', '456'))).toThrow('share one SvelteKit version');
    expect(() => composeShell(shell('en'), shell('pl').replace('style.css', 'other.css'))).toThrow('share their startup stylesheets');
    expect(() => composeShell(shell('en').replace('kit.start(app, element)', 'kit.launch()'), shell('pl'))).toThrow('exactly one SvelteKit startup');
  });
});
