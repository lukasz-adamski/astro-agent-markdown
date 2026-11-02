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
	// Decorative images: an empty `alt` marks an image as decorative
	'img[alt=""]',
	'img[role="presentation"]',
	'img[role="none"]',
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
	// Skip links: in-page links shown only to screen readers
	'a.sr-only[href^="#"]',
	'a.visually-hidden[href^="#"]',
	'.skip-link',
	// Content hidden from every reader
	'[hidden]',
	'[aria-hidden="true"]',
	// Explicit opt-out
	'[data-markdown-ignore]',
];

/** Elements that are removed even when they match a keep selector. */
const HIDDEN = '[hidden], [aria-hidden="true"], [data-markdown-ignore]';

/**
 * Elements exempt from removal: buttons whose text labels content, such as
 * accordion and tab triggers or disclosure buttons inside headings.
 */
export const DEFAULT_KEEP_SELECTORS = [
	`:is(h1, h2, h3, h4, h5, h6) button:not(${HIDDEN})`,
	`button[aria-expanded]:not(${HIDDEN})`,
	`button[role="tab"]:not(${HIDDEN})`,
];
