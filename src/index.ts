import { createConverter, type MarkdownPage } from './core/converter.js';
import { createPageUrl } from './core/urls.js';
import { type AgentMarkdownOptions, resolveOptions } from './options.js';

export type { MarkdownPage } from './core/converter.js';
export type { PageMetadata } from './core/metadata.js';
export { prefersMarkdown } from './core/negotiation.js';
export { DEFAULT_CONTENT_SELECTORS, DEFAULT_REMOVE_SELECTORS } from './core/selectors.js';
export { default } from './integration.js';
export type {
	AgentMarkdownOptions,
	CloudflareOptions,
	ContentSignal,
	FrontmatterField,
	LlmsTxtOptions,
	MarkdownFormatOptions,
	MarkdownTransform,
	TransformContext,
} from './options.js';

export type HtmlToMarkdownOptions = Pick<
	AgentMarkdownOptions,
	| 'contentSelector'
	| 'removeSelectors'
	| 'defaultRemoveSelectors'
	| 'frontmatter'
	| 'jsonLd'
	| 'absoluteUrls'
	| 'markdown'
	| 'rehypePlugins'
	| 'remarkPlugins'
	| 'transform'
> & {
	/** URL of the page, used to resolve relative links. */
	url?: string | URL;
};

/**
 * Converts an HTML document with the same pipeline as the integration.
 * Resolves to `null` for redirects, pages opted out with `data-markdown-ignore`
 * and pages where no content selector matches.
 */
export async function htmlToMarkdown(html: string, options: HtmlToMarkdownOptions = {}): Promise<MarkdownPage | null> {
	const { url, ...rest } = options;
	const { conversion, hooks } = resolveOptions(rest);
	const pageUrl = url ? new URL(url) : createPageUrl('/', undefined);
	return createConverter(conversion, hooks)({ html, pathname: pageUrl.pathname, url: pageUrl });
}
