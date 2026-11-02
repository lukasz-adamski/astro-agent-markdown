import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegrationLogger } from 'astro';
import { createConverter } from '../core/converter.js';
import { createPageFilter } from '../core/filter.js';
import type { PageMetadata } from '../core/metadata.js';
import { normalizePathname, type RoutingConfig, toMarkdownPath, toPagePath, withBase } from '../core/routing.js';
import { createPageUrl } from '../core/urls.js';
import type { LlmsTxtFile, ResolvedOptions } from '../options.js';
import { createLlmsFullTxt, createLlmsTxt, languageLabels, normalizeIntro, planLlmsTxt } from './llms-txt.js';

export interface GenerateOptions {
	/** Directory containing the generated HTML (`dir` of `astro:build:done`). */
	dir: URL;
	/** Project root, for `llmsTxt.introFile`. */
	root: URL;
	pathnames: string[];
	options: ResolvedOptions;
	llmsTxt: LlmsTxtFile[];
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
	/** Frontmatter block included in `markdown`, empty when disabled. */
	frontmatter: string;
	/** JSON-LD block included in `markdown`, empty when disabled. */
	jsonLd: string;
}

const CONCURRENCY = 16;
/** Pages named in a warning before it is shortened. */
const LISTED_IN_WARNINGS = 5;

/** Writes a Markdown file next to every eligible HTML page of a build. */
export async function generateMarkdown({
	dir,
	root,
	pathnames,
	options,
	llmsTxt,
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

	const written = await writeLlmsTxt({ dir, root, files: llmsTxt, pages, routing, site, logger });

	const skipped = candidates.length - pages.length - failed;
	const details = [skipped && `${skipped} skipped`, failed && `${failed} failed`].filter(Boolean).join(', ');
	logger.info(
		`Generated ${pages.length} Markdown ${pages.length === 1 ? 'page' : 'pages'}` +
			`${details ? ` (${details})` : ''} in ${Math.round(performance.now() - start)}ms` +
			`${written.length ? `, wrote ${written.join(', ')}` : ''}.`,
	);
	return pages;

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
		if (!(await writeNewFile(new URL(`.${markdownPath}`, dir), page.markdown, logger))) return null;

		const href = withBase(markdownPath, routing.base);
		if (options.alternateLink) {
			const updated = injectAlternateLink(html, href);
			if (updated) await writeFile(htmlFile, updated);
		}

		return { pathname, href: publicUrl(href, site), ...page };
	}
}

interface WriteLlmsTxtOptions extends Pick<GenerateOptions, 'dir' | 'root' | 'routing' | 'site' | 'logger'> {
	files: LlmsTxtFile[];
	pages: GeneratedPage[];
}

/**
 * Writes the `llms.txt` and `llms-full.txt` files and warns about likely
 * configuration mistakes.
 * @returns A summary of each written file, such as `llms.txt (46 pages, 11 KB)`.
 */
async function writeLlmsTxt({
	dir,
	root,
	files,
	pages,
	routing,
	site,
	logger,
}: WriteLlmsTxtOptions): Promise<string[]> {
	const plans = files.map((file) => planLlmsTxt(pages, file, site));
	const indexes = plans.filter((plan) => plan.file.index);
	const languages = languageLabels(indexes);
	const written: string[] = [];

	for (const plan of plans) {
		const { file } = plan;
		const name = file.path.slice(1);
		for (const warning of plan.warnings) logger.warn(`${name}: ${warning}`);

		if (file.index) {
			const listed = plan.sections.flatMap((section) => section.pages).filter((entry) => !entry.hidden);
			const undescribed = listed.filter((entry) => !entry.description).length;
			if (undescribed) {
				logger.warn(`${name}: ${undescribed} of ${listed.length} pages are listed without a description.`);
			}
			const alternates = file.crossLinks
				? indexes.flatMap((other, index) =>
						other === plan
							? []
							: [{ label: languages[index] as string, href: publicUrl(withBase(other.file.path, routing.base), site) }],
					)
				: [];
			const content = createLlmsTxt(plan, await readIntro(file, root), alternates);
			if (await writeNewFile(new URL(`.${file.path}`, dir), content, logger)) {
				written.push(`${name} (${listed.length} ${listed.length === 1 ? 'page' : 'pages'}, ${formatSize(content)})`);
			}
		}

		if (file.full) {
			const full = createLlmsFullTxt(plan, file.full);
			const size = Buffer.byteLength(full.content);
			if (file.full.maxSize && size > file.full.maxSize) {
				const largest = [...full.pages]
					.sort((a, b) => b.bytes - a.bytes)
					.slice(0, LISTED_IN_WARNINGS)
					.map((page) => `${page.pathname} (${formatSize(page.bytes)})`);
				logger.warn(
					`${file.fullPath.slice(1)} is ${formatSize(size)}, above \`maxSize\` (${formatSize(file.full.maxSize)}). ` +
						`Largest pages: ${largest.join(', ')}.`,
				);
			}
			if (await writeNewFile(new URL(`.${file.fullPath}`, dir), full.content, logger)) {
				written.push(`${file.fullPath.slice(1)} (${formatSize(size)})`);
			}
		}
	}

	if (files.length > 1) {
		const listed = new Set(
			plans.flatMap((plan) => plan.sections.flatMap((section) => section.pages.map((e) => e.page))),
		);
		const missing = pages.filter((page) => !listed.has(page)).map((page) => page.pathname);
		if (missing.length) {
			const shown = missing.slice(0, LISTED_IN_WARNINGS).join(', ');
			const more = missing.length > LISTED_IN_WARNINGS ? ` and ${missing.length - LISTED_IN_WARNINGS} more` : '';
			logger.warn(`${missing.length} pages are in no llms.txt file: ${shown}${more}.`);
		}
	}
	return written;
}

async function readIntro(file: LlmsTxtFile, root: URL): Promise<string | undefined> {
	if (!file.introFile) return file.intro && normalizeIntro(file.intro);
	const path = fileURLToPath(new URL(file.introFile, root));
	const markdown = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
		throw new Error(
			`[astro-agent-markdown] Could not read \`llmsTxt.introFile\` ${path}: ${error.code ?? error.message}`,
		);
	});
	return normalizeIntro(markdown);
}

/** Writes `file` unless it already exists, e.g. copied from `public/`. */
async function writeNewFile(file: URL, content: string, logger: AstroIntegrationLogger): Promise<boolean> {
	if (await isFile(file)) {
		logger.warn(`Skipped ${fileURLToPath(file)}: the file already exists.`);
		return false;
	}
	await mkdir(dirname(fileURLToPath(file)), { recursive: true });
	await writeFile(file, content);
	return true;
}

function publicUrl(path: string, site: string | undefined): string {
	return site ? new URL(path, site).href : path;
}

function formatSize(content: string | number): string {
	const bytes = typeof content === 'number' ? content : Buffer.byteLength(content);
	return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
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
