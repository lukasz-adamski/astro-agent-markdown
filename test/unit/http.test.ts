import { describe, expect, it } from 'vitest';
import { createRequestHandler, type HandlerConfig } from '../../src/core/http.js';
import { resolveOptions } from '../../src/options.js';

const options = resolveOptions({ exclude: ['/private/**'], contentSignal: 'ai-train=no' });
const config: HandlerConfig = {
	site: 'https://example.com',
	base: '/docs',
	trailingSlash: 'ignore',
	buildFormat: 'directory',
	outputPath: 'sibling',
	include: options.include,
	exclude: options.exclude,
	conversion: options.conversion,
	contentNegotiation: true,
	contentSignal: options.contentSignal,
	alternateLink: true,
};
const handler = createRequestHandler(config);

const html = (body: string, headers: Record<string, string> = {}) =>
	new Response(`<html><head><title>T</title></head><body>${body}</body></html>`, {
		headers: { 'content-type': 'text/html', ...headers },
	});

describe('match', () => {
	it('maps .md URLs to the page, keeping the query', () => {
		const match = handler.match(new URL('https://example.com/docs/guide/intro.md?v=2'), null);
		expect(match).toMatchObject({ pathname: '/guide/intro', via: 'extension' });
		expect(match?.pageUrl.href).toBe('https://example.com/docs/guide/intro/?v=2');
	});

	it('maps /index.md to the base root', () => {
		expect(handler.match(new URL('https://example.com/docs/index.md'), null)?.pageUrl.pathname).toBe('/docs/');
	});

	it('negotiates on the Accept header', () => {
		expect(handler.match(new URL('https://example.com/docs/a/'), 'text/markdown')).toMatchObject({
			pathname: '/a',
			via: 'accept',
		});
		expect(handler.match(new URL('https://example.com/docs/a/'), 'text/html')).toBeNull();
	});

	it('ignores excluded pages and paths outside base', () => {
		expect(handler.match(new URL('https://example.com/docs/private/x.md'), null)).toBeNull();
		expect(handler.match(new URL('https://example.com/docs/%70rivate/x.md'), null)).toBeNull();
		expect(handler.match(new URL('https://example.com/docs/%70rivate/x/'), 'text/markdown')).toBeNull();
		expect(handler.match(new URL('https://example.com/other/x.md'), null)).toBeNull();
	});
});

describe('toMarkdownResponse', () => {
	const match = handler.match(new URL('https://example.com/docs/a/'), 'text/markdown');
	if (!match) throw new Error('Expected a match');

	it('converts HTML and rewrites the headers', async () => {
		const response = await handler.toMarkdownResponse(
			html('<main><h1>Hello</h1></main>', {
				'content-length': '999',
				etag: '"abc"',
				'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
				vary: 'Origin',
				'cache-control': 'public, max-age=60',
				'set-cookie': 'a=b',
			}),
			match,
		);
		expect(Object.fromEntries(response.headers)).toEqual({
			'cache-control': 'public, max-age=60',
			'content-signal': 'ai-train=no',
			'content-type': 'text/markdown; charset=utf-8',
			'set-cookie': 'a=b',
			vary: 'Origin, Accept',
		});
		expect(await response.text()).toBe('---\ntitle: T\nurl: https://example.com/docs/a/\n---\n\n# Hello\n');
	});

	it('keeps an existing Content-Signal header', async () => {
		const response = await handler.toMarkdownResponse(html('<p>x</p>', { 'content-signal': 'search=yes' }), match);
		expect(response.headers.get('content-signal')).toBe('search=yes');
	});

	it('passes non-HTML responses through', async () => {
		const json = Response.json({ ok: true });
		expect(await handler.toMarkdownResponse(json, match)).toBe(json);
	});

	it('falls back to HTML for opted-out pages', async () => {
		const optedOut = new Response('<html><body data-markdown-ignore><p>x</p></body></html>', {
			headers: { 'content-type': 'text/html' },
		});
		const fallback = await handler.toMarkdownResponse(optedOut, match);
		expect(fallback.headers.get('content-type')).toBe('text/html');
		expect(await fallback.text()).toContain('<p>x</p>');
	});

	it('answers 404 for opted-out pages requested as .md', async () => {
		const extension = handler.match(new URL('https://example.com/docs/a.md'), null);
		if (!extension) throw new Error('Expected a match');
		const optedOut = new Response('<html><body data-markdown-ignore></body></html>', {
			headers: { 'content-type': 'text/html' },
		});
		expect((await handler.toMarkdownResponse(optedOut, extension)).status).toBe(404);
	});
});

describe('decorateHtmlResponse', () => {
	it('advertises the Markdown version', () => {
		const response = handler.decorateHtmlResponse(html('', { vary: 'accept' }), new URL('https://example.com/docs/a/'));
		expect(response.headers.get('link')).toBe('</docs/a.md>; rel="alternate"; type="text/markdown"');
		expect(response.headers.get('vary')).toBe('accept');
	});

	it('leaves error responses alone', () => {
		const notFound = new Response('<html></html>', { status: 404, headers: { 'content-type': 'text/html' } });
		expect(handler.decorateHtmlResponse(notFound, new URL('https://example.com/docs/missing/'))).toBe(notFound);
	});

	it('leaves excluded pages and non-HTML responses alone', () => {
		const excluded = html('');
		expect(handler.decorateHtmlResponse(excluded, new URL('https://example.com/docs/private/a'))).toBe(excluded);
		const json = Response.json({});
		expect(handler.decorateHtmlResponse(json, new URL('https://example.com/docs/a'))).toBe(json);
	});
});
