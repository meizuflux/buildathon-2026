import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = '1d3c8ee8535951a7443e2d3511d96f3bf03a7b7d';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const paths = git('ls-tree', '-r', '--name-only', source, '--', 'backend').trim().split('\n');
for (const path of paths) {
  const expected = git('show', source + ':' + path).replace(/\r\n/g, '\n');
  const actual = readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
  if (actual !== expected) throw new Error('Backend differs from master source: ' + path);
}
console.log(`${paths.length} backend files match origin/master source ${source.slice(0, 7)}. Current branch: ${git('branch', '--show-current').trim()}.`);
