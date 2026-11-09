// CP-03 round 6 adversarial regressions (do-it 1.1, archive A1, G-2). R6-A1-M9: git quotes a non-ASCII (or tab,
// newline, `"`) path unless asked for NUL-separated output, so a lost board under such a folder was skipped and the
// CLOSEOUT path went through. Each case replays the reviewer's commands with the REAL status-write and doc-it.
// Authored by DevOtts (https://github.com/DevOtts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { script, mkTmp, tree, git, sw, cleanup, DOC_IT } from '../_helpers.mjs';

after(cleanup);
const S4 = (args, env = {}) => script('archive-package.mjs', args, { env: { DOC_IT_CLI: DOC_IT, ...env } });
const noDocIt = (t) => { if (DOC_IT) return false; console.log('IMPLEMENTED-NOT-VERIFIED: doc-it not found (set DOC_IT_CLI to doc-it.mjs)'); t.skip('doc-it missing'); return true; };
const IMPL = 'docs/implementations';

// The reviewer's `mkpkg`: a board (T-1, T-2 not started) by the real status-write, STATUS.md, a tracked PLAN.md, committed.
function mkpkg(root, name) {
  if (!fs.existsSync(path.join(root, '.git'))) git(root, 'init', '-q', '-b', 'main');
  const dir = path.join(root, IMPL, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'PLAN.md'), '# plan\n\nOne core piece, two tasks, nothing else.\n');
  const plan = path.join(mkTmp('plan-'), 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ implementation: name, waves: [{ id: 'W1', title: 'W', tasks: [{ id: 'T-1', title: 'a' }, { id: 'T-2', title: 'b' }] }], pieces: [] }));
  const r = sw(['init', '--file', path.join(dir, 'status.json'), '--plan', plan, '--by', 'plan-it'], root);
  assert.equal(r.code, 0, r.err);
  fs.writeFileSync(path.join(dir, 'STATUS.md'), '# status\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'board');
  return dir;
}
function rowsDrop() {
  const rows = path.join(mkTmp('rows-'), 'rows-drop.json');
  fs.writeFileSync(rows, JSON.stringify([{ piece: 'Core', disposition: 'dropped', detail: 'we decided not to build this piece' }]));
  return rows;
}
// <name> -> git mv <name> demo2; git rm board + STATUS.md; (commit)
function renamedDropped(name, { commit = true } = {}) {
  const root = mkTmp('r6-m9-'); mkpkg(root, name);
  git(root, 'mv', `${IMPL}/${name}`, `${IMPL}/demo2`);
  git(root, 'rm', '-q', '-f', `${IMPL}/demo2/status.json`, `${IMPL}/demo2/STATUS.md`);
  if (commit) git(root, 'commit', '-q', '-m', 'rename, drop board');
  return root;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function deniedNaming(root, res, before, name) {
  assert.equal(res.code, 1, res.out + res.err);
  assert.match(res.err, /^DENIED: board deleted: /);
  assert.match(res.err, new RegExp(esc(`${IMPL}/${name}/status.json`)), 'the lost board is named by its real, unquoted path');
  assert.doesNotMatch(res.out, /CLOSED_MOVED/);
  assert.equal(fs.existsSync(path.join(root, IMPL, '0-done', 'demo2')), false, 'nothing moved to 0-done');
  assert.deepEqual(tree(root), before, 'nothing written or moved');
}

const NAMES = [
  ['non-ASCII', 'migração'],
  ['a space', 'sp ace'],
  ['a tab', 'ta\tb'],
  ['a newline', 'nl\nx'],
  ['a leading "', '"q'],
  ['ASCII control', 'demo'],
];

for (const [label, name] of NAMES) {
  test(`CP03 R6-A1-M9 (${label}): ${JSON.stringify(name)} renamed to demo2 with its board dropped, committed: archive-package demo2 --closeout-rows is DENIED, nothing moved`, (t) => {
    if (noDocIt(t)) return;
    const root = renamedDropped(name);
    const before = tree(root);
    const res = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
    deniedNaming(root, res, before, name);
    assert.match(res.err, /was deleted in commit [0-9a-f]{12}/);
  });
}

test('CP03 R6-A1-M9 uncommitted rename (git mv + git rm, not committed) of "migração" and of "nl\\nx": DENIED', (t) => {
  if (noDocIt(t)) return;
  for (const name of ['migração', 'nl\nx']) {
    const root = renamedDropped(name, { commit: false });
    const before = tree(root);
    const res = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
    deniedNaming(root, res, before, name);
    assert.match(res.err, /is deleted in the working tree \(uncommitted\)/);
  }
});

test('CP03 R6-A1-M9 a board that lives only on an orphan branch, under "migração/": DENIED (orphan branch)', (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r6-m9o-'); mkpkg(root, 'migração');
  git(root, 'checkout', '-q', '--orphan', 'fresh');
  git(root, 'rm', '-r', '-q', '-f', '.');
  fs.mkdirSync(path.join(root, IMPL, 'demo2'), { recursive: true });
  fs.writeFileSync(path.join(root, IMPL, 'demo2', 'PLAN.md'), '# plan\n\nOne core piece, two tasks, nothing else.\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'fresh start');
  const before = tree(root);
  const res = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  deniedNaming(root, res, before, 'migração');
  assert.match(res.err, /on a history unrelated to HEAD \(an orphan branch\)/);
});

test('CP03 R6-A1-M9 control: the lost "migração" board restored byte-for-byte (untracked) at its old path is accounted for (log --raw -z): CLOSED_MOVED', (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r6-m9r-'); const dir = mkpkg(root, 'migração');
  const bytes = fs.readFileSync(path.join(dir, 'status.json'));
  git(root, 'mv', `${IMPL}/migração`, `${IMPL}/demo2`);
  git(root, 'rm', '-q', '-f', `${IMPL}/demo2/status.json`, `${IMPL}/demo2/STATUS.md`);
  git(root, 'commit', '-q', '-m', 'rename, drop board');
  fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'status.json'), bytes);
  const res = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  assert.equal(res.code, 0, res.out + res.err);
  assert.match(res.out, /^CLOSED_MOVED docs\/implementations\/0-done\/demo2/);
  // and a changed byte is not a committed version: DENIED, naming the real path
  const root2 = mkTmp('r6-m9r2-'); const dir2 = mkpkg(root2, 'migração');
  git(root2, 'mv', `${IMPL}/migração`, `${IMPL}/demo2`);
  git(root2, 'rm', '-q', '-f', `${IMPL}/demo2/status.json`, `${IMPL}/demo2/STATUS.md`);
  git(root2, 'commit', '-q', '-m', 'rename, drop board');
  fs.mkdirSync(dir2); fs.writeFileSync(path.join(dir2, 'status.json'), `${bytes.toString('utf8').trimEnd()} \n`);
  const before = tree(root2);
  const r2 = S4(['--repo', root2, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  deniedNaming(root2, r2, before, 'migração');
  assert.match(r2.err, /is untracked and matches no committed version of that path/);
});

test('CP03 R6-A1-M9 debrief-doc-check --since lists a non-ASCII, a spaced, a newline and a "-led page by its real path', async (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r6-m9d-'); git(root, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(root, 'a.md'), 'a\n'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'one');
  const pages = ['migração.md', 'sp ace.md', 'nl\nx.md', '"q.md', 'ta\tb.md'];
  for (const p of pages) fs.writeFileSync(path.join(root, p), 'x\n');
  git(root, 'add', 'migração.md', 'sp ace.md'); git(root, 'commit', '-q', '-m', 'two');
  const { check } = await import('../../plugins/conclude-it/skills/conclude-it/scripts/debrief-doc-check.mjs');
  const res = check({ repo: root, since: 'HEAD~1' }, { PATH: process.env.PATH, HOME: root, DOC_IT_CLI: DOC_IT });
  assert.deepEqual([...res.result.pages].sort(), [...pages].sort());
});
