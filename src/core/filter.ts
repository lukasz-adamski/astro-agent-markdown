import picomatch from 'picomatch';
import { normalizePathname } from './routing.js';

/** Matches route pathnames against `include` and `exclude` glob patterns. */
export function createPageFilter(include: string[], exclude: string[]): (pathname: string) => boolean {
	const options = { dot: true };
	const isIncluded = picomatch(include.map(normalizePattern), options);
	const isExcluded = exclude.length ? picomatch(exclude.map(normalizePattern), options) : () => false;
	return (pathname) => {
		const normalized = normalizePathname(pathname);
		return isIncluded(normalized) && !isExcluded(normalized);
	};
}

/** Patterns are written like pathnames; `/blog/**` also matches `/blog`. */
function normalizePattern(pattern: string): string {
	const absolute = pattern.startsWith('/') ? pattern : `/${pattern}`;
	return absolute.length > 1 ? absolute.replace(/\/+$/, '') : absolute;
}
