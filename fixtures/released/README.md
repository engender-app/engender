# Released formats

Each non-alpha `v*` tag needs a directory named after its version, without the
`v`. Run `tests/released-formats.test.ts` with `WRITE_RELEASED_FORMAT=<version>`
in that release's checkout to write its Archive, populated SQLite journal and
row counts. The writer refuses to overwrite an existing directory. Fetch tags
before testing; the Node CI job uses `fetch-depth: 0` and `fetch-tags: true`.

## 1.0.0-rc.1

These three files came from the unchanged writer at `v1.0.0-rc.1`, commit
`de5eb9dc7`, on 14 October 2026. The journal has schema 88 and three entries,
plus the writer's content in every Archive section. All data is synthetic.

The released writer accepts only a stable version string. In a temporary,
detached checkout, run `npm ci`, `npx svelte-kit sync`, then:

```sh
WRITE_RELEASED_FORMAT=1.0.0 npx vitest run tests/released-formats.test.ts \
  -t 'writes the release candidate fixtures once'
```

Copy that checkout's `fixtures/released/1.0.0/` to
`fixtures/released/1.0.0-rc.1/` without changing the files. The environment value
sets only the directory name; the released code writes the file formats and
counts. No released source or tag was changed.
