# astro-agent-markdown

[![npm](https://img.shields.io/npm/v/astro-agent-markdown)](https://www.npmjs.com/package/astro-agent-markdown)
[![CI](https://github.com/lukasz-adamski/astro-agent-markdown/actions/workflows/ci.yml/badge.svg)](https://github.com/lukasz-adamski/astro-agent-markdown/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An Astro integration that gives every page a clean Markdown version for AI agents, crawlers and other non-browser clients.

Pages stay as they are for people. Agents get the same content without navigation, scripts, styles or layout markup: fewer tokens, less noise. The idea comes from Cloudflare's [Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/). This integration does the same thing inside Astro, so it doesn't depend on where you host.

```
/docs/install/      → HTML for browsers
/docs/install.md    → Markdown for agents
```

## Features

- **Static first.** At build time, a `.md` file is written next to every prerendered page. Any static host can serve it.
- **Generated from the final HTML.** Whatever your pages render (`.astro`, MDX, content collections, Starlight, components) is converted from the build output. If another integration post-processes HTML in `astro:build:done`, list it before this one.
- **Configurable output.** You choose which pages are converted, which element is the main content and which elements are removed. There are also rehype/remark plugins and a final `transform` hook.
- **Agent-friendly output.** YAML frontmatter from `<meta>` tags, absolute URLs, GFM tables, code fences with languages, and JSON-LD.
- **Discoverable.** `<link rel="alternate" type="text/markdown">` in every page, plus an optional [`llms.txt`](https://llmstxt.org).
- **Works in dev.** `/page.md` URLs and `Accept: text/markdown` work in `astro dev`, with the same pipeline as the build.
- **On-demand rendering.** If you use an adapter, server-rendered pages also get content negotiation, `/page.md` URLs and `Vary`, `Link` and `Content-Signal` headers.
- **Cloudflare Workers.** Static sites deployed with Workers static assets can get a `_headers` rule and a small generated Worker that answers `Accept: text/markdown`.

## Installation

```sh
npx astro add astro-agent-markdown
```

Or install it manually:

```sh
npm install astro-agent-markdown
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import agentMarkdown from 'astro-agent-markdown';

export default defineConfig({
	site: 'https://example.com', // recommended: makes links and the `url` field absolute
	integrations: [agentMarkdown()],
});
```

Requires Astro 6 or 7 and Node.js 22.12 or later.

## How it works

| Context | `/page.md` | `Accept: text/markdown` | Hooks applied |
| --- | --- | --- | --- |
| `astro build` (prerendered pages) | static file | needs a server or edge rule ([see below](#content-negotiation-on-static-hosts)) | yes |
| `astro build` with `cloudflare` | static file | yes, with the generated Worker ([see below](#cloudflare-workers)) | yes |
| `astro dev` | yes | yes | yes |
| On-demand pages (`middleware`) | yes | yes | no ([see below](#hooks-and-on-demand-pages)) |

Every page goes through the same pipeline:

1. The rendered HTML is parsed. Metadata is read from `<head>`.
2. The main content is selected (`contentSelector`). Everything else is dropped.
3. Non-content elements are removed (`removeSelectors`).
4. The markup is normalized: code languages, heading permalinks, asides, relative URLs.
5. The result is converted to Markdown, and frontmatter and JSON-LD are added.

### Example

```html
<html lang="en">
  <head>
    <title>Installation | Acme Docs</title>
    <meta name="description" content="How to install Acme." />
  </head>
  <body>
    <header><nav>…</nav></header>
    <main>
      <h1>Installation</h1>
      <aside aria-label="Tip"><p>Use pnpm for faster installs.</p></aside>
      <pre data-language="sh"><code>pnpm add acme</code></pre>
      <p>Next, <a href="../config/">configure it</a>.</p>
    </main>
    <footer>…</footer>
  </body>
</html>
```

becomes `/docs/install.md`:

````md
---
title: Installation | Acme Docs
description: How to install Acme.
url: https://example.com/docs/install/
---

# Installation

> **Tip**
>
> Use pnpm for faster installs.

```sh
pnpm add acme
```

Next, [configure it](https://example.com/docs/config/).
````

## Requesting Markdown

```sh
# Static file (works on any host)
curl https://example.com/docs/install.md

# Content negotiation (dev server, on-demand pages, Cloudflare Worker)
curl https://example.com/docs/install/ -H "Accept: text/markdown"
```

A request gets Markdown only when `text/markdown` is listed in `Accept` and is at least as preferred as `text/html`. Browsers never send it, so they keep getting HTML.

Markdown responses have these headers:

| Header           | Value                                       |
| ---------------- | ------------------------------------------- |
| `Content-Type`   | `text/markdown; charset=utf-8`              |
| `Vary`           | `Accept`, merged with existing values       |
| `Content-Signal` | only when the `contentSignal` option is set |

`Content-Length`, `Content-Encoding`, `ETag` and `Last-Modified` are removed, because they describe the HTML body. Other headers are kept, including cookies.

## Configuration

```js
agentMarkdown({
	exclude: ['/admin/**', '/tags/*'],
	contentSelector: ['article', 'main'],
	removeSelectors: ['.toc', '.newsletter', '#comments'],
	frontmatter: ['title', 'description', 'url'],
	llmsTxt: { title: 'Acme', full: true },
	contentSignal: { aiTrain: false, search: true, aiInput: true },
});
```

### Pages

| Option    | Type       | Default  | Description                                                                           |
| --------- | ---------- | -------- | ------------------------------------------------------------------------------------- |
| `include` | `string[]` | `['**']` | Glob patterns of pages to convert, matched against the route pathname without `base`. |
| `exclude` | `string[]` | `[]`     | Glob patterns of pages to skip. `/404` and `/500` are always skipped.                 |

Patterns are written like pathnames and ignore trailing slashes: `/blog/**` matches `/blog`, `/blog/` and `/blog/a/b/`.

These pages are skipped automatically:

- redirects (`<meta http-equiv="refresh">`)
- pages with `data-markdown-ignore` on `<html>` or `<body>`
- pages where no `contentSelector` matches

### Content

| Option                   | Type                 | Default                                                        | Description                                                          |
| ------------------------ | -------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `contentSelector`        | `string \| string[]` | `['[data-markdown-content]', 'main', '[role="main"]', 'body']` | CSS selectors for the main content. The first one that matches wins. |
| `removeSelectors`        | `string[]`           | `[]`                                                           | More elements to remove, added to the built-in list.                 |
| `defaultRemoveSelectors` | `boolean`            | `true`                                                         | Whether to apply the built-in removal list.                          |

Built-in removal list ([`DEFAULT_REMOVE_SELECTORS`](src/core/selectors.ts)):

- scripts, styles, `<noscript>` and `<template>`
- embeds: `<iframe>`, `<object>`, `<embed>`, `<canvas>`, inline `<svg>`, `data:` images
- page chrome: `<nav>`, `<footer>`, the page-level `<header>`, landmark roles
- form controls: `<form>`, `<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`
- hidden content: `[hidden]`, `[aria-hidden="true"]`, `.sr-only`, `.visually-hidden`
- anything marked `[data-markdown-ignore]`

Removal selectors are matched against the whole document. This is why `body > header` works even when `<body>` is the content root. Invalid selectors are rejected when the config loads.

You can also mark content directly in your markup:

```astro
<main>
  <article data-markdown-content>…</article>   <!-- use this as the content root -->
  <div class="share" data-markdown-ignore>…</div> <!-- leave this out -->
</main>
```

### Output

| Option          | Type                            | Default                                    | Description                                                                                                                                                                                                        |
| --------------- | ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontmatter`   | `boolean \| FrontmatterField[]` | `['title', 'description', 'url', 'image']` | Fields to emit, in this order. Available fields: `title`, `description`, `url`, `image`, `lang`. `false` disables frontmatter.                                                                                      |
| `jsonLd`        | `boolean`                       | `true`                                     | Add `<script type="application/ld+json">` blocks at the end as a fenced `json` block.                                                                                                                              |
| `absoluteUrls` | `boolean` | `true` | Resolve links and image sources to absolute URLs using `site`. Without `site`, they become root-relative. |
| `markdown`      | `MarkdownFormatOptions`         | `{ bullet: '-', rule: '-' }`               | Formatting options for [`remark-stringify`](https://github.com/remarkjs/remark/tree/main/packages/remark-stringify#options): `bullet`, `emphasis`, `strong`, `fence`, `rule`, `listItemIndent`, `setext` and more. |
| `outputPath`    | `'sibling' \| 'nested'`         | `'sibling'`                                | `'sibling'` writes `/docs/intro.md`. `'nested'` writes `/docs/intro/index.md`. The home page is always `/index.md`.                                                                                                 |
| `alternateLink` | `boolean`                       | `true`                                     | Add `<link rel="alternate" type="text/markdown">` to generated HTML, and a `Link` header to on-demand responses.                                                                                                   |
| `llmsTxt`       | `boolean \| LlmsTxtOptions`     | `false`                                    | Generate `/llms.txt` listing every Markdown page. Options: `title`, `description` (both default to the home page's values) and `full` (also writes `llms-full.txt` with the content of every page).                |

How frontmatter fields are filled:

| Field         | Source, first match wins                                                       |
| ------------- | ------------------------------------------------------------------------------ |
| `title`       | `<meta name="title">`, then `og:title`, then `twitter:title`, then `<title>`   |
| `description` | `<meta name="description">`, then `og:description`, then `twitter:description` |
| `url`         | `<link rel="canonical">`, then `og:url`, then the page URL                     |
| `image`       | `og:image`, then `twitter:image`                                               |
| `lang`        | `<html lang>`                                                                  |

### Server

| Option               | Type                               | Default  | Description                                                                                                                                       |
| -------------------- | ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contentNegotiation` | `boolean` | `true` | Serve Markdown for `Accept: text/markdown` in dev, on on-demand pages and in the generated Cloudflare Worker. |
| `contentSignal`      | `false \| string \| ContentSignal` | `false`  | Add a [`Content-Signal`](https://contentsignals.org) header to Markdown responses, for example `{ aiTrain: false, search: true, aiInput: true }`. |
| `middleware` | `boolean \| 'auto'` | `'auto'` | Inject the on-demand middleware and the `/[...path].md` route. `'auto'` does this for `output: 'server'`. See [On-demand pages in static projects](#on-demand-pages-in-static-projects). |

### Cloudflare

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `cloudflare` | `boolean \| CloudflareOptions` | `false` | Write deployment files for [Workers static assets](https://developers.cloudflare.com/workers/static-assets/). `true` enables everything below. |
| `cloudflare.headers` | `boolean` | `true` | Add a `/*.md` rule to `_headers`: `Content-Type: text/markdown; charset=utf-8`, plus `Content-Signal` when `contentSignal` is set. |
| `cloudflare.worker` | `boolean` | `true` | Write `_worker.js`, a Worker that answers `Accept: text/markdown` with the page's Markdown file, and add it to `.assetsignore`. Static output only. |
| `cloudflare.negotiation` | `'rewrite' \| 'redirect'` | `'rewrite'` | `'rewrite'` serves the Markdown at the page URL. `'redirect'` sends a `302` to the `.md` URL. |

See [Cloudflare Workers](#cloudflare-workers) for the Wrangler setup.

### Hooks

| Option          | Type                                    | Description                                                                                       |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `rehypePlugins` | `PluggableList`                         | Run on the cleaned HTML tree, before conversion.                                                  |
| `remarkPlugins` | `PluggableList`                         | Run on the Markdown tree, before serialization.                                                   |
| `transform`     | `(markdown, context) => string \| void` | Last step. Return a string to replace the output. `context` has `pathname`, `url` and `metadata`. |

```js
agentMarkdown({
	transform: (markdown, { url }) => `${markdown}\nSource: ${url}\n`,
});
```

Plugins can read the page metadata from `file.data.page`.

## Notes

### Hooks and on-demand pages

The on-demand middleware runs inside your server bundle. Functions can't be serialized into it. So `rehypePlugins`, `remarkPlugins` and `transform` apply to the build and to `astro dev`, but not to server-rendered pages. All other options apply everywhere. The integration warns about this when you use both.

### On-demand pages in static projects

With `output: 'static'`, the default, you can still render some pages on demand with an adapter and `export const prerender = false`. `middleware: 'auto'` doesn't cover this case. The `/[...path].md` route is itself rendered on demand, so injecting it would turn every static project with an adapter into a server build. Opt in explicitly:

```js
agentMarkdown({ middleware: true });
```

`middleware: true` requires an adapter. Without one, the config fails with an error.

### Content negotiation on static hosts

A static host serves files and ignores `Accept`, so negotiation needs something in front of it. For prerendered pages, the `.md` files cover most agents. If you also need `Accept: text/markdown` on prerendered URLs, add a rewrite at your host or edge (a Netlify Edge Function, a Vercel rewrite with a `has` header condition, and so on). The rewrite should map `/docs/intro/` to `/docs/intro.md` when the header asks for Markdown. On Cloudflare, the [`cloudflare` option](#cloudflare-workers) does this for you, or you can use [zone rules without a Worker](#cloudflare-without-a-worker).

The same applies to prerendered pages in a project with an adapter. The host serves their HTML before Astro runs.

### Cloudflare Workers

With `cloudflare: true`, a static build writes three extra files to `dist/`:

| File | Purpose |
| --- | --- |
| `_headers` | A `/*.md` rule with `Content-Type: text/markdown; charset=utf-8` and `Content-Signal`. Appended to your own `public/_headers` if you have one. |
| `_worker.js` | A Worker that serves the page's Markdown file for `Accept: text/markdown` and adds `Vary: Accept` to HTML. It imports `astro-agent-markdown/cloudflare`, which Wrangler bundles (about 6 KiB). |
| `.assetsignore` | Lists `_worker.js`, so the Worker isn't uploaded as a public file. |

Point Wrangler at the generated Worker. `run_worker_first` sends page requests to the Worker, while scripts, styles and `.md` files are still served directly as free static requests:

```jsonc
// wrangler.jsonc
{
  "name": "my-site",
  "compatibility_date": "2026-10-01",
  "main": "./dist/_worker.js",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "404-page",
    "run_worker_first": ["/*", "!/_astro/*", "!/*.md"]
  }
}
```

```sh
astro build && wrangler deploy
```

The Worker reads only static files. It never converts HTML at request time, and it keeps `ETag` and conditional requests working. Pages without a Markdown file (excluded or opted out) fall back to HTML. With `negotiation: 'redirect'`, agents get a `302` to the `.md` URL instead.

If you already have a Worker, set `cloudflare: { worker: false }` and call `serveMarkdown` yourself:

```ts
import { serveMarkdown } from 'astro-agent-markdown/cloudflare';

export default {
  async fetch(request, env) {
    return (await serveMarkdown(request, env.ASSETS)) ?? env.ASSETS.fetch(request);
  },
};
```

`serveMarkdown` and `createMarkdownWorker` accept `base`, `outputPath`, `negotiation` and `contentSignal`. Use the same values as in the integration. The worker is skipped for server output: there, the Cloudflare adapter's Worker serves on-demand pages through the integration's middleware.

### Cloudflare without a Worker

You can also serve Markdown on Cloudflare without running any Worker code. All requests then stay free static asset requests. The trade-off is weaker content negotiation.

**`_headers` only.** Turn the Worker off and deploy the static assets as usual:

```js
agentMarkdown({ cloudflare: { worker: false } });
```

```jsonc
// wrangler.jsonc
{
  "name": "my-site",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "./dist", "not_found_handling": "404-page" }
}
```

Every page still has a `.md` URL with the right `Content-Type` and `Content-Signal`. Agents find it through `<link rel="alternate">` and `llms.txt`. The only thing missing is `Accept: text/markdown` on the page URL itself, which returns HTML.

**Zone rules.** If the site runs on a custom domain, [URL rewrite rules](https://developers.cloudflare.com/rules/transform/url-rewrite/) can map negotiated requests to the Markdown files. These rules run before Workers and static assets. Create them in the zone, under **Rules** → **Transform Rules**, in this order:

1. **Home page** (URL rewrite, static path):

   ```
   When: any(http.request.headers["accept"][*] contains "text/markdown") and http.request.uri.path eq "/"
   Path: /index.md
   ```

2. **Other pages** (URL rewrite, dynamic path):

   ```
   When: any(http.request.headers["accept"][*] contains "text/markdown")
         and http.request.uri.path ne "/"
         and not http.request.uri.path contains "."
   Path: regex_replace(http.request.uri.path, "^(.+?)/?$", "${1}.md")
   ```

   This maps `/docs/intro/` and `/docs/intro` to `/docs/intro.md`. With `outputPath: 'nested'`, use `"${1}/index.md"` as the replacement. Paths containing a dot (assets, `.md` files) are skipped.

3. **`Vary` header** (response header modification), so caches keep HTML and Markdown apart:

   ```
   When: any(http.response.headers["content-type"][*] contains "text/html")
         or any(http.response.headers["content-type"][*] contains "text/markdown")
   Add header: Vary = Accept
   ```

Compared with the generated Worker, the rules have these limits:

- They need a zone (custom domain). Zone rules don't apply to `*.workers.dev`.
- There's no HTML fallback. Excluded or opted-out pages, and pages whose path contains a dot, return 404 to agents that ask for Markdown.
- `contains` checks only that `text/markdown` is listed. It ignores `q` weights. Browsers never send it, so they're not affected.
- Function availability can differ between Cloudflare plans. Test the rules on a staging hostname first.

[Redirect rules](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/) can do the same with a `302` to the `.md` URL instead of a rewrite.

**Cloudflare's Markdown for Agents.** On Pro plans and higher, the zone setting [Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/) converts HTML at the edge for `Accept: text/markdown`. It uses Cloudflare's own conversion, so this integration's selectors, hooks and frontmatter don't apply to those responses. The generated `.md` files and `llms.txt` still work alongside it.

### Existing files

A generated file never overwrites an existing one, such as `public/about.md` or `public/llms.txt`. The integration logs a warning and skips the page instead. In dev, `.md` files from `public/` and your own `.md` routes take precedence too.

## Programmatic API

The conversion pipeline is exported for use outside the integration, for example in your own middleware or in tests:

```js
import { htmlToMarkdown, prefersMarkdown } from 'astro-agent-markdown';

const page = await htmlToMarkdown(html, {
	url: 'https://example.com/docs/intro/',
	removeSelectors: ['.toc'],
});
page?.markdown; // string
page?.metadata; // { title, description, url, image, lang, jsonLd, … }

prefersMarkdown(request.headers.get('accept')); // boolean
```

`htmlToMarkdown` takes the content and output options listed above. It resolves to `null` for pages that wouldn't get a Markdown version.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, and [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[MIT](LICENSE)
