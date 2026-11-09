// CP-03 round 6, FIFO class (do-it 1.1, archive A1, G-2): a FIFO, a /dev symlink or any other non-regular file as a
// package's status.json, CLOSEOUT.md, plan.json, STATUS.md or as the 0-done board must not hang archive-package or
// ledger-card close. Each is DENIED (unreadable board) or REJECTED fast, nothing moved. Every run has a timeout, so a
// hang fails the case instead of the suite.
// Authored by DevOtts (https://github.com/DevOtts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SCRIPTS, mkTmp, tree, git, sw, cleanup, DOC_IT, W } from '../_helpers.mjs';

after(cleanup);
const IMPL = 'docs/implementations';
const run = (name, args, env = {}) => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, name), ...args], { encoding: 'utf8', timeout: 20000, input: '', env: { PATH: process.env.PATH, HOME: os.tmpdir(), DOIT_STATUS_WRITE: W, DOC_IT_CLI: DOC_IT || '/nonexistent/doc-it.mjs', ...env } });
  assert.notEqual(r.status, null, `${name} hung or was killed (${r.signal}): ${r.stdout}${r.stderr}`);
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
};
const mkfifo = (p) => { const r = spawnSync('mkfifo', [p]); assert.equal(r.status, 0, `mkfifo: ${r.stderr}`); };
function rowsDrop() {
  const rows = path.join(mkTmp('rows-'), 'rows-drop.json');
  fs.writeFileSync(rows, JSON.stringify([{ piece: 'Core', disposition: 'dropped', detail: 'we decided not to build this piece' }]));
  return rows;
}
// A boardless package (no git), PLAN.md only.
function bare(prefix) {
  const root = mkTmp(prefix); const dir = path.join(root, IMPL, 'demo');
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'PLAN.md'), '# plan\n');
  return { root, dir };
}
function denied(root, res, before, rel) {
  assert.equal(res.code, 1, res.out + res.err);
  assert.match(res.err, /^DENIED: unreadable board: /);
  assert.ok(res.err.includes(rel), `names ${rel}: ${res.err}`);
  assert.doesNotMatch(res.out, /CLOSED_/);
  assert.equal(fs.existsSync(path.join(root, IMPL, '0-done', 'demo')), false, 'nothing moved');
  assert.deepEqual(tree(root), before, 'nothing written or moved');
}

const KINDS = [
  ['a FIFO', (p) => mkfifo(p), /is a FIFO, not a regular file/],
  ['a symlink to /dev/zero', (p) => fs.symlinkSync('/dev/zero', p), /is a symlink/],
  ['a symlink to /dev/stdin', (p) => fs.symlinkSync('/dev/stdin', p), /is a symlink/],
  ['a dangling symlink', (p) => fs.symlinkSync('/nonexistent/status.json', p), /is a symlink/],
];
for (const file of ['status.json', 'CLOSEOUT.md', 'plan.json', 'STATUS.md']) {
  for (const [label, make, why] of KINDS) {
    test(`CP03 R6 FIFO class: ${label} as the package's ${file}: archive-package returns DENIED (unreadable board) without hanging, nothing moved`, () => {
      const { root, dir } = bare('r6-fifo-');
      make(path.join(dir, file));
      const before = tree(root);
      const args = ['--repo', root, '--impl', 'demo'];
      if (file !== 'status.json' && file !== 'CLOSEOUT.md') args.push('--closeout-rows', rowsDrop());
      const res = run('archive-package.mjs', args);
      denied(root, res, before, `${IMPL}/demo/${file}`);
      assert.match(res.err, why);
    });
  }
}

test('CP03 R6 FIFO class: a symlink to a regular board elsewhere is DENIED too (a board is never read through a link)', () => {
  const { root, dir } = bare('r6-fifol-');
  const elsewhere = path.join(mkTmp('board-'), 'status.json'); fs.writeFileSync(elsewhere, '{"implementation":"demo","waves":[]}');
  fs.symlinkSync(elsewhere, path.join(dir, 'status.json'));
  const before = tree(root);
  denied(root, run('archive-package.mjs', ['--repo', root, '--impl', 'demo']), before, `${IMPL}/demo/status.json`);
});

test('CP03 R6 FIFO class: a 0-done board that is a FIFO (the lost board\'s 0-done/<name>/status.json) is DENIED (unreadable board), no hang', () => {
  const root = mkTmp('r6-fifod-'); git(root, 'init', '-q', '-b', 'main');
  const dir = path.join(root, IMPL, 'demo'); fs.mkdirSync(dir, { recursive: true });
  const plan = path.join(mkTmp('plan-'), 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ implementation: 'demo', waves: [{ id: 'W1', title: 'W', tasks: [{ id: 'T-1', title: 'a' }] }], pieces: [] }));
  assert.equal(sw(['init', '--file', path.join(dir, 'status.json'), '--plan', plan, '--by', 'plan-it'], root).code, 0);
  fs.writeFileSync(path.join(dir, 'PLAN.md'), '# plan\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'board');
  git(root, 'mv', `${IMPL}/demo`, `${IMPL}/demo2`); git(root, 'rm', '-q', '-f', `${IMPL}/demo2/status.json`); git(root, 'commit', '-q', '-m', 'rename, drop board');
  fs.mkdirSync(path.join(root, IMPL, '0-done', 'demo'), { recursive: true });
  mkfifo(path.join(root, IMPL, '0-done', 'demo', 'status.json'));
  const before = tree(root);
  const res = run('archive-package.mjs', ['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  assert.equal(res.code, 1, res.out + res.err);
  assert.match(res.err, /^DENIED: unreadable board: docs\/implementations\/0-done\/demo\/status\.json is a FIFO/);
  assert.deepEqual(tree(root), before, 'nothing written or moved');
  // the lost board's old path as a FIFO: same
  fs.rmSync(path.join(root, IMPL, '0-done'), { recursive: true });
  fs.mkdirSync(dir); mkfifo(path.join(dir, 'status.json'));
  const before2 = tree(root);
  const r2 = run('archive-package.mjs', ['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  assert.equal(r2.code, 1, r2.out + r2.err);
  assert.match(r2.err, /^DENIED: unreadable board: docs\/implementations\/demo\/status\.json is a FIFO/);
  assert.deepEqual(tree(root), before2, 'nothing written or moved');
});

test('CP03 R6 FIFO class: ledger-card close on a FIFO or /dev/zero-linked status.json is REJECTED (unreadable board) without hanging', () => {
  for (const make of [(p) => mkfifo(p), (p) => fs.symlinkSync('/dev/zero', p)]) {
    const { root, dir } = bare('r6-fifoc-');
    make(path.join(dir, 'status.json'));
    const before = tree(root);
    const res = run('ledger-card.mjs', ['close', '--repo', root, '--impl', 'demo']);
    assert.equal(res.code, 1, res.out + res.err);
    assert.match(res.err, /REJECTED: close refused: unreadable board: .*status\.json is (a FIFO|a symlink)/);
    assert.deepEqual(tree(root), before);
  }
});
