import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';
import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../fixtures/static/', import.meta.url));
const dist = new URL('../fixtures/static/dist/', import.meta.url);
const read = (path: string) => readFile(new URL(path, dist), 'utf8');

describe('static build', () => {
	beforeAll(async () => {
		await build({ root, logLevel: 'silent' });
	});

	it('writes a Markdown file next to every page', async () => {
		expect(await read('index.md')).toBe(
			[
				'---',
				'title: Example Site',
				'description: The home page.',
				'url: https://example.com/',
				'---',
				'',
				'# Welcome',
				'',
				'Read the [first post](https://example.com/blog/first-post/).',
				'',
			].join('\n'),
		);
		expect(await read('blog/first-post.md')).toContain(
			'Body of first-post. See [all posts](https://example.com/blog/) and ![Cover](https://example.com/blog/first-post/cover.png).',
		);
		expect(await read('notes.md')).toContain('A page written in **Markdown**.');
	});

	it('removes configured elements and applies the transform hook', async () => {
		const about = await read('about.md');
		expect(about).not.toContain('Buy now');
		expect(about).not.toContain('console.log');
		expect(about).not.toContain('Home');
		expect(about).toMatch(/<!-- transformed -->\n$/);
	});

	it('skips excluded, opted-out, redirect and error pages', () => {
		for (const path of ['private/secret.md', 'draft.md', 'old.md', '404.md']) {
			expect(existsSync(new URL(path, dist)), path).toBe(false);
		}
	});

	it('keeps files copied from public/', async () => {
		expect(await read('raw.md')).toBe('# Raw public markdown\n');
	});

	it('advertises the Markdown version in HTML', async () => {
		expect(await read('about/index.html')).toContain(
			'<head><link rel="alternate" type="text/markdown" href="/about.md">',
		);
		expect(await read('draft/index.html')).not.toContain('text/markdown');
	});

	it('extends _headers for Cloudflare', async () => {
		expect(await read('_headers')).toBe(
			[
				'/_astro/*',
				'  Cache-Control: public, max-age=31536000, immutable',
				'',
				'# astro-agent-markdown',
				'/*.md',
				'  Content-Type: text/markdown; charset=utf-8',
				'  Content-Signal: ai-train=no, search=yes, ai-input=yes',
				'',
			].join('\n'),
		);
	});

	it('emits a Cloudflare Worker hidden from the assets', async () => {
		expect(await read('_worker.js')).toContain(
			'export default createMarkdownWorker({"base":"/","outputPath":"sibling","negotiation":"rewrite",' +
				'"contentSignal":"ai-train=no, search=yes, ai-input=yes"});',
		);
		expect(await read('.assetsignore')).toBe('# astro-agent-markdown\n_worker.js\n');
	});

	it('generates llms.txt and llms-full.txt', async () => {
		expect(await read('llms.txt')).toBe(
			[
				'# Example Site',
				'',
				'> The home page.',
				'',
				'## Pages',
				'',
				'- [Example Site](https://example.com/index.md): The home page.',
				'- [About us](https://example.com/about.md): Who we are.',
				'- [Post: first-post](https://example.com/blog/first-post.md)',
				'- [Post: second-post](https://example.com/blog/second-post.md)',
				'- [/notes](https://example.com/notes.md)',
				'',
			].join('\n'),
		);
		const full = await read('llms-full.txt');
		expect(full).toContain('# Welcome');
		expect(full).toContain('# second-post');
	});
});
