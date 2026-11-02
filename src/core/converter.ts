import type { Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { VFile } from 'vfile';
import type { ConversionHooks, ConversionOptions, FrontmatterField } from '../options.js';
import { toFrontmatter } from './frontmatter.js';
import { normalizeContent, selectContent } from './hast.js';
import { extractMetadata, type PageMetadata } from './metadata.js';
import { hasPublicOrigin } from './urls.js';

declare module 'vfile' {
	interface DataMap {
		/** Metadata of the page being converted, available to user plugins. */
		page: PageMetadata;
	}
}

export interface ConvertInput {
	html: string;
	/** Route pathname of the page, without `base`. */
	pathname: string;
	/** URL of the page including `base`; may use a placeholder origin (see `createPageUrl`). */
	url: URL;
}

export interface MarkdownPage {
	markdown: string;
	metadata: PageMetadata;
}

/** A converted page with the generated frontmatter and JSON-LD blocks, as included in `markdown`. */
export interface ConvertedPage extends MarkdownPage {
	frontmatter: string;
	jsonLd: string;
}

export type Converter = (input: ConvertInput) => Promise<ConvertedPage | null>;

/**
 * Creates a reusable HTML → Markdown converter. Resolves to `null` for pages
 * that should not have a Markdown version: redirects, pages opted out with
 * `data-markdown-ignore` and pages without a matching content root.
 */
export function createConverter(options: ConversionOptions, hooks: ConversionHooks = {}): Converter {
	const parser = unified().use(rehypeParse);
	const processor = unified()
		.use(hooks.rehypePlugins ?? [])
		.use(rehypeRemark)
		.use(remarkGfm)
		.use(hooks.remarkPlugins ?? [])
		.use(remarkStringify, options.markdown)
		.freeze();

	return async ({ html, pathname, url }) => {
		const tree = parser.parse(html);
		const metadata = extractMetadata(tree, url);
		if (metadata.redirect || metadata.ignored) return null;
		if (!selectContent(tree, options.contentSelectors, options.removeSelectors, options.keepSelectors)) return null;
		normalizeContent(tree, options.absoluteUrls ? url : undefined);

		const file = new VFile({ data: { page: metadata } });
		const mdast = (await processor.run(tree as HastRoot, file)) as MdastRoot;
		const body = processor.stringify(mdast, file).trim();

		const frontmatter = toFrontmatter(frontmatterEntries(metadata, options.frontmatter));
		const jsonLd = options.jsonLd ? jsonLdBlock(metadata.jsonLd) : '';
		let markdown = joinSections([frontmatter, body, jsonLd]);
		if (hooks.transform) {
			const context = { pathname, url: hasPublicOrigin(url) ? url : undefined, metadata };
			markdown = (await hooks.transform(markdown, context)) ?? markdown;
		}
		return { markdown, metadata, frontmatter, jsonLd };
	};
}

function frontmatterEntries(metadata: PageMetadata, fields: FrontmatterField[]): [string, string][] {
	return fields.flatMap((field) => {
		const value = metadata[field];
		return value ? [[field, value] as [string, string]] : [];
	});
}

function jsonLdBlock(scripts: string[]): string {
	return scripts.length ? `\`\`\`json\n${scripts.join('\n')}\n\`\`\`` : '';
}

function joinSections(sections: string[]): string {
	return `${sections.filter(Boolean).join('\n\n')}\n`;
}
