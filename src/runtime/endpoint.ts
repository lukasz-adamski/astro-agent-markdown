import { config, onDemandRoutes } from 'virtual:astro-agent-markdown/config';
import type { APIRoute } from 'astro';
import { createRequestHandler } from '../core/http.js';
import { stripBase } from '../core/routing.js';

const handler = createRequestHandler(config);

export const prerender = false;

/**
 * Serves `/page.md` for on-demand rendered pages by rendering and converting
 * `/page`. Markdown of prerendered pages is a static file served before routing.
 */
export const GET: APIRoute = async (context) => {
	const match = handler.match(context.url, null);
	const pathname = match && stripBase(match.pageUrl.pathname, config.base);
	if (match?.via !== 'extension' || !pathname || !onDemandRoutes.some((route) => route.test(pathname))) {
		return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
	}
	return handler.toMarkdownResponse(await context.rewrite(match.pageUrl), match);
};
