import type { AstroConfig } from 'astro';
import { z } from 'astro/zod';
import { selectAll } from 'hast-util-select';
import type { Options as StringifyOptions } from 'remark-stringify';
import type { PluggableList } from 'unified';
import type { PageMetadata } from './core/metadata.js';
import { normalizePathname } from './core/routing.js';
import { DEFAULT_CONTENT_SELECTORS, DEFAULT_KEEP_SELECTORS, DEFAULT_REMOVE_SELECTORS } from './core/selectors.js';

/** Metadata fields that can be emitted as YAML frontmatter. */
export type FrontmatterField = 'title' | 'description' | 'url' | 'image' | 'lang';

/** Formatting options passed to `remark-stringify`. */
export type MarkdownFormatOptions = Pick<
	StringifyOptions,
	| 'bullet'
	| 'bulletOrdered'
	| 'closeAtx'
	| 'emphasis'
	| 'fence'
	| 'fences'
	| 'incrementListMarker'
	| 'listItemIndent'
	| 'quote'
	| 'resourceLink'
	| 'rule'
	| 'ruleRepetition'
	| 'ruleSpaces'
	| 'setext'
	| 'strong'
	| 'tightDefinitions'
>;

/**
 * Value of the `Content-Signal` response header.
 * @see https://contentsignals.org
 */
export interface ContentSignal {
	/** Allow training or fine-tuning AI models. */
	aiTrain?: boolean;
	/** Allow building a search index and showing search results. */
	search?: boolean;
	/** Allow using the content as input to AI models (RAG, grounding, answers). */
	aiInput?: boolean;
}

export interface LlmsTxtSection {
	/** Heading of the section. */
	title: string;
	/** Glob patterns of the pages listed in this section. */
	include: string[];
	/** Glob patterns of pages left out of this section. */
	exclude?: string[];
}

/** A page listed in `llms.txt`. */
export interface LlmsTxtPage {
	/** Route pathname of the page, without `base`. */
	pathname: string;
	/** URL of the Markdown file. */
	href: string;
	metadata: PageMetadata;
}

/** How a page is listed in `llms.txt`. Omitted fields keep their defaults. */
export interface LlmsTxtEntry {
	/** Link text. */
	label?: string;
	/** Text after the link. `false` leaves it out. */
	description?: string | false;
}

export interface LlmsFullTxtOptions {
	/**
	 * What starts each page: `'source'` writes its `# Title` and a `Source:`
	 * line with its URL, `'frontmatter'` its YAML frontmatter.
	 * @default 'source'
	 */
	pageHeader?: 'source' | 'frontmatter';
	/**
	 * Include the pages of the `Optional` section.
	 * @default false
	 */
	optional?: boolean;
	/**
	 * Remove boilerplate repeated across pages, such as calls to action: a
	 * top-level block found on at least `minShare` of the pages, and on at least
	 * `minPages` pages, stays only on the first page that has it. Repeats within
	 * a page and `**term**: details` facts are kept.
	 * @default false
	 */
	dedupe?: boolean | { minShare?: number; minPages?: number };
	/**
	 * Warn when the file is larger than this many bytes. `false` disables the warning.
	 * @default 512000
	 */
	maxSize?: number | false;
}

export interface LlmsTxtOptions {
	/**
	 * Location of the index, e.g. `/en/llms.txt` for one locale. `llms-full.txt`
	 * is written next to it, and the page in its directory is the home page.
	 * @default '/llms.txt'
	 */
	path?: string;
	/**
	 * One file per locale of Astro's `i18n` config: `/llms.txt` for the default
	 * locale, `/<locale>/llms.txt` for the others. Other options apply to each;
	 * patterns and pathnames such as `sectionOrder` and `optional` match full
	 * pathnames, so set them per locale. Pass an object keyed by locale to
	 * override options for some locales.
	 * @default false
	 * @example { en: { introFile: './src/llms-intro.en.md' }, de: { introFile: './src/llms-intro.de.md' } }
	 */
	locales?: boolean | Record<string, LlmsTxtLocaleOptions>;
	/**
	 * Glob patterns of the pages listed, matched like the top-level `include`.
	 * @default ['**']
	 */
	include?: string[];
	/** Glob patterns of pages left out of this index. */
	exclude?: string[];
	/**
	 * Top-level heading. Defaults to the site name: `og:site_name` of the home
	 * page, or the suffix shared by page titles, such as `Acme` in `About | Acme`.
	 */
	title?: string;
	/** Short summary rendered as a blockquote. Defaults to the description of the home page. */
	description?: string;
	/**
	 * Markdown inserted after the summary, before the links: facts, rules,
	 * contact. A leading frontmatter block, `# heading` and blockquote are skipped.
	 */
	intro?: string;
	/**
	 * Markdown file inserted like `intro`, relative to the project root.
	 * @example './src/llms-intro.md'
	 */
	introFile?: string;
	/**
	 * Group pages under `##` headings. A page goes to the first section that
	 * matches; the others are listed under `## Pages`, before the sections.
	 * `'auto'` makes a section of every first path segment with subpages.
	 */
	sections?: LlmsTxtSection[] | 'auto';
	/**
	 * Order of automatic sections, as the pathnames of their pages. Sections
	 * not listed follow in path order.
	 * @example ['/docs', '/blog']
	 */
	sectionOrder?: string[];
	/**
	 * Glob patterns of secondary pages, such as legal pages, listed last under
	 * `## Optional`, which agents may skip.
	 * @example ['/privacy', '/terms']
	 */
	optional?: string[];
	/**
	 * Name of the language in the links between index files. Defaults to the
	 * `lang` of the home page, written in that language.
	 */
	language?: string;
	/**
	 * With several index files, link each to the others under `## Other languages`.
	 * @default true
	 */
	crossLinks?: boolean;
	/**
	 * Decides how a page is listed. Return `false` to leave it out of the index
	 * while keeping it in `llms-full.txt`.
	 */
	entry?: (page: LlmsTxtPage) => LlmsTxtEntry | false | undefined;
	/**
	 * Write the index. Disable it to keep a hand-written `llms.txt` and only
	 * generate `llms-full.txt`.
	 * @default true
	 */
	index?: boolean;
	/**
	 * Also emit `llms-full.txt` containing the Markdown of every listed page,
	 * without JSON-LD, in the order of the index.
	 * @default false
	 */
	full?: boolean | LlmsFullTxtOptions;
}

/** Options overriding the shared `llmsTxt` options for one locale. */
export type LlmsTxtLocaleOptions = Omit<LlmsTxtOptions, 'path' | 'locales' | 'include'>;

export interface CloudflareOptions {
	/**
	 * Add a `_headers` rule setting `Content-Signal` on `.md` files when
	 * `contentSignal` is configured. Workers static assets already serve them
	 * as `text/markdown; charset=utf-8`.
	 * @default true
	 */
	headers?: boolean;
	/**
	 * Emit `_worker.js` (and `.assetsignore`), a Worker answering
	 * `Accept: text/markdown` with the Markdown file of the page. Static output only.
	 * @default true
	 */
	worker?: boolean;
	/**
	 * How the Worker answers a request negotiating Markdown: `'rewrite'` serves
	 * the Markdown at the page URL, `'redirect'` sends a `302` to the `.md` URL.
	 * @default 'rewrite'
	 */
	negotiation?: 'rewrite' | 'redirect';
}

export interface TransformContext {
	/**
	 * Route pathname of the page, without `base` (e.g. `/blog/hello`). For
	 * `htmlToMarkdown()`, the pathname of the `url` option.
	 */
	pathname: string;
	/** Public URL of the HTML page, when known. */
	url: URL | undefined;
	/** Metadata extracted from the page `<head>`. */
	metadata: PageMetadata;
}

export type MarkdownTransform = (
	markdown: string,
	context: TransformContext,
) => string | undefined | Promise<string | undefined>;

export interface AgentMarkdownOptions {
	/**
	 * Glob patterns matched against the route pathname (without `base`).
	 * Only matching pages get a Markdown version.
	 * @default ['**']
	 * @example ['/docs/**', '/blog/**']
	 */
	include?: string[];
	/**
	 * Glob patterns of pages that never get a Markdown version.
	 * Error pages (`/404`, `/500`, `/en/404`, …) are always excluded.
	 * @example ['/admin/**', '/tags/*']
	 */
	exclude?: string[];
	/**
	 * CSS selectors locating the main content of a page. The first selector that
	 * matches is used; pages where none matches are skipped.
	 * @default ['[data-markdown-content]', 'main', '[role="main"]', 'body']
	 */
	contentSelector?: string | string[];
	/**
	 * Additional CSS selectors of elements removed before conversion.
	 * @example ['.toc', '.newsletter', '#comments']
	 */
	removeSelectors?: string[];
	/**
	 * Additional CSS selectors of elements that are never removed, even when
	 * they match a removal selector. Their descendants can still be removed.
	 * @example ['.cta button']
	 */
	keepSelectors?: string[];
	/**
	 * Keep the built-in lists of removed elements (scripts, navigation, forms,
	 * hidden elements, `[data-markdown-ignore]`, …) and of kept ones (buttons
	 * labelling headings, accordions and tabs).
	 * @default true
	 */
	defaultRemoveSelectors?: boolean;
	/**
	 * YAML frontmatter generated from the page `<head>`. `true` emits the default
	 * fields, an array picks fields and their order, `false` disables it.
	 * @default ['title', 'description', 'url', 'image']
	 */
	frontmatter?: boolean | FrontmatterField[];
	/**
	 * Append `<script type="application/ld+json">` blocks as a fenced `json` code block.
	 * @default true
	 */
	jsonLd?: boolean;
	/**
	 * Resolve links and image sources to absolute URLs using `site`. Without
	 * `site`, they are made root-relative instead.
	 * @default true
	 */
	absoluteUrls?: boolean;
	/** Markdown formatting options (bullet style, emphasis marker, fences, …). */
	markdown?: MarkdownFormatOptions;
	/**
	 * Rehype plugins run on the main content, after elements are removed and
	 * markup is normalized, before conversion.
	 * Applied at build time and in dev, not by the on-demand middleware.
	 */
	rehypePlugins?: PluggableList;
	/**
	 * Remark plugins run on the Markdown tree before serialization.
	 * Applied at build time and in dev, not by the on-demand middleware.
	 */
	remarkPlugins?: PluggableList;
	/**
	 * Final hook receiving the generated Markdown. Return a new string to replace it.
	 * Applied at build time and in dev, not by the on-demand middleware.
	 */
	transform?: MarkdownTransform;
	/**
	 * Where the Markdown version of a page is written.
	 * - `'sibling'`: `/docs/intro/` → `/docs/intro.md`
	 * - `'nested'`: `/docs/intro/` → `/docs/intro/index.md`
	 *
	 * The home page is always `/index.md`.
	 * @default 'sibling'
	 */
	outputPath?: 'sibling' | 'nested';
	/**
	 * Advertise the Markdown version with `<link rel="alternate" type="text/markdown">`
	 * in generated HTML and a matching `Link` header on on-demand responses.
	 * @default true
	 */
	alternateLink?: boolean;
	/**
	 * Generate an `llms.txt` index of all Markdown pages at build time. Pass an
	 * array for several indexes, e.g. one per locale.
	 * @see https://llmstxt.org
	 * @default false
	 */
	llmsTxt?: boolean | LlmsTxtOptions | LlmsTxtOptions[];
	/**
	 * Serve Markdown when the request `Accept` header prefers `text/markdown`
	 * over `text/html`. Applies to the dev server, on-demand rendered pages and
	 * the generated Cloudflare Worker.
	 * @default true
	 */
	contentNegotiation?: boolean;
	/**
	 * `Content-Signal` header added to Markdown responses: in dev, on on-demand
	 * pages and through the Cloudflare `_headers` rule and Worker.
	 * @default false
	 * @example { aiTrain: false, search: true, aiInput: true }
	 */
	contentSignal?: false | string | ContentSignal;
	/**
	 * Deployment files for Cloudflare Workers static assets: a `_headers` rule
	 * for Markdown files and a Worker negotiating `text/markdown`.
	 * @default false
	 */
	cloudflare?: boolean | CloudflareOptions;
	/**
	 * Inject middleware and a `/[...path].md` route serving Markdown for
	 * on-demand rendered pages. `'auto'` enables them for `output: 'server'`.
	 * Set `true` when a static project with an adapter has on-demand pages;
	 * the route is rendered on demand, so it makes the build a server build.
	 * @default 'auto'
	 */
	middleware?: boolean | 'auto';
}

/** Serializable options controlling the HTML → Markdown conversion. */
export interface ConversionOptions {
	contentSelectors: string[];
	removeSelectors: string[];
	keepSelectors: string[];
	frontmatter: FrontmatterField[];
	jsonLd: boolean;
	absoluteUrls: boolean;
	markdown: MarkdownFormatOptions;
}

/** Non-serializable extension points of the conversion. */
export interface ConversionHooks {
	rehypePlugins?: PluggableList;
	remarkPlugins?: PluggableList;
	transform?: MarkdownTransform;
}

export interface ResolvedLlmsFullTxt {
	pageHeader: 'source' | 'frontmatter';
	optional: boolean;
	dedupe: { minShare: number; minPages: number } | null;
	maxSize: number | null;
}

/** Options of one `llmsTxt` file, with defaults. */
export interface ResolvedLlmsTxtEntry
	extends Required<Pick<LlmsTxtOptions, 'include' | 'exclude' | 'optional' | 'sectionOrder' | 'crossLinks' | 'index'>>,
		Pick<LlmsTxtOptions, 'path' | 'title' | 'description' | 'intro' | 'introFile' | 'language' | 'entry'> {
	sections: LlmsTxtSection[] | 'auto';
	full: ResolvedLlmsFullTxt | null;
}

/** `llmsTxt` options with defaults, before `locales` is expanded. */
export interface ResolvedLlmsTxt extends ResolvedLlmsTxtEntry {
	locales: boolean;
	/** Options of the locales with overrides, by locale key. */
	localeOptions: Record<string, ResolvedLlmsTxtEntry>;
}

/** One index file to write. */
export interface LlmsTxtFile extends Omit<ResolvedLlmsTxtEntry, 'path'> {
	path: string;
	/** Location of `llms-full.txt`. */
	fullPath: string;
	/** Pathname of the page whose metadata provides the defaults. */
	home: string;
	/** Locale code from the `i18n` config, which names the file's language. */
	locale?: string;
}

export interface ResolvedOptions {
	include: string[];
	exclude: string[];
	conversion: ConversionOptions;
	hooks: ConversionHooks;
	outputPath: 'sibling' | 'nested';
	alternateLink: boolean;
	llmsTxt: ResolvedLlmsTxt[];
	contentNegotiation: boolean;
	contentSignal: string | null;
	cloudflare: Required<CloudflareOptions> | null;
	middleware: boolean | 'auto';
}

export const DEFAULT_FRONTMATTER: FrontmatterField[] = ['title', 'description', 'url', 'image'];

export const DEFAULT_MARKDOWN_FORMAT: MarkdownFormatOptions = { bullet: '-', rule: '-' };

/** Error pages, including localized ones such as `/en/404`. */
const ALWAYS_EXCLUDED = ['/404', '/500', '/*/404', '/*/500'];

const fn = <T>() => z.custom<T>((value) => typeof value === 'function', 'Expected a function');
const pluggableList = z.custom<PluggableList>(Array.isArray, 'Expected an array of plugins');
const headerValue = z
	.string()
	.regex(/^[\x20-\x7e]+$/, 'Expected printable ASCII characters only (a valid HTTP header value)');
const selector = z
	.string()
	.refine(isValidSelector, { error: (issue) => `Invalid CSS selector: ${String(issue.input)}` })
	.refine((value) => !hasComplexArgument(value), {
		error: (issue) =>
			`Unsupported CSS selector: ${String(issue.input)}. Only compound selectors (without spaces, \`>\`, \`+\` or \`~\`) work inside :not() and :is().`,
	});
const globs = z.array(z.string());
const llmsTxtFields = {
	path: z
		.string()
		.regex(/^\/(?:[^/\s]+\/)*[^/\s]+\.txt$/, 'Expected an absolute path to a .txt file, e.g. /en/llms.txt')
		.refine((path) => !/\/\.{1,2}\//.test(path), 'Expected a path without `.` or `..` segments'),
	include: globs,
	exclude: globs,
	title: z.string(),
	description: z.string(),
	intro: z.string(),
	introFile: z.string().min(1),
	sections: z.union([
		z.literal('auto'),
		z.array(z.object({ title: z.string().min(1), include: globs, exclude: globs.optional() }).strict()),
	]),
	sectionOrder: globs,
	optional: globs,
	language: z.string().min(1),
	crossLinks: z.boolean(),
	entry: fn<NonNullable<LlmsTxtOptions['entry']>>(),
	index: z.boolean(),
	full: z.union([
		z.boolean(),
		z
			.object({
				pageHeader: z.enum(['source', 'frontmatter']),
				optional: z.boolean(),
				dedupe: z.union([
					z.boolean(),
					z
						.object({ minShare: z.number().gt(0).max(1), minPages: z.number().int().min(2) })
						.partial()
						.strict(),
				]),
				maxSize: z.union([z.literal(false), z.number().int().positive()]),
			})
			.partial()
			.strict(),
	]),
};
const introSource = {
	error: 'Use either `intro` or `introFile`.',
};
const hasOneIntro = (value: { intro?: string; introFile?: string }) =>
	!(value.intro !== undefined && value.introFile !== undefined);
const { path: _path, include: _include, ...localeFields } = llmsTxtFields;
const llmsTxtLocaleOptions = z.object(localeFields).partial().strict().refine(hasOneIntro, introSource);
const llmsTxtOptions = z
	.object({ ...llmsTxtFields, locales: z.union([z.boolean(), z.record(z.string(), llmsTxtLocaleOptions)]) })
	.partial()
	.strict()
	.refine((value) => !(value.locales && (value.path || value.include || value.language)), {
		error: '`locales` sets `path`, `include` and `language` for each locale; remove them.',
	})
	.refine(hasOneIntro, introSource);

const frontmatterField = z.enum(['title', 'description', 'url', 'image', 'lang']);

const optionsSchema = z
	.object({
		include: z.array(z.string()),
		exclude: z.array(z.string()),
		contentSelector: z.union([selector, z.array(selector).min(1)]),
		removeSelectors: z.array(selector),
		keepSelectors: z.array(selector),
		defaultRemoveSelectors: z.boolean(),
		frontmatter: z.union([z.boolean(), z.array(frontmatterField)]),
		jsonLd: z.boolean(),
		absoluteUrls: z.boolean(),
		markdown: z
			.object({
				bullet: z.enum(['*', '+', '-']),
				bulletOrdered: z.enum(['.', ')']),
				closeAtx: z.boolean(),
				emphasis: z.enum(['*', '_']),
				fence: z.enum(['`', '~']),
				fences: z.boolean(),
				incrementListMarker: z.boolean(),
				listItemIndent: z.enum(['mixed', 'one', 'tab']),
				quote: z.enum(['"', "'"]),
				resourceLink: z.boolean(),
				rule: z.enum(['*', '-', '_']),
				ruleRepetition: z.number().int().min(3),
				ruleSpaces: z.boolean(),
				setext: z.boolean(),
				strong: z.enum(['*', '_']),
				tightDefinitions: z.boolean(),
			})
			.partial()
			.strict(),
		rehypePlugins: pluggableList,
		remarkPlugins: pluggableList,
		transform: fn<MarkdownTransform>(),
		outputPath: z.enum(['sibling', 'nested']),
		alternateLink: z.boolean(),
		llmsTxt: z.union([z.boolean(), llmsTxtOptions, z.array(llmsTxtOptions).min(1)]),
		contentNegotiation: z.boolean(),
		contentSignal: z.union([
			z.literal(false),
			headerValue,
			z.object({ aiTrain: z.boolean(), search: z.boolean(), aiInput: z.boolean() }).partial().strict(),
		]),
		cloudflare: z.union([
			z.boolean(),
			z
				.object({ headers: z.boolean(), worker: z.boolean(), negotiation: z.enum(['rewrite', 'redirect']) })
				.partial()
				.strict(),
		]),
		middleware: z.union([z.boolean(), z.literal('auto')]),
	})
	.partial()
	.strict();

// Compile-time guard keeping the schema in sync with the public interface.
optionsSchema satisfies z.ZodType<AgentMarkdownOptions>;

export function resolveOptions(options: AgentMarkdownOptions = {}): ResolvedOptions {
	const result = optionsSchema.safeParse(options);
	if (!result.success) {
		throw new Error(`[astro-agent-markdown] Invalid options:\n${describeIssues(result.error.issues).join('\n')}`);
	}

	const defaults = options.defaultRemoveSelectors !== false;
	return {
		include: options.include ?? ['**'],
		exclude: [...ALWAYS_EXCLUDED, ...(options.exclude ?? [])],
		conversion: {
			contentSelectors: toArray(options.contentSelector ?? DEFAULT_CONTENT_SELECTORS),
			removeSelectors: [...(defaults ? DEFAULT_REMOVE_SELECTORS : []), ...(options.removeSelectors ?? [])],
			keepSelectors: [...(defaults ? DEFAULT_KEEP_SELECTORS : []), ...(options.keepSelectors ?? [])],
			frontmatter: resolveFrontmatter(options.frontmatter),
			jsonLd: options.jsonLd ?? true,
			absoluteUrls: options.absoluteUrls ?? true,
			markdown: { ...DEFAULT_MARKDOWN_FORMAT, ...options.markdown },
		},
		hooks: {
			rehypePlugins: options.rehypePlugins,
			remarkPlugins: options.remarkPlugins,
			transform: options.transform,
		},
		outputPath: options.outputPath ?? 'sibling',
		alternateLink: options.alternateLink ?? true,
		llmsTxt: resolveLlmsTxt(options.llmsTxt),
		contentNegotiation: options.contentNegotiation ?? true,
		contentSignal: resolveContentSignal(options.contentSignal),
		cloudflare: resolveCloudflare(options.cloudflare),
		middleware: options.middleware ?? 'auto',
	};
}

/** For unions, reports the alternative that got furthest instead of a generic "Invalid input". */
function describeIssues(issues: z.core.$ZodIssue[], prefix: PropertyKey[] = []): string[] {
	const depth = (branch: z.core.$ZodIssue[]) => Math.max(0, ...branch.map((issue) => issue.path.length));
	return issues.flatMap((issue) => {
		const path = [...prefix, ...issue.path];
		if (issue.code === 'invalid_union' && issue.errors.length) {
			const closest = issue.errors.reduce((best, branch) => (depth(branch) > depth(best) ? branch : best));
			if (depth(closest) > 0) return describeIssues(closest, path);
		}
		return [`  - ${path.map(String).join('.') || '(root)'}: ${issue.message}`];
	});
}

function isValidSelector(value: string): boolean {
	try {
		selectAll(value, { type: 'root', children: [] });
		return value.trim() !== '';
	} catch {
		return false;
	}
}

/**
 * hast-util-select silently mismatches complex selectors inside `:not()` and
 * `:is()`: `button:not(h2 button)` matches every button.
 */
function hasComplexArgument(value: string): boolean {
	const source = value.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
	for (const match of source.matchAll(/:(?:not|is)\(/g)) {
		let depth = 0;
		let brackets = 0;
		let compound = '';
		for (const char of source.slice((match.index ?? 0) + match[0].length)) {
			if (char === '[') brackets++;
			else if (char === ']') brackets--;
			else if (char === '(') depth++;
			else if (char === ')' && depth-- === 0) break;
			if (depth > 0 || brackets > 0) continue;
			if (char === ',') compound = '';
			else compound += char;
			if (/[>+~]/.test(char) || /\S\s+\S/.test(compound)) return true;
		}
	}
	return false;
}

function toArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}

function resolveFrontmatter(value: AgentMarkdownOptions['frontmatter']): FrontmatterField[] {
	if (value === false) return [];
	if (value === undefined || value === true) return DEFAULT_FRONTMATTER;
	return [...new Set(value)];
}

function resolveLlmsTxt(value: AgentMarkdownOptions['llmsTxt']): ResolvedLlmsTxt[] {
	if (!value) return [];
	const resolved = toArray(value === true ? {} : value).map(({ locales, ...options }, index) => {
		const path = Array.isArray(value) ? `llmsTxt.${index}` : 'llmsTxt';
		return {
			...resolveLlmsTxtEntry(options, path),
			locales: Boolean(locales),
			localeOptions: Object.fromEntries(
				Object.entries(typeof locales === 'object' ? locales : {}).map(([key, overrides]) => {
					// An intro set for the locale replaces the shared one, whichever option sets it.
					const shared = 'intro' in overrides || 'introFile' in overrides ? omitIntro(options) : options;
					return [key, resolveLlmsTxtEntry({ ...shared, ...overrides }, `${path}.locales.${key}`)];
				}),
			),
		};
	});
	// Without `locales`, file paths are known now: report duplicates early.
	if (!resolved.some((entry) => entry.locales)) resolveLlmsTxtFiles(resolved, undefined);
	return resolved;
}

/** Resolves the options of one file; `path` names them in errors. */
function resolveLlmsTxtEntry(
	{ full, ...options }: Omit<LlmsTxtOptions, 'locales'>,
	path: string,
): ResolvedLlmsTxtEntry {
	// Checked after locale overrides are merged, as `sections` may come from the shared options.
	if (options.sectionOrder?.length && options.sections !== 'auto') {
		throw invalid(
			`${path}.sectionOrder`,
			"needs `sections: 'auto'`. Explicit sections are listed in the order they are given.",
		);
	}
	return {
		...options,
		include: options.include ?? ['**'],
		exclude: options.exclude ?? [],
		sections: options.sections ?? [],
		sectionOrder: options.sectionOrder ?? [],
		optional: options.optional ?? [],
		crossLinks: options.crossLinks ?? true,
		index: options.index ?? true,
		full: resolveLlmsFullTxt(full),
	};
}

function omitIntro<T extends Pick<LlmsTxtOptions, 'intro' | 'introFile'>>({ intro, introFile, ...rest }: T) {
	return rest;
}

function resolveLlmsFullTxt(value: LlmsTxtOptions['full']): ResolvedLlmsFullTxt | null {
	if (!value) return null;
	const { pageHeader = 'source', optional = false, dedupe = false, maxSize = 512_000 } = value === true ? {} : value;
	const { minShare = 0.5, minPages = 3 } = dedupe === true ? {} : dedupe || {};
	return { pageHeader, optional, dedupe: dedupe ? { minShare, minPages } : null, maxSize: maxSize || null };
}

/**
 * Resolves the index files to write, one per locale for `locales: true`.
 * Throws when two of them share a path.
 */
export function resolveLlmsTxtFiles(entries: ResolvedLlmsTxt[], i18n: AstroConfig['i18n']): LlmsTxtFile[] {
	const files = entries.flatMap(({ locales, path, localeOptions, ...shared }): LlmsTxtFile[] => {
		if (!locales) return [{ ...shared, ...filePaths(path ?? '/llms.txt') }];
		if (!i18n) throw invalid('llmsTxt.locales', 'needs the `i18n` option of the Astro config.');

		const prefixDefaultLocale = typeof i18n.routing === 'object' && i18n.routing.prefixDefaultLocale;
		const all = i18n.locales.map((locale) =>
			typeof locale === 'string'
				? { prefix: locale, code: locale, keys: [locale] }
				: { prefix: locale.path, code: locale.codes[0], keys: [locale.path, ...locale.codes] },
		);
		const keys = all.flatMap((locale) => locale.keys);
		const unknown = Object.keys(localeOptions).find((key) => !keys.includes(key));
		if (unknown) {
			throw invalid(
				`llmsTxt.locales.${unknown}`,
				`is not a locale of the \`i18n\` config. Use one of: ${keys.join(', ')}.`,
			);
		}

		return all.map(({ prefix, code, keys }) => {
			const others = all.filter((other) => other.prefix !== prefix).map((other) => `/${other.prefix}/**`);
			const entry = keys.map((key) => localeOptions[key]).find(Boolean) ?? shared;
			const base = { ...entry, locale: code, include: [`/${prefix}/**`] };
			if (prefix !== i18n.defaultLocale) return { ...base, ...filePaths(`/${prefix}/llms.txt`) };
			if (prefixDefaultLocale) return { ...base, ...filePaths('/llms.txt'), home: `/${prefix}` };
			return { ...base, ...filePaths('/llms.txt'), include: entry.include, exclude: [...others, ...entry.exclude] };
		});
	});

	const paths = files.flatMap((file) => [file.path, ...(file.full ? [file.fullPath] : [])]);
	const duplicate = paths.find((path, index) => paths.indexOf(path) !== index);
	if (duplicate) throw invalid('llmsTxt', `${duplicate} is generated twice.`);
	return files;
}

/** `/en/llms.txt` → `/en/llms-full.txt`, home page `/en` */
function filePaths(path: string): Pick<LlmsTxtFile, 'path' | 'fullPath' | 'home'> {
	const directory = path.slice(0, path.lastIndexOf('/') + 1);
	const name = path.slice(directory.length, -'.txt'.length);
	return { path, fullPath: `${directory}${name}-full.txt`, home: normalizePathname(directory) };
}

function invalid(path: string, message: string): Error {
	return new Error(`[astro-agent-markdown] Invalid options:\n  - ${path}: ${message}`);
}

function resolveCloudflare(value: AgentMarkdownOptions['cloudflare']): Required<CloudflareOptions> | null {
	if (!value) return null;
	const { headers = true, worker = true, negotiation = 'rewrite' } = value === true ? {} : value;
	return { headers, worker, negotiation };
}

function resolveContentSignal(value: AgentMarkdownOptions['contentSignal']): string | null {
	if (!value) return null;
	if (typeof value === 'string') return value;
	const signals: [string, boolean | undefined][] = [
		['ai-train', value.aiTrain],
		['search', value.search],
		['ai-input', value.aiInput],
	];
	const header = signals
		.filter((entry): entry is [string, boolean] => entry[1] !== undefined)
		.map(([name, allowed]) => `${name}=${allowed ? 'yes' : 'no'}`)
		.join(', ');
	return header || null;
}

export function hasConversionHooks(hooks: ConversionHooks): boolean {
	return Boolean(hooks.rehypePlugins?.length || hooks.remarkPlugins?.length || hooks.transform);
}
