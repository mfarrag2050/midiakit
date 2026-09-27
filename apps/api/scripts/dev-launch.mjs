import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  apiDirectory, assertInheritedEnvironment, cleanDevEnvironment,
  DevLaunchError, readLocalEnvironment, reportLaunchFailure,
} from './dev-environment.mjs';

function launch(target) {
  if (!['api', 'worker', 'backup'].includes(target) || process.argv.length !== 3) {
    throw new DevLaunchError('DEV_LAUNCH_USAGE: node apps/api/scripts/dev-launch.mjs api|worker|backup');
  }
  assertInheritedEnvironment(process.env);
  const environment = cleanDevEnvironment(process.env, readLocalEnvironment());
  if (target === 'backup' && !(environment.PATH ?? '').split(':').includes('/opt/homebrew/opt/libpq/bin')) {
    environment.PATH = `/opt/homebrew/opt/libpq/bin:${environment.PATH ?? ''}`;
  }
  const entry = { api: 'src/server.ts', worker: '../renderer/src/api-worker.ts', backup: 'src/workers/backup-worker.ts' }[target];
  const guard = fileURLToPath(new URL('./dev-startup.mjs', import.meta.url));
  const child = spawn(process.execPath, ['--import', guard, '--import', 'tsx', resolve(apiDirectory, entry)], {
    cwd: target === 'api' ? apiDirectory : resolve(apiDirectory, '../..'),
    env: environment, stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.once('error', reportLaunchFailure);
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143); });
}

try { launch(process.argv[2]); }
catch (error) { reportLaunchFailure(error); }
