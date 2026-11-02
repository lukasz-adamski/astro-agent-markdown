import type { Root } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';
import { type HtmlToMarkdownOptions, htmlToMarkdown } from '../../src/index.js';

const page = (body: string, head = '<title>Test page</title>') =>
	`<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;

async function convert(html: string, options?: HtmlToMarkdownOptions): Promise<string> {
	const result = await htmlToMarkdown(html, { frontmatter: false, ...options });
	if (!result) throw new Error('Expected a Markdown page');
	return result.markdown;
}

describe('frontmatter', () => {
	const head = `
		<title>Fallback title</title>
		<meta property="og:title" content="OG title">
		<meta name="description" content="Plain description">
		<meta property="og:description" content="OG description">
		<meta property="og:image" content="/social.png">
		<link rel="canonical" href="/canonical/">`;

	it('prefers standard meta tags over Open Graph', async () => {
		const result = await htmlToMarkdown(page('<main><p>Hi</p></main>', head), { url: 'https://example.com/a/' });
		expect(result?.markdown).toBe(
			[
				'---',
				'title: OG title',
				'description: Plain description',
				'url: https://example.com/canonical/',
				'image: https://example.com/social.png',
				'---',
				'',
				'Hi',
				'',
			].join('\n'),
		);
	});

	it('falls back to <title> and the page URL', async () => {
		const result = await htmlToMarkdown(page('<p>Hi</p>'), { url: 'https://example.com/a/' });
		expect(result?.metadata).toMatchObject({ title: 'Test page', url: 'https://example.com/a/', lang: 'en' });
	});

	it('emits the selected fields in order', async () => {
		const markdown = await convert(page('<p>Hi</p>', head), { frontmatter: ['lang', 'title'] });
		expect(markdown).toMatch(/^---\nlang: en\ntitle: OG title\n---\n/);
	});
});

describe('content selection', () => {
	it('uses <main> and drops the surrounding chrome', async () => {
		const html = page('<header>Logo</header><nav>Menu</nav><main><h1>Title</h1></main><footer>Footer</footer>');
		expect(await convert(html)).toBe('# Title\n');
	});

	it('prefers [data-markdown-content]', async () => {
		const html = page('<main><div>Intro</div><article data-markdown-content><p>Article</p></article></main>');
		expect(await convert(html)).toBe('Article\n');
	});

	it('falls back to <body> without site header and footers', async () => {
		const html = page(
			'<header>Logo</header><div><header><h1>Title</h1></header><p>Content</p><footer>Prev / Next</footer></div><footer>Site</footer>',
		);
		expect(await convert(html)).toBe('# Title\n\nContent\n');
	});

	it('skips pages where no content selector matches', async () => {
		expect(await htmlToMarkdown(page('<p>No article</p>'), { contentSelector: 'article' })).toBeNull();
	});

	it('removes non-content elements', async () => {
		const html = page(`<main>
			<p>Keep</p>
			<script>alert(1)</script><style>p{}</style><noscript>JS</noscript>
			<button>Click</button><form><input name="q"></form>
			<p hidden>Hidden</p><p aria-hidden="true">Decorative</p>
			<span class="sr-only">Screen reader</span>
			<div data-markdown-ignore>Ignored</div>
			<img src="data:image/png;base64,AAAA" alt="inline">
		</main>`);
		expect(await convert(html)).toBe('Keep\n');
	});

	it('applies custom removal selectors', async () => {
		const html = page('<main><p>Keep</p><aside class="ad">Ad</aside><div id="comments">Comments</div></main>');
		expect(await convert(html, { removeSelectors: ['.ad', '#comments'] })).toBe('Keep\n');
	});

	it('can disable the default removal list', async () => {
		const html = page('<main><nav>Table of contents</nav><p>Body</p></main>');
		expect(await convert(html, { defaultRemoveSelectors: false })).toBe('Table of contents\n\nBody\n');
	});
});

describe('page opt-out', () => {
	it('skips pages with data-markdown-ignore on <body>', async () => {
		const html = '<html><head><title>x</title></head><body data-markdown-ignore><p>x</p></body></html>';
		expect(await htmlToMarkdown(html)).toBeNull();
	});

	it('skips meta refresh redirects', async () => {
		const html = page('<a href="/new">Redirecting</a>', '<meta http-equiv="Refresh" content="0;url=/new">');
		expect(await htmlToMarkdown(html)).toBeNull();
	});
});

describe('markup normalization', () => {
	it('keeps the language of Shiki and Prism code blocks', async () => {
		const html = page(`<main>
			<pre class="astro-code" data-language="ts"><code><span class="line">const a = 1;</span>
<span class="line">a++;</span></code></pre>
			<pre class="language-css"><code>p {}</code></pre>
			<pre data-language="plaintext"><code>plain</code></pre>
		</main>`);
		expect(await convert(html)).toBe('```ts\nconst a = 1;\na++;\n```\n\n```css\np {}\n```\n\n```\nplain\n```\n');
	});

	it('unwraps heading permalinks', async () => {
		const html = page(`<main>
			<h2 id="a"><a href="#a">Wrapped</a></h2>
			<h2 id="b"><a href="#b" aria-hidden="true">#</a>Prepended</h2>
			<div><h2 id="c">Sibling</h2><a href="#c"><span aria-hidden="true">#</span><span class="sr-only">Section titled Sibling</span></a></div>
		</main>`);
		expect(await convert(html)).toBe('## Wrapped\n\n## Prepended\n\n## Sibling\n');
	});

	it('turns asides into labelled blockquotes', async () => {
		const html = page(`<main>
			<aside aria-label="Tip"><p aria-hidden="true">Tip</p><div><p>Use pnpm.</p></div></aside>
			<aside><p>Plain aside.</p></aside>
		</main>`);
		expect(await convert(html)).toBe('> **Tip**\n>\n> Use pnpm.\n\n> Plain aside.\n');
	});

	it('converts GFM tables and strikethrough', async () => {
		const html = page(
			'<main><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td><del>2</del></td></tr></table></main>',
		);
		expect(await convert(html)).toBe('| A | B     |\n| - | ----- |\n| 1 | ~~2~~ |\n');
	});
});

describe('URLs', () => {
	const html = page(`<main>
		<a href="../sibling/">Relative</a> <a href="/root">Root</a> <a href="#part">Fragment</a>
		<a href="https://other.dev/x">External</a> <a href="mailto:a@b.c">Mail</a>
		<img src="img.png" alt="Image">
	</main>`);

	it('resolves against the page URL', async () => {
		expect(await convert(html, { url: 'https://example.com/docs/page/' })).toBe(
			'[Relative](https://example.com/docs/sibling/) [Root](https://example.com/root) [Fragment](#part) ' +
				'[External](https://other.dev/x) [Mail](mailto:a@b.c) ![Image](https://example.com/docs/page/img.png)\n',
		);
	});

	it('produces root-relative URLs without an origin', async () => {
		expect(await convert(html)).toContain('[Relative](/sibling/) [Root](/root)');
	});

	it('preserves URLs when absoluteUrls is disabled', async () => {
		expect(await convert(html, { url: 'https://example.com/docs/page/', absoluteUrls: false })).toContain(
			'[Relative](../sibling/) [Root](/root)',
		);
	});
});

describe('JSON-LD', () => {
	const head = `<script type="application/ld+json">{ "@type": "Article" }</script>
		<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`;

	it('appends structured data as a fenced block', async () => {
		expect(await convert(page('<main><p>Body</p></main>', head))).toBe(
			'Body\n\n```json\n{"@type":"Article"}\n{"@type":"BreadcrumbList"}\n```\n',
		);
	});

	it('can be disabled', async () => {
		expect(await convert(page('<main><p>Body</p></main>', head), { jsonLd: false })).toBe('Body\n');
	});
});

describe('extension points', () => {
	it('runs rehype and remark plugins', async () => {
		const rehypeUppercase = () => (tree: Root) => {
			visit(tree, 'text', (node) => {
				node.value = node.value.toUpperCase();
			});
		};
		const remarkDemote = () => (tree: MdastRoot) => {
			visit(tree, 'heading', (node) => {
				node.depth = 2;
			});
		};
		const html = page('<main><h1>Title</h1><p>text</p></main>');
		expect(await convert(html, { rehypePlugins: [rehypeUppercase], remarkPlugins: [remarkDemote] })).toBe(
			'## TITLE\n\nTEXT\n',
		);
	});

	it('transforms the final Markdown', async () => {
		const markdown = await convert(page('<main><p>Body</p></main>'), {
			transform: (value, { metadata }) => `${value}\nSource: ${metadata.title}\n`,
		});
		expect(markdown).toBe('Body\n\nSource: Test page\n');
	});

	it('applies formatting options', async () => {
		const html = page('<main><ul><li><em>a</em></li></ul><hr></main>');
		expect(await convert(html)).toBe('- *a*\n\n---\n');
		expect(await convert(html, { markdown: { bullet: '*', emphasis: '_', rule: '*' } })).toBe('* _a_\n\n***\n');
	});
});
