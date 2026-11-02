import type { LlmsTxtOptions } from '../options.js';
import type { GeneratedPage } from './generate.js';

/**
 * Builds an `llms.txt` index listing every Markdown page.
 * @see https://llmstxt.org
 */
export function createLlmsTxt(pages: GeneratedPage[], options: LlmsTxtOptions, site: string | undefined): string {
	const home = pages.find((page) => page.pathname === '/')?.metadata;
	const title = options.title ?? home?.title ?? (site ? new URL(site).hostname : 'Documentation');
	const description = options.description ?? home?.description;

	const lines = [`# ${singleLine(title)}`, ''];
	if (description) lines.push(`> ${singleLine(description)}`, '');
	lines.push('## Pages', '');
	for (const page of pages) {
		const label = escapeLinkText(singleLine(page.metadata.title ?? page.pathname));
		const summary = page.metadata.description ? `: ${singleLine(page.metadata.description)}` : '';
		lines.push(`- [${label}](${page.href})${summary}`);
	}
	return `${lines.join('\n')}\n`;
}

/**
 * Concatenates the Markdown of every page. Frontmatter blocks separate the
 * documents; pages without one are separated by a thematic break.
 */
export function createLlmsFullTxt(pages: GeneratedPage[]): string {
	const documents = pages.map((page, index) => {
		const markdown = page.markdown.trim();
		return index === 0 || markdown.startsWith('---\n') ? markdown : `---\n\n${markdown}`;
	});
	return `${documents.join('\n\n')}\n`;
}

function singleLine(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function escapeLinkText(value: string): string {
	return value.replace(/[[\]\\]/g, '\\$&');
}
