declare module 'virtual:astro-agent-markdown/config' {
	export const config: import('../core/http.js').HandlerConfig;
	/** `true` when running `astro dev`, which converts pages in its own middleware. */
	export const isDev: boolean;
	/** Patterns of on-demand rendered pages, matched against pathnames without `base`. */
	export const onDemandRoutes: RegExp[];
}
