import { defineConfig } from 'astro/config';
import agentMarkdown from '../../../dist/index.js';

export default defineConfig({
	site: 'https://example.com',
	redirects: { '/old': '/about' },
	integrations: [
		agentMarkdown({
			exclude: ['/private/**'],
			removeSelectors: ['.ad'],
			llmsTxt: { full: true },
			contentSignal: { aiTrain: false, search: true, aiInput: true },
			cloudflare: true,
			transform: (markdown, { pathname }) => (pathname === '/about' ? `${markdown}\n<!-- transformed -->\n` : markdown),
		}),
	],
});
