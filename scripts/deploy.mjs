#!/usr/bin/env node
/**
 * Publishes the committed HEAD to GitHub Pages (branch gh-pages).
 *
 * The build runs in a temporary git worktree, so uncommitted changes in the working
 * folder never reach the live site. Checks run first; nothing is pushed if they fail.
 *
 * Usage: npm run deploy
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// On Windows npm/npx are .cmd files, which Node only runs through a shell.
const shell = process.platform === 'win32';
const run = (cmd, args, cwd = ROOT) =>
  execFileSync(cmd, args, { cwd, shell, stdio: ['ignore', 'pipe', 'inherit'] })
    .toString()
    .trim();
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, shell, stdio: 'inherit' });

const remote = run('git', ['remote', 'get-url', 'origin']);
const sha = run('git', ['rev-parse', '--short', 'HEAD']);
const name = run('git', ['config', 'user.name']);
const email = run('git', ['config', 'user.email']);
const tree = mkdtempSync(join(tmpdir(), 'plinko-deploy-'));

try {
  sh('git', ['worktree', 'add', '--detach', tree, 'HEAD'], ROOT);
  // 'junction' works on Windows without admin rights; other systems ignore the type.
  symlinkSync(join(ROOT, 'node_modules'), join(tree, 'node_modules'), 'junction');
  sh('npm', ['run', 'check'], tree);
  sh('npx', ['vite', 'build'], tree);

  const dist = join(tree, 'dist');
  writeFileSync(join(dist, '.nojekyll'), '');
  sh('git', ['init', '-q', '-b', 'gh-pages'], dist);
  sh('git', ['add', '-A'], dist);
  sh(
    'git',
    [
      '-c',
      `user.name=${name}`,
      '-c',
      `user.email=${email}`,
      'commit',
      '-qm',
      `deploy: build of ${sha}`,
    ],
    dist,
  );
  sh('git', ['push', '-q', '-f', remote, 'gh-pages'], dist);
  console.log(`\nDeployed ${sha} to gh-pages.`);
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', tree], { cwd: ROOT, stdio: 'ignore' });
  rmSync(tree, { recursive: true, force: true });
}
