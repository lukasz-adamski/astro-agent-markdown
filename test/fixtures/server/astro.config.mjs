import node from '@astrojs/node';
import { defineConfig } from 'astro/config';
import agentMarkdown from '../../../dist/index.js';

export default defineConfig({
	output: 'server',
	adapter: node({ mode: 'standalone' }),
	integrations: [agentMarkdown({ contentSignal: { aiTrain: false, search: true, aiInput: true } })],
});
