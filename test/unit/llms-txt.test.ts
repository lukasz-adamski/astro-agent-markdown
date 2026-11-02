import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AstroConfig, AstroIntegrationLogger } from 'astro';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMarkdown } from '../../src/build/generate.js';
import type { RoutingConfig } from '../../src/core/routing.js';
import { type AgentMarkdownOptions, resolveLlmsTxtFiles, resolveOptions } from '../../src/options.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as AstroIntegrationLogger;
const routing: RoutingConfig = { base: '/', trailingSlash: 'ignore', buildFormat: 'directory', outputPath: 'sibling' };

interface Page {
	title: string;
	body?: string;
	description?: string;
	lang?: string;
	head?: string;
}

const PAGES: Record<string, Page> = {
	'/': {
		title: 'Acme | Werkzeuge',
		body: '<h1>Willkommen</h1><p>Start.</p>',
		description: 'Die Startseite.',
		lang: 'de',
	},
	'/produkte': { title: 'Produkte: Hämmer und Sägen | Acme', description: 'Alle Produkte.', lang: 'de' },
	'/produkte/saegen': { title: 'Sägen | Acme', lang: 'de' },
	'/blog/beitrag': { title: 'Beitrag | Acme', lang: 'de' },
	'/kontakt': { title: 'Kontakt | Acme', lang: 'de' },
	'/datenschutz': { title: 'Datenschutzerklärung | Acme', lang: 'de' },
	'/en': { title: 'Acme | Tools', body: '<p>Welcome.</p>', description: 'The home page.', lang: 'en' },
	'/en/products': { title: 'Products | Acme', lang: 'en' },
	'/en/404': { title: 'Not found | Acme', lang: 'en' },
};

let dir: URL;

beforeEach(async () => {
	dir = pathToFileURL(`${await mkdtemp(join(tmpdir(), 'agent-markdown-llms-'))}/`);
	vi.clearAllMocks();
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const read = (path: string) => readFile(new URL(path, dir), 'utf8');

async function write(path: string, content: string): Promise<void> {
	const file = new URL(path, dir);
	await mkdir(new URL('.', file), { recursive: true });
	await writeFile(file, content);
}

async function build(
	llmsTxt: AgentMarkdownOptions['llmsTxt'],
	{ pages = PAGES, i18n }: { pages?: Record<string, Page>; i18n?: AstroConfig['i18n'] } = {},
): Promise<void> {
	for (const [pathname, page] of Object.entries(pages)) {
		const description = page.description ? `<meta name="description" content="${page.description}">` : '';
		const html =
			`<!doctype html><html lang="${page.lang ?? 'en'}"><head><title>${page.title}</title>${description}` +
			`<script type="application/ld+json">{"@type":"WebPage"}</script>${page.head ?? ''}</head>` +
			`<body><main>${page.body ?? `<p>${page.title}</p>`}</main></body></html>`;
		await write(`.${pathname === '/' ? '' : pathname}/index.html`, html);
	}
	const options = resolveOptions({ llmsTxt });
	await generateMarkdown({
		dir,
		root: dir,
		pathnames: Object.keys(pages),
		options,
		llmsTxt: resolveLlmsTxtFiles(options.llmsTxt, i18n),
		routing,
		site: 'https://example.com',
		logger,
	});
}

const lines = (...values: string[]) => `${values.join('\n')}\n`;

describe('llms.txt', () => {
	it('lists every page, home first, with the site name and short labels', async () => {
		await build(true);
		expect(await read('llms.txt')).toBe(
			lines(
				'# Acme',
				'',
				'> Die Startseite.',
				'',
				'## Pages',
				'',
				'- [Werkzeuge](https://example.com/index.md): Die Startseite.',
				'- [Beitrag](https://example.com/blog/beitrag.md)',
				'- [Datenschutzerklärung](https://example.com/datenschutz.md)',
				'- [Tools](https://example.com/en.md): The home page.',
				'- [Products](https://example.com/en/products.md)',
				'- [Kontakt](https://example.com/kontakt.md)',
				'- [Produkte: Hämmer und Sägen](https://example.com/produkte.md): Alle Produkte.',
				'- [Sägen](https://example.com/produkte/saegen.md)',
			),
		);
	});

	it('takes the site name from all pages when a file has too few', async () => {
		await build([{ exclude: ['/en/**'] }, { path: '/en/llms.txt', include: ['/en'] }]);
		expect(await read('en/llms.txt')).toMatch(/^# Acme\n[\s\S]*- \[Tools\]\(https:\/\/example\.com\/en\.md\)/);
	});

	it('takes the site name from og:site_name', async () => {
		const pages = { '/': { title: 'Home', head: '<meta property="og:site_name" content="Acme Inc.">' } };
		await build(true, { pages });
		expect(await read('llms.txt')).toMatch(/^# Acme Inc\.\n/);
	});

	it('writes linked files per locale with sections and an Optional section', async () => {
		await build(
			{ locales: true, sections: [{ title: 'Blog', include: ['/blog/**'] }], optional: ['/datenschutz'] },
			{
				i18n: {
					defaultLocale: 'de',
					locales: ['de', 'en'],
					routing: { prefixDefaultLocale: false },
				} as AstroConfig['i18n'],
			},
		);
		expect(await read('llms.txt')).toBe(
			lines(
				'# Acme',
				'',
				'> Die Startseite.',
				'',
				'## Pages',
				'',
				'- [Werkzeuge](https://example.com/index.md): Die Startseite.',
				'- [Kontakt](https://example.com/kontakt.md)',
				'- [Produkte: Hämmer und Sägen](https://example.com/produkte.md): Alle Produkte.',
				'- [Sägen](https://example.com/produkte/saegen.md)',
				'',
				'## Blog',
				'',
				'- [Beitrag](https://example.com/blog/beitrag.md)',
				'',
				'## Other languages',
				'',
				'- [English](https://example.com/en/llms.txt)',
				'',
				'## Optional',
				'',
				'- [Datenschutzerklärung](https://example.com/datenschutz.md)',
			),
		);
		const english = await read('en/llms.txt');
		expect(english).toContain('- [Products](https://example.com/en/products.md)');
		expect(english).toContain('## Other languages\n\n- [Deutsch](https://example.com/llms.txt)');
		expect(english).not.toContain('404');
		expect(logger.warn).toHaveBeenCalledWith('en/llms.txt: the "Blog" section matches no page.');
		expect(logger.warn).toHaveBeenCalledWith('en/llms.txt: the "Optional" section matches no page.');
	});

	it('uses an intro and options per locale', async () => {
		await write('intro.de.md', 'Preise auf Anfrage.');
		await write('intro.en.md', 'Prices on request.');
		await build(
			{
				locales: { de: { introFile: './intro.de.md' }, en: { introFile: './intro.en.md', crossLinks: false } },
				sections: 'auto',
			},
			{
				i18n: {
					defaultLocale: 'de',
					locales: ['de', 'en'],
					routing: { prefixDefaultLocale: false },
				} as AstroConfig['i18n'],
			},
		);
		const german = await read('llms.txt');
		const english = await read('en/llms.txt');
		expect(german).toContain('> Die Startseite.\n\nPreise auf Anfrage.\n\n## Pages');
		expect(german).not.toContain('Prices');
		expect(german).toContain('- [English](https://example.com/en/llms.txt)');
		expect(english).toContain('> The home page.\n\nPrices on request.\n\n## Pages');
		expect(english).not.toContain('Other languages');
	});

	it('names languages by their base language unless two files share it', async () => {
		const pages = {
			'/': { title: 'Home', lang: 'en-US' },
			'/de': { title: 'Start', lang: 'de-DE' },
			'/uk': { title: 'Home', lang: 'en-GB' },
		};
		await build(
			[
				{ include: ['/'] },
				{ path: '/de/llms.txt', include: ['/de/**'] },
				{ path: '/uk/llms.txt', include: ['/uk/**'] },
			],
			{
				pages,
			},
		);
		expect(await read('llms.txt')).toContain(
			'- [Deutsch](https://example.com/de/llms.txt)\n- [British English](https://example.com/uk/llms.txt)',
		);
		expect(await read('de/llms.txt')).toContain('- [American English](https://example.com/llms.txt)');
	});

	it('orders automatic sections with sectionOrder', async () => {
		await build({ sections: 'auto', exclude: ['/en/**'], sectionOrder: ['/produkte/', '/missing'] });
		expect((await read('llms.txt')).match(/^## .+$/gm)).toEqual(['## Pages', '## Produkte', '## Blog']);
		expect(logger.warn).toHaveBeenCalledWith('llms.txt: `sectionOrder` lists /missing, which is not a section.');
	});

	it('groups pages by path segment with sections: auto', async () => {
		await build({ sections: 'auto', exclude: ['/en/**'], crossLinks: false });
		const index = await read('llms.txt');
		expect(index).toContain(
			lines(
				'## Pages',
				'',
				'- [Werkzeuge](https://example.com/index.md): Die Startseite.',
				'- [Datenschutzerklärung](https://example.com/datenschutz.md)',
				'- [Kontakt](https://example.com/kontakt.md)',
				'',
				'## Blog',
				'',
				'- [Beitrag](https://example.com/blog/beitrag.md)',
				'',
				'## Produkte',
				'',
				'- [Produkte: Hämmer und Sägen](https://example.com/produkte.md): Alle Produkte.',
				'- [Sägen](https://example.com/produkte/saegen.md)',
			),
		);
	});

	it('inserts an intro after the summary', async () => {
		await write(
			'intro.md',
			'---\ntitle: Intro\n---\n# Acme\n\n> Summary\n\nOrders ship within two days.\n\n- Contact: hello@example.com\n',
		);
		await build({ introFile: './intro.md', include: ['/'] });
		expect(await read('llms.txt')).toBe(
			lines(
				'# Acme',
				'',
				'> Die Startseite.',
				'',
				'Orders ship within two days.',
				'',
				'- Contact: hello@example.com',
				'',
				'## Pages',
				'',
				'- [Werkzeuge](https://example.com/index.md): Die Startseite.',
			),
		);
	});

	it('fails when the intro file is missing', async () => {
		await expect(build({ introFile: './missing.md' })).rejects.toThrow(/llmsTxt\.introFile.*missing\.md: ENOENT/);
	});

	it('lets entry change labels and descriptions, or hide pages from the index only', async () => {
		await build({
			include: ['/', '/kontakt', '/datenschutz'],
			full: true,
			entry: ({ pathname }) => {
				if (pathname === '/') return { label: 'Home', description: false };
				if (pathname === '/datenschutz') return false;
				return undefined;
			},
		});
		expect(await read('llms.txt')).toContain(
			lines('- [Home](https://example.com/index.md)', '- [Kontakt](https://example.com/kontakt.md)'),
		);
		expect(await read('llms.txt')).not.toContain('datenschutz');
		expect(await read('llms-full.txt')).toContain('Datenschutzerklärung');
	});

	it('warns about pages in no index and pages without a description', async () => {
		await build([{ include: ['/', '/kontakt'] }, { path: '/en/llms.txt', include: ['/en/**'] }]);
		expect(logger.warn).toHaveBeenCalledWith('llms.txt: 1 of 2 pages are listed without a description.');
		expect(logger.warn).toHaveBeenCalledWith(
			'4 pages are in no llms.txt file: /blog/beitrag, /datenschutz, /produkte, /produkte/saegen.',
		);
		expect(logger.info).toHaveBeenCalledWith(
			expect.stringMatching(/wrote llms\.txt \(2 pages, \d+ B\), en\/llms\.txt \(2 pages, \d+ B\)\.$/),
		);
	});
});

describe('llms-full.txt', () => {
	it('writes each page under its heading and source, in index order, without Optional pages', async () => {
		await build({
			index: false,
			include: ['/', '/kontakt', '/blog/beitrag', '/datenschutz'],
			sections: [{ title: 'Blog', include: ['/blog/**'] }],
			optional: ['/datenschutz'],
			full: true,
		});
		await expect(read('llms.txt')).rejects.toThrow();
		expect(await read('llms-full.txt')).toBe(
			lines(
				'# Willkommen',
				'Source: https://example.com/',
				'',
				'Start.',
				'',
				'# Kontakt',
				'Source: https://example.com/kontakt/',
				'',
				'Kontakt | Acme',
				'',
				'# Beitrag',
				'Source: https://example.com/blog/beitrag/',
				'',
				'Beitrag | Acme',
			),
		);
		expect(await read('kontakt.md')).toContain('{"@type":"WebPage"}');
	});

	it('can start pages with their frontmatter and include Optional pages', async () => {
		await build({
			include: ['/kontakt', '/datenschutz'],
			optional: ['/datenschutz'],
			full: { pageHeader: 'frontmatter', optional: true },
		});
		const full = await read('llms-full.txt');
		expect(full).toMatch(/^---\ntitle: Kontakt \| Acme\n/);
		expect(full).toContain('Kontakt | Acme\n\n---\ntitle: Datenschutzerklärung | Acme');
		expect(full).not.toContain('WebPage');
	});

	it('starts each page with its first heading, after eyebrows and tags', async () => {
		const pages = {
			'/a': { title: 'A | Acme', body: '<p>Guide</p><h1>Getting started</h1><p>Text.</p>' },
			'/b': { title: 'B | Acme', body: '<ul><li>Release</li><li>Tools</li></ul><h1>Version 2</h1><h2>Changes</h2>' },
			'/c': { title: 'C | Acme', body: '<h2>Section</h2><h1>Late title</h1>' },
		};
		await build({ index: false, full: true }, { pages });
		expect(await read('llms-full.txt')).toBe(
			lines(
				'# Getting started',
				'Source: https://example.com/a/',
				'',
				'Guide',
				'',
				'Text.',
				'',
				'# Version 2',
				'Source: https://example.com/b/',
				'',
				'- Release',
				'- Tools',
				'',
				'## Changes',
				'',
				'# C',
				'Source: https://example.com/c/',
				'',
				'## Section',
				'',
				'# Late title',
			),
		);
	});

	it('removes boilerplate shared by most pages, keeping facts, lists and repeats within a page', async () => {
		const cta = '<h2>Questions?</h2><p>Write to us.</p>';
		const steps =
			'<ol><li><p>Order</p><p>Included:</p><ul><li>A box</li></ul></li><li><p>Delivery</p><p>Included:</p><ul><li>A receipt</li></ul></li></ol>';
		const pages: Record<string, Page> = {
			'/a': { title: 'A', body: `<h1>A</h1>${steps}<dl><dt>Warranty</dt><dd>Two years</dd></dl>${cta}${cta}` },
			'/b': { title: 'B', body: `<h1>B</h1><dl><dt>Warranty</dt><dd>Two years</dd></dl>${cta}` },
			'/c': { title: 'C', body: `<h1>C</h1><dl><dt>Warranty</dt><dd>Two years</dd></dl><p>Shared by two.</p>${cta}` },
			'/d': { title: 'D', body: `<h1>D</h1><p>Shared by two.</p>${cta}` },
		};
		await build({ index: false, full: { dedupe: true } }, { pages });
		const full = await read('llms-full.txt');
		expect(full.match(/Write to us/g)).toHaveLength(2);
		expect(full.match(/\*\*Warranty\*\*: Two years/g)).toHaveLength(3);
		expect(full.match(/Included:/g)).toHaveLength(2);
		expect(full.match(/Shared by two/g)).toHaveLength(2);
		expect(full).toContain('# B\nSource: https://example.com/b/\n\n**Warranty**: Two years\n\n# C');
	});

	it('keeps shared headings followed by a heading, and strips frontmatter changed by a transform', async () => {
		const pages: Record<string, Page> = Object.fromEntries(
			[1, 2, 3, 4].map((n) => [
				`/${n}`,
				{ title: `P${n}`, body: `<h1>Page ${n}</h1><h2>Features</h2><h3>Feature ${n}</h3><p>Unique ${n}.</p>` },
			]),
		);
		for (const page of Object.values(pages)) page.body += '<p>Write to us.</p>';
		const options = resolveOptions({
			llmsTxt: { index: false, full: { dedupe: true } },
			transform: (markdown) => markdown.replace(/^---\n/, '---\nextra: 1\n'),
		});
		for (const [pathname, page] of Object.entries(pages)) {
			await write(
				`.${pathname}/index.html`,
				`<html><head><title>${page.title}</title></head><body><main>${page.body}</main></body></html>`,
			);
		}
		await generateMarkdown({
			dir,
			root: dir,
			pathnames: Object.keys(pages),
			options,
			llmsTxt: resolveLlmsTxtFiles(options.llmsTxt, undefined),
			routing,
			site: 'https://example.com',
			logger,
		});
		const full = await read('llms-full.txt');
		expect(full.match(/^## Features$/gm)).toHaveLength(4);
		expect(full.match(/Write to us/g)).toHaveLength(1);
		expect(full).not.toContain('extra: 1');
		expect(full).toMatch(/^# Page 1\nSource: https:\/\/example\.com\/1\/\n/);
	});

	it('warns when the file is larger than maxSize', async () => {
		await build({ include: ['/', '/kontakt'], full: { maxSize: 10 } });
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringMatching(
				/^llms-full\.txt is \d+ B, above `maxSize` \(10 B\)\. Largest pages: \/kontakt \(\d+ B\), \/ \(\d+ B\)\.$/,
			),
		);
	});
});
