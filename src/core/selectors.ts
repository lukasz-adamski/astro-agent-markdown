/** Candidates for the main content of a page, tried in order. */
export const DEFAULT_CONTENT_SELECTORS = ['[data-markdown-content]', 'main', '[role="main"]', 'body'];

/** Elements that carry no meaningful content for a Markdown reader. */
export const DEFAULT_REMOVE_SELECTORS = [
	// Non-content and embedded resources
	'script',
	'style',
	'noscript',
	'template',
	'link',
	'meta',
	'iframe',
	'object',
	'embed',
	'canvas',
	'svg',
	'img[src^="data:"]',
	// Site chrome and interactive controls
	'nav',
	'body > header',
	'footer',
	'[role="navigation"]',
	'[role="search"]',
	'[role="banner"]',
	'[role="contentinfo"]',
	'form',
	'button',
	'input',
	'select',
	'textarea',
	'dialog',
	// Hidden and assistive-only content
	'[hidden]',
	'[aria-hidden="true"]',
	'.sr-only',
	'.visually-hidden',
	// Explicit opt-out
	'[data-markdown-ignore]',
];
