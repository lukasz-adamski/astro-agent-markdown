import type { AstroConfig, AstroIntegration } from 'astro';
import { writeCloudflareFiles } from './build/cloudflare.js';
import { generateMarkdown } from './build/generate.js';
import { createRequestHandler, type HandlerConfig } from './core/http.js';
import { createDevMiddleware } from './dev/middleware.js';
import { type AgentMarkdownOptions, hasConversionHooks, type ResolvedOptions, resolveOptions } from './options.js';

const NAME = 'astro-agent-markdown';
const VIRTUAL_CONFIG = 'virtual:astro-agent-markdown/config';
const MARKDOWN_ROUTE = '/[...path].md';

type VitePlugin = NonNullable<AstroConfig['vite']['plugins']>[number];

/**
 * Astro integration generating a Markdown version of every page for AI agents
 * and other non-browser clients.
 */
export default function agentMarkdown(userOptions: AgentMarkdownOptions = {}): AstroIntegration {
	const options = resolveOptions(userOptions);
	let config: AstroConfig | undefined;
	let handlerConfig: HandlerConfig | undefined;
	let buildOutput: 'static' | 'server' = 'static';
	let markdownRoutes: RegExp[] = [];
	let onDemandRoutes: RegExp[] = [];

	return {
		name: NAME,
		hooks: {
			'astro:config:setup': ({ config: userConfig, command, addMiddleware, injectRoute, updateConfig, logger }) => {
				if (!shouldInjectMiddleware(options.middleware, userConfig)) return;
				if (hasConversionHooks(options.hooks)) {
					logger.warn(
						'`rehypePlugins`, `remarkPlugins` and `transform` are applied at build time and in dev, ' +
							'but not to on-demand rendered pages.',
					);
				}
				updateConfig({
					vite: {
						plugins: [virtualConfigPlugin(() => ({ config: handlerConfig, isDev: command === 'dev', onDemandRoutes }))],
						ssr: { noExternal: [NAME] },
					},
				});
				addMiddleware({ entrypoint: new URL('./runtime/middleware.js', import.meta.url), order: 'pre' });
				injectRoute({
					pattern: MARKDOWN_ROUTE,
					entrypoint: new URL('./runtime/endpoint.js', import.meta.url),
					prerender: false,
				});
			},

			'astro:config:done': ({ config: resolvedConfig, buildOutput: output }) => {
				config = resolvedConfig;
				buildOutput = output;
				handlerConfig = createHandlerConfig(options, resolvedConfig);
			},

			'astro:routes:resolved': ({ routes }) => {
				markdownRoutes = routes
					.filter((route) => route.pattern.includes('.md') && route.pattern !== MARKDOWN_ROUTE)
					.map((route) => route.patternRegex);
				onDemandRoutes = routes
					.filter((route) => route.type === 'page' && !route.isPrerendered)
					.map((route) => route.patternRegex);
			},

			'astro:server:setup': ({ server, logger }) => {
				if (!config || !handlerConfig) return;
				server.middlewares.use(
					createDevMiddleware({
						handler: createRequestHandler(handlerConfig, options.hooks),
						base: config.base,
						publicDir: config.publicDir,
						markdownRoutes: () => markdownRoutes,
						logger,
					}),
				);
			},

			'astro:build:done': async ({ dir, pages, logger }) => {
				if (!handlerConfig) return;
				await generateMarkdown({
					dir,
					pathnames: pages.map((page) => page.pathname),
					options,
					routing: handlerConfig,
					site: handlerConfig.site,
					logger,
				});
				if (options.cloudflare) {
					await writeCloudflareFiles({
						dir,
						cloudflare: options.cloudflare,
						routing: handlerConfig,
						contentSignal: options.contentSignal,
						contentNegotiation: options.contentNegotiation,
						buildOutput,
						logger,
					});
				}
			},
		},
	};
}

/**
 * The injected `.md` route is rendered on demand, which turns the build into a
 * server build. `'auto'` therefore only injects it when `output` is already
 * `'server'`; projects that mix prerendered and on-demand pages opt in with `true`.
 */
function shouldInjectMiddleware(mode: ResolvedOptions['middleware'], config: AstroConfig): boolean {
	if (mode === 'auto') return config.output === 'server';
	if (mode && !config.adapter) {
		throw new Error(
			'[astro-agent-markdown] `middleware: true` needs an adapter, because it serves on-demand rendered pages. ' +
				'Add an adapter or remove the option.',
		);
	}
	return mode;
}

function createHandlerConfig(options: ResolvedOptions, config: AstroConfig): HandlerConfig {
	return {
		site: config.site,
		base: config.base,
		trailingSlash: config.trailingSlash,
		buildFormat: config.build.format,
		outputPath: options.outputPath,
		include: options.include,
		exclude: options.exclude,
		conversion: options.conversion,
		contentNegotiation: options.contentNegotiation,
		contentSignal: options.contentSignal,
		alternateLink: options.alternateLink,
	};
}

interface RuntimeConfig {
	config: HandlerConfig | undefined;
	isDev: boolean;
	onDemandRoutes: RegExp[];
}

/** Exposes the configuration to the on-demand middleware and endpoint. */
function virtualConfigPlugin(getRuntimeConfig: () => RuntimeConfig): VitePlugin {
	const resolvedId = `\0${VIRTUAL_CONFIG}`;
	const serializeRegExp = ({ source, flags }: RegExp) =>
		`new RegExp(${JSON.stringify(source)}, ${JSON.stringify(flags)})`;
	return {
		name: `${NAME}:config`,
		resolveId: (id: string) => (id === VIRTUAL_CONFIG ? resolvedId : undefined),
		load: (id: string) => {
			if (id !== resolvedId) return undefined;
			const { config, isDev, onDemandRoutes } = getRuntimeConfig();
			return [
				`export const config = ${JSON.stringify(config)};`,
				`export const isDev = ${isDev};`,
				`export const onDemandRoutes = [${onDemandRoutes.map(serializeRegExp).join(', ')}];`,
			].join('\n');
		},
	};
}
