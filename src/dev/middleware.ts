import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { AstroIntegrationLogger } from 'astro';
import type { RequestHandler } from '../core/http.js';
import { decodePathname, stripBase } from '../core/routing.js';
import { interceptResponse } from './intercept.js';

export type ConnectMiddleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;

export interface DevMiddlewareOptions {
	handler: RequestHandler;
	base: string;
	publicDir: URL;
	/** Patterns of project routes that serve `.md` URLs themselves. */
	markdownRoutes: () => RegExp[];
	logger: AstroIntegrationLogger;
}

/**
 * Dev server middleware serving Markdown for `/page.md` requests and requests
 * negotiating `text/markdown`. The page is rendered as HTML by Astro and
 * converted with the same options as the static build, hooks included.
 */
export function createDevMiddleware({
	handler,
	base,
	publicDir,
	markdownRoutes,
	logger,
}: DevMiddlewareOptions): ConnectMiddleware {
	const servesItself = (pathname: string): boolean => {
		const route = stripBase(decodePathname(pathname), base);
		if (route === undefined) return false;
		return existsSync(fileURLToPath(new URL(`.${route}`, publicDir))) || markdownRoutes().some((r) => r.test(route));
	};

	return (req, res, next) => {
		if ((req.method !== 'GET' && req.method !== 'HEAD') || !req.url) return next();

		const protocol = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http';
		const url = new URL(req.url, `${protocol}://${req.headers.host ?? 'localhost'}`);
		const match = handler.match(url, req.headers.accept ?? null);
		if (!match || (match.via === 'extension' && servesItself(url.pathname))) return next();

		req.url = `${match.pageUrl.pathname}${match.pageUrl.search}`;
		req.headers.accept = 'text/html';
		delete req.headers['if-none-match'];
		delete req.headers['if-modified-since'];

		interceptResponse(
			res,
			(response) => handler.toMarkdownResponse(response, match),
			(error) => logger.error(`Markdown conversion failed for ${url.pathname}: ${String(error)}`),
		);
		next();
	};
}
