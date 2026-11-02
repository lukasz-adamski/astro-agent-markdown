# Changelog

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
