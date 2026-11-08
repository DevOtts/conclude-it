// CP-03 round 2 adversarial regressions (do-it 1.1, archive A1, G-2). Each case replays the reviewer's exact commands
// against S4 (archive-package) with the REAL status-write and the REAL doc-it, and asserts a refusal with nothing moved.
// Authored by DevOtts (https://github.com/DevOtts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { script, mkTmp, tree, git, sw, cleanup, DOC_IT } from '../_helpers.mjs';

after(cleanup);
const S4 = (args) => script('archive-package.mjs', args, { env: { DOC_IT_CLI: DOC_IT } });
const noDocIt = (t) => { if (DOC_IT) return false; console.log('IMPLEMENTED-NOT-VERIFIED: doc-it not found (set DOC_IT_CLI to doc-it.mjs)'); t.skip('doc-it missing'); return true; };
const IMPL = 'docs/implementations';

// A real git repo: docs/implementations/demo/ with a committed board (T-1, T-2 not started), STATUS.md and PLAN.md.
// rows-drop.json is a CLOSEOUT row doc-it accepts, so only the board check can stop the move.
function repo() {
  const root = mkTmp('r2-m3-');
  git(root, 'init', '-q', '-b', 'main');
  const dir = path.join(root, IMPL, 'demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'PLAN.md'), '# demo plan\n\nThe demo package.\n');
  const plan = path.join(root, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ implementation: 'demo', waves: [{ id: 'W1', title: 'W', tasks: [{ id: 'T-1', title: 'a' }, { id: 'T-2', title: 'b' }] }], pieces: [] }));
  assert.equal(sw(['init', '--file', path.join(dir, 'status.json'), '--plan', plan, '--by', 'plan-it'], root).code, 0);
  if (!fs.existsSync(path.join(dir, 'STATUS.md'))) fs.writeFileSync(path.join(dir, 'STATUS.md'), '# demo status\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'board');
  const rows = path.join(mkTmp('rows-'), 'rows-drop.json');
  fs.writeFileSync(rows, JSON.stringify([{ piece: 'Core', disposition: 'dropped', detail: 'superseded by the new design' }]));
  return { root, rows, impl: path.join(root, IMPL) };
}
function refused(r, res, before) {
  assert.equal(res.code, 1, res.out + res.err);
  assert.match(res.err, /^DENIED: board deleted: /);
  assert.doesNotMatch(res.out, /CLOSED_MOVED/);
  assert.equal(fs.existsSync(path.join(r.impl, '0-done')), false, 'nothing moved to 0-done');
  assert.deepEqual(tree(r.root), before, 'nothing written or moved');
}

test('R2-A1-M3 (a) git mv demo demo2 + git rm the board in the same commit: DENIED (rename followed), nothing moved', (t) => {
  if (noDocIt(t)) return;
  const r = repo();
  git(r.root, 'mv', `${IMPL}/demo`, `${IMPL}/demo2`);
  git(r.root, 'rm', '-q', '-f', `${IMPL}/demo2/status.json`, `${IMPL}/demo2/STATUS.md`);
  git(r.root, 'commit', '-q', '-m', 'rename and drop board');
  assert.equal(git(r.root, 'status', '--porcelain').trim(), '', 'git status is clean');
  const before = tree(r.root);
  const res = S4(['--repo', r.root, '--impl', 'demo2', '--closeout-rows', r.rows]);
  refused(r, res, before);
  assert.match(res.err, /docs\/implementations\/demo\/status\.json existed in commit [0-9a-f]{12} \(this package's PLAN\.md lived in docs\/implementations\/demo\/; renamed here\)/);
});

test('R2-A1-M3 (b) uncommitted mv demo demo3 + rm the board: DENIED, nothing moved', (t) => {
  if (noDocIt(t)) return;
  const r = repo();
  fs.renameSync(path.join(r.impl, 'demo'), path.join(r.impl, 'demo3'));
  for (const f of ['status.json', 'STATUS.md']) fs.rmSync(path.join(r.impl, 'demo3', f));
  const before = tree(r.root);
  const res = S4(['--repo', r.root, '--impl', 'demo3', '--closeout-rows', r.rows]);
  refused(r, res, before);
  assert.match(res.err, /docs\/implementations\/demo\/status\.json is deleted in the working tree \(uncommitted\)/);
  // the same after `git add -A` (a staged rename + delete)
  git(r.root, 'add', '-A');
  const staged = S4(['--repo', r.root, '--impl', 'demo3', '--closeout-rows', r.rows]);
  assert.equal(staged.code, 1, staged.out); assert.match(staged.err, /^DENIED: board deleted: /);
  assert.equal(fs.existsSync(path.join(r.impl, '0-done')), false);
});

test('R2-A1-M3 (c) --dir docs/implementations/DEMO on a case-insensitive filesystem: DENIED, nothing moved', (t) => {
  if (noDocIt(t)) return;
  const r = repo();
  for (const f of ['status.json', 'STATUS.md']) fs.rmSync(path.join(r.impl, 'demo', f));
  if (!fs.existsSync(path.join(r.impl, 'DEMO'))) { console.log('IMPLEMENTED-NOT-VERIFIED: this filesystem is case-sensitive; --dir DEMO does not open demo/'); t.skip('case-sensitive filesystem'); return; }
  const before = tree(r.root);
  const res = S4(['--repo', r.root, '--dir', `${IMPL}/DEMO`, '--closeout-rows', r.rows]);
  refused(r, res, before);
  assert.match(res.err, /board deleted: docs\/implementations\/demo\/status\.json is tracked at HEAD/, 'reported with the real case');
});

test('R2-A1-M3 a folder renamed only in case after the board was dropped is still DENIED (icase pathspec)', (t) => {
  if (noDocIt(t)) return;
  const r = repo();
  git(r.root, 'rm', '-q', `${IMPL}/demo/status.json`, `${IMPL}/demo/STATUS.md`); git(r.root, 'commit', '-q', '-m', 'drop');
  git(r.root, 'mv', `${IMPL}/demo`, `${IMPL}/tmpname`); git(r.root, 'mv', `${IMPL}/tmpname`, `${IMPL}/Demo`); git(r.root, 'commit', '-q', '-m', 'case');
  const before = tree(r.root);
  const res = S4(['--repo', r.root, '--impl', 'Demo', '--closeout-rows', r.rows]);
  refused(r, res, before);
});

test('R2-A1-M3 control: a package that never had a board still closes through the CLOSEOUT, even beside another package whose board is deleted', (t) => {
  if (noDocIt(t)) return;
  const r = repo();
  fs.rmSync(path.join(r.impl, 'demo', 'status.json')); // unrelated package, folder still on disk
  const other = path.join(r.impl, 'other'); fs.mkdirSync(other); fs.writeFileSync(path.join(other, 'NOTES.md'), '# other, never had a board\n');
  git(r.root, 'add', `${IMPL}/other`); git(r.root, 'commit', '-q', '-m', 'other');
  git(r.root, 'mv', `${IMPL}/other`, `${IMPL}/other2`); git(r.root, 'commit', '-q', '-m', 'rename other');
  const res = S4(['--repo', r.root, '--impl', 'other2', '--closeout-rows', r.rows]);
  assert.equal(res.code, 0, res.out + res.err);
  assert.match(res.out, /^CLOSED_MOVED docs\/implementations\/0-done\/other2/);
});

test('R2-L2 a board never committed (or outside git) deleted: the rendered STATUS.md or plan.json left behind DENIES the CLOSEOUT path', (t) => {
  if (noDocIt(t)) return;
  for (const left of ['STATUS.md', 'plan.json']) {
    const root = mkTmp('r2-l2-'); // no git at all
    const dir = path.join(root, IMPL, 'demo'); fs.mkdirSync(dir, { recursive: true });
    const plan = path.join(root, 'plan.json');
    fs.writeFileSync(plan, JSON.stringify({ implementation: 'demo', waves: [{ id: 'W1', title: 'W', tasks: [{ id: 'T-1', title: 'a' }] }], pieces: [] }));
    assert.equal(sw(['init', '--file', path.join(dir, 'status.json'), '--plan', plan, '--by', 'plan-it'], root).code, 0);
    if (left === 'plan.json') fs.copyFileSync(plan, path.join(dir, 'plan.json'));
    fs.rmSync(path.join(dir, 'status.json'));
    if (left === 'plan.json') fs.rmSync(path.join(dir, 'STATUS.md'), { force: true });
    else assert.ok(fs.readFileSync(path.join(dir, 'STATUS.md'), 'utf8').startsWith('<!-- generated from status.json'), 'the writer rendered STATUS.md');
    const rows = path.join(mkTmp('rows-'), 'rows-drop.json');
    fs.writeFileSync(rows, JSON.stringify([{ piece: 'Core', disposition: 'dropped', detail: 'superseded by the new design' }]));
    const before = tree(root);
    const res = S4(['--repo', root, '--impl', 'demo', '--closeout-rows', rows]);
    assert.equal(res.code, 1, `${left}: ${res.out}${res.err}`);
    assert.match(res.err, new RegExp(`^DENIED: board deleted: .*docs/implementations/demo/${left.replace('.', '\\.')} shows the package had one`));
    assert.deepEqual(tree(root), before, 'nothing written or moved');
  }
  // control: a hand-written legacy STATUS.md (no writer marker) does not block the CLOSEOUT path
  const root = mkTmp('r2-l2-ok-');
  const dir = path.join(root, IMPL, 'legacy'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'STATUS.md'), '# STATUS — legacy\n\nAll done.\n');
  const rows = path.join(mkTmp('rows-'), 'rows-drop.json');
  fs.writeFileSync(rows, JSON.stringify([{ piece: 'Core', disposition: 'dropped', detail: 'superseded by the new design' }]));
  const ok = S4(['--repo', root, '--impl', 'legacy', '--closeout-rows', rows]);
  assert.equal(ok.code, 0, ok.out + ok.err); assert.match(ok.out, /^CLOSED_MOVED/);
});
