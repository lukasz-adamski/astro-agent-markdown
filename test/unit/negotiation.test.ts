import { describe, expect, it } from 'vitest';
import { prefersMarkdown } from '../../src/core/negotiation.js';

describe('prefersMarkdown', () => {
	it.each([
		['text/markdown', true],
		['text/markdown, text/html;q=0.9', true],
		['text/html, text/markdown', true],
		['TEXT/MARKDOWN; charset=utf-8', true],
		['text/plain, text/markdown;q=0.5, */*;q=0.1', true],
	])('serves Markdown for %s', (accept, expected) => {
		expect(prefersMarkdown(accept)).toBe(expected);
	});

	it.each([
		[null],
		[''],
		['*/*'],
		['text/*'],
		['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'],
		['text/html, text/markdown;q=0.5'],
		['text/markdown;q=0'],
		['text/markdown;q=0.5, */*'],
	])('serves HTML for %s', (accept) => {
		expect(prefersMarkdown(accept)).toBe(false);
	});
});
