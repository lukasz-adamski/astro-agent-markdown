import { execFileSync } from 'node:child_process';

/** Integration fixtures load the integration from `dist`, so build it first. */
export default function setup(): void {
	execFileSync('pnpm', ['run', '--silent', 'build'], { stdio: 'inherit' });
}
