// T-A1-03, T-A1-04 (do-it 1.1 epic A1): ship pipeline S4 archives only through the guarded close (status.json) or a
// CLOSEOUT written from doc-it's template (no status.json). Never a bare move. Authored by DevOtts.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkBoardRepo, verify, script, mkTmp, tree, cleanup, DOC_IT } from '../_helpers.mjs';

after(cleanup);
const S4 = (args, env) => script('archive-package.mjs', args, { env });

test('T-A1-03 S4 on a package with unverified tasks and no owner note: REJECTED, not moved, names the tasks', () => {
  const r = mkBoardRepo({ tasks: ['T-01', 'T-02', 'T-03'] });
  verify(r, ['T-01']);
  const before = fs.readFileSync(r.file); const treeBefore = tree(r.root);
  const res = S4(['--repo', r.root, '--impl', 'pkg']);
  assert.equal(res.code, 1, res.out + res.err);
  assert.match(res.err, /^REJECTED: /);
  assert.match(res.err, /2 task\(s\) not verified \(T-02, T-03\)/);
  assert.match(res.err, /nothing moved/);
  assert.ok(fs.existsSync(r.dir), 'folder not moved');
  assert.equal(fs.existsSync(path.join(path.dirname(r.dir), '0-done')), false);
  assert.deepEqual(fs.readFileSync(r.file), before, 'board byte-identical');
  assert.deepEqual(tree(r.root), treeBefore);
});

test('T-A1-03 S4 guarded close: all verified -> CLOSED_MOVED; with an owner note unverified -> moved, note in history', () => {
  const a = mkBoardRepo(); verify(a, ['T-01', 'T-02']);
  const ra = S4(['--repo', a.root, '--impl', 'pkg']);
  assert.equal(ra.code, 0, ra.err);
  assert.match(ra.out, /^CLOSED_MOVED docs\/implementation\/0-done\/pkg/);
  const da = JSON.parse(fs.readFileSync(path.join(a.root, 'docs/implementation/0-done/pkg/status.json'), 'utf8'));
  assert.equal(da.closed, true);
  const b = mkBoardRepo(); verify(b, ['T-01']);
  const rb = S4(['--repo', b.root, '--impl', 'pkg', '--owner-note', 'T-02 dropped by the owner']);
  assert.equal(rb.code, 0, rb.err);
  const db = JSON.parse(fs.readFileSync(path.join(b.root, 'docs/implementation/0-done/pkg/status.json'), 'utf8'));
  assert.equal(db.closed, true);
  assert.ok(db.history.some((h) => h.task === '*' && h.to === 'closed' && h.note === 'T-02 dropped by the owner'));
});

function bareRepo() {
  const root = mkTmp('a1-nb-');
  const dir = path.join(root, 'docs', 'implementation', 'study');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'PLAN.md'), '# study\n');
  return { root, dir };
}
const docItEnv = () => ({ DOC_IT_CLI: DOC_IT });

test('T-A1-04 S4 on a package without status.json: DENIED first, then CLOSEOUT (one row per piece) written and moved', (t) => {
  if (!DOC_IT) { console.log('IMPLEMENTED-NOT-VERIFIED: doc-it not found (set DOC_IT_CLI to doc-it.mjs)'); t.skip('doc-it missing'); return; }
  const r = bareRepo();
  const denied = S4(['--repo', r.root, '--impl', 'study'], docItEnv());
  assert.equal(denied.code, 1);
  assert.match(denied.err, /^DENIED: .*no status\.json and no CLOSEOUT\.md/);
  assert.ok(fs.existsSync(r.dir)); assert.equal(fs.existsSync(path.join(r.dir, 'CLOSEOUT.md')), false);

  const rows = [
    { piece: 'Parser', disposition: 'shipped', detail: 'PR #12 merged, sha abc1234 on main' },
    { piece: 'Exporter', disposition: 'dropped', detail: 'superseded by the vendor API' },
    { piece: 'Docs site', disposition: 'carried', detail: 'navigation left', backlog: 'docs/implementation/1-backlog/docs-site.md' },
  ];
  const rowsFile = path.join(r.root, 'rows.json'); fs.writeFileSync(rowsFile, JSON.stringify(rows));
  const ok = S4(['--repo', r.root, '--impl', 'study', '--closeout-rows', rowsFile, '--by', 'conclude-it', '--date', '2026-11-06'], docItEnv());
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /^CLOSED_MOVED docs\/implementation\/0-done\/study/);
  const moved = path.join(r.root, 'docs/implementation/0-done/study');
  assert.equal(fs.existsSync(r.dir), false);
  const text = fs.readFileSync(path.join(moved, 'CLOSEOUT.md'), 'utf8');
  for (const p of rows) assert.equal(text.split('\n').filter((l) => l.startsWith(`| ${p.piece} |`)).length, 1, `one row for ${p.piece}`);
  assert.equal(text.split('\n').filter((l) => /^\| (shipped|dropped|carried|<piece name>)/.test(l) || l.startsWith('| <piece name>')).length, 0, 'template example rows replaced');
  assert.match(text, /^# CLOSEOUT: study/m);
  assert.ok(fs.existsSync(path.join(moved, 'PLAN.md')));
  // The written CLOSEOUT is the template's own shape: doc-it accepts it.
  const again = script('archive-package.mjs', ['--repo', r.root, '--dir', moved], { env: docItEnv() });
  assert.equal(again.code, 0, again.err); assert.match(again.out, /^CLOSED_IN_PLACE/);
});

test('T-A1-04 a CLOSEOUT row `carried` without a backlog path is refused: nothing written, nothing moved', (t) => {
  if (!DOC_IT) { console.log('IMPLEMENTED-NOT-VERIFIED: doc-it not found (set DOC_IT_CLI to doc-it.mjs)'); t.skip('doc-it missing'); return; }
  const r = bareRepo(); const before = tree(r.root);
  const rowsFile = path.join(mkTmp('rows-'), 'rows.json');
  fs.writeFileSync(rowsFile, JSON.stringify([{ piece: 'Parser', disposition: 'shipped', detail: 'PR #12' }, { piece: 'Docs site', disposition: 'carried', detail: 'navigation left' }]));
  const res = S4(['--repo', r.root, '--impl', 'study', '--closeout-rows', rowsFile], docItEnv());
  assert.equal(res.code, 1);
  assert.match(res.err, /^REJECTED: CLOSEOUT refused by doc-it check closeout/);
  assert.match(res.err, /Docs site.*carried needs a backlog link/);
  assert.deepEqual(tree(r.root), before, 'no CLOSEOUT.md written, folder not moved');
  // A hand-written CLOSEOUT with the same defect is refused too.
  fs.writeFileSync(path.join(r.dir, 'CLOSEOUT.md'), '# CLOSEOUT: study\n\n| Piece | Disposition | Evidence or reason | Backlog link |\n|---|---|---|---|\n| Docs site | carried | left | |\n');
  const res2 = S4(['--repo', r.root, '--impl', 'study'], docItEnv());
  assert.equal(res2.code, 1); assert.match(res2.err, /^REJECTED: .*fails doc-it check closeout/);
  assert.ok(fs.existsSync(r.dir));
});

test('T-A1-04 without doc-it a package with no status.json is DENIED with the [skip] line; nothing moved', () => {
  const r = bareRepo(); const home = mkTmp('home-'); const before = tree(r.root);
  const rowsFile = path.join(home, 'rows.json'); fs.writeFileSync(rowsFile, JSON.stringify([{ piece: 'P', disposition: 'dropped', detail: 'x' }]));
  const res = script('archive-package.mjs', ['--repo', r.root, '--impl', 'study', '--closeout-rows', rowsFile], { env: { HOME: home } });
  assert.equal(res.code, 1);
  assert.match(res.err, /^DENIED: /);
  assert.match(res.err, /^\[skip\] doc-it not installed: check closeout$/m);
  assert.deepEqual(tree(r.root), before);
});

test('T-A1-03 S4 reports PARTIAL_FAILED when the guarded close dies after the freeze; a re-run completes the move', () => {
  const r = mkBoardRepo(); verify(r, ['T-01', 'T-02']);
  const killed = S4(['--repo', r.root, '--impl', 'pkg'], { STATUS_WRITE_TEST_CRASH: 'after-freeze' });
  assert.equal(killed.code, 1);
  assert.match(killed.err, /^PARTIAL_FAILED: board closed, folder not moved/);
  assert.ok(fs.existsSync(r.dir)); assert.equal(r.read().closed, true);
  const again = S4(['--repo', r.root, '--impl', 'pkg']);
  assert.equal(again.code, 0, again.err);
  assert.match(again.out, /^CLOSED_MOVED docs\/implementation\/0-done\/pkg/);
  const doc = JSON.parse(fs.readFileSync(path.join(r.root, 'docs/implementation/0-done/pkg/status.json'), 'utf8'));
  assert.equal(doc.history.filter((h) => h.task === '*' && h.to === 'closed').length, 1);
});
