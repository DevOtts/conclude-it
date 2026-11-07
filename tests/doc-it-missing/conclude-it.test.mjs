// T-K2-03 (conclude-it part, D14): on a temp HOME with DOC_IT_CLI unset, every conclude-it doc-it check prints
// "[skip] doc-it not installed: <check>" and none reports that check as PASS. Authored by DevOtts.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { script, mkTmp, git, cleanup } from '../_helpers.mjs';

after(cleanup);
const PASSY = /\bPASS\b|\bclean\b|^ok\b|none expired|CLOSED_MOVED|CLOSED_IN_PLACE/m;

test('T-K2-03 conclude-it without doc-it: every doc-it check prints the [skip] line, none PASS', () => {
  const home = mkTmp('k2-home-');
  const root = mkTmp('k2-repo-'); git(root, 'init', '-q', '-b', 'main');
  const pkg = path.join(root, 'docs', 'implementation', 'study'); fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'PLAN.md'), '# s\n');
  fs.writeFileSync(path.join(pkg, 'CLOSEOUT.md'), '# CLOSEOUT: study\n\n| Piece | Disposition | Evidence or reason | Backlog link |\n|---|---|---|---|\n| P | dropped | not needed | |\n');
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'f');
  const env = { HOME: home }; // script() passes a minimal env: DOC_IT_CLI is unset

  const checks = [
    { name: 'check archive (Step 0)', run: () => script('archive-audit.mjs', ['--repo', root], { env }), skip: ['check archive'], exit: 0 },
    { name: 'check closeout (S4)', run: () => script('archive-package.mjs', ['--repo', root, '--impl', 'study'], { env }), skip: ['check closeout'], exit: 1 },
    { name: 'check expiry + homes (Step 2)', run: () => script('debrief-doc-check.mjs', ['--repo', root, '--pages', 'docs/implementation/study/PLAN.md'], { env }), skip: ['check expiry', 'fact-kind homes (DS-1)'], exit: 0 },
  ];
  for (const c of checks) {
    const r = c.run(); const all = r.out + r.err;
    assert.equal(r.code, c.exit, `${c.name}: ${all}`);
    for (const s of c.skip) assert.ok(all.split('\n').includes(`[skip] doc-it not installed: ${s}`), `${c.name} prints the skip line for ${s}:\n${all}`);
    assert.doesNotMatch(all, PASSY, `${c.name} must not report PASS`);
  }
  // S4 without doc-it never moves a package on an unchecked CLOSEOUT; nothing changed anywhere.
  assert.ok(fs.existsSync(pkg));
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '');
  assert.deepEqual(fs.readdirSync(home), []);
});
