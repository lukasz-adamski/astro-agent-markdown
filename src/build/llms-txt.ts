import type { Root as MdastRoot, RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { createPageFilter } from '../core/filter.js';
import type { PageMetadata } from '../core/metadata.js';
import { normalizePathname } from '../core/routing.js';
import type { LlmsTxtFile, ResolvedLlmsFullTxt } from '../options.js';
import type { GeneratedPage } from './generate.js';

/** Title separators such as `About | Acme` or `About – Acme`. */
const TITLE_SEPARATOR = /\s[|·•–—-]\s/g;
const PAGES_SECTION = 'Pages';
const OPTIONAL_SECTION = 'Optional';

export interface ListedPage {
	page: GeneratedPage;
	label: string;
	description: string | undefined;
	/** Left out of the index by `entry`, still part of `llms-full.txt`. */
	hidden: boolean;
}

export interface LlmsTxtSectionPlan {
	title: string;
	pages: ListedPage[];
	optional: boolean;
}

/** Contents of one index file, before it is rendered. */
export interface LlmsTxtPlan {
	file: LlmsTxtFile;
	title: string;
	description: string | undefined;
	/** Language code of the file: its i18n locale, or the `lang` of its home page. */
	lang: string | undefined;
	/** Listed pages in index order: sections in order, `Optional` last. */
	sections: LlmsTxtSectionPlan[];
	/** Likely configuration mistakes, such as sections that match no page. */
	warnings: string[];
}

export interface LlmsTxtLink {
	label: string;
	href: string;
}

export function planLlmsTxt(pages: GeneratedPage[], file: LlmsTxtFile, site: string | undefined): LlmsTxtPlan {
	const isListed = createPageFilter(file.include, file.exclude);
	const listed = pages.filter((page) => isListed(page.pathname));
	const ordered = [
		...listed.filter((page) => page.pathname === file.home),
		...listed.filter((page) => page.pathname !== file.home),
	];
	const home = ordered.find((page) => page.pathname === file.home)?.metadata;
	const brands = siteBrands(ordered, pages, home);

	const entries = ordered.map((page): ListedPage => {
		const entry = file.entry?.({ pathname: page.pathname, href: page.href, metadata: page.metadata });
		const { label, description } = entry || {};
		return {
			page,
			label: label || shortTitle(page.metadata.title, brands) || page.pathname,
			description: description === false ? undefined : description || page.metadata.description,
			hidden: entry === false,
		};
	});

	return {
		file,
		title:
			file.title ?? home?.siteName ?? brands.at(-1) ?? home?.title ?? (site ? new URL(site).hostname : 'Documentation'),
		description: file.description ?? home?.description,
		lang: file.locale ?? home?.lang,
		...groupSections(entries, file),
	};
}

/**
 * Renders an `llms.txt` index: the site name, summary and intro, then the
 * links grouped in sections, with links to the other index files before `Optional`.
 * @see https://llmstxt.org
 */
export function createLlmsTxt(plan: LlmsTxtPlan, intro: string | undefined, alternates: LlmsTxtLink[]): string {
	const lines = [`# ${singleLine(plan.title)}`, ''];
	if (plan.description) lines.push(`> ${singleLine(plan.description)}`, '');
	if (intro) lines.push(intro, '');

	const pageLinks = (section: LlmsTxtSectionPlan): [string, string[]] => [
		section.title,
		section.pages
			.filter((entry) => !entry.hidden)
			.map(({ page, label, description }) => {
				const summary = description ? `: ${singleLine(description)}` : '';
				return `${link(label, page.href)}${summary}`;
			}),
	];
	const lists = [
		...plan.sections.filter((section) => !section.optional).map(pageLinks),
		['Other languages', alternates.map((item) => link(item.label, item.href))] as [string, string[]],
		...plan.sections.filter((section) => section.optional).map(pageLinks),
	];
	for (const [title, items] of lists) {
		if (items.length) lines.push(`## ${singleLine(title)}`, '', ...items.map((item) => `- ${item}`), '');
	}
	return `${lines.join('\n').trimEnd()}\n`;
}

/** Bytes of each page in `llms-full.txt`, to report the largest ones. */
export interface LlmsFullTxt {
	content: string;
	pages: { pathname: string; bytes: number }[];
}

/**
 * Concatenates the Markdown of the listed pages in index order, without
 * JSON-LD and, unless enabled, without the `Optional` section.
 */
export function createLlmsFullTxt(plan: LlmsTxtPlan, options: ResolvedLlmsFullTxt): LlmsFullTxt {
	const entries = plan.sections.filter((section) => options.optional || !section.optional).flatMap((s) => s.pages);
	const bodies = entries.map(({ page }) => parseBody(pageBody(page)));
	if (options.dedupe) dedupeBlocks(bodies, options.dedupe);

	const documents = entries.map(({ page, label }, index) => {
		const { heading, blocks } = bodies[index] as PageBody;
		if (options.pageHeader === 'frontmatter') {
			const header = page.frontmatter && page.markdown.startsWith(page.frontmatter) ? page.frontmatter : '';
			const document = [header, ...blocks.map((block) => block.text)].filter(Boolean).join('\n\n');
			return index === 0 || header ? document : `---\n\n${document}`;
		}
		const title = heading?.text ?? `# ${singleLine(label)}`;
		const rest = blocks.filter((block) => block !== heading).map((block) => block.text);
		return [`${title}\nSource: ${page.metadata.url ?? page.href}`, ...rest].join('\n\n');
	});
	return {
		content: `${documents.join('\n\n')}\n`,
		pages: entries.map(({ page }, index) => ({
			pathname: page.pathname,
			bytes: Buffer.byteLength(documents[index] as string),
		})),
	};
}

/**
 * Removes a leading frontmatter block, `# heading` and blockquote from an
 * intro, as the index writes its own.
 */
export function normalizeIntro(markdown: string): string {
	return markdown
		.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '')
		.replace(/^\s*#\s[^\n]*(?:\n|$)/, '')
		.replace(/^\s*(?:>[^\n]*(?:\n|$))+/, '')
		.trim();
}

/**
 * Names the language of each file in links between files: `English`, or
 * `British English` when another file is also in English.
 */
export function languageLabels(plans: LlmsTxtPlan[]): string[] {
	const languages = plans.map((plan) => plan.lang && baseLanguage(plan.lang));
	return plans.map((plan, index) => {
		const language = languages[index];
		const shared = language && languages.filter((other) => other === language).length > 1;
		return plan.file.language ?? languageName(shared ? plan.lang : language) ?? plan.file.path;
	});
}

function groupSections(entries: ListedPage[], file: LlmsTxtFile): Pick<LlmsTxtPlan, 'sections' | 'warnings'> {
	const isOptional = file.optional.length ? createPageFilter(file.optional, []) : () => false;
	const optional: LlmsTxtSectionPlan = { title: OPTIONAL_SECTION, pages: [], optional: true };
	const rest: LlmsTxtSectionPlan = { title: PAGES_SECTION, pages: [], optional: false };
	const required = entries.filter((entry) => {
		if (!isOptional(entry.page.pathname)) return true;
		optional.pages.push(entry);
		return false;
	});

	const warnings: string[] = [];
	const sections =
		file.sections === 'auto'
			? autoSections(required, file, rest, warnings)
			: configuredSections(required, file.sections, rest);
	const empty = sections.filter((section) => !section.pages.length).map((section) => section.title);
	if (file.optional.length && !optional.pages.length) empty.push(OPTIONAL_SECTION);
	warnings.push(...empty.map((title) => `the "${title}" section matches no page.`));

	return {
		sections: [rest, ...sections, optional].filter((section) => section.pages.length),
		warnings,
	};
}

function configuredSections(
	entries: ListedPage[],
	config: Exclude<LlmsTxtFile['sections'], 'auto'>,
	rest: LlmsTxtSectionPlan,
): LlmsTxtSectionPlan[] {
	const sections = config.map((section) => ({
		title: section.title,
		pages: [] as ListedPage[],
		optional: false,
		matches: createPageFilter(section.include, section.exclude ?? []),
	}));
	for (const entry of entries) {
		(sections.find((section) => section.matches(entry.page.pathname))?.pages ?? rest.pages).push(entry);
	}
	return sections.map(({ title, pages, optional }) => ({ title, pages, optional }));
}

/**
 * Makes a section of every first path segment below the home page that has
 * subpages, titled after the segment's own page (`Services: web, shops` →
 * `Services`) or the segment name, in `sectionOrder` and then path order.
 * Other pages stay in `rest`.
 */
function autoSections(
	entries: ListedPage[],
	{ home, sectionOrder }: LlmsTxtFile,
	rest: LlmsTxtSectionPlan,
	warnings: string[],
): LlmsTxtSectionPlan[] {
	const segments = (pathname: string) => {
		const relative = home !== '/' && pathname.startsWith(`${home}/`) ? pathname.slice(home.length) : pathname;
		return relative.split('/').filter(Boolean);
	};
	const parents = new Set(
		entries.flatMap(({ page }) => {
			const [first, ...more] = segments(page.pathname);
			return first && more.length ? [first] : [];
		}),
	);

	const sections = new Map<string, LlmsTxtSectionPlan>();
	for (const entry of entries) {
		const [first, ...more] = segments(entry.page.pathname);
		if (!first || !parents.has(first) || entry.page.pathname === home) {
			rest.pages.push(entry);
			continue;
		}
		let section = sections.get(first);
		if (!section) {
			section = { title: humanize(first), pages: [], optional: false };
			sections.set(first, section);
		}
		if (!more.length) section.title = entry.label.split(/:\s/)[0]?.trim() || section.title;
		section.pages.push(entry);
	}

	const sectionPath = (segment: string) => `${home === '/' ? '' : home}/${segment}`;
	const order = sectionOrder.map(normalizePathname);
	for (const path of order) {
		if (![...sections.keys()].some((segment) => sectionPath(segment) === path)) {
			warnings.push(`\`sectionOrder\` lists ${path}, which is not a section.`);
		}
	}
	const rank = (segment: string) => {
		const index = order.indexOf(sectionPath(segment));
		return index === -1 ? order.length : index;
	};
	return [...sections.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([, section]) => section);
}

/**
 * Brands to strip from titles: `og:site_name`, and the name that starts or
 * ends most titles, as in `Acme | Home` and `About | Acme`. A file with too
 * few pages to tell, such as a small locale, uses the titles of all pages.
 */
function siteBrands(listed: GeneratedPage[], all: GeneratedPage[], home: PageMetadata | undefined): string[] {
	const shared = sharedBrand(listed) ?? sharedBrand(all);
	return [...new Set([home?.siteName, shared].filter((brand): brand is string => Boolean(brand)))];
}

function sharedBrand(pages: GeneratedPage[]): string | undefined {
	const titles = pages.flatMap((page) => page.metadata.title ?? []);
	const counts = new Map<string, number>();
	for (const title of titles) {
		const candidates = new Set([splitTitle(title, 'first')?.[0], splitTitle(title, 'last')?.[1]]);
		for (const candidate of candidates) {
			if (candidate) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
		}
	}
	const [name, count = 0] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
	return name && count >= 2 && count * 2 >= titles.length ? name : undefined;
}

/** `About | Acme` and `Acme | About` → `About` */
function shortTitle(title: string | undefined, brands: string[]): string | undefined {
	if (!title) return undefined;
	const last = splitTitle(title, 'last');
	if (last && brands.includes(last[1])) return last[0];
	const first = splitTitle(title, 'first');
	if (first && brands.includes(first[0])) return first[1];
	return title;
}

function splitTitle(title: string, which: 'first' | 'last'): [string, string] | undefined {
	const matches = [...title.matchAll(TITLE_SEPARATOR)];
	const match = which === 'first' ? matches[0] : matches.at(-1);
	if (match?.index === undefined) return undefined;
	const before = title.slice(0, match.index).trim();
	const after = title.slice(match.index + match[0].length).trim();
	return before && after ? [before, after] : undefined;
}

/** `en-US` → `en` */
function baseLanguage(code: string): string {
	try {
		return new Intl.Locale(code).language;
	} catch {
		return code;
	}
}

/** `de` → `Deutsch`, `en` → `English` */
function languageName(code: string | undefined): string | undefined {
	if (!code) return undefined;
	try {
		const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
		return name && name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
	} catch {
		return undefined;
	}
}

function humanize(segment: string): string {
	let text = segment;
	try {
		text = decodeURIComponent(segment);
	} catch {}
	text = text.replace(/[-_]+/g, ' ');
	return text.charAt(0).toUpperCase() + text.slice(1);
}

interface Block {
	/** Markdown source of a top-level node: a whole list, table or blockquote. */
	text: string;
	/** Heading depth, `0` for other blocks. */
	depth: number;
	/** A `**term**: details` line from a definition list: a fact of the page, never deduplicated. */
	fact: boolean;
}

interface PageBody {
	blocks: Block[];
	/**
	 * The page title: the first `# heading` before any `##` heading, possibly
	 * after an eyebrow label or a list of tags.
	 */
	heading: Block | undefined;
}

const markdownParser = unified().use(remarkParse).use(remarkGfm);

/** The page Markdown without its frontmatter, and without the JSON-LD the converter added unless a transform changed it. */
function pageBody(page: GeneratedPage): string {
	let markdown = page.markdown;
	// Matched as any leading block, as a transform may have changed its fields.
	if (page.frontmatter) markdown = markdown.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '');
	const jsonLd = page.jsonLd ? markdown.lastIndexOf(page.jsonLd) : -1;
	if (jsonLd !== -1) markdown = markdown.slice(0, jsonLd) + markdown.slice(jsonLd + page.jsonLd.length);
	return markdown.trim();
}

function parseBody(markdown: string): PageBody {
	const blocks = (markdownParser.parse(markdown) as MdastRoot).children.flatMap((node): Block[] => {
		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		if (start === undefined || end === undefined) return [];
		return [{ text: markdown.slice(start, end), depth: node.type === 'heading' ? node.depth : 0, fact: isFact(node) }];
	});
	const firstSection = blocks.findIndex((block) => block.depth > 1);
	const heading = blocks.slice(0, firstSection === -1 ? undefined : firstSection).find((block) => block.depth === 1);
	return { blocks, heading };
}

function isFact(node: RootContent): boolean {
	if (node.type !== 'paragraph') return false;
	const [term, details] = node.children;
	return term?.type === 'strong' && details?.type === 'text' && details.value.startsWith(':');
}

/**
 * Removes boilerplate repeated across pages, such as calls to action: blocks
 * found on at least `minShare` of the pages (and `minPages`) stay only on the
 * first page that has them. Repeats within a page and facts are kept. A
 * heading and the block after it count as one block; a heading followed by
 * another heading is kept, as it introduces the content below.
 */
function dedupeBlocks(bodies: PageBody[], { minShare, minPages }: { minShare: number; minPages: number }): void {
	const units = bodies.map((body) => toUnits(body.blocks.filter((block) => block !== body.heading)));
	const owners = new Map<string, number>();
	const pagesWith = new Map<string, number>();
	units.forEach((pageUnits, index) => {
		for (const key of new Set(pageUnits.map(unitKey))) {
			if (!owners.has(key)) owners.set(key, index);
			pagesWith.set(key, (pagesWith.get(key) ?? 0) + 1);
		}
	});

	const threshold = Math.max(minPages, Math.ceil(minShare * bodies.length));
	bodies.forEach((body, index) => {
		const removed = new Set(
			(units[index] ?? [])
				.filter((unit) => {
					const key = unitKey(unit);
					return (
						unit.some((block) => block.depth === 0) &&
						!unit.some((block) => block.fact) &&
						(pagesWith.get(key) ?? 0) >= threshold &&
						owners.get(key) !== index
					);
				})
				.flat(),
		);
		body.blocks = body.blocks.filter((block) => !removed.has(block));
	});
}

function toUnits(blocks: Block[]): Block[][] {
	const units: Block[][] = [];
	for (const block of blocks) {
		const previous = units.at(-1);
		if (previous?.length === 1 && (previous[0] as Block).depth > 0 && block.depth === 0) {
			previous.push(block);
		} else {
			units.push([block]);
		}
	}
	return units;
}

function unitKey(unit: Block[]): string {
	return unit
		.map((block) => block.text)
		.join('\n')
		.replace(/\s+/g, ' ')
		.trim();
}

function link(label: string, href: string): string {
	return `[${escapeLinkText(singleLine(label))}](${href})`;
}

function singleLine(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function escapeLinkText(value: string): string {
	return value.replace(/[[\]\\]/g, '\\$&');
}
