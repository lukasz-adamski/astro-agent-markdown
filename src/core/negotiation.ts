const MARKDOWN = 'text/markdown';
const HTML = 'text/html';

interface MediaRange {
	type: string;
	quality: number;
}

/**
 * Whether an `Accept` header asks for Markdown: `text/markdown` must be listed
 * explicitly and be at least as preferred as `text/html` (directly or through
 * `text/*` and `*\/*`). Browsers never list `text/markdown`, so they get HTML.
 */
export function prefersMarkdown(accept: string | null | undefined): boolean {
	if (!accept) return false;
	const ranges = parseAccept(accept);
	const markdown = ranges.find((range) => range.type === MARKDOWN)?.quality ?? 0;
	return markdown > 0 && markdown >= qualityOf(ranges, HTML);
}

function qualityOf(ranges: MediaRange[], type: string): number {
	const group = `${type.slice(0, type.indexOf('/'))}/*`;
	const match =
		ranges.find((range) => range.type === type) ??
		ranges.find((range) => range.type === group) ??
		ranges.find((range) => range.type === '*/*');
	return match?.quality ?? 0;
}

function parseAccept(accept: string): MediaRange[] {
	return accept.split(',').flatMap((part) => {
		const [type = '', ...parameters] = part.split(';').map((segment) => segment.trim());
		if (!type) return [];
		const q = parameters.find((parameter) => /^q\s*=/i.test(parameter));
		const quality = q ? Number.parseFloat(q.slice(q.indexOf('=') + 1)) : 1;
		return [{ type: type.toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 }];
	});
}
