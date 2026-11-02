import type { AstroConfig } from 'astro';
import { describe, expect, it } from 'vitest';
import { createPageFilter } from '../../src/core/filter.js';
import { DEFAULT_KEEP_SELECTORS, DEFAULT_REMOVE_SELECTORS } from '../../src/core/selectors.js';
import { type AgentMarkdownOptions, resolveLlmsTxtFiles, resolveOptions } from '../../src/options.js';

describe('resolveOptions', () => {
	it('applies defaults', () => {
		const options = resolveOptions();
		expect(options).toMatchObject({
			include: ['**'],
			exclude: ['/404', '/500', '/*/404', '/*/500'],
			outputPath: 'sibling',
			alternateLink: true,
			llmsTxt: [],
			contentNegotiation: true,
			contentSignal: null,
			cloudflare: null,
			middleware: 'auto',
		});
		expect(options.conversion.removeSelectors).toEqual(DEFAULT_REMOVE_SELECTORS);
		expect(options.conversion.keepSelectors).toEqual(DEFAULT_KEEP_SELECTORS);
		expect(options.conversion.frontmatter).toEqual(['title', 'description', 'url', 'image']);
	});

	it('merges removal selectors and exclusions', () => {
		const options = resolveOptions({
			exclude: ['/admin/**'],
			removeSelectors: ['.ad'],
			keepSelectors: ['.cta button'],
			defaultRemoveSelectors: false,
		});
		expect(options.exclude).toEqual(['/404', '/500', '/*/404', '/*/500', '/admin/**']);
		expect(options.conversion.removeSelectors).toEqual(['.ad']);
		expect(options.conversion.keepSelectors).toEqual(['.cta button']);
	});

	it('always excludes error pages, including localized ones', () => {
		const { include, exclude } = resolveOptions();
		const isIncluded = createPageFilter(include, exclude);
		expect(['/404', '/en/404', '/de/500/'].filter(isIncluded)).toEqual([]);
		expect(['/docs/404-errors', '/en/blog/404'].filter(isIncluded)).toEqual(['/docs/404-errors', '/en/blog/404']);
	});

	it('resolves llms.txt files', () => {
		const files = (llmsTxt: AgentMarkdownOptions['llmsTxt'], i18n?: AstroConfig['i18n']) =>
			resolveLlmsTxtFiles(resolveOptions({ llmsTxt }).llmsTxt, i18n);

		expect(files({ full: true })).toEqual([
			{
				path: '/llms.txt',
				fullPath: '/llms-full.txt',
				home: '/',
				include: ['**'],
				exclude: [],
				sections: [],
				sectionOrder: [],
				optional: [],
				crossLinks: true,
				entry: undefined,
				index: true,
				full: { pageHeader: 'source', optional: false, dedupe: null, maxSize: 512_000 },
			},
		]);
		expect(files([{ exclude: ['/en/**'] }, { path: '/en/llms.txt', include: ['/en/**'] }])).toMatchObject([
			{ path: '/llms.txt', home: '/' },
			{ path: '/en/llms.txt', fullPath: '/en/llms-full.txt', home: '/en' },
		]);

		const i18n = (prefixDefaultLocale: boolean) =>
			({
				defaultLocale: 'pl',
				locales: ['pl', { path: 'english', codes: ['en', 'en-US'] }],
				routing: { prefixDefaultLocale },
			}) as AstroConfig['i18n'];
		expect(files({ locales: true, exclude: ['/drafts/**'] }, i18n(false))).toMatchObject([
			{ path: '/llms.txt', home: '/', locale: 'pl', include: ['**'], exclude: ['/english/**', '/drafts/**'] },
			{ path: '/english/llms.txt', home: '/english', locale: 'en', include: ['/english/**'], exclude: ['/drafts/**'] },
		]);
		expect(files({ locales: true }, i18n(true))).toMatchObject([
			{ path: '/llms.txt', home: '/pl', include: ['/pl/**'] },
			{ path: '/english/llms.txt', home: '/english' },
		]);
		expect(() => files({ locales: true })).toThrow('llmsTxt.locales: needs the `i18n` option');

		const overridden = files(
			{ intro: 'Shared', optional: ['/legal'], locales: { english: { introFile: './en.md' }, pl: { optional: [] } } },
			i18n(false),
		);
		expect(overridden).toMatchObject([
			{ path: '/llms.txt', intro: 'Shared', optional: [] },
			{ path: '/english/llms.txt', introFile: './en.md', optional: ['/legal'] },
		]);
		expect(overridden[1]).not.toHaveProperty('intro');
		expect(() => files({ locales: { de: {} } }, i18n(false))).toThrow(
			'llmsTxt.locales.de: is not a locale of the `i18n` config. Use one of: pl, english, en, en-US.',
		);
		expect(resolveOptions({ llmsTxt: { full: { dedupe: true } } }).llmsTxt[0]?.full?.dedupe).toEqual({
			minShare: 0.5,
			minPages: 3,
		});
	});

	it('accepts sectionOrder with automatic sections, also from the shared options', () => {
		expect(() =>
			resolveOptions({ llmsTxt: { sections: 'auto', locales: { en: { sectionOrder: ['/en/blog'] } } } }),
		).not.toThrow();
	});

	it.each([
		'main:has(> h3)',
		'li:not(:nth-child(2n + 1))',
		'button:not([aria-label="Close menu"], .icon)',
		'[title=":not(a b)"]',
		':is(h1, h2) > a',
	])('accepts the selector %s', (value) => {
		expect(() => resolveOptions({ removeSelectors: [value] })).not.toThrow();
	});

	it('serializes content signals', () => {
		expect(resolveOptions({ contentSignal: { aiTrain: false, search: true } }).contentSignal).toBe(
			'ai-train=no, search=yes',
		);
		expect(resolveOptions({ contentSignal: 'ai-input=yes' }).contentSignal).toBe('ai-input=yes');
	});

	it('resolves Cloudflare options', () => {
		expect(resolveOptions({ cloudflare: true }).cloudflare).toEqual({
			headers: true,
			worker: true,
			negotiation: 'rewrite',
		});
		expect(resolveOptions({ cloudflare: { worker: false } }).cloudflare).toEqual({
			headers: true,
			worker: false,
			negotiation: 'rewrite',
		});
	});

	it.each([
		[{ cloudflare: { negotiation: 'proxy' } }, 'cloudflare.negotiation'],
		[{ contentSignal: 'search=yes\nX-Injected: 1' }, 'contentSignal'],
		[{ outputPath: 'flat' }, 'outputPath'],
		[{ contentSelector: 'main >' }, 'Invalid CSS selector: main >'],
		[{ removeSelectors: ['[broken'] }, 'removeSelectors.0'],
		[{ removeSelectors: ['button:not(h2 button)'] }, 'Only compound selectors'],
		[{ keepSelectors: [':is(nav > a)'] }, 'keepSelectors.0'],
		[{ removeSelectors: ['a:not(.x ~ a)'] }, 'Only compound selectors'],
		[{ llmsTxt: { path: 'llms.txt' } }, 'llmsTxt.path'],
		[{ llmsTxt: [{}, { path: '/llms.txt' }] }, '/llms.txt is generated twice'],
		[{ llmsTxt: { path: '/../llms.txt' } }, 'without `.` or `..` segments'],
		[{ llmsTxt: { sections: [{ title: 'Docs' }] } }, 'llmsTxt.sections.0.include'],
		[{ llmsTxt: { locales: true, path: '/x.txt' } }, '`locales` sets `path`'],
		[
			{ llmsTxt: { sections: [{ title: 'Blog', include: ['/blog/**'] }], sectionOrder: ['/blog'] } },
			'llmsTxt.sectionOrder',
		],
		[{ llmsTxt: { sectionOrder: ['/blog'] } }, "needs `sections: 'auto'`"],
		[{ llmsTxt: { locales: { en: { sectionOrder: ['/en/blog'] } } } }, 'llmsTxt.locales.en.sectionOrder'],
		[{ llmsTxt: [{}, { path: '/en/llms.txt', sectionOrder: ['/en/blog'] }] }, 'llmsTxt.1.sectionOrder'],
		[{ llmsTxt: { intro: 'a', introFile: './a.md' } }, 'either `intro` or `introFile`'],
		[{ llmsTxt: { full: { dedupe: { minPages: 1 } } } }, 'llmsTxt.full.dedupe.minPages'],
		[{ llmsTxt: { full: { dedupe: { minShare: 0 } } } }, 'llmsTxt.full.dedupe.minShare'],
		[{ llmsTxt: { locales: { en: { path: '/x.txt' } } } }, 'llmsTxt.locales.en'],
		[{ frontmatter: ['author'] }, 'frontmatter'],
		[{ unknownOption: true }, 'unknownOption'],
		[{ transform: 'nope' }, 'transform'],
	])('rejects %j', (input, message) => {
		expect(() => resolveOptions(input as AgentMarkdownOptions)).toThrow(message);
	});
});
