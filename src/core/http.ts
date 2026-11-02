import type { ConversionHooks, ConversionOptions } from '../options.js';
import { createConverter } from './converter.js';
import { createPageFilter } from './filter.js';
import { appendVary, isHtml } from './headers.js';
import { prefersMarkdown } from './negotiation.js';
import {
	decodePathname,
	fromMarkdownPath,
	normalizePathname,
	type RoutingConfig,
	stripBase,
	toMarkdownPath,
	toPagePath,
	withBase,
} from './routing.js';
import { createPageUrl } from './urls.js';

/** Serializable configuration shared by the dev server and the on-demand middleware. */
export interface HandlerConfig extends RoutingConfig {
	site: string | undefined;
	include: string[];
	exclude: string[];
	conversion: ConversionOptions;
	contentNegotiation: boolean;
	contentSignal: string | null;
	alternateLink: boolean;
}

export interface MarkdownMatch {
	/** Route pathname of the page, without `base`. */
	pathname: string;
	/** URL of the HTML page that has to be rendered. */
	pageUrl: URL;
	/** `extension` for `/page.md` requests, `accept` for content negotiation. */
	via: 'extension' | 'accept';
}

export interface RequestHandler {
	/** Detects a request for the Markdown version of a page. */
	match(url: URL, accept: string | null): MarkdownMatch | null;
	/** Converts the rendered HTML response of a matched request. */
	toMarkdownResponse(response: Response, match: MarkdownMatch): Promise<Response>;
	/** Adds `Vary` and `Link` headers advertising the Markdown version to successful HTML responses. */
	decorateHtmlResponse(response: Response, url: URL): Response;
}

/** Headers describing the original HTML body, invalid for the converted one. */
const STALE_HEADERS = [
	'content-encoding',
	'content-length',
	'content-range',
	'transfer-encoding',
	'etag',
	'last-modified',
];

export function createRequestHandler(config: HandlerConfig, hooks?: ConversionHooks): RequestHandler {
	const convert = createConverter(config.conversion, hooks);
	const isIncluded = createPageFilter(config.include, config.exclude);

	return {
		match(url, accept) {
			const pathname = stripBase(decodePathname(url.pathname), config.base);
			if (pathname === undefined) return null;

			if (pathname.endsWith('.md')) {
				const page = fromMarkdownPath(pathname);
				if (!isIncluded(page)) return null;
				const pageUrl = new URL(`${toPagePath(page, config)}${url.search}`, url);
				return { pathname: page, pageUrl, via: 'extension' };
			}

			if (config.contentNegotiation && prefersMarkdown(accept) && isIncluded(pathname)) {
				return { pathname: normalizePathname(pathname), pageUrl: url, via: 'accept' };
			}
			return null;
		},

		async toMarkdownResponse(response, match) {
			if (!isHtml(response)) return response;

			const html = await response.text();
			// Without `site`, links become root-relative rather than trusting the `Host` header.
			const { pathname, search } = match.pageUrl;
			const url = createPageUrl(`${pathname}${search}`, config.site);
			const page = await convert({ html, pathname: match.pathname, url });
			if (!page) {
				return match.via === 'accept'
					? new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers })
					: new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
			}

			const headers = new Headers(response.headers);
			for (const name of STALE_HEADERS) headers.delete(name);
			headers.set('content-type', 'text/markdown; charset=utf-8');
			appendVary(headers, 'Accept');
			if (match.via === 'extension') {
				const page = toPagePath(match.pathname, config);
				headers.append('link', `<${config.site ? new URL(page, config.site).href : page}>; rel="canonical"`);
			}
			if (config.contentSignal && !headers.has('content-signal')) {
				headers.set('content-signal', config.contentSignal);
			}
			return new Response(page.markdown, { status: response.status, statusText: response.statusText, headers });
		},

		decorateHtmlResponse(response, url) {
			const pathname = stripBase(decodePathname(url.pathname), config.base);
			if (!response.ok || !isHtml(response) || pathname === undefined || !isIncluded(pathname)) return response;
			if (!config.contentNegotiation && !config.alternateLink) return response;

			const headers = new Headers(response.headers);
			if (config.contentNegotiation) appendVary(headers, 'Accept');
			if (config.alternateLink) {
				const href = withBase(toMarkdownPath(pathname, config.outputPath), config.base);
				headers.append('link', `<${href}>; rel="alternate"; type="text/markdown"`);
			}
			return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
		},
	};
}
