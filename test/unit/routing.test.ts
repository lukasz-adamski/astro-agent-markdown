import { describe, expect, it } from 'vitest';
import { createPageFilter } from '../../src/core/filter.js';
import {
	fromMarkdownPath,
	normalizePathname,
	type RoutingConfig,
	stripBase,
	toMarkdownPath,
	toPagePath,
} from '../../src/core/routing.js';

describe('normalizePathname', () => {
	it.each([
		['', '/'],
		['/', '/'],
		['index.html', '/'],
		['about/', '/about'],
		['/about', '/about'],
		['/about.html', '/about'],
		['/about/index.html', '/about'],
		['/docs//intro/', '/docs/intro'],
		['/blog/index-of-things', '/blog/index-of-things'],
	])('%s → %s', (input, expected) => {
		expect(normalizePathname(input)).toBe(expected);
	});
});

describe('createPageFilter', () => {
	const filter = createPageFilter(['**'], ['/404', '/admin/**', 'tags/*']);

	it('matches normalized pathnames', () => {
		expect(filter('/')).toBe(true);
		expect(filter('about/')).toBe(true);
		expect(filter('/404/')).toBe(false);
		expect(filter('/admin')).toBe(false);
		expect(filter('/admin/users/1')).toBe(false);
		expect(filter('/tags/astro')).toBe(false);
		expect(filter('/tags')).toBe(true);
	});

	it('limits pages to include patterns', () => {
		const docsOnly = createPageFilter(['/docs/**'], []);
		expect(docsOnly('/docs')).toBe(true);
		expect(docsOnly('/docs/a/b/')).toBe(true);
		expect(docsOnly('/blog/a')).toBe(false);
	});
});

describe('Markdown paths', () => {
	it('maps pages to Markdown files', () => {
		expect(toMarkdownPath('/', 'sibling')).toBe('/index.md');
		expect(toMarkdownPath('/', 'nested')).toBe('/index.md');
		expect(toMarkdownPath('/docs/intro/', 'sibling')).toBe('/docs/intro.md');
		expect(toMarkdownPath('/docs/intro/', 'nested')).toBe('/docs/intro/index.md');
	});

	it('maps both Markdown layouts back to the page', () => {
		expect(fromMarkdownPath('/index.md')).toBe('/');
		expect(fromMarkdownPath('/docs/intro.md')).toBe('/docs/intro');
		expect(fromMarkdownPath('/docs/intro/index.md')).toBe('/docs/intro');
	});
});

describe('toPagePath', () => {
	const config = (overrides: Partial<RoutingConfig>): RoutingConfig => ({
		base: '/',
		trailingSlash: 'ignore',
		buildFormat: 'directory',
		outputPath: 'sibling',
		...overrides,
	});

	it('follows trailingSlash and build.format', () => {
		expect(toPagePath('/about', config({}))).toBe('/about/');
		expect(toPagePath('/about', config({ buildFormat: 'file' }))).toBe('/about');
		expect(toPagePath('/about', config({ trailingSlash: 'never' }))).toBe('/about');
		expect(toPagePath('/about', config({ trailingSlash: 'always', buildFormat: 'file' }))).toBe('/about/');
	});

	it('prefixes base', () => {
		expect(toPagePath('/', config({ base: '/docs/' }))).toBe('/docs/');
		expect(toPagePath('/', config({ base: '/docs', trailingSlash: 'never' }))).toBe('/docs');
		expect(toPagePath('/a', config({ base: '/docs' }))).toBe('/docs/a/');
	});
});

describe('stripBase', () => {
	it('removes the base prefix', () => {
		expect(stripBase('/about', '/')).toBe('/about');
		expect(stripBase('/docs', '/docs/')).toBe('/');
		expect(stripBase('/docs/a', '/docs')).toBe('/a');
		expect(stripBase('/docsy/a', '/docs')).toBeUndefined();
	});
});
