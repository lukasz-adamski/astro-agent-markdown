# Changelog

## 0.2.1

- The generated Cloudflare Worker adds `charset=utf-8` to `.md` and `.txt` files, which Workers static assets serve without one in production. Clients such as Python's `requests` decoded them as ISO-8859-1. Remove `!/*.md` from `run_worker_first` so `.md` files reach the Worker.
- Markdown served at `.md` URLs by the Worker, the dev server and on-demand pages has a canonical `Link` header pointing to its page.
- New `decorateResponse` export in `astro-agent-markdown/cloudflare` for existing Workers, and `trailingSlash` and `buildFormat` options for the canonical link.
- With `cloudflare: { worker: false }`, the build log points to the zone rules that add the charset. The README lists them.

## 0.2.0

This release changes the generated Markdown and `llms-full.txt`. Review the output of your pages after upgrading.

### Conversion

- Buttons inside headings, accordion triggers (`[aria-expanded]`) and tabs (`[role="tab"]`) keep their text. FAQ questions rendered as `<h3><button>…</button></h3>` were left as empty headings. Buttons outside text become separate lines.
- New `keepSelectors` option and `DEFAULT_KEEP_SELECTORS` export: elements exempt from removal.
- Screen-reader text (`.sr-only`, `.visually-hidden`) is kept. It was removed, even though agents are the readers it is written for. Skip links are still removed.
- Decorative images (`alt=""`, `role="presentation"`, `role="none"`) are removed.
- Formatting elements left without text no longer produce `****`.
- Heading permalinks placed after the heading with only screen-reader text (Starlight's `Section titled …` links) are removed.
- Fragment links (`#pricing`) are resolved to the HTML page when `absoluteUrls` is on.
- Definition lists are written as `**term**: details` lines.
- The `_headers` rule only sets `Content-Signal` and is written only when `contentSignal` is set. Its `Content-Type` line also labelled the HTML 404 page of a missing `.md` file as Markdown. Workers static assets serve `.md` files as `text/markdown` without it.
- Localized error pages (`/en/404`, `/de/500`) are always excluded.
- Selectors with combinators inside `:not()` or `:is()` are rejected: hast-util-select silently mismatches them.
- Placeholder links (`href="#"`) keep only their text.
- `PageMetadata.siteName`, from `og:site_name`.

### llms.txt

- Several files: `path`, or `locales: true` for one file per locale of Astro's `i18n` config, with per-locale overrides when `locales` is an object. Files link to each other under `## Other languages` (`crossLinks`, `language`), named after their language (`English`, or `British English` when two files share it).
- `include` and `exclude` per file.
- `intro` and `introFile`: hand-written Markdown between the summary and the links.
- `sections`, with `'auto'` grouping by path segment and `sectionOrder`, and `optional` for the `## Optional` section, always last.
- `entry` decides the label and description of a page, or leaves it out of the index only.
- `index: false` generates only `llms-full.txt`.
- The heading is the site name (`og:site_name`, or the name shared by page titles, across the whole site for files with few pages) instead of the home page title. Link labels leave that name out, at the start or end of a title. The home page comes first.
- Warnings for sections matching no page, pages without a description and pages in no file. The build log lists the written files and their sizes.

### llms-full.txt

- Pages follow the order of the index and leave out JSON-LD and, unless `full.optional` is set, the `Optional` section.
- Each page starts with its first `# heading` and a `Source:` line instead of its frontmatter (`full.pageHeader: 'frontmatter'` restores it). Eyebrows and tag lists above the heading follow it.
- `full.dedupe` removes boilerplate repeated across pages, such as calls to action: top-level blocks found on at least half of the pages (`minShare`) stay on the first page only. Facts, repeats within a page and headings followed by another heading are kept.
- `full.maxSize` warns above 500 KB by default, naming the largest pages.

## 0.1.0

Initial release.
- Markdown version of every prerendered page, written next to the HTML at build time.
- HTML → Markdown pipeline with content root selection, element removal, YAML frontmatter, JSON-LD and absolute URLs.
- `<link rel="alternate" type="text/markdown">` added to generated HTML.
- Optional `llms.txt` and `llms-full.txt`.
- Dev server support for `/page.md` and `Accept: text/markdown`.
- On-demand rendered pages: content negotiation, `/page.md` URLs, `Vary`, `Link` and `Content-Signal` headers.
- `rehypePlugins`, `remarkPlugins` and `transform` extension points.
- Cloudflare Workers static assets: `_headers` rule for Markdown files, generated `_worker.js` for `Accept: text/markdown` (rewrite or redirect), and the `astro-agent-markdown/cloudflare` module for custom Workers.
