import { z } from 'astro/zod';
import { selectAll } from 'hast-util-select';
import type { Options as StringifyOptions } from 'remark-stringify';
import type { PluggableList } from 'unified';
import type { PageMetadata } from './core/metadata.js';
import { DEFAULT_CONTENT_SELECTORS, DEFAULT_REMOVE_SELECTORS } from './core/selectors.js';

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

export interface LlmsTxtOptions {
	/** Top-level heading. Defaults to the title of the home page. */
	title?: string;
	/** Short summary rendered as a blockquote. Defaults to the description of the home page. */
	description?: string;
	/**
	 * Also emit `llms-full.txt` containing the Markdown of every page.
	 * @default false
	 */
	full?: boolean;
}

export interface CloudflareOptions {
	/**
	 * Add a `_headers` rule serving `.md` files as `text/markdown; charset=utf-8`,
	 * with the `contentSignal` header when configured.
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
	 * `/404` and `/500` are always excluded.
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
	 * Keep the built-in list of removed elements (scripts, navigation, forms,
	 * hidden elements, `[data-markdown-ignore]`, …).
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
	 * Rehype plugins run on the cleaned HTML tree before conversion.
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
	 * Generate an `llms.txt` index of all Markdown pages at build time.
	 * @see https://llmstxt.org
	 * @default false
	 */
	llmsTxt?: boolean | LlmsTxtOptions;
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

export interface ResolvedOptions {
	include: string[];
	exclude: string[];
	conversion: ConversionOptions;
	hooks: ConversionHooks;
	outputPath: 'sibling' | 'nested';
	alternateLink: boolean;
	llmsTxt: LlmsTxtOptions | null;
	contentNegotiation: boolean;
	contentSignal: string | null;
	cloudflare: Required<CloudflareOptions> | null;
	middleware: boolean | 'auto';
}

export const DEFAULT_FRONTMATTER: FrontmatterField[] = ['title', 'description', 'url', 'image'];

export const DEFAULT_MARKDOWN_FORMAT: MarkdownFormatOptions = { bullet: '-', rule: '-' };

const ALWAYS_EXCLUDED = ['/404', '/500'];

const fn = <T>() => z.custom<T>((value) => typeof value === 'function', 'Expected a function');
const pluggableList = z.custom<PluggableList>(Array.isArray, 'Expected an array of plugins');
const headerValue = z
	.string()
	.regex(/^[\x20-\x7e]+$/, 'Expected printable ASCII characters only (a valid HTTP header value)');
const selector = z
	.string()
	.refine(isValidSelector, { error: (issue) => `Invalid CSS selector: ${String(issue.input)}` });
const frontmatterField = z.enum(['title', 'description', 'url', 'image', 'lang']);

const optionsSchema = z
	.object({
		include: z.array(z.string()),
		exclude: z.array(z.string()),
		contentSelector: z.union([selector, z.array(selector).min(1)]),
		removeSelectors: z.array(selector),
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
		llmsTxt: z.union([
			z.boolean(),
			z.object({ title: z.string(), description: z.string(), full: z.boolean() }).partial().strict(),
		]),
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

	return {
		include: options.include ?? ['**'],
		exclude: [...ALWAYS_EXCLUDED, ...(options.exclude ?? [])],
		conversion: {
			contentSelectors: toArray(options.contentSelector ?? DEFAULT_CONTENT_SELECTORS),
			removeSelectors: [
				...(options.defaultRemoveSelectors === false ? [] : DEFAULT_REMOVE_SELECTORS),
				...(options.removeSelectors ?? []),
			],
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

function toArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}

function resolveFrontmatter(value: AgentMarkdownOptions['frontmatter']): FrontmatterField[] {
	if (value === false) return [];
	if (value === undefined || value === true) return DEFAULT_FRONTMATTER;
	return [...new Set(value)];
}

function resolveLlmsTxt(value: AgentMarkdownOptions['llmsTxt']): LlmsTxtOptions | null {
	if (!value) return null;
	return value === true ? {} : value;
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
