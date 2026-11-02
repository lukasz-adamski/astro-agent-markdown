export type OutputPath = 'sibling' | 'nested';
export type TrailingSlash = 'always' | 'never' | 'ignore';
export type BuildFormat = 'file' | 'directory' | 'preserve';

export interface RoutingConfig {
	base: string;
	trailingSlash: TrailingSlash;
	buildFormat: BuildFormat;
	outputPath: OutputPath;
}

/**
 * Normalizes a route pathname for matching and mapping:
 * leading slash, no trailing slash, no `.html` or `/index` suffix.
 * `about/`, `/about.html` and `/about/index.html` all become `/about`.
 */
export function normalizePathname(pathname: string): string {
	const normalized = `/${pathname}`
		.replace(/\/{2,}/g, '/')
		.replace(/\.html$/, '')
		.replace(/\/index$/, '/')
		.replace(/\/+$/, '');
	return normalized || '/';
}

/** `/` → `/index.md`, `/docs/intro` → `/docs/intro.md` or `/docs/intro/index.md` */
export function toMarkdownPath(pathname: string, outputPath: OutputPath): string {
	const normalized = normalizePathname(pathname);
	if (normalized === '/') return '/index.md';
	return outputPath === 'nested' ? `${normalized}/index.md` : `${normalized}.md`;
}

/** `/docs/intro.md` and `/docs/intro/index.md` → `/docs/intro` */
export function fromMarkdownPath(markdownPath: string): string {
	return normalizePathname(markdownPath.replace(/\.md$/, ''));
}

/**
 * Public path of a page including `base`, in the form Astro serves it
 * according to `trailingSlash` and `build.format`.
 */
export function toPagePath(pathname: string, config: RoutingConfig): string {
	const normalized = normalizePathname(pathname);
	const base = config.base.replace(/\/+$/, '');
	if (normalized === '/') return base && config.trailingSlash === 'never' ? base : `${base}/`;
	const slash =
		config.trailingSlash === 'always' || (config.trailingSlash === 'ignore' && config.buildFormat === 'directory');
	return `${base}${normalized}${slash ? '/' : ''}`;
}

/**
 * Decodes a request pathname the way Astro does before routing, so filters see
 * `/private/x` whether it was requested as `/private/x` or `/%70rivate/x`.
 */
export function decodePathname(pathname: string): string {
	try {
		return decodeURI(pathname);
	} catch {
		return pathname;
	}
}

/** Removes `base` from a request pathname; `undefined` when outside of `base`. */
export function stripBase(pathname: string, base: string): string | undefined {
	const prefix = base.replace(/\/+$/, '');
	if (!prefix) return pathname;
	if (pathname === prefix) return '/';
	return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : undefined;
}

export function withBase(pathname: string, base: string): string {
	return `${base.replace(/\/+$/, '')}${pathname}`;
}
