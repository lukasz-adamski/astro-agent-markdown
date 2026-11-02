/** Whether a response carries an HTML document. */
export function isHtml(response: Response): boolean {
	return /^text\/html\b/i.test(response.headers.get('content-type') ?? '');
}

/** Adds `value` to the `Vary` header unless already covered. */
export function appendVary(headers: Headers, value: string): void {
	const current = headers.get('vary');
	if (!current) {
		headers.set('vary', value);
		return;
	}
	const values = current.split(',').map((part) => part.trim().toLowerCase());
	if (!values.includes('*') && !values.includes(value.toLowerCase())) {
		headers.set('vary', `${current}, ${value}`);
	}
}
