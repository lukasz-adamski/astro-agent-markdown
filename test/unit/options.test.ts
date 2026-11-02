import { describe, expect, it } from 'vitest';
import { DEFAULT_REMOVE_SELECTORS } from '../../src/core/selectors.js';
import { type AgentMarkdownOptions, resolveOptions } from '../../src/options.js';

describe('resolveOptions', () => {
	it('applies defaults', () => {
		const options = resolveOptions();
		expect(options).toMatchObject({
			include: ['**'],
			exclude: ['/404', '/500'],
			outputPath: 'sibling',
			alternateLink: true,
			llmsTxt: null,
			contentNegotiation: true,
			contentSignal: null,
			cloudflare: null,
			middleware: 'auto',
		});
		expect(options.conversion.removeSelectors).toEqual(DEFAULT_REMOVE_SELECTORS);
		expect(options.conversion.frontmatter).toEqual(['title', 'description', 'url', 'image']);
	});

	it('merges removal selectors and exclusions', () => {
		const options = resolveOptions({ exclude: ['/admin/**'], removeSelectors: ['.ad'], defaultRemoveSelectors: false });
		expect(options.exclude).toEqual(['/404', '/500', '/admin/**']);
		expect(options.conversion.removeSelectors).toEqual(['.ad']);
	});

	it('serializes content signals', () => {
		expect(resolveOptions({ contentSignal: { aiTrain: false, search: true } }).contentSignal).toBe(
			'ai-train=no, search=yes',
		);
		expect(resolveOptions({ contentSignal: 'ai-input=yes' }).contentSignal).toBe('ai-input=yes');
	});

	it('resolves Cloudflare options', () => {
		expect(resolveOptions({ cloudflare: true }).cloudflare).toEqual({
			headers: true,
			worker: true,
			negotiation: 'rewrite',
		});
		expect(resolveOptions({ cloudflare: { worker: false } }).cloudflare).toEqual({
			headers: true,
			worker: false,
			negotiation: 'rewrite',
		});
	});

	it.each([
		[{ cloudflare: { negotiation: 'proxy' } }, 'cloudflare.negotiation'],
		[{ contentSignal: 'search=yes\nX-Injected: 1' }, 'contentSignal'],
		[{ outputPath: 'flat' }, 'outputPath'],
		[{ contentSelector: 'main >' }, 'Invalid CSS selector: main >'],
		[{ removeSelectors: ['[broken'] }, 'removeSelectors.0'],
		[{ frontmatter: ['author'] }, 'frontmatter'],
		[{ unknownOption: true }, 'unknownOption'],
		[{ transform: 'nope' }, 'transform'],
	])('rejects %j', (input, message) => {
		expect(() => resolveOptions(input as AgentMarkdownOptions)).toThrow(message);
	});
});
