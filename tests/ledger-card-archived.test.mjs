// T-A1-07 (do-it 1.1 epic A1-05): `ledger-card close` on a package already in 0-done/ closes it IN PLACE
// (status-write close without --move). Real build-it status-write. Authored by DevOtts.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkBoardRepo, script, cleanup, tree } from './_helpers.mjs';

after(cleanup);

test('T-A1-07 ledger-card close --owner-note on an archived package (0-done/x, 0 of 4, closed: false): closed in place', () => {
  const r = mkBoardRepo({ name: 'x', where: '0-done', tasks: ['T-1', 'T-2', 'T-3', 'T-4'] });
  assert.equal(r.read().closed, false);
  const doneDir = path.dirname(r.dir);
  const before = fs.readFileSync(r.file);

  // Without a note: refused, byte-identical.
  const no = script('ledger-card.mjs', ['close', '--repo', r.root, '--impl', 'x']);
  assert.equal(no.code, 1);
  assert.match(no.err, /4 task\(s\) not verified \(T-1, T-2, T-3, T-4\)/);
  assert.deepEqual(fs.readFileSync(r.file), before);

  // With a note: closed in place.
  const res = script('ledger-card.mjs', ['close', '--repo', r.root, '--impl', 'x', '--owner-note', 'archived by hand before the guarded close existed']);
  assert.equal(res.code, 0, res.err);
  assert.match(res.out, /CLOSED_IN_PLACE docs\/implementation\/0-done\/x/);
  const doc = r.read();
  assert.equal(doc.closed, true);
  const entry = doc.history.filter((h) => h.task === '*' && h.to === 'closed');
  assert.equal(entry.length, 1);
  assert.equal(entry[0].note, 'archived by hand before the guarded close existed');
  assert.deepEqual(fs.readdirSync(doneDir), ['x'], 'folder not moved, no nested 0-done');
  assert.equal(tree(r.dir).some((p) => p.includes('0-done')), false);

  // Re-running is refused (already closed) and changes nothing.
  const b2 = fs.readFileSync(r.file);
  const again = script('ledger-card.mjs', ['close', '--repo', r.root, '--impl', 'x', '--owner-note', 'again']);
  assert.equal(again.code, 1); assert.match(again.err, /already closed/);
  assert.deepEqual(fs.readFileSync(r.file), b2);
});

test('T-A1-07 ledger-card close resumes a PARTIAL_FAILED board (frozen, not moved): moves it, one close entry', () => {
  const r = mkBoardRepo({ tasks: ['T-1'] });
  // Freeze in place with the real writer, as a killed `close --move` would leave it.
  const killed = script('ledger-card.mjs', ['close', '--repo', r.root, '--dir', r.dir, '--owner-note', 'n'], { env: { STATUS_WRITE_TEST_CRASH: 'after-freeze' } });
  assert.equal(killed.code, 1);
  assert.match(killed.err, /PARTIAL_FAILED: board closed, folder not moved .*re-run close to complete the move/);
  assert.equal(r.read().closed, true); assert.ok(fs.existsSync(r.dir));
  const res = script('ledger-card.mjs', ['close', '--repo', r.root, '--impl', 'pkg']);
  assert.equal(res.code, 0, res.err);
  assert.match(res.out, /CLOSED_MOVED docs\/implementation\/0-done\/pkg/);
  const doc = JSON.parse(fs.readFileSync(path.join(r.root, 'docs/implementation/0-done/pkg/status.json'), 'utf8'));
  assert.equal(doc.history.filter((h) => h.task === '*' && h.to === 'closed').length, 1);
});
