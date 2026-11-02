import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AstroIntegrationLogger } from 'astro';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeCloudflareFiles } from '../../src/build/cloudflare.js';
import { generateMarkdown, injectAlternateLink } from '../../src/build/generate.js';
import type { RoutingConfig } from '../../src/core/routing.js';
import agentMarkdown from '../../src/integration.js';
import { resolveOptions } from '../../src/options.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as AstroIntegrationLogger;

let dir: URL;
const page = (body: string) =>
	`<!doctype html><html><head><title>T</title></head><body><main>${body}</main></body></html>`;

beforeEach(async () => {
	dir = pathToFileURL(`${await mkdtemp(join(tmpdir(), 'agent-markdown-'))}/`);
	vi.clearAllMocks();
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function write(path: string, content: string): Promise<void> {
	const file = new URL(path, dir);
	await mkdir(new URL('.', file), { recursive: true });
	await writeFile(file, content);
}

const read = (path: string) => readFile(new URL(path, dir), 'utf8');

describe('generateMarkdown', () => {
	it("derives the page URL from the emitted file with build.format: 'preserve'", async () => {
		await write('blog/index.html', page('<a href="post/">Post</a>'));
		await write('about.html', page('<a href="team/">Team</a>'));
		const routing: RoutingConfig = {
			base: '/',
			trailingSlash: 'ignore',
			buildFormat: 'preserve',
			outputPath: 'sibling',
		};

		await generateMarkdown({
			dir,
			root: dir,
			pathnames: ['blog', 'about'],
			options: resolveOptions(),
			llmsTxt: [],
			routing,
			site: 'https://example.com',
			logger,
		});

		expect(await read('blog.md')).toContain('url: https://example.com/blog/');
		expect(await read('blog.md')).toContain('[Post](https://example.com/blog/post/)');
		expect(await read('about.md')).toContain('url: https://example.com/about\n');
		expect(await read('about.md')).toContain('[Team](https://example.com/team/)');
	});
});

describe('injectAlternateLink', () => {
	it('inserts the link after the opening <head> tag', () => {
		const html = '<html><head lang="en"><script>const s = "</head>";</script></head><body></body></html>';
		expect(injectAlternateLink(html, '/a.md')).toBe(
			'<html><head lang="en"><link rel="alternate" type="text/markdown" href="/a.md"><script>const s = "</head>";</script></head><body></body></html>',
		);
	});

	it('skips documents that already advertise Markdown or have no <head>', () => {
		expect(injectAlternateLink('<head><link rel="alternate" type="text/markdown" href="/x.md"></head>', '/a.md')).toBe(
			undefined,
		);
		expect(injectAlternateLink('<header>No head</header>', '/a.md')).toBeUndefined();
	});
});

describe('writeCloudflareFiles', () => {
	const routing: RoutingConfig = {
		base: '/',
		trailingSlash: 'ignore',
		buildFormat: 'directory',
		outputPath: 'sibling',
	};
	const cloudflare = { headers: true, worker: true, negotiation: 'rewrite' as const };

	it('skips the Worker when content negotiation is disabled', async () => {
		await writeCloudflareFiles({
			dir,
			cloudflare,
			routing,
			contentSignal: 'search=yes',
			contentNegotiation: false,
			buildOutput: 'static',
			logger,
		});
		await expect(read('_worker.js')).rejects.toThrow();
		expect(await read('_headers')).toBe('# astro-agent-markdown\n/*.md\n  Content-Signal: search=yes\n');
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('contentNegotiation'));
	});

	it('writes no _headers rule without a content signal', async () => {
		await writeCloudflareFiles({
			dir,
			cloudflare: { ...cloudflare, worker: false },
			routing,
			contentSignal: null,
			contentNegotiation: true,
			buildOutput: 'static',
			logger,
		});
		await expect(read('_headers')).rejects.toThrow();
	});
});

describe('middleware option', () => {
	type SetupParams = Parameters<NonNullable<ReturnType<typeof agentMarkdown>['hooks']['astro:config:setup']>>[0];
	const setup = (options: Parameters<typeof agentMarkdown>[0], config: Record<string, unknown>) => {
		const hooks = { addMiddleware: vi.fn(), injectRoute: vi.fn(), updateConfig: vi.fn() };
		const hook = agentMarkdown(options).hooks['astro:config:setup'];
		hook?.({ config, command: 'build', logger, ...hooks } as unknown as SetupParams);
		return hooks;
	};

	it("injects the on-demand route only for output: 'server' in auto mode", () => {
		expect(setup({}, { output: 'static', adapter: { name: 'node' } }).injectRoute).not.toHaveBeenCalled();
		expect(setup({}, { output: 'server', adapter: { name: 'node' } }).injectRoute).toHaveBeenCalled();
		expect(setup({ middleware: true }, { output: 'static', adapter: { name: 'node' } }).injectRoute).toHaveBeenCalled();
	});

	it('requires an adapter when enabled explicitly', () => {
		expect(() => setup({ middleware: true }, { output: 'static' })).toThrow('needs an adapter');
	});
});
