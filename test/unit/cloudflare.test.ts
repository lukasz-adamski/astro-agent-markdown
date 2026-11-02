import { describe, expect, it } from 'vitest';
import {
	type AssetsBinding,
	createMarkdownWorker,
	decorateResponse,
	serveMarkdown,
} from '../../src/cloudflare/worker.js';

/** In-memory stand-in for the Workers static assets binding. */
function createAssets(files: Record<string, { body: string; type: string }>, fallbackHtml = false) {
	const requests: Request[] = [];
	const assets: AssetsBinding = {
		async fetch(request) {
			requests.push(request);
			const { pathname } = new URL(request.url);
			// Mirrors `html_handling`: `/docs/` is served from `/docs/index.html`.
			const file =
				files[pathname] ?? files[`${pathname}index.html`] ?? (fallbackHtml ? files['/index.html'] : undefined);
			if (!file) return new Response('Not Found', { status: 404 });
			if (request.headers.get('if-none-match') === `"${pathname}"`) return new Response(null, { status: 304 });
			return new Response(request.method === 'HEAD' ? null : file.body, {
				headers: { 'content-type': file.type, etag: `"${pathname}"` },
			});
		},
	};
	return { assets, requests };
}

const files = {
	'/index.html': { body: '<h1>Home</h1>', type: 'text/html; charset=utf-8' },
	'/index.md': { body: '# Home\n', type: 'text/markdown' },
	'/docs/intro/index.html': { body: '<h1>Intro</h1>', type: 'text/html; charset=utf-8' },
	'/docs/intro.md': { body: '# Intro\n', type: 'text/markdown' },
	'/docs/intro/index.md': { body: '# Nested intro\n', type: 'text/markdown' },
};

const request = (path: string, accept = 'text/markdown', init: RequestInit = {}) =>
	new Request(`https://example.com${path}`, { ...init, headers: { accept, ...init.headers } });

describe('serveMarkdown', () => {
	it('rewrites negotiated requests to the Markdown file', async () => {
		const { assets } = createAssets(files);
		const response = await serveMarkdown(request('/docs/intro/'), assets);
		expect(response?.status).toBe(200);
		expect(response?.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		expect(response?.headers.get('vary')).toBe('Accept');
		expect(response?.headers.get('etag')).toBe('"/docs/intro.md"');
		expect(await response?.text()).toBe('# Intro\n');
	});

	it('maps the home page and both URL forms', async () => {
		const { assets } = createAssets(files);
		expect(await (await serveMarkdown(request('/'), assets))?.text()).toBe('# Home\n');
		expect(await (await serveMarkdown(request('/docs/intro'), assets))?.text()).toBe('# Intro\n');
		expect(await (await serveMarkdown(request('/docs/intro/index.html'), assets))?.text()).toBe('# Intro\n');
	});

	it('follows outputPath and base', async () => {
		const { assets } = createAssets(files);
		const nested = await serveMarkdown(request('/docs/intro/'), assets, { outputPath: 'nested' });
		expect(await nested?.text()).toBe('# Nested intro\n');

		const { assets: based, requests } = createAssets({ '/blog/intro.md': files['/docs/intro.md'] });
		await serveMarkdown(request('/blog/intro/'), based, { base: '/blog' });
		expect(requests.map((r) => new URL(r.url).pathname)).toEqual(['/blog/intro.md']);
		expect(await serveMarkdown(request('/other/'), based, { base: '/blog' })).toBeNull();
	});

	it('redirects when configured', async () => {
		const { assets, requests } = createAssets(files);
		const response = await serveMarkdown(request('/docs/intro/?v=1'), assets, { negotiation: 'redirect' });
		expect(response?.status).toBe(302);
		expect(response?.headers.get('location')).toBe('https://example.com/docs/intro.md?v=1');
		expect(response?.headers.get('vary')).toBe('Accept');
		expect(requests[0]?.method).toBe('HEAD');
	});

	it('adds Content-Signal and keeps conditional requests working', async () => {
		const { assets } = createAssets(files);
		const signalled = await serveMarkdown(request('/'), assets, { contentSignal: 'ai-train=no' });
		expect(signalled?.headers.get('content-signal')).toBe('ai-train=no');

		const cached = await serveMarkdown(
			request('/', 'text/markdown', { headers: { 'if-none-match': '"/index.md"' } }),
			assets,
		);
		expect(cached?.status).toBe(304);
	});

	it('ignores requests that do not negotiate Markdown', async () => {
		const { assets, requests } = createAssets(files);
		expect(await serveMarkdown(request('/', 'text/html,*/*;q=0.8'), assets)).toBeNull();
		expect(await serveMarkdown(request('/', 'text/markdown', { method: 'POST' }), assets)).toBeNull();
		expect(await serveMarkdown(request('/index.md'), assets)).toBeNull();
		expect(requests).toHaveLength(0);
	});

	it('returns null for pages without a Markdown file', async () => {
		expect(await serveMarkdown(request('/missing/'), createAssets(files).assets)).toBeNull();
		// `not_found_handling: 'single-page-application'` answers with HTML instead of 404.
		expect(await serveMarkdown(request('/missing/'), createAssets(files, true).assets)).toBeNull();
	});
});

describe('createMarkdownWorker', () => {
	const worker = createMarkdownWorker();

	it('serves Markdown or falls back to the assets', async () => {
		const { assets } = createAssets(files);
		const markdown = await worker.fetch(request('/docs/intro/'), { ASSETS: assets });
		expect(await markdown.text()).toBe('# Intro\n');

		const html = await worker.fetch(request('/docs/intro/', 'text/html'), { ASSETS: assets });
		expect(await html.text()).toBe('<h1>Intro</h1>');
		expect(html.headers.get('vary')).toBe('Accept');
	});

	it('does not add Vary to other assets', async () => {
		const { assets } = createAssets({ '/style.css': { body: 'a{}', type: 'text/css' } });
		const response = await worker.fetch(request('/style.css', '*/*'), { ASSETS: assets });
		expect(response.headers.get('vary')).toBeNull();
	});

	it('adds a charset to text files and a canonical link to .md files', async () => {
		const { assets } = createAssets({
			...files,
			'/llms.txt': { body: '# Site\n', type: 'text/plain' },
			'/notes.md': { body: '# Notes\n', type: 'text/markdown; charset=iso-8859-1' },
		});
		const markdown = await worker.fetch(request('/docs/intro.md', '*/*'), { ASSETS: assets });
		expect(markdown.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		expect(markdown.headers.get('link')).toBe('<https://example.com/docs/intro/>; rel="canonical"');
		expect(await markdown.text()).toBe('# Intro\n');

		const home = await worker.fetch(request('/index.md', '*/*'), { ASSETS: assets });
		expect(home.headers.get('link')).toBe('<https://example.com/>; rel="canonical"');

		const llms = await worker.fetch(request('/llms.txt', '*/*'), { ASSETS: assets });
		expect(llms.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		expect(llms.headers.get('link')).toBeNull();

		const declared = await worker.fetch(request('/notes.md', '*/*'), { ASSETS: assets });
		expect(declared.headers.get('content-type')).toBe('text/markdown; charset=iso-8859-1');

		const missing = await worker.fetch(request('/missing.md', '*/*'), { ASSETS: assets });
		expect(missing.status).toBe(404);
		expect(missing.headers.get('link')).toBeNull();
	});

	it('builds canonical links from the routing options', () => {
		const response = new Response('# Intro\n', { headers: { 'content-type': 'text/markdown' } });
		const options = { base: '/blog', outputPath: 'nested', trailingSlash: 'never' } as const;
		const decorated = decorateResponse(request('/blog/intro/index.md'), response, options);
		expect(decorated.headers.get('link')).toBe('<https://example.com/blog/intro>; rel="canonical"');
	});

	it('reports a missing binding', async () => {
		await expect(worker.fetch(request('/'), {})).rejects.toThrow('"ASSETS" static assets binding');
	});
});
