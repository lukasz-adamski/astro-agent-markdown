import { fileURLToPath } from 'node:url';
import { dev } from 'astro';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type DevServer = Awaited<ReturnType<typeof dev>>;

const root = fileURLToPath(new URL('../fixtures/static/', import.meta.url));

describe('dev server', () => {
	let server: DevServer;
	const get = (path: string, headers?: Record<string, string>) =>
		fetch(`http://localhost:${server.address.port}${path}`, { headers });

	beforeAll(async () => {
		// Astro skips its dev request handler when it detects Vitest.
		const vitest = process.env.VITEST;
		delete process.env.VITEST;
		try {
			server = await dev({ root, logLevel: 'silent', server: { port: 0 } });
		} finally {
			process.env.VITEST = vitest;
		}
	});

	afterAll(async () => {
		await server?.stop();
	});

	it('serves /page.md with the build pipeline', async () => {
		const response = await get('/about.md');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		expect(response.headers.get('vary')).toContain('Accept');
		const body = await response.text();
		expect(body).toContain('# About');
		expect(body).toContain('<!-- transformed -->');
	});

	it('negotiates Markdown with the Accept header', async () => {
		const response = await get('/blog/first-post/', { accept: 'text/markdown, text/html;q=0.9' });
		expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		expect(await response.text()).toContain('# first-post');
	});

	it('keeps serving HTML to browsers', async () => {
		const response = await get('/about/', { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' });
		expect(response.headers.get('content-type')).toMatch(/^text\/html/);
	});

	it('does not intercept files from public/', async () => {
		expect(await (await get('/raw.md')).text()).toBe('# Raw public markdown\n');
	});

	it('does not serve excluded or opted-out pages', async () => {
		expect((await get('/private/secret.md')).status).toBe(404);
		expect((await get('/draft.md')).status).toBe(404);
		const negotiated = await get('/draft/', { accept: 'text/markdown' });
		expect(negotiated.headers.get('content-type')).toMatch(/^text\/html/);
	});
});
