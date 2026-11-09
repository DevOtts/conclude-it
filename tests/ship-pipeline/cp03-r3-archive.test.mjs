// CP-03 round 3 adversarial regressions (do-it 1.1, archive A1, G-2). Each case replays the reviewer's exact commands
// against S4 (archive-package) with the REAL status-write and the REAL doc-it, and asserts a refusal with nothing moved.
// Authored by DevOtts (https://github.com/DevOtts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { script, mkTmp, tree, git, sw, verify, cleanup, DOC_IT } from '../_helpers.mjs';

after(cleanup);
const S4 = (args) => script('archive-package.mjs', args, { env: { DOC_IT_CLI: DOC_IT } });
const noDocIt = (t) => { if (DOC_IT) return false; console.log('IMPLEMENTED-NOT-VERIFIED: doc-it not found (set DOC_IT_CLI to doc-it.mjs)'); t.skip('doc-it missing'); return true; };
const IMPL = 'docs/implementations';

// The reviewer's `mkpkg`: <root>/docs/implementations/<name>/ with a board (T-1, T-2 not started) written by the real
// status-write, a STATUS.md and a tracked PLAN.md, committed. plan.json sits outside the package.
function mkpkg(root, name = 'demo') {
  if (!fs.existsSync(path.join(root, '.git'))) git(root, 'init', '-q', '-b', 'main');
  const dir = path.join(root, IMPL, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'PLAN.md'), `# ${name} plan\n\nThe ${name} package: one core piece, two tasks, nothing else.\n`);
  const plan = path.join(root, `plan-${name}.json`);
  fs.writeFileSync(plan, JSON.stringify({ implementation: name, waves: [{ id: 'W1', title: 'W', tasks: [{ id: 'T-1', title: 'a' }, { id: 'T-2', title: 'b' }] }], pieces: [] }));
  assert.equal(sw(['init', '--file', path.join(dir, 'status.json'), '--plan', plan, '--by', 'plan-it'], root).code, 0);
  if (!fs.existsSync(path.join(dir, 'STATUS.md'))) fs.writeFileSync(path.join(dir, 'STATUS.md'), `# ${name} status\n`);
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', `board ${name}`);
  return dir;
}
function rowsDrop() {
  const rows = path.join(mkTmp('rows-'), 'rows-drop.json');
  fs.writeFileSync(rows, JSON.stringify([{ piece: 'Core', disposition: 'dropped', detail: 'we decided not to build this piece' }]));
  return rows;
}
function refused(root, res, before, { code = 1, kind = /^DENIED: board deleted: / } = {}) {
  assert.equal(res.code, code, res.out + res.err);
  assert.match(res.err, kind);
  assert.doesNotMatch(res.out, /CLOSED_MOVED/);
  assert.equal(fs.existsSync(path.join(root, IMPL, '0-done')), false, 'nothing moved to 0-done');
  assert.deepEqual(tree(root), before, 'nothing written or moved');
}

test('R3-A1-M5 (a) git mv demo demo2 + board removed + 301 new files in one commit (beats a 300-file follow cap): DENIED, nothing moved', (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r3-m5a-'); mkpkg(root);
  git(root, 'mv', `${IMPL}/demo`, `${IMPL}/demo2`);
  git(root, 'rm', '-q', '-f', `${IMPL}/demo2/status.json`, `${IMPL}/demo2/STATUS.md`);
  fs.mkdirSync(path.join(root, IMPL, 'demo2', '0'));
  for (let i = 0; i <= 300; i++) fs.writeFileSync(path.join(root, IMPL, 'demo2', '0', `n${String(i).padStart(3, '0')}.md`), `note ${i}\n`);
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'rename, drop board, 301 files');
  assert.equal(git(root, 'status', '--porcelain').trim(), '', 'git status is clean');
  const before = tree(root);
  const res = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  refused(root, res, before);
  assert.match(res.err, /docs\/implementations\/demo\/status\.json was deleted in commit [0-9a-f]{12}, with no close/);
});

test('R3-A1-M5 (b) git mv demo demo2 + board removed + PLAN.md rewritten in one commit (--follow loses it): DENIED, nothing moved', (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r3-m5b-'); mkpkg(root);
  git(root, 'mv', `${IMPL}/demo`, `${IMPL}/demo2`);
  git(root, 'rm', '-q', '-f', `${IMPL}/demo2/status.json`, `${IMPL}/demo2/STATUS.md`);
  fs.writeFileSync(path.join(root, IMPL, 'demo2', 'PLAN.md'), '# Something else entirely\n\nRewritten from scratch so that no rename is detected.\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'rename and rewrite');
  const followed = git(root, 'log', '--follow', '--name-only', '--format=', '--', `${IMPL}/demo2/PLAN.md`).split('\n').filter(Boolean);
  assert.deepEqual([...new Set(followed)], [`${IMPL}/demo2/PLAN.md`], 'git log --follow finds only demo2/PLAN.md (the precondition of the attack)');
  const before = tree(root);
  const res = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  refused(root, res, before);
  assert.match(res.err, /docs\/implementations\/demo\/status\.json was deleted in commit [0-9a-f]{12}/);
  // a stub folder left at the old name does not hide the lost board either
  fs.mkdirSync(path.join(root, IMPL, 'demo')); fs.writeFileSync(path.join(root, IMPL, 'demo', 'README.md'), 'stub\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'stub');
  const before2 = tree(root);
  refused(root, S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]), before2);
});

test('R3-A1-M5 the owner note: one naming a different folder is still DENIED; one naming the lost board lets the CLOSEOUT through, is recorded, and accounts for it later', (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r3-m5n-'); mkpkg(root);
  git(root, 'rm', '-q', '-r', `${IMPL}/demo`); git(root, 'commit', '-q', '-m', 'demo abandoned');
  for (const n of ['p1', 'p2']) { fs.mkdirSync(path.join(root, IMPL, n), { recursive: true }); fs.writeFileSync(path.join(root, IMPL, n, 'NOTES.md'), `# ${n}, never had a board\n`); }
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'p1 p2');
  const before = tree(root);
  refused(root, S4(['--repo', root, '--impl', 'p1', '--closeout-rows', rowsDrop(), '--owner-note', 'demo2 was dropped, see the review notes']), before);
  refused(root, S4(['--repo', root, '--impl', 'p1', '--closeout-rows', rowsDrop()]), before);
  const ok = S4(['--repo', root, '--impl', 'p1', '--closeout-rows', rowsDrop(), '--owner-note', 'demo was abandoned on purpose and is not p1']);
  assert.equal(ok.code, 0, ok.out + ok.err); assert.match(ok.out, /^CLOSED_MOVED docs\/implementations\/0-done\/p1/);
  const co = fs.readFileSync(path.join(root, IMPL, '0-done', 'p1', 'CLOSEOUT.md'), 'utf8');
  assert.match(co, /<!-- archive-package owner-note boards: docs\/implementations\/demo\/status\.json -->/);
  assert.match(co, /demo was abandoned on purpose and is not p1/);
  assert.equal(spawnDocIt(['check', 'closeout', path.join(root, IMPL, '0-done', 'p1', 'CLOSEOUT.md'), '--root', root]), 0, 'the recorded CLOSEOUT still passes doc-it');
  // the recorded note accounts for demo's board: the next package needs no note
  const next = S4(['--repo', root, '--impl', 'p2', '--closeout-rows', rowsDrop()]);
  assert.equal(next.code, 0, next.out + next.err); assert.match(next.out, /^CLOSED_MOVED docs\/implementations\/0-done\/p2/);
});

test('R3-A1-M5 control: a package archived with its board (guarded close into 0-done/, committed) does not block a later CLOSEOUT archive', (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r3-m5c-'); const dir = mkpkg(root);
  verify({ root, dir, file: path.join(dir, 'status.json') }, ['T-1', 'T-2']);
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'verified');
  const closed = S4(['--repo', root, '--impl', 'demo']);
  assert.equal(closed.code, 0, closed.out + closed.err); assert.match(closed.out, /^CLOSED_MOVED docs\/implementations\/0-done\/demo/);
  // before and after the move is committed
  fs.mkdirSync(path.join(root, IMPL, 'p1')); fs.writeFileSync(path.join(root, IMPL, 'p1', 'NOTES.md'), '# p1\n');
  const a = S4(['--repo', root, '--impl', 'p1', '--closeout-rows', rowsDrop()]);
  assert.equal(a.code, 0, a.out + a.err);
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'archived');
  fs.mkdirSync(path.join(root, IMPL, 'p2')); fs.writeFileSync(path.join(root, IMPL, 'p2', 'NOTES.md'), '# p2\n');
  const b = S4(['--repo', root, '--impl', 'p2', '--closeout-rows', rowsDrop()]);
  assert.equal(b.code, 0, b.out + b.err); assert.match(b.out, /^CLOSED_MOVED/);
});

test('R3-L3 git checkout --orphan hides the board from HEAD\'s history (the old branch still has it): DENIED, nothing moved', (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r3-l3-'); mkpkg(root);
  git(root, 'checkout', '-q', '--orphan', 'fresh');
  git(root, 'mv', `${IMPL}/demo`, `${IMPL}/demo2`);
  git(root, 'rm', '-q', '-f', `${IMPL}/demo2/status.json`, `${IMPL}/demo2/STATUS.md`);
  git(root, 'commit', '-q', '-m', 'fresh start');
  const before = tree(root);
  const res = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  refused(root, res, before);
  assert.match(res.err, /docs\/implementations\/demo\/status\.json lives only in commit [0-9a-f]{12}, on a history unrelated to HEAD/);
});

test('R3-A1-M6 (1) --repo <empty dir> --dir <package elsewhere, board deleted>: refused, nothing moved', (t) => {
  if (noDocIt(t)) return;
  const T = mkTmp('t-x1-'); const dir = mkpkg(T);
  fs.rmSync(path.join(dir, 'status.json')); fs.rmSync(path.join(dir, 'STATUS.md'));
  const empty = mkTmp('empty-');
  const before = tree(T);
  const res = S4(['--repo', empty, '--dir', path.join(T, IMPL, 'demo'), '--closeout-rows', rowsDrop()]);
  refused(T, res, before, { code: 2, kind: /^archive-package: usage: package dir .*docs\/implementations\/demo is outside --repo / });
  assert.deepEqual(fs.readdirSync(empty), [], 'nothing written into --repo');
});

test('R3-A1-M6 (2) --repo <unrelated git repo> --dir <same package, absolute>: refused, nothing moved', (t) => {
  if (noDocIt(t)) return;
  const T = mkTmp('t-x2-'); const dir = mkpkg(T);
  fs.rmSync(path.join(dir, 'status.json')); fs.rmSync(path.join(dir, 'STATUS.md'));
  const other = mkTmp('other-'); git(other, 'init', '-q', '-b', 'main');
  const before = tree(T);
  const res = S4(['--repo', other, '--dir', path.join(T, IMPL, 'demo'), '--closeout-rows', rowsDrop()]);
  refused(T, res, before, { code: 2, kind: /^archive-package: usage: package dir .* is outside --repo / });
});

test('R3-A1-M6 (3) a package inside a submodule (board deleted and committed there), --repo <outer repo>: refused naming the submodule; with --repo <submodule>: DENIED', (t) => {
  if (noDocIt(t)) return;
  const sub = mkTmp('sub-src-'); mkpkg(sub);
  git(sub, 'rm', '-q', `${IMPL}/demo/status.json`, `${IMPL}/demo/STATUS.md`); git(sub, 'commit', '-q', '-m', 'drop board');
  const outer = mkTmp('outer-'); git(outer, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(outer, 'README.md'), 'outer\n'); git(outer, 'add', '-A'); git(outer, 'commit', '-q', '-m', 'outer');
  git(outer, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub, 'docs-sub');
  git(outer, 'commit', '-q', '-m', 'add submodule');
  const subTop = fs.realpathSync(path.join(outer, 'docs-sub'));
  const before = tree(outer);
  const res = S4(['--repo', outer, '--dir', `docs-sub/${IMPL}/demo`, '--closeout-rows', rowsDrop()]);
  assert.equal(res.code, 2, res.out + res.err);
  assert.match(res.err, /^archive-package: usage: docs-sub\/docs\/implementations\/demo is inside the git repo .*docs-sub \(a submodule or nested repo\)/);
  assert.ok(res.err.includes(`pass --repo ${subTop}`), res.err);
  assert.deepEqual(tree(outer), before, 'nothing written or moved');
  const inSub = S4(['--repo', subTop, '--impl', 'demo', '--closeout-rows', rowsDrop()]);
  assert.equal(inSub.code, 1, inSub.out + inSub.err);
  assert.match(inSub.err, /^DENIED: board deleted: docs\/implementations\/demo\/status\.json existed in commit/);
  assert.deepEqual(tree(outer), before, 'nothing written or moved');
});

import { spawnSync } from 'node:child_process';
function spawnDocIt(args) { return spawnSync(process.execPath, [DOC_IT, ...args], { encoding: 'utf8' }).status; }
