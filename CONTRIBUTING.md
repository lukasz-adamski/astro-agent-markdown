# Contributing

Thanks for your interest in improving astro-agent-markdown. Bug reports, ideas and pull requests are all welcome.

## Reporting issues

Use the [issue templates](https://github.com/lukasz-adamski/astro-agent-markdown/issues/new/choose). A minimal reproduction (a repository or a StackBlitz project) is the fastest way to get a bug fixed. Report security issues privately, as described in [SECURITY.md](SECURITY.md).

## Development

Requirements: Node.js 22.12 or later and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm test        # unit tests and integration tests against the fixture projects
pnpm typecheck
pnpm lint        # Biome; `pnpm format` fixes formatting
pnpm build       # compiles src/ to dist/
```

The integration tests build and serve the Astro projects in `test/fixtures/` and load the integration from `dist/`, so `pnpm test` runs `pnpm build` first.

### Project layout

| Path | Contents |
| --- | --- |
| `src/core/` | HTML → Markdown conversion, metadata, routing and HTTP helpers shared by every mode |
| `src/build/` | Static build output: Markdown files, `llms.txt`, Cloudflare files |
| `src/dev/` | Dev server middleware |
| `src/runtime/` | Middleware and endpoint injected for on-demand rendered pages |
| `src/cloudflare/` | Worker module published as `astro-agent-markdown/cloudflare` |
| `src/integration.ts` | Astro hooks wiring everything together |

`src/cloudflare/` and the modules it imports must stay free of Node.js APIs and heavy dependencies, because they run in Workers.

## Pull requests

- Keep changes focused. Open an issue first for larger features.
- Add or update tests for every behavior change.
- Update the README when options or behavior change.
- Add a line to `CHANGELOG.md` under `## Unreleased` (create the heading if it's missing).
- Make sure `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.

## Releasing

Maintainers only:

1. Rename `## Unreleased` in `CHANGELOG.md` to the new version, e.g. `## 0.2.0`.
2. Run `npm version <patch|minor|major>`. It updates `package.json` and creates the commit and the `v*` tag.
3. Run `git push --follow-tags`.

The [release workflow](.github/workflows/release.yml) checks the tag, runs the full test suite and publishes to npm with provenance. It then creates the GitHub release from the matching `CHANGELOG.md` section.
