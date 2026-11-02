import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'astro';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type PreviewServer = Awaited<ReturnType<typeof preview>>;

const root = fileURLToPath(new URL('../fixtures/server/', import.meta.url));

describe('on-demand rendering', () => {
	let server: PreviewServer;
	const get = (path: string, headers?: Record<string, string>) =>
		fetch(`http://localhost:${server.port}${path}`, { headers });

	beforeAll(async () => {
		await build({ root, logLevel: 'silent' });
		server = await preview({ root, logLevel: 'silent', server: { port: await freePort() } });
	});

	afterAll(async () => {
		await server?.stop();
	});

	it('advertises the Markdown version on HTML responses', async () => {
		const response = await get('/dynamic');
		expect(response.headers.get('content-type')).toMatch(/^text\/html/);
		expect(response.headers.get('vary')).toBe('Accept');
		expect(response.headers.get('link')).toBe('</dynamic.md>; rel="alternate"; type="text/markdown"');
	});

	it('negotiates Markdown with the Accept header', async () => {
		const response = await get('/dynamic?name=agent', { accept: 'text/markdown' });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		expect(response.headers.get('content-signal')).toBe('ai-train=no, search=yes, ai-input=yes');
		expect(response.headers.get('set-cookie')).toBe('visited=yes');
		expect(await response.text()).toContain('# Hello agent\n\nRendered at request time.');
	});

	it('serves /page.md for on-demand pages', async () => {
		const response = await get('/dynamic.md?name=extension');
		expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		const body = await response.text();
		expect(body).toContain('description: Rendered on demand');
		expect(body).toContain('# Hello extension');
		expect(body).not.toContain('Menu');
	});

	it('returns 404 for unknown pages when the 404 page is prerendered', async () => {
		const missing = await get('/missing.md');
		expect(missing.status).toBe(404);
		expect((await get('/dynamic.md')).status).toBe(200);
	});

	it('serves generated files for prerendered pages', async () => {
		const response = await get('/index.md');
		expect(await response.text()).toContain('# Static home');
	});

	it('leaves non-HTML responses untouched', async () => {
		const response = await get('/api.json', { accept: 'text/markdown' });
		expect(await response.json()).toEqual({ ok: true });
	});
});

/** The preview server does not report the port it bound when given port 0. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer().listen(0, () => {
			const address = probe.address();
			probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject()));
		});
	});
}
