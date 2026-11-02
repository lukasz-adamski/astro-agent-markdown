/** Origin used when the public origin of a page is unknown (static build without `site`). */
const PLACEHOLDER_ORIGIN = 'http://localhost.invalid';

/**
 * Creates the URL of a page. Without a known origin, URLs resolved against it
 * become root-relative.
 */
export function createPageUrl(path: string, origin: string | URL | undefined): URL {
	return new URL(path, origin ?? PLACEHOLDER_ORIGIN);
}

export function hasPublicOrigin(url: URL): boolean {
	return url.origin !== PLACEHOLDER_ORIGIN;
}

/**
 * Resolves `value` against `base`. Fragment-only references and unparsable
 * values are returned unchanged.
 */
export function resolveUrl(value: string, base: URL): string {
	if (value.startsWith('#')) return value;
	let url: URL;
	try {
		url = new URL(value, base);
	} catch {
		return value;
	}
	return hasPublicOrigin(url) ? url.href : `${url.pathname}${url.search}${url.hash}`;
}
