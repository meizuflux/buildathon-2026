// Starts the resident dashboard demo in a browser with simulated data (no backend needed).
//   npm run demo            dev server (Expo web)
//   npm run demo -- export  static build in dist-demo/
import { spawn } from 'node:child_process';

const env = { ...process.env, EXPO_PUBLIC_DATA_MODE: 'mock' };
const args = process.argv.includes('export')
  ? ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-demo']
  : ['expo', 'start', '--web'];
const child = spawn('npx', args, { env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
