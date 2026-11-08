// Starts the resident dashboard in a browser.
//   npm run demo             simulated scenario with presenter controls (no backend needed)
//   npm run demo -- export   static build of the simulated demo in dist-demo/
//   npm run demo:live        live data from the Haven backend (start it with npm run backend:start)
import { spawn } from 'node:child_process';

const live = process.argv.includes('live');
const env = live
  ? { ...process.env, EXPO_PUBLIC_DATA_MODE: 'api', EXPO_PUBLIC_RESIDENT_DASHBOARD: '1' }
  : { ...process.env, EXPO_PUBLIC_DATA_MODE: 'mock' };
// --clear: the env flags differ between modes and Metro caches them across builds.
const args = process.argv.includes('export')
  ? ['expo', 'export', '--clear', '--platform', 'web', '--output-dir', live ? 'dist-live' : 'dist-demo']
  : ['expo', 'start', '--web', '--clear'];
const child = spawn('npx', args, { env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
