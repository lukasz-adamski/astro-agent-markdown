import type { Element, ElementContent, Root } from 'hast';
import { select, selectAll } from 'hast-util-select';
import { toString as hastToString } from 'hast-util-to-string';
import { SKIP, visit } from 'unist-util-visit';
import { resolveUrl } from './urls.js';

const URL_ATTRIBUTES: Record<string, string[]> = {
	a: ['href'],
	img: ['src'],
	video: ['src', 'poster'],
	audio: ['src'],
	source: ['src'],
};

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Elements that become empty emphasis (`****`) or no-ops when they have no text. */
const INLINE_FORMATTING = new Set(['b', 'strong', 'i', 'em', 's', 'del', 'u', 'mark', 'small', 'span']);

/** Elements allowed in a `<dd>` rendered on the same line as its term. */
const PHRASING = new Set([
	...INLINE_FORMATTING,
	'a',
	'abbr',
	'bdi',
	'bdo',
	'br',
	'button',
	'cite',
	'code',
	'data',
	'dfn',
	'img',
	'ins',
	'kbd',
	'q',
	'samp',
	'sub',
	'sup',
	'time',
	'var',
	'wbr',
]);

const MEDIA = 'img, video, audio, picture';

/** Classes of text shown only to screen readers. */
const VISUALLY_HIDDEN = new Set(['sr-only', 'visually-hidden']);

/**
 * Replaces the document with its main content and drops removed elements,
 * except those matching a keep selector. Selectors are matched against the
 * whole document, so selectors such as `body > header` keep working when the
 * content root is `<body>`.
 *
 * @returns `false` when no content selector matches.
 */
export function selectContent(
	tree: Root,
	contentSelectors: string[],
	removeSelectors: string[],
	keepSelectors: string[] = [],
): boolean {
	const content = findFirst(tree, contentSelectors);
	if (!content) return false;

	const kept = new Set(matchAll(keepSelectors, tree));
	const removed = new Set(matchAll(removeSelectors, tree).filter((node) => !kept.has(node)));
	visit(content, 'element', (node, index, parent) => {
		if (parent && index !== undefined && removed.has(node)) {
			parent.children.splice(index, 1);
			return [SKIP, index];
		}
		return undefined;
	});

	tree.children = [content];
	return true;
}

/**
 * Normalizes markup produced by common Astro tooling so it converts cleanly:
 * annotates highlighted code blocks with their language, drops heading
 * permalinks, turns asides into labelled blockquotes and definition lists into
 * `**term**: details` lines, drops links and formatting left empty after
 * cleanup and resolves URLs.
 */
export function normalizeContent(tree: Root, base: URL | undefined): void {
	visit(tree, 'element', (node, index, parent) => {
		if (HEADINGS.has(node.tagName)) {
			unwrapFragmentLinks(node);
		} else if (node.tagName === 'pre') {
			annotateCodeLanguage(node);
		} else if (node.tagName === 'aside') {
			asideToBlockquote(node);
		} else if (node.tagName === 'dl') {
			definitionListToParagraphs(node);
		} else if (node.tagName === 'button' && !isTextContainer(parent)) {
			// Kept buttons outside of text, such as tabs and accordion triggers, would run together.
			node.tagName = 'p';
		} else if (node.tagName === 'a' && parent && index !== undefined && isRedundantLink(node, parent, index)) {
			parent.children.splice(index, 1);
			return [SKIP, index];
		} else if (node.tagName === 'a' && parent && index !== undefined && node.properties.href === '#') {
			// `href="#"` is a placeholder for script-driven links, with no target.
			parent.children.splice(index, 1, ...node.children);
			return [SKIP, index];
		} else if (INLINE_FORMATTING.has(node.tagName) && parent && index !== undefined && isEmpty(node)) {
			// Unwrapped rather than removed, so whitespace between words survives.
			parent.children.splice(index, 1, ...node.children);
			return [SKIP, index];
		}

		if (base) resolveUrls(node, base);
		return undefined;
	});
}

function isTextContainer(parent: Root | Element | undefined): boolean {
	return (
		parent?.type === 'element' &&
		(parent.tagName === 'p' || HEADINGS.has(parent.tagName) || PHRASING.has(parent.tagName))
	);
}

function matchAll(selectors: string[], tree: Root): Element[] {
	return selectors.length ? selectAll(selectors.join(', '), tree) : [];
}

function findFirst(tree: Root, selectors: string[]): Element | undefined {
	for (const selector of selectors) {
		const element = select(selector, tree);
		if (element) return element;
	}
	return undefined;
}

/** `<h2><a href="#intro">Intro</a></h2>` → `<h2>Intro</h2>` */
function unwrapFragmentLinks(heading: Element): void {
	visit(heading, 'element', (node, index, parent) => {
		const href = node.properties.href;
		if (node.tagName === 'a' && typeof href === 'string' && href.startsWith('#') && parent && index !== undefined) {
			parent.children.splice(index, 1, ...node.children);
			return [SKIP, index];
		}
		return undefined;
	});
}

/**
 * Links left empty after cleanup, and heading permalinks placed after the
 * heading, whose text is only for screen readers:
 * `<h2 id="intro">Intro</h2><a href="#intro"><span class="sr-only">Section titled Intro</span></a>`.
 */
function isRedundantLink(link: Element, parent: Root | Element, index: number): boolean {
	if (isEmpty(link)) return true;
	const href = link.properties.href;
	if (typeof href !== 'string' || !href.startsWith('#') || hasVisibleText(link)) return false;
	const previous = parent.children
		.slice(0, index)
		.findLast((child) => child.type !== 'text' || child.value.trim() !== '');
	return previous?.type === 'element' && HEADINGS.has(previous.tagName) && `#${previous.properties.id}` === href;
}

function hasVisibleText(element: Element): boolean {
	return element.children.some((child) => {
		if (child.type === 'text') return child.value.trim() !== '';
		if (child.type !== 'element' || child.properties.ariaHidden === 'true') return false;
		const hidden = classList(child).some((name) => VISUALLY_HIDDEN.has(name));
		return !hidden && hasVisibleText(child);
	});
}

/** Shiki and Expressive Code expose the language as `data-language` on `<pre>`. */
function annotateCodeLanguage(pre: Element): void {
	const code = pre.children.find((child): child is Element => child.type === 'element' && child.tagName === 'code');
	if (!code) return;

	const codeClasses = classList(code);
	if (codeClasses.some((name) => name.startsWith('language-'))) return;

	const language =
		pre.properties.dataLanguage ??
		classList(pre)
			.find((name) => name.startsWith('language-'))
			?.slice('language-'.length);
	if (typeof language === 'string' && language && language !== 'plaintext') {
		code.properties.className = [...codeClasses, `language-${language}`];
	}
}

/** `<aside aria-label="Tip"><p>Text</p></aside>` → `> **Tip**` + `> Text` */
function asideToBlockquote(aside: Element): void {
	aside.tagName = 'blockquote';
	const label = typeof aside.properties.ariaLabel === 'string' ? aside.properties.ariaLabel.trim() : '';
	if (!label || hastToString(aside).trim().startsWith(label)) return;
	aside.children.unshift(paragraph([strong([textNode(label)])]));
}

/**
 * `<dl><dt>Time</dt><dd>2-4 weeks</dd></dl>` → `**Time**: 2-4 weeks`. Details
 * with block content follow the term in their own paragraphs.
 */
function definitionListToParagraphs(list: Element): void {
	const groups: { terms: Element[]; details: Element[] }[] = [];
	for (const child of definitionItems(list)) {
		const last = groups.at(-1);
		if (child.tagName === 'dt') {
			if (last && !last.details.length) last.terms.push(child);
			else groups.push({ terms: [child], details: [] });
		} else if (last) {
			last.details.push(child);
		} else {
			groups.push({ terms: [], details: [child] });
		}
	}

	list.tagName = 'div';
	list.children = groups.flatMap(({ terms, details }) => {
		const label = terms.length ? [strong(join(terms))] : [];
		if (details.every(isPhrasing)) {
			const text = join(details);
			const separator = label.length && text.length ? [textNode(': ')] : [];
			return [paragraph([...label, ...separator, ...text])];
		}
		return [...(label.length ? [paragraph(label)] : []), ...details.flatMap((detail) => detail.children)];
	});
}

/** `<dt>` and `<dd>` children, including those wrapped in a `<div>` as HTML allows. */
function definitionItems(list: Element): Element[] {
	return list.children.flatMap((child) => {
		if (child.type !== 'element') return [];
		if (child.tagName === 'div') return definitionItems(child);
		return child.tagName === 'dt' || child.tagName === 'dd' ? [child] : [];
	});
}

function isPhrasing(element: Element): boolean {
	return element.children.every(
		(child) => child.type !== 'element' || (PHRASING.has(child.tagName) && isPhrasing(child)),
	);
}

function join(elements: Element[]): ElementContent[] {
	return elements.flatMap((element, index) => [...(index ? [textNode(', ')] : []), ...element.children]);
}

function paragraph(children: ElementContent[]): Element {
	return { type: 'element', tagName: 'p', properties: {}, children };
}

function strong(children: ElementContent[]): Element {
	return { type: 'element', tagName: 'strong', properties: {}, children };
}

function textNode(value: string): ElementContent {
	return { type: 'text', value };
}

/** Links and formatting without text or media, e.g. icon placeholders drawn with CSS. */
function isEmpty(element: Element): boolean {
	return hastToString(element).trim() === '' && !select(MEDIA, element);
}

function resolveUrls(element: Element, base: URL): void {
	for (const attribute of URL_ATTRIBUTES[element.tagName] ?? []) {
		const value = element.properties[attribute];
		if (typeof value === 'string') element.properties[attribute] = resolveUrl(value, base);
	}
}

function classList(element: Element): string[] {
	const value = element.properties.className;
	return Array.isArray(value) ? value.map(String) : [];
}
