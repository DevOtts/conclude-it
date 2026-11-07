// T-A1-05 (do-it 1.1 epic A1-03): conclude-it Step 0 runs `doc-it check archive` and REPORTS; it never fixes and
// changes no file. Without doc-it it prints "[skip] doc-it not installed: check archive" and exits 0.
// Authored by DevOtts.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { script, mkTmp, git, cleanup, DOC_IT } from '../_helpers.mjs';

after(cleanup);

function repoWithFindings() {
  const root = mkTmp('a1-s0-');
  git(root, 'init', '-q', '-b', 'main');
  const done = path.join(root, 'docs', 'implementation', '0-done');
  fs.mkdirSync(path.join(done, 'unclosed'), { recursive: true });
  fs.writeFileSync(path.join(done, 'unclosed', 'status.json'), JSON.stringify({ schema: 1, implementation: 'unclosed', closed: false, waves: [], sessions: [], pieces: [], history: [] }));
  fs.mkdirSync(path.join(done, 'bare'), { recursive: true });
  fs.writeFileSync(path.join(done, 'bare', 'PLAN.md'), '# bare\n');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true }); fs.writeFileSync(path.join(root, 'src', 'a.js'), '');
  const init = spawnSync(process.execPath, [DOC_IT, 'init', '--root', root, '--yes', '--program', 'docs/implementation', '--code', 'src'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'fixture');
  return root;
}

test('T-A1-05 Step 0 on a repo with findings: report lists them; zero files changed (git status clean)', (t) => {
  if (!DOC_IT) { console.log('IMPLEMENTED-NOT-VERIFIED: doc-it not found (set DOC_IT_CLI to doc-it.mjs)'); t.skip('doc-it missing'); return; }
  const root = repoWithFindings();
  const r = script('archive-audit.mjs', ['--repo', root], { env: { DOC_IT_CLI: DOC_IT } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /doc-it check archive: 2 finding\(s\) \(report only; nothing was changed\)/);
  assert.match(r.out, /archived but board not closed[^\n]*\(1\):\n\s+docs\/implementation\/0-done\/unclosed/);
  assert.match(r.out, /archived with no board and no CLOSEOUT\.md[^\n]*\(1\):\n\s+docs\/implementation\/0-done\/bare/);
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '', 'git status clean');
  const j = script('archive-audit.mjs', ['--repo', root, '--json'], { env: { DOC_IT_CLI: DOC_IT } });
  assert.equal(j.code, 0);
  const parsed = JSON.parse(j.out);
  assert.equal(parsed.findings, 2);
  assert.deepEqual(parsed.done_unclosed, ['docs/implementation/0-done/unclosed']);
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '');
});

test('T-A1-05 Step 0 on a home without doc-it: prints [skip] doc-it not installed and exits 0', () => {
  const home = mkTmp('a1-home-');
  const root = mkTmp('a1-s0b-'); git(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'README.md'), 'x\n'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'f');
  // DOC_IT_CLI unset (script() passes a minimal env) and HOME is an empty temp dir.
  const r = script('archive-audit.mjs', ['--repo', root], { env: { HOME: home } });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, '[skip] doc-it not installed: check archive\n');
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '');
  assert.deepEqual(fs.readdirSync(home), []);
});

test('T-A1-05 Step 0 finds an installed doc-it under HOME/.claude/plugins/cache (newest version wins)', (t) => {
  if (!DOC_IT) { t.skip('doc-it missing'); return; }
  const home = mkTmp('a1-home2-');
  const fake = path.join(home, '.claude', 'plugins', 'cache', 'mk', 'doc-it', '0.0.1', 'scripts');
  fs.mkdirSync(fake, { recursive: true });
  // Fixture only: an older, broken copy must lose to the newer real one.
  fs.writeFileSync(path.join(fake, 'doc-it.mjs'), 'process.exit(2)\n');
  const real = path.join(home, '.claude', 'plugins', 'cache', 'mk', 'doc-it', '0.1.0', 'scripts');
  fs.mkdirSync(real, { recursive: true });
  fs.symlinkSync(DOC_IT, path.join(real, 'doc-it.mjs'));
  const root = repoWithFindings();
  const r = script('archive-audit.mjs', ['--repo', root], { env: { HOME: home } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /2 finding\(s\)/);
});

function noisyRepo(n) {
  const root = mkTmp('a1-noisy-');
  const done = path.join(root, 'docs', 'implementation', '0-done');
  for (let i = 0; i < n; i++) { fs.mkdirSync(path.join(done, `legacy${String(i).padStart(3, '0')}`), { recursive: true }); fs.writeFileSync(path.join(done, `legacy${String(i).padStart(3, '0')}`, 'PLAN.md'), 'x'); }
  for (let i = 0; i < 3; i++) { fs.mkdirSync(path.join(done, `open${i}`), { recursive: true }); fs.writeFileSync(path.join(done, `open${i}`, 'status.json'), JSON.stringify({ closed: false })); }
  fs.mkdirSync(path.join(root, '.doc-it'), { recursive: true });
  fs.writeFileSync(path.join(root, '.doc-it', 'config.json'), JSON.stringify({ version: 1, roles: { program: ['docs/implementation'] } }));
  return root;
}

test('T-A1-05 Step 0 on a noisy archive (200 legacy packages) stays within ~15 lines and lists done_unclosed in full', (t) => {
  if (!DOC_IT) { t.skip('doc-it missing'); return; }
  const root = noisyRepo(200);
  const r = script('archive-audit.mjs', ['--repo', root], { env: { DOC_IT_CLI: DOC_IT } });
  assert.equal(r.code, 0, r.err);
  const lines = r.out.trim().split('\n');
  assert.ok(lines.length <= 15, `${lines.length} lines:\n${r.out}`);
  for (const i of [0, 1, 2]) assert.match(r.out, new RegExp(`0-done/open${i}\\b`));
  assert.match(r.out, /done_without_closeout=200|\(200\)/);
});

test('T-A1-05 Step 0 with a doc-it that lacks --summary falls back: done_unclosed list plus counts, still within ~15 lines', () => {
  const root = noisyRepo(200);
  const fake = path.join(mkTmp('a1-old-'), 'doc-it.mjs');
  // Fixture only: an "older doc-it" that ignores unknown flags and has no --summary in its help.
  fs.writeFileSync(fake, `const a = process.argv.slice(2);
if (a.includes('--help')) { console.log('doc-it check archive [--root <dir>] [--json]'); process.exit(0); }
const u = ['docs/implementation/0-done/open0', 'docs/implementation/0-done/open1', 'docs/implementation/0-done/open2'];
const w = Array.from({ length: 200 }, (_, i) => 'docs/implementation/0-done/legacy' + i);
console.log(JSON.stringify({ done_unclosed: u, done_without_closeout: w, stale_active: [], unowned: [] }));
process.exit(1);
`);
  const r = script('archive-audit.mjs', ['--repo', root], { env: { DOC_IT_CLI: fake } });
  assert.equal(r.code, 0, r.err);
  const lines = r.out.trim().split('\n');
  assert.ok(lines.length <= 15, `${lines.length} lines`);
  assert.match(r.out, /203 finding\(s\)/);
  assert.match(r.out, /0-done\/open2/);
  assert.match(r.out, /done_without_closeout=200/);
  assert.doesNotMatch(r.out, /legacy17/);
});
