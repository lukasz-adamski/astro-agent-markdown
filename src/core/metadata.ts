import type { Element, Root } from 'hast';
import { select, selectAll } from 'hast-util-select';
import { toString as hastToString } from 'hast-util-to-string';
import { resolveUrl } from './urls.js';

export interface PageMetadata {
	title?: string;
	description?: string;
	/** Canonical URL of the page. */
	url?: string;
	/** Social preview image. */
	image?: string;
	/** Value of `<html lang>`. */
	lang?: string;
	/** Contents of `<script type="application/ld+json">` blocks. */
	jsonLd: string[];
	/** The page opted out with `data-markdown-ignore` on `<html>` or `<body>`. */
	ignored: boolean;
	/** The page is a `<meta http-equiv="refresh">` redirect. */
	redirect: boolean;
}

/**
 * Reads page-level metadata from a parsed HTML document. Standard `<meta name>`
 * tags take precedence over their Open Graph and Twitter counterparts.
 * URLs are resolved against `pageUrl`, which is also the fallback `url`.
 */
export function extractMetadata(tree: Root, pageUrl: URL): PageMetadata {
	const image = firstContent(tree, ['meta[property="og:image"]', 'meta[name="twitter:image"]']);
	const canonical =
		attribute(select('link[rel~="canonical"][href]', tree), 'href') ?? firstContent(tree, ['meta[property="og:url"]']);
	const lang = attribute(select('html[lang]', tree), 'lang');

	return {
		title:
			firstContent(tree, ['meta[name="title"]', 'meta[property="og:title"]', 'meta[name="twitter:title"]']) ??
			textContent(select('head > title', tree)),
		description: firstContent(tree, [
			'meta[name="description"]',
			'meta[property="og:description"]',
			'meta[name="twitter:description"]',
		]),
		url: resolveUrl(canonical ?? pageUrl.href, pageUrl),
		image: image && resolveUrl(image, pageUrl),
		lang,
		jsonLd: selectAll('script[type="application/ld+json"]', tree)
			.map((script) => normalizeJson(hastToString(script)))
			.filter((json) => json !== ''),
		ignored: Boolean(select('html[data-markdown-ignore], body[data-markdown-ignore]', tree)),
		redirect: Boolean(select('meta[http-equiv="refresh" i]', tree)),
	};
}

function firstContent(tree: Root, selectors: string[]): string | undefined {
	for (const selector of selectors) {
		const value = attribute(select(selector, tree), 'content');
		if (value) return value;
	}
	return undefined;
}

function attribute(element: Element | undefined, name: string): string | undefined {
	const value = element?.properties[name];
	if (value === undefined || value === null || value === false) return undefined;
	return clean(Array.isArray(value) ? value.join(' ') : String(value));
}

function textContent(element: Element | undefined): string | undefined {
	return element && clean(hastToString(element));
}

function clean(value: string): string | undefined {
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized || undefined;
}

/** Minifies valid JSON so multiple blocks can be listed one per line. */
function normalizeJson(source: string): string {
	const trimmed = source.trim();
	try {
		return JSON.stringify(JSON.parse(trimmed));
	} catch {
		return trimmed;
	}
}
