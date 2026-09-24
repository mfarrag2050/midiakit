import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { apiDirectory, DevLaunchError, reportLaunchFailure } from './dev-environment.mjs';

// A separate launcher keeps Studio orchestration out of the API/worker secret environment.
try {
  if (process.argv.length !== 2) throw new DevLaunchError('DEV_STUDIO_USAGE: node apps/api/scripts/dev-studio.mjs');
  const child = spawn('pnpm', ['--filter', '@pf-mediakit/studio', 'exec', 'next', 'dev',
    '-p', '19051', '-H', '127.0.0.1'], {
    cwd: resolve(apiDirectory, '../../../pf-mediakit-studio'),
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME,
      NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_API_BASE: 'http://127.0.0.1:19040',
      // Studio's current client consumes API_URL; BASE remains the requested launch setting.
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:19040',
      NEXT_PUBLIC_API_MOCK: 'false',
    },
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.once('error', reportLaunchFailure);
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143); });
} catch (error) { reportLaunchFailure(error); }
