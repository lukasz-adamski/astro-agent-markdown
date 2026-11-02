import { config, isDev } from 'virtual:astro-agent-markdown/config';
import type { MiddlewareHandler } from 'astro';
import { createRequestHandler } from '../core/http.js';

const handler = createRequestHandler(config);

/**
 * Negotiates Markdown for on-demand rendered pages and advertises it on HTML
 * responses. `/page.md` requests are served by the injected endpoint,
 * prerendered pages by the files generated at build time and the dev server
 * by its own middleware.
 */
export const onRequest: MiddlewareHandler = async (context, next) => {
	if (isDev || context.isPrerendered) return next();

	const match = handler.match(context.url, context.request.headers.get('accept'));
	if (match?.via === 'accept') return handler.toMarkdownResponse(await next(), match);
	if (match) return next();
	return handler.decorateHtmlResponse(await next(), context.url);
};
