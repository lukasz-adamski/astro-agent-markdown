import { appendVary, isHtml } from '../core/headers.js';
import { prefersMarkdown } from '../core/negotiation.js';
import { type OutputPath, stripBase, toMarkdownPath, withBase } from '../core/routing.js';

/** The part of the Workers static assets binding used here. */
export interface AssetsBinding {
	fetch(request: Request): Promise<Response>;
}

export interface MarkdownWorkerOptions {
	/** Astro `base`. @default '/' */
	base?: string;
	/** Same as the integration's `outputPath`. @default 'sibling' */
	outputPath?: OutputPath;
	/**
	 * How a request negotiating `text/markdown` is answered:
	 * `'rewrite'` serves the Markdown file at the page URL, `'redirect'` sends
	 * a `302` to the `.md` URL.
	 * @default 'rewrite'
	 */
	negotiation?: 'rewrite' | 'redirect';
	/** `Content-Signal` header added to Markdown responses that don't have one. */
	contentSignal?: string | null;
	/** Name of the static assets binding in the Wrangler configuration. @default 'ASSETS' */
	binding?: string;
}

/**
 * Answers a request for the Markdown version of a prerendered page from the
 * static assets. Resolves to `null` when the request doesn't negotiate
 * `text/markdown` or the page has no Markdown file, so it can be used inside
 * an existing Worker.
 */
export async function serveMarkdown(
	request: Request,
	assets: AssetsBinding,
	options: MarkdownWorkerOptions = {},
): Promise<Response | null> {
	const { base = '/', outputPath = 'sibling', negotiation = 'rewrite', contentSignal } = options;
	if (request.method !== 'GET' && request.method !== 'HEAD') return null;
	if (!prefersMarkdown(request.headers.get('accept'))) return null;

	const url = new URL(request.url);
	const pathname = stripBase(url.pathname, base);
	if (pathname === undefined || pathname.endsWith('.md')) return null;

	const markdownUrl = new URL(`${withBase(toMarkdownPath(pathname, outputPath), base)}${url.search}`, url);
	if (negotiation === 'redirect') {
		const exists = await assets.fetch(new Request(markdownUrl, { method: 'HEAD' }));
		if (!isMarkdownAsset(exists)) return null;
		return new Response(null, { status: 302, headers: { location: markdownUrl.href, vary: 'Accept' } });
	}

	const response = await assets.fetch(new Request(markdownUrl, request));
	if (!isMarkdownAsset(response)) return null;

	const headers = new Headers(response.headers);
	if (response.status !== 304) headers.set('content-type', 'text/markdown; charset=utf-8');
	if (contentSignal && !headers.has('content-signal')) headers.set('content-signal', contentSignal);
	appendVary(headers, 'Accept');
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Creates a Worker serving static assets with Markdown content negotiation.
 * HTML responses get `Vary: Accept` so caches keep both variants apart.
 */
export function createMarkdownWorker(options: MarkdownWorkerOptions = {}): {
	fetch(request: Request, env: Record<string, unknown>): Promise<Response>;
} {
	const binding = options.binding ?? 'ASSETS';
	return {
		async fetch(request, env) {
			const assets = env[binding] as AssetsBinding | undefined;
			if (!assets) {
				throw new Error(`[astro-agent-markdown] The "${binding}" static assets binding is not configured.`);
			}

			const markdown = await serveMarkdown(request, assets, options);
			if (markdown) return markdown;

			const response = await assets.fetch(request);
			if (!isHtml(response)) return response;
			const headers = new Headers(response.headers);
			appendVary(headers, 'Accept');
			return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
		},
	};
}

/** `not_found_handling: 'single-page-application'` answers missing files with HTML. */
function isMarkdownAsset(response: Response): boolean {
	return response.status === 304 || (response.ok && !isHtml(response));
}
