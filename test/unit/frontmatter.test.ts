import { describe, expect, it } from 'vitest';
import { toFrontmatter, toYamlScalar } from '../../src/core/frontmatter.js';

describe('toYamlScalar', () => {
	it.each(['Hello world', 'https://example.com/a?b=c#d', 'Ünïcödé title', 'C# basics', 'Rock & roll'])(
		'keeps %s plain',
		(value) => {
			expect(toYamlScalar(value)).toBe(value);
		},
	);

	it.each([
		'Note: important',
		'yes',
		'No',
		'null',
		'2024',
		'-dash',
		'# heading',
		"'quoted'",
		'"double"',
		'trailing:',
		' padded',
		'a #b',
		'line\nbreak',
		'',
		'.inf',
		'-.Inf',
		'.NaN',
	])('quotes %j', (value) => {
		expect(toYamlScalar(value)).toBe(JSON.stringify(value));
	});
});

describe('toFrontmatter', () => {
	it('renders a YAML block', () => {
		expect(
			toFrontmatter([
				['title', 'Hi'],
				['description', 'A: B'],
			]),
		).toBe('---\ntitle: Hi\ndescription: "A: B"\n---');
	});

	it('renders nothing without entries', () => {
		expect(toFrontmatter([])).toBe('');
	});
});
