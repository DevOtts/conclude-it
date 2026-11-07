// T-K2-01 (scripted half; the judgement half is evals/doc-it-expiry.yaml). conclude-it Step 2 runs
// `doc-it check expiry` on the pages the session touched: the verdict lists the expired page; nothing is rewritten.
// Authored by DevOtts.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { script, mkTmp, git, cleanup, DOC_IT } from '../_helpers.mjs';

after(cleanup);

function fixture() {
  const root = mkTmp('k2-exp-');
  git(root, 'init', '-q', '-b', 'main');
  const d = path.join(root, 'docs', 'reference');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'old.md'), '---\nverified: 2026-01-10\n---\n# Old page\nBehaviour as of January.\n');
  fs.writeFileSync(path.join(d, 'fresh.md'), '---\nverified: 2026-11-01\n---\n# Fresh page\n');
  fs.writeFileSync(path.join(d, 'untouched-old.md'), '---\nverified: 2025-01-01\n---\n# Not touched this session\n');
  const init = spawnSync(process.execPath, [DOC_IT, 'init', '--root', root, '--yes', '--durable', 'docs/reference'], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'fixture');
  // The session touches old.md and fresh.md.
  fs.appendFileSync(path.join(d, 'old.md'), 'Edited this session.\n');
  fs.appendFileSync(path.join(d, 'fresh.md'), 'Edited this session.\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'session edits');
  return root;
}
const snapshot = (root) => git(root, 'status', '--porcelain', '--untracked-files=all') + git(root, 'rev-parse', 'HEAD') + git(root, 'ls-files', '-s');

test('T-K2-01 Step 2 helper lists the touched expired page in the verdict; no file changed', (t) => {
  if (!DOC_IT) { console.log('IMPLEMENTED-NOT-VERIFIED: doc-it not found (set DOC_IT_CLI to doc-it.mjs)'); t.skip('doc-it missing'); return; }
  const root = fixture(); const before = snapshot(root);
  const r = script('debrief-doc-check.mjs', ['--repo', root, '--since', 'HEAD~1', '--today', '2026-11-06'], { env: { DOC_IT_CLI: DOC_IT } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /doc-it check expiry on 2 page\(s\) this session touched: 1 need review \(report only; nothing rewritten\)/);
  assert.match(r.out, /expired docs\/reference\/old\.md: verified 2026-01-10 \(300 days, limit 60\)/);
  assert.doesNotMatch(r.out, /fresh\.md/);
  assert.doesNotMatch(r.out, /untouched-old\.md/, 'only pages the session touched');
  assert.match(r.out, /fact-kind homes \(DS-1\): not yet checked/);
  assert.equal(snapshot(root), before, 'nothing rewritten, git status clean');
  const j = JSON.parse(script('debrief-doc-check.mjs', ['--repo', root, '--pages', 'docs/reference/old.md', '--today', '2026-11-06', '--json'], { env: { DOC_IT_CLI: DOC_IT } }).out);
  assert.deepEqual(j.expired.map((e) => e.path), ['docs/reference/old.md']);
  assert.equal(j.homes, 'not yet checked');
  assert.equal(snapshot(root), before);
});
