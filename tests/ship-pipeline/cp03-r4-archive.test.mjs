// CP-03 round 4 adversarial regressions (do-it 1.1, archive A1, G-2). Each case replays the reviewer's exact commands
// against S4 (archive-package) with the REAL status-write and the REAL doc-it, and asserts a refusal with nothing moved.
// Authored by DevOtts (https://github.com/DevOtts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { script, mkTmp, tree, git, sw, verify, cleanup, DOC_IT, W } from '../_helpers.mjs';

after(cleanup);
const S4 = (args, env = {}) => script('archive-package.mjs', args, { env: { DOC_IT_CLI: DOC_IT, ...env } });
const noDocIt = (t) => { if (DOC_IT) return false; console.log('IMPLEMENTED-NOT-VERIFIED: doc-it not found (set DOC_IT_CLI to doc-it.mjs)'); t.skip('doc-it missing'); return true; };
const IMPL = 'docs/implementations';
const docIt = (args) => spawnSync(process.execPath, [DOC_IT, ...args], { encoding: 'utf8' });

// The reviewer's `mkpkg` (as in round 3): a board (T-1, T-2 not started) by the real status-write, STATUS.md, a tracked
// PLAN.md, committed; plan.json outside the package.
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
  assert.equal(fs.existsSync(path.join(root, IMPL, '0-done', 'demo2')), false, 'nothing moved to 0-done');
  assert.deepEqual(tree(root), before, 'nothing written or moved');
}
// demo (T-1, T-2 not started) -> git mv demo demo2; git rm board; git commit
function renamedDropped(prefix) {
  const root = mkTmp(prefix); mkpkg(root);
  git(root, 'mv', `${IMPL}/demo`, `${IMPL}/demo2`);
  git(root, 'rm', '-q', '-f', `${IMPL}/demo2/status.json`, `${IMPL}/demo2/STATUS.md`);
  git(root, 'commit', '-q', '-m', 'rename, drop board');
  return root;
}
// other = a verified package closed through the guarded close into 0-done/other, committed
function closedOther(root) {
  const dir = mkpkg(root, 'other');
  verify({ root, dir, file: path.join(dir, 'status.json') }, ['T-1', 'T-2']);
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'other verified');
  const c = S4(['--repo', root, '--impl', 'other']);
  assert.equal(c.code, 0, c.out + c.err); assert.match(c.out, /^CLOSED_MOVED docs\/implementations\/0-done\/other/);
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'other archived');
}

test('R4-A1-M7 V3: an empty, untracked docs/implementations/demo/status.json does not account for the lost board: DENIED, nothing moved', (t) => {
  if (noDocIt(t)) return;
  const root = renamedDropped('r4-m7v3-');
  fs.mkdirSync(path.join(root, IMPL, 'demo')); fs.writeFileSync(path.join(root, IMPL, 'demo', 'status.json'), '');
  const before = tree(root);
  const res = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  refused(root, res, before);
  assert.match(res.err, /docs\/implementations\/demo\/status\.json was deleted in commit [0-9a-f]{12}; the status\.json now at that path is not a status board/);
  // also a well-formed board that names another package, and a fresh untracked board named demo (not the lost one)
  const plan = path.join(mkTmp('plan-'), 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ implementation: 'demo', waves: [{ id: 'W1', title: 'W', tasks: [{ id: 'X-1', title: 'x' }] }], pieces: [] }));
  fs.rmSync(path.join(root, IMPL, 'demo', 'status.json'));
  assert.equal(sw(['init', '--file', path.join(root, IMPL, 'demo', 'status.json'), '--plan', plan, '--by', 'plan-it'], root).code, 0);
  const before2 = tree(root);
  const r2 = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  refused(root, r2, before2);
  assert.match(r2.err, /is untracked and matches no committed version of that path/);
  const j = JSON.parse(fs.readFileSync(path.join(root, IMPL, 'demo', 'status.json'), 'utf8')); j.implementation = 'other';
  fs.writeFileSync(path.join(root, IMPL, 'demo', 'status.json'), JSON.stringify(j));
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'tracked board naming another package');
  const before3 = tree(root);
  const r3 = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  refused(root, r3, before3);
  assert.match(r3.err, /names "other", not demo/);
});

test('R4-A1-M7 V1: a copy of another package\'s closed board in 0-done/demo does not account for the lost board: DENIED; doc-it reports it', (t) => {
  if (noDocIt(t)) return;
  const root = renamedDropped('r4-m7v1-');
  closedOther(root);
  fs.mkdirSync(path.join(root, IMPL, '0-done', 'demo'));
  fs.copyFileSync(path.join(root, IMPL, '0-done', 'other', 'status.json'), path.join(root, IMPL, '0-done', 'demo', 'status.json'));
  const before = tree(root);
  const res = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  refused(root, res, before);
  assert.match(res.err, /docs\/implementations\/0-done\/demo\/status\.json names "other", not demo/);
  // doc-it check archive: the copy is done_board_mismatch, exit 1
  fs.mkdirSync(path.join(root, '.doc-it'));
  fs.writeFileSync(path.join(root, '.doc-it', 'config.json'), JSON.stringify({ version: 1, roles: { program: [IMPL] } }));
  const c = docIt(['check', 'archive', '--root', root, '--json']);
  assert.equal(c.status, 1, c.stdout + c.stderr);
  assert.deepEqual(JSON.parse(c.stdout).done_board_mismatch, ['docs/implementations/0-done/demo']);
});

test('R4-A1-M7 V2 + 0-done rule: {} or an unfrozen board named demo in 0-done/demo is DENIED; a hand-edited copy fails validate; the real freeze still accounts', (t) => {
  if (noDocIt(t)) return;
  const root = renamedDropped('r4-m7v2-');
  const doneDemo = path.join(root, IMPL, '0-done', 'demo');
  fs.mkdirSync(doneDemo, { recursive: true });
  fs.writeFileSync(path.join(doneDemo, 'status.json'), '{}');
  let before = tree(root);
  refused(root, S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]), before);
  // the lost board itself, copied back from history but not closed
  const sha = git(root, 'log', '--all', '--diff-filter=D', '--format=%H', '--', `${IMPL}/demo/status.json`).trim().split('\n')[0];
  const lostText = git(root, 'show', `${sha}^:${IMPL}/demo/status.json`);
  fs.writeFileSync(path.join(doneDemo, 'status.json'), lostText);
  before = tree(root);
  const r1 = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  refused(root, r1, before); assert.match(r1.err, /0-done\/demo\/status\.json is not closed/);
  // hand-set closed:true with a forged close entry (no matching digest)
  const j = JSON.parse(lostText); j.closed = true;
  j.history.push({ at: j.updated_at, task: '*', from: 'open', to: 'closed', by: 'conclude-it', note: 'x', board_sha256: 'a'.repeat(64) });
  fs.writeFileSync(path.join(doneDemo, 'status.json'), JSON.stringify(j, null, 2));
  before = tree(root);
  const r2 = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  refused(root, r2, before); assert.match(r2.err, /0-done\/demo\/status\.json fails status-write validate/);
  // the writer cannot be found: fail closed
  const r3 = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()], { DOIT_STATUS_WRITE: path.join(root, 'no-such-writer.mjs') });
  refused(root, r3, before, { kind: /^DENIED: cannot verify the archived board docs\/implementations\/0-done\/demo\/status\.json/ });
  // control: the real freeze (restore demo, close it through the guarded close with a note) accounts for it
  fs.rmSync(doneDemo, { recursive: true });
  fs.mkdirSync(path.join(root, IMPL, 'demo')); fs.writeFileSync(path.join(root, IMPL, 'demo', 'status.json'), lostText);
  const cl = S4(['--repo', root, '--impl', 'demo', '--owner-note', 'demo split into demo2, tasks moved there']);
  assert.equal(cl.code, 0, cl.out + cl.err); assert.match(cl.out, /^CLOSED_MOVED docs\/implementations\/0-done\/demo/);
  const ok = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  assert.equal(ok.code, 0, ok.out + ok.err); assert.match(ok.out, /^CLOSED_MOVED docs\/implementations\/0-done\/demo2/);
});

test('R4-A1-M7 an archived package moved back out of 0-done/ with its board dropped is DENIED (a 0-done board is not skipped)', (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r4-m7back-'); closedOther(root);
  git(root, 'mv', `${IMPL}/0-done/other`, `${IMPL}/demo2`);
  git(root, 'rm', '-q', '-f', `${IMPL}/demo2/status.json`, `${IMPL}/demo2/STATUS.md`);
  git(root, 'commit', '-q', '-m', 'unarchive, drop board');
  const before = tree(root);
  const res = S4(['--repo', root, '--impl', 'demo2', '--closeout-rows', rowsDrop()]);
  refused(root, res, before);
  assert.match(res.err, /docs\/implementations\/0-done\/other\/status\.json was deleted in commit/);
});

// mkpkg demo; git rm board + STATUS.md; git commit   (a full clone DENIES this: "existed in commit")
function droppedInPlace(prefix) {
  const root = mkTmp(prefix); mkpkg(root);
  git(root, 'rm', '-q', '-f', `${IMPL}/demo/status.json`, `${IMPL}/demo/STATUS.md`);
  git(root, 'commit', '-q', '-m', 'drop board');
  return root;
}
const refusedHere = (root, res, before, kind) => {
  assert.equal(res.code, 1, res.out + res.err);
  assert.match(res.err, kind);
  assert.doesNotMatch(res.out, /CLOSED_MOVED/);
  assert.equal(fs.existsSync(path.join(root, IMPL, '0-done')), false, 'nothing moved to 0-done');
  assert.deepEqual(tree(root), before, 'nothing written or moved');
};

test('R4-A1-M8 git clone --depth 1 hides the deleted board: DENIED (shallow clone), nothing moved; --owner-note takes it on and is recorded', (t) => {
  if (noDocIt(t)) return;
  const T = droppedInPlace('r4-m8sh-');
  assert.match(S4(['--repo', T, '--impl', 'demo', '--closeout-rows', rowsDrop()]).err, /^DENIED: board deleted: .*existed in commit/, 'full clone: DENIED');
  const SH = path.join(mkTmp('r4-m8sh-clone-'), 'sh');
  git(path.dirname(SH), 'clone', '-q', '--depth', '1', `file://${T}`, SH);
  assert.equal(git(SH, 'rev-parse', '--is-shallow-repository').trim(), 'true');
  const before = tree(SH);
  const res = S4(['--repo', SH, '--impl', 'demo', '--closeout-rows', rowsDrop()]);
  refusedHere(SH, res, before, /^DENIED: shallow clone: board history unknown.*git fetch --unshallow.*--owner-note/);
  // the owner takes it on: archived, and the CLOSEOUT says so
  const ok = S4(['--repo', SH, '--impl', 'demo', '--closeout-rows', rowsDrop(), '--owner-note', 'archived from a CI checkout, owner checked the board history by hand']);
  assert.equal(ok.code, 0, ok.out + ok.err); assert.match(ok.out, /^CLOSED_MOVED docs\/implementations\/0-done\/demo/);
  assert.match(fs.readFileSync(path.join(SH, IMPL, '0-done', 'demo', 'CLOSEOUT.md'), 'utf8'), /Owner note on archiving from a shallow clone \(board history unknown\): archived from a CI checkout/);
  // git fetch --unshallow (the fix the message names) makes the clone whole
  git(SH, 'fetch', '-q', '--unshallow');
  assert.equal(git(SH, 'rev-parse', '--is-shallow-repository').trim(), 'false');
});

test('R4-A1-M8 GIT_CEILING_DIRECTORIES=$T/docs hides the repo from the package folder: DENIED (git error), nothing moved', (t) => {
  if (noDocIt(t)) return;
  const T = droppedInPlace('r4-m8ceil-');
  const before = tree(T);
  const res = S4(['--repo', T, '--impl', 'demo', '--closeout-rows', rowsDrop()], { GIT_CEILING_DIRECTORIES: path.join(T, 'docs') });
  refusedHere(T, res, before, /^DENIED: git error: git sees --repo .* but not the package from its own folder docs\/implementations\/demo/);
});

test('R4-A1-M8 any git failure in a history query is DENIED (git error), never read as "no history"', (t) => {
  if (noDocIt(t)) return;
  const T = droppedInPlace('r4-m8fail-');
  // a git on PATH that fails every `log` (a broken object store, a killed process, ...), real git otherwise
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  const bin = mkTmp('r4-m8bin-');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = log ] && { echo "fatal: simulated failure" >&2; exit 128; }; done\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
  const before = tree(T);
  const res = S4(['--repo', T, '--impl', 'demo', '--closeout-rows', rowsDrop()], { PATH: `${bin}:${process.env.PATH}` });
  refusedHere(T, res, before, /^DENIED: git error: git log --all -1 failed in .*simulated failure/);
  // a broken repo (unparseable .git/config): DENIED, not read as "not a git repository"
  const B = droppedInPlace('r4-m8broken-');
  fs.writeFileSync(path.join(B, '.git', 'config'), '[core\nbroken');
  const beforeB = tree(B);
  const rb = S4(['--repo', B, '--impl', 'demo', '--closeout-rows', rowsDrop()]);
  refusedHere(B, rb, beforeB, /^DENIED: git error: git cannot read/);
});

test('R4-A1-M8 control: outside git altogether the CLOSEOUT path still works (no history to ask)', (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r4-m8nogit-');
  fs.mkdirSync(path.join(root, IMPL, 'study'), { recursive: true }); fs.writeFileSync(path.join(root, IMPL, 'study', 'NOTES.md'), '# study\n');
  const res = S4(['--repo', root, '--impl', 'study', '--closeout-rows', rowsDrop()], { GIT_CEILING_DIRECTORIES: path.dirname(root) });
  assert.equal(res.code, 0, res.out + res.err); assert.match(res.out, /^CLOSED_MOVED docs\/implementations\/0-done\/study/);
});

test('R4-L7 on a case-sensitive repo (core.ignorecase false) --owner-note DEMO does not name demo\'s board: DENIED; with core.ignorecase true it does', (t) => {
  if (noDocIt(t)) return;
  const root = mkTmp('r4-l7-'); mkpkg(root);
  git(root, 'rm', '-q', '-r', `${IMPL}/demo`); git(root, 'commit', '-q', '-m', 'demo abandoned');
  fs.mkdirSync(path.join(root, IMPL, 'p1'), { recursive: true }); fs.writeFileSync(path.join(root, IMPL, 'p1', 'NOTES.md'), '# p1\n');
  git(root, 'config', 'core.ignorecase', 'false');
  const before = tree(root);
  const res = S4(['--repo', root, '--impl', 'p1', '--closeout-rows', rowsDrop(), '--owner-note', 'DEMO was abandoned, unrelated to p1']);
  assert.equal(res.code, 1, res.out + res.err); assert.match(res.err, /^DENIED: board deleted: docs\/implementations\/demo\/status\.json/);
  assert.deepEqual(tree(root), before, 'nothing written or moved');
  git(root, 'config', 'core.ignorecase', 'true');
  const ok = S4(['--repo', root, '--impl', 'p1', '--closeout-rows', rowsDrop(), '--owner-note', 'DEMO was abandoned, unrelated to p1']);
  assert.equal(ok.code, 0, ok.out + ok.err); assert.match(ok.out, /^CLOSED_MOVED docs\/implementations\/0-done\/p1/);
});
