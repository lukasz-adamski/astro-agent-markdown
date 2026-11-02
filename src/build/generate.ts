import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegrationLogger } from 'astro';
import { createConverter } from '../core/converter.js';
import { createPageFilter } from '../core/filter.js';
import type { PageMetadata } from '../core/metadata.js';
import { normalizePathname, type RoutingConfig, toMarkdownPath, toPagePath, withBase } from '../core/routing.js';
import { createPageUrl } from '../core/urls.js';
import type { ResolvedOptions } from '../options.js';
import { createLlmsFullTxt, createLlmsTxt } from './llms-txt.js';

export interface GenerateOptions {
	/** Directory containing the generated HTML (`dir` of `astro:build:done`). */
	dir: URL;
	pathnames: string[];
	options: ResolvedOptions;
	routing: RoutingConfig;
	site: string | undefined;
	logger: AstroIntegrationLogger;
}

export interface GeneratedPage {
	/** Normalized route pathname without `base`. */
	pathname: string;
	/** Public URL (or root-relative path) of the Markdown file. */
	href: string;
	markdown: string;
	metadata: PageMetadata;
}

const CONCURRENCY = 16;

/** Writes a Markdown file next to every eligible HTML page of a build. */
export async function generateMarkdown({
	dir,
	pathnames,
	options,
	routing,
	site,
	logger,
}: GenerateOptions): Promise<GeneratedPage[]> {
	const start = performance.now();
	const convert = createConverter(options.conversion, options.hooks);
	const isIncluded = createPageFilter(options.include, options.exclude);
	const candidates = [...new Set(pathnames.map(normalizePathname))].filter(isIncluded).sort();

	let failed = 0;
	const results = await mapConcurrent(candidates, CONCURRENCY, async (pathname) => {
		try {
			return await generatePage(pathname);
		} catch (error) {
			failed++;
			logger.warn(`Could not convert ${pathname}: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	});
	const pages = results.filter((page): page is GeneratedPage => page !== null);

	if (options.llmsTxt) {
		await writeNewFile(new URL('llms.txt', dir), createLlmsTxt(pages, options.llmsTxt, site));
		if (options.llmsTxt.full) await writeNewFile(new URL('llms-full.txt', dir), createLlmsFullTxt(pages));
	}

	const skipped = candidates.length - pages.length - failed;
	const details = [skipped && `${skipped} skipped`, failed && `${failed} failed`].filter(Boolean).join(', ');
	logger.info(
		`Generated ${pages.length} Markdown ${pages.length === 1 ? 'page' : 'pages'}` +
			`${details ? ` (${details})` : ''} in ${Math.round(performance.now() - start)}ms.`,
	);
	return pages;

	/** Writes `file` unless it already exists, e.g. copied from `public/`. */
	async function writeNewFile(file: URL, content: string): Promise<boolean> {
		if (await isFile(file)) {
			logger.warn(`Skipped ${fileURLToPath(file)}: the file already exists.`);
			return false;
		}
		await mkdir(dirname(fileURLToPath(file)), { recursive: true });
		await writeFile(file, content);
		return true;
	}

	async function generatePage(pathname: string): Promise<GeneratedPage | null> {
		const found = await findHtmlFile(dir, pathname);
		if (!found) return null;

		const { file: htmlFile, directory } = found;
		const html = await readFile(htmlFile, 'utf8');
		// The emitted file tells how the page is served, e.g. with `build.format: 'preserve'`.
		const pagePath = toPagePath(pathname, { ...routing, buildFormat: directory ? 'directory' : 'file' });
		const url = createPageUrl(pagePath, site);
		const page = await convert({ html, pathname, url });
		if (!page) return null;

		const markdownPath = toMarkdownPath(pathname, routing.outputPath);
		if (!(await writeNewFile(new URL(`.${markdownPath}`, dir), page.markdown))) return null;

		const href = withBase(markdownPath, routing.base);
		if (options.alternateLink) {
			const updated = injectAlternateLink(html, href);
			if (updated) await writeFile(htmlFile, updated);
		}

		return {
			pathname,
			href: site ? new URL(href, site).href : href,
			markdown: page.markdown,
			metadata: page.metadata,
		};
	}
}

/**
 * Resolves the HTML file of a page for any `build.format`. `directory` tells
 * whether it is an `index.html`, served with a trailing slash.
 */
async function findHtmlFile(dir: URL, pathname: string): Promise<{ file: URL; directory: boolean } | undefined> {
	const candidates = pathname === '/' ? ['index.html'] : [`.${pathname}/index.html`, `.${pathname}.html`];
	for (const candidate of candidates) {
		const file = new URL(candidate, dir);
		if (await isFile(file)) return { file, directory: candidate.endsWith('/index.html') || candidate === 'index.html' };
	}
	return undefined;
}

async function isFile(file: URL): Promise<boolean> {
	const stats = await stat(file).catch(() => undefined);
	return stats?.isFile() ?? false;
}

/**
 * Inserts `<link rel="alternate" type="text/markdown">` right after the opening
 * `<head>` tag, which comes before any script that could contain `</head>`.
 */
export function injectAlternateLink(html: string, href: string): string | undefined {
	if (/<link\b[^>]*\btype=["']?text\/markdown\b/i.test(html)) return undefined;
	const head = /<head(?:\s[^>]*)?>/i.exec(html);
	if (!head) return undefined;
	const index = head.index + head[0].length;
	const link = `<link rel="alternate" type="text/markdown" href="${escapeAttribute(href)}">`;
	return `${html.slice(0, index)}${link}${html.slice(index)}`;
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index] as T);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}
