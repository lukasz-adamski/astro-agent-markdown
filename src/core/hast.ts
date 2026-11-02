import type { Element, Root } from 'hast';
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

/**
 * Replaces the document with its main content and drops removed elements.
 * Removal selectors are matched against the whole document, so selectors such
 * as `body > header` keep working when the content root is `<body>`.
 *
 * @returns `false` when no content selector matches.
 */
export function selectContent(tree: Root, contentSelectors: string[], removeSelectors: string[]): boolean {
	const content = findFirst(tree, contentSelectors);
	if (!content) return false;

	const removed = new Set(removeSelectors.length ? selectAll(removeSelectors.join(', '), tree) : []);
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
 * annotates highlighted code blocks with their language, unwraps heading
 * permalinks, turns asides into labelled blockquotes, drops links left empty
 * after cleanup and resolves URLs.
 */
export function normalizeContent(tree: Root, base: URL | undefined): void {
	visit(tree, 'element', (node, index, parent) => {
		if (HEADINGS.has(node.tagName)) {
			unwrapFragmentLinks(node);
		} else if (node.tagName === 'pre') {
			annotateCodeLanguage(node);
		} else if (node.tagName === 'aside') {
			asideToBlockquote(node);
		} else if (node.tagName === 'a' && parent && index !== undefined && isEmptyLink(node)) {
			parent.children.splice(index, 1);
			return [SKIP, index];
		}

		if (base) resolveUrls(node, base);
		return undefined;
	});
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
	aside.children.unshift({
		type: 'element',
		tagName: 'p',
		properties: {},
		children: [{ type: 'element', tagName: 'strong', properties: {}, children: [{ type: 'text', value: label }] }],
	});
}

function isEmptyLink(link: Element): boolean {
	return hastToString(link).trim() === '' && !select('img', link);
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
