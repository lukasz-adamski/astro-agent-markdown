const RESERVED_SCALARS = /^(?:true|false|yes|no|on|off|null|~|[-+]?\.(?:inf|nan))$/i;
const INDICATOR_START = /^[-?:,[\]{}#&*!|>'"%@`\s]/;
const NUMERIC_START = /^[-+.]?\d/;

/** Serializes flat string entries as a YAML frontmatter block. */
export function toFrontmatter(entries: [key: string, value: string][]): string {
	if (entries.length === 0) return '';
	const lines = entries.map(([key, value]) => `${key}: ${toYamlScalar(value)}`);
	return `---\n${lines.join('\n')}\n---`;
}

/**
 * Emits a plain scalar when it is unambiguous, otherwise a double-quoted one.
 * JSON string syntax is valid YAML, which keeps escaping correct.
 */
export function toYamlScalar(value: string): string {
	const plain =
		value !== '' &&
		value === value.trim() &&
		!INDICATOR_START.test(value) &&
		!NUMERIC_START.test(value) &&
		!RESERVED_SCALARS.test(value) &&
		!/\p{Cc}|: | #|:$/u.test(value);
	return plain ? value : JSON.stringify(value);
}
