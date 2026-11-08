// CP-03 adversarial review regressions (do-it 1.1, archive A1, G-2). Each case replays the reviewer's attack against
// S4 (archive-package) with the REAL status-write (DOIT_STATUS_WRITE) and the REAL doc-it (DOC_IT_CLI), and asserts a
// refusal with nothing moved. Authored by DevOtts (https://github.com/DevOtts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkBoardRepo, script, mkTmp, tree, git, sw, cleanup, DOC_IT } from '../_helpers.mjs';

after(cleanup);
const S4 = (args, env) => script('archive-package.mjs', args, { env });
const docItEnv = () => ({ DOC_IT_CLI: DOC_IT });
const noDocIt = (t) => { if (DOC_IT) return false; console.log('IMPLEMENTED-NOT-VERIFIED: doc-it not found (set DOC_IT_CLI to doc-it.mjs)'); t.skip('doc-it missing'); return true; };
const hand = (r, f) => { const d = r.read(); f(d); fs.writeFileSync(r.file, JSON.stringify(d, null, 2) + '\n'); };
const doneDir = (r) => path.join(path.dirname(r.dir), '0-done');

test('A1-H1 a hand-set closed:true (T-01, T-02 not started) through S4: REJECTED as tampered, not moved', () => {
  const r = mkBoardRepo();
  hand(r, (d) => { d.closed = true; });
  const before = tree(r.root);
  const res = S4(['--repo', r.root, '--impl', 'pkg'], docItEnv());
  assert.equal(res.code, 1, res.out + res.err);
  assert.match(res.err, /^REJECTED: /);
  assert.match(res.err, /tampered/);
  assert.doesNotMatch(res.out, /CLOSED_MOVED/);
  assert.ok(fs.existsSync(r.dir)); assert.equal(fs.existsSync(doneDir(r)), false);
  assert.deepEqual(tree(r.root), before, 'nothing written or moved');
});

test('A1-H1 a board edited after a real freeze (PARTIAL_FAILED) is REJECTED on the re-run, not moved', () => {
  const r = mkBoardRepo();
  const killed = S4(['--repo', r.root, '--impl', 'pkg', '--owner-note', 'owner accepts both open'], { STATUS_WRITE_TEST_CRASH: 'after-freeze' });
  assert.match(killed.err, /^PARTIAL_FAILED/);
  hand(r, (d) => { d.waves[0].tasks[0].title = 'changed after the freeze'; });
  const res = S4(['--repo', r.root, '--impl', 'pkg']);
  assert.equal(res.code, 1); assert.match(res.err, /^REJECTED: .*tampered/);
  assert.equal(fs.existsSync(doneDir(r)), false);
});

test('A1-H1 a hand-set closed board moved by a bare mv is reported by doc-it check archive (done_closed_unverified)', (t) => {
  if (noDocIt(t)) return;
  const r = mkBoardRepo();
  hand(r, (d) => { d.closed = true; });
  fs.mkdirSync(doneDir(r), { recursive: true }); fs.renameSync(r.dir, path.join(doneDir(r), 'pkg'));
  const init = spawnSync(process.execPath, [DOC_IT, 'init', '--root', r.root, '--yes', '--program', 'docs/implementation'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const c = spawnSync(process.execPath, [DOC_IT, 'check', 'archive', '--root', r.root, '--json'], { encoding: 'utf8' });
  assert.equal(c.status, 1, c.stdout);
  assert.deepEqual(JSON.parse(c.stdout).done_closed_unverified, ['docs/implementation/0-done/pkg']);
  const a = script('archive-audit.mjs', ['--repo', r.root], { env: docItEnv() });
  assert.match(a.out, /doc-it check archive: 1 finding\(s\)/);
});
