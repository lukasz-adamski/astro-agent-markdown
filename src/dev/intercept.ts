import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';

type Transform = (response: Response) => Promise<Response>;

/** Statuses that must not carry a body, so the Fetch API cannot represent them with one. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * Buffers everything written to `res`, passes it through `transform` as a Fetch
 * `Response` and writes the result instead. If `transform` throws, the original
 * response is sent unchanged.
 */
export function interceptResponse(res: ServerResponse, transform: Transform, onError: (error: unknown) => void): void {
	const original = { writeHead: res.writeHead, write: res.write, end: res.end };
	const chunks: Buffer[] = [];

	const collect = (chunk: unknown, encoding?: unknown) => {
		if (chunk === undefined || chunk === null || typeof chunk === 'function') return;
		chunks.push(
			typeof chunk === 'string'
				? Buffer.from(chunk, typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8')
				: Buffer.from(chunk as Uint8Array),
		);
	};

	res.writeHead = function writeHead(statusCode: number, ...rest: unknown[]) {
		res.statusCode = statusCode;
		const [first, second] = rest;
		if (typeof first === 'string') res.statusMessage = first;
		applyHeaders(res, (typeof first === 'string' ? second : first) as OutgoingHttpHeaders | unknown[] | undefined);
		return res;
	} as ServerResponse['writeHead'];

	res.write = function write(chunk: unknown, encoding?: unknown, callback?: unknown) {
		collect(chunk, encoding);
		const done = [encoding, callback].find((value) => typeof value === 'function') as (() => void) | undefined;
		done?.();
		return true;
	} as ServerResponse['write'];

	res.end = function end(chunk?: unknown, encoding?: unknown, callback?: unknown) {
		collect(chunk, encoding);
		const done = [chunk, encoding, callback].find((value) => typeof value === 'function') as (() => void) | undefined;
		Object.assign(res, original);
		flush()
			.catch((error: unknown) => {
				onError(error);
				if (!res.headersSent) res.statusCode = 500;
				if (!res.writableEnded) res.end();
			})
			.then(done);
		return res;
	} as ServerResponse['end'];

	async function flush(): Promise<void> {
		const body = Buffer.concat(chunks);
		let output: Response | undefined;
		try {
			if (!NULL_BODY_STATUSES.has(res.statusCode)) {
				output = await transform(new Response(body, { status: res.statusCode, headers: toHeaders(res) }));
			}
		} catch (error) {
			onError(error);
		}

		if (!output) {
			res.end(body);
			return;
		}
		for (const name of res.getHeaderNames()) res.removeHeader(name);
		output.headers.forEach((value, name) => {
			if (name !== 'set-cookie') res.setHeader(name, value);
		});
		const cookies = output.headers.getSetCookie();
		if (cookies.length) res.setHeader('set-cookie', cookies);
		res.statusCode = output.status;
		if (output.statusText) res.statusMessage = output.statusText;
		res.end(Buffer.from(await output.arrayBuffer()));
	}
}

function applyHeaders(res: ServerResponse, headers: OutgoingHttpHeaders | unknown[] | undefined): void {
	if (!headers) return;
	if (Array.isArray(headers)) {
		// Raw header list: `[name, value, name, value, …]` or `[[name, value], …]`.
		const pairs = Array.isArray(headers[0])
			? (headers as [string, string][])
			: Array.from({ length: headers.length / 2 }, (_, i) => [headers[i * 2], headers[i * 2 + 1]] as [string, string]);
		for (const [name, value] of pairs) res.appendHeader(name, value);
		return;
	}
	for (const [name, value] of Object.entries(headers)) {
		if (value !== undefined) res.setHeader(name, value);
	}
}

function toHeaders(res: ServerResponse): Headers {
	const headers = new Headers();
	for (const [name, value] of Object.entries(res.getHeaders())) {
		if (value === undefined) continue;
		for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
	}
	return headers;
}
