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

test('A1-H2 an empty board: status-write close --move directly and S4 both refuse without an owner note', () => {
  const r = mkBoardRepo({ tasks: [] });
  const before = tree(r.root);
  const direct = sw(['close', '--by', 'conclude-it', '--move', '--file', r.file], r.root);
  assert.equal(direct.code, 1, direct.out); assert.match(direct.err, /no tasks, so nothing is verified/);
  const res = S4(['--repo', r.root, '--impl', 'pkg']);
  assert.equal(res.code, 1); assert.match(res.err, /^REJECTED: .*no tasks/);
  assert.deepEqual(tree(r.root), before); assert.equal(fs.existsSync(doneDir(r)), false);
});

// A real git repo with a committed board for package demo (T-1, T-2 not started).
function trackedBoardRepo() {
  const root = mkTmp('a1-m1-');
  git(root, 'init', '-q', '-b', 'main');
  const dir = path.join(root, 'docs', 'implementations', 'demo');
  fs.mkdirSync(dir, { recursive: true });
  const plan = path.join(root, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ implementation: 'demo', waves: [{ id: 'W1', title: 'W', tasks: [{ id: 'T-1', title: 'a' }, { id: 'T-2', title: 'b' }] }], pieces: [] }));
  assert.equal(sw(['init', '--file', path.join(dir, 'status.json'), '--plan', plan, '--by', 'plan-it'], root).code, 0);
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'board');
  const rows = path.join(mkTmp('rows-'), 'rows.json');
  fs.writeFileSync(rows, JSON.stringify([{ piece: 'Core', disposition: 'shipped', detail: 'yes' }]));
  return { root, dir, rows };
}

test('A1-M1 a tracked status.json deleted from the working tree: DENIED (board deleted), never the CLOSEOUT path', (t) => {
  if (noDocIt(t)) return;
  const r = trackedBoardRepo();
  for (const f of ['status.json', 'STATUS.md']) fs.rmSync(path.join(r.dir, f), { force: true });
  const before = tree(r.root);
  const res = S4(['--repo', r.root, '--impl', 'demo', '--closeout-rows', r.rows], docItEnv());
  assert.equal(res.code, 1, res.out + res.err);
  assert.match(res.err, /^DENIED: board deleted: docs\/implementations\/demo\/status\.json is tracked at HEAD/);
  assert.equal(fs.existsSync(path.join(r.dir, 'CLOSEOUT.md')), false, 'no CLOSEOUT written');
  assert.deepEqual(tree(r.root), before);
});

test('A1-M1 a board whose deletion was committed still exists in history: DENIED, even with a hand-written CLOSEOUT', (t) => {
  if (noDocIt(t)) return;
  const r = trackedBoardRepo();
  git(r.root, 'rm', '-q', '-r', 'docs/implementations/demo/status.json');
  git(r.root, 'commit', '-q', '-m', 'drop board');
  fs.writeFileSync(path.join(r.dir, 'CLOSEOUT.md'), '# CLOSEOUT: demo\n\n| Piece | Disposition | Evidence or reason | Backlog link |\n|---|---|---|---|\n| Core | dropped | superseded by the new design | |\n');
  const res = S4(['--repo', r.root, '--impl', 'demo'], docItEnv());
  assert.equal(res.code, 1); assert.match(res.err, /^DENIED: board deleted: .* existed in commit [0-9a-f]{12}/);
  assert.ok(fs.existsSync(r.dir)); assert.equal(fs.existsSync(path.join(path.dirname(r.dir), '0-done')), false);
});

test('A1-M2 S4 CLOSEOUT rows with shipped "yes" or dropped "." are REJECTED by doc-it; nothing written or moved', (t) => {
  if (noDocIt(t)) return;
  for (const row of [{ piece: 'Core', disposition: 'shipped', detail: 'yes' }, { piece: 'Core', disposition: 'dropped', detail: '.' }]) {
    const root = mkTmp('a1-m2-');
    const dir = path.join(root, 'docs', 'implementations', 'demo'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'PLAN.md'), '# demo\n');
    const rows = path.join(root, 'rows.json'); fs.writeFileSync(rows, JSON.stringify([row]));
    const before = tree(root);
    const res = S4(['--repo', root, '--impl', 'demo', '--closeout-rows', rows], docItEnv());
    assert.equal(res.code, 1, res.out + res.err);
    assert.match(res.err, /^REJECTED: CLOSEOUT refused by doc-it check closeout/);
    assert.deepEqual(tree(root), before);
  }
});
