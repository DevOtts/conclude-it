// conclude-it side of the init-it test contract (CARD-A T-A-14, T-A-15, T-A-13) plus the close step.
// Run: DOIT_STATUS_WRITE=<build-it>/plugins/build-it/scripts/status/status-write.mjs node --test <this file>
// Authored by DevOtts (https://github.com/DevOtts).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveStatusWrite, parseCard } from './ledger-card.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ledger-card.mjs');
const W = resolveStatusWrite(process.env);
const SID = 'sess-open-1';

const LEGACY_INDEX = `# Session history (repo)

| date | alias | project | session | status | tags | summary |
|---|---|---|---|---|---|---|
| 2026-09-01 | claudinho | repo | [legacy-one](claudinho/2026-09-01--legacy-one.md) | concluded | legacy | first legacy row |
`;
const OPEN_CARD = (sid = SID) => `---
session: alpha-build
alias: claudinho
session_id: ${sid}
project: repo
cwd: /work/repo
date: 2026-10-18
status: open
implementation: [alpha]
opened_at: 2026-10-18T09:00:00Z
tags: [init-it, build]
---
**Objective:** open build session, registered by /init-it.
`;
const LEGACY_CARD = `---
session: legacy-one
alias: claudinho
session_id: 11111111-aaaa
project: repo
cwd: /work/repo
date: 2026-09-01
status: concluded
summary: a: b: c
tags: [legacy]
---
**Objective:** legacy card without implementation.
`;

function w(args, cwd) { return spawnSync(process.execPath, [W, ...args], { encoding: 'utf8', cwd }); }
function lc(args, cwd, env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd, env: { PATH: process.env.PATH, HOME: os.tmpdir(), DOIT_STATUS_WRITE: W, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function mkRepo({ open = true, sessions = [SID], tasks = ['A-01', 'A-02'] } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lc-')));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  const dir = path.join(root, 'docs', 'implementations', 'alpha');
  fs.mkdirSync(dir, { recursive: true });
  const plan = path.join(root, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ implementation: 'alpha', waves: [{ id: 'W1', title: 'W', tasks: tasks.map((id) => ({ id, title: id })) }], pieces: [] }));
  assert.equal(w(['init', '--file', path.join(dir, 'status.json'), '--plan', plan, '--by', 'plan-it'], root).status, 0);
  for (const s of sessions) assert.equal(w(['session', 'add', '--session-id', s, '--alias', 'claudinho', '--name', 'alpha-build', '--role', 'build', '--by', 'init-it', '--file', path.join(dir, 'status.json')], root).status, 0);
  const hist = path.join(root, '.agents', 'history', 'claudinho');
  fs.mkdirSync(hist, { recursive: true });
  fs.writeFileSync(path.join(hist, '2026-09-01--legacy-one.md'), LEGACY_CARD);
  let index = LEGACY_INDEX;
  if (open) {
    fs.writeFileSync(path.join(hist, '2026-10-18--alpha-build.md'), OPEN_CARD());
    index = index.replace('|---|---|---|---|---|---|---|\n', '|---|---|---|---|---|---|---|\n')
      .replace('# Session history (repo)\n\n', '# Session history (repo)\n\n| date | alias | project | impl | session | status | tags | summary |\n|---|---|---|---|---|---|---|---|\n| 2026-10-18 | claudinho | repo | alpha | [alpha-build](claudinho/2026-10-18--alpha-build.md) | open | init-it, build | open: build session registered by init-it |\n\n');
  }
  fs.writeFileSync(path.join(root, '.agents', 'history', 'INDEX.md'), index);
  const body = path.join(root, 'body.md');
  fs.writeFileSync(body, '**Objective:** build alpha.\n**Key results:** A-01 done.\n');
  const status = () => JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8'));
  const index_ = () => fs.readFileSync(path.join(root, '.agents', 'history', 'INDEX.md'), 'utf8');
  return { root, dir, body, status, index: index_, hist };
}

function verifyAll(r, ids) {
  const f = path.join(r.dir, 'status.json');
  for (const id of ids) {
    fs.mkdirSync(path.join(r.dir, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(r.dir, 'evidence', `${id}.log`), 'all green\n');
    fs.writeFileSync(path.join(r.dir, 'evidence', `${id}.verdict.md`), `review-it verdict\ntask: ${id}\nverdict: PASS\n`);
    assert.equal(w(['set', id, '--status', 'in-progress', '--by', 'build-it', '--file', f], r.root).status, 0);
    assert.equal(w(['set', id, '--status', 'done', '--evidence', `docs/implementations/alpha/evidence/${id}.log`, '--by', 'build-it', '--file', f], r.root).status, 0);
    const v = w(['set', id, '--status', 'verified', '--evidence', `docs/implementations/alpha/evidence/${id}.verdict.md`, '--by', 'review-it', '--file', f], r.root);
    assert.equal(v.status, 0, v.stderr);
  }
}

test('T-A-14 conclude-it on an open card: same filename, status concluded, one INDEX row, ended_at set', () => {
  const r = mkRepo();
  const files = () => fs.readdirSync(r.hist).sort();
  const before = files();
  const res = lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'concluded', '--body-file', r.body, '--tags', 'build-it,alpha', '--summary', 'alpha built'], r.root);
  assert.equal(res.code, 0, res.err);
  assert.deepEqual(files(), before, 'no second card');
  const card = parseCard(fs.readFileSync(path.join(r.hist, '2026-10-18--alpha-build.md'), 'utf8'));
  assert.equal(card.fields.status, 'concluded');
  assert.equal(card.fields.implementation, '[alpha]');
  assert.equal(card.fields.session_id, SID);
  assert.equal(card.fields.opened_at, '2026-10-18T09:00:00Z');
  assert.match(card.body, /\*\*Objective:\*\* build alpha\./);
  const rows = r.index().split('\n').filter((l) => l.includes('2026-10-18--alpha-build.md'));
  assert.equal(rows.length, 1);
  assert.match(rows[0], /\| alpha \| \[alpha-build\]\(claudinho\/2026-10-18--alpha-build\.md\) \| concluded \| build-it, alpha \| alpha built \|/);
  assert.ok(r.index().includes('| 2026-09-01 | claudinho | repo | [legacy-one](claudinho/2026-09-01--legacy-one.md) | concluded | legacy | first legacy row |'));
  assert.match(r.status().sessions[0].ended_at, /Z$/);
  // idempotent: the card is no longer open, a re-run writes nothing new for the open path
  assert.equal(lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'shipped', '--body-file', r.body], r.root).code, 2);
});

test('T-A-14b shipped + implementation extended with what the session touched', () => {
  const r = mkRepo();
  fs.mkdirSync(path.join(r.root, 'docs', 'implementations', 'beta'));
  const res = lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'shipped', '--body-file', r.body, '--implementation', 'beta'], r.root);
  assert.equal(res.code, 0, res.err);
  const card = parseCard(fs.readFileSync(path.join(r.hist, '2026-10-18--alpha-build.md'), 'utf8'));
  assert.equal(card.fields.status, 'shipped');
  assert.equal(card.fields.implementation, '[alpha, beta]');
  assert.match(res.err, /beta.*missing or invalid; ended_at not set/);
});

test('T-A-15 no open card: card written as before; implementation only if derivable', () => {
  const r = mkRepo({ open: false, sessions: [] });
  const before = r.index();
  const res = lc(['upgrade', '--repo', r.root, '--session-id', 'sess-none', '--status', 'concluded', '--body-file', r.body, '--alias', 'claudinho', '--session', 'quick-fix', '--date', '2026-10-18', '--tags', 'fix', '--project', 'repo'], r.root);
  assert.equal(res.code, 0, res.err);
  const text = fs.readFileSync(path.join(r.hist, '2026-10-18--quick-fix.md'), 'utf8');
  assert.doesNotMatch(text, /^implementation:/m);
  assert.deepEqual(parseCard(text).order, ['session', 'alias', 'session_id', 'project', 'cwd', 'date', 'status', 'tags']);
  const idx = r.index();
  assert.ok(idx.endsWith(before.slice(before.indexOf('| 2026-09-01'))));
  assert.match(idx, /\|---\|---\|---\|---\|---\|---\|---\|\n\| 2026-10-18 \| claudinho \| repo \| \[quick-fix\]\(claudinho\/2026-10-18--quick-fix\.md\) \| concluded \| fix \|/);
  assert.doesNotMatch(idx, /\| impl \|/, 'legacy INDEX stays legacy when nothing names an implementation');

  // derivable from the branch name -> implementation present
  const r2 = mkRepo({ open: false, sessions: [] });
  fs.writeFileSync(path.join(r2.root, '.git', 'HEAD'), 'ref: refs/heads/feat/alpha\n');
  assert.equal(lc(['upgrade', '--repo', r2.root, '--session-id', 'sess-b', '--status', 'concluded', '--body-file', r2.body, '--alias', 'claudinho', '--session', 'alpha-fix', '--date', '2026-10-18'], r2.root).code, 0);
  assert.match(fs.readFileSync(path.join(r2.hist, '2026-10-18--alpha-fix.md'), 'utf8'), /^implementation: \[alpha\]$/m);
  assert.match(r2.index(), /\| impl \|/);
  assert.match(r2.index(), /\| alpha \| \[alpha-fix\]/);
});

test('T-A-13 (conclude-it reader) a legacy card without implementation and with a stray colon reads without error', () => {
  const c = parseCard(LEGACY_CARD);
  assert.equal(c.fields.implementation, undefined);
  assert.equal(c.fields.summary, 'a: b: c');
  const r = mkRepo();
  // the open-card scan walks the legacy card first without throwing
  assert.equal(lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'concluded', '--body-file', r.body], r.root).code, 0);
});

test('CLOSE-01 all tasks verified: close moves the folder to 0-done and ends every open session', () => {
  const r = mkRepo({ sessions: ['s-a', 's-b'] });
  verifyAll(r, ['A-01', 'A-02']);
  const res = lc(['close', '--repo', r.root, '--impl', 'alpha'], r.root);
  assert.equal(res.code, 0, res.err);
  const moved = path.join(r.root, 'docs', 'implementations', '0-done', 'alpha', 'status.json');
  assert.ok(fs.existsSync(moved));
  assert.equal(fs.existsSync(r.dir), false);
  const doc = JSON.parse(fs.readFileSync(moved, 'utf8'));
  assert.equal(doc.closed, true);
  assert.equal(doc.sessions.length, 2);
  for (const s of doc.sessions) assert.match(s.ended_at, /Z$/);
  assert.match(res.out, /session end s-a/);
  assert.match(res.out, /session end s-b/);
});

test('CLOSE-02 one task unverified and no owner note: refused, board and sessions byte-identical', () => {
  const r = mkRepo({ sessions: ['s-a'] });
  verifyAll(r, ['A-01']);
  const f = path.join(r.dir, 'status.json');
  const before = fs.readFileSync(f);
  const res = lc(['close', '--repo', r.root, '--impl', 'alpha'], r.root);
  assert.equal(res.code, 1);
  assert.match(res.err, /1 task\(s\) not verified \(A-02\)/);
  assert.deepEqual(fs.readFileSync(f), before);
  assert.equal(fs.existsSync(path.join(r.root, 'docs', 'implementations', '0-done', 'alpha')), false);
});

test('CLOSE-03 unverified with an owner note: closes knowingly, moves, ends sessions, history records the note', () => {
  const r = mkRepo({ sessions: ['s-a'] });
  verifyAll(r, ['A-01']);
  const res = lc(['close', '--repo', r.root, '--impl', 'alpha', '--owner-note', 'A-02 dropped by Fernando'], r.root);
  assert.equal(res.code, 0, res.err);
  const doc = JSON.parse(fs.readFileSync(path.join(r.root, 'docs', 'implementations', '0-done', 'alpha', 'status.json'), 'utf8'));
  assert.equal(doc.closed, true);
  assert.ok(doc.sessions[0].ended_at);
  assert.ok(doc.history.some((h) => h.task === '*' && h.note === 'A-02 dropped by Fernando'));
});

test('CLOSE-04 an empty board (created by init-it, no tasks) is not "all verified" without an owner note', () => {
  const r = mkRepo({ sessions: ['s-a'], tasks: [] });
  const res = lc(['close', '--repo', r.root, '--impl', 'alpha'], r.root);
  assert.equal(res.code, 1);
  assert.match(res.err, /no tasks/);
});

test('CLOSE-05 after close, the open card upgrade links the moved 0-done path', () => {
  const r = mkRepo();
  verifyAll(r, ['A-01', 'A-02']);
  assert.equal(lc(['close', '--repo', r.root, '--impl', 'alpha'], r.root).code, 0);
  const res = lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'shipped', '--body-file', r.body], r.root);
  assert.equal(res.code, 0, res.err);
  const text = fs.readFileSync(path.join(r.hist, '2026-10-18--alpha-build.md'), 'utf8');
  assert.match(text, /\*\*Moved:\*\* docs\/implementations\/0-done\/alpha/);
});

// ---------- INIT-08 adversarial review (appended) ----------
import { spawn } from 'node:child_process';

const CARD = (r) => path.join(r.hist, '2026-10-18--alpha-build.md');
const residueIn = (dir) => { const bad = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.lock$|\.tmp$|\.stale$/.test(e.name)) bad.push(p); } }; walk(dir); return bad; };
const sessionCellRows = (text, link) => text.split(/\r?\n/).filter((l) => l.split('|').some((c) => c.trim().endsWith(`](${link})`) && c.trim().startsWith('[')));
function lcAsync(args, cwd) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [SCRIPT, ...args], { cwd, env: { PATH: process.env.PATH, HOME: os.tmpdir(), DOIT_STATUS_WRITE: W } });
    let out = ''; let err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => resolve({ code, out, err }));
  });
}

test('ADV-LC-01 killed after the card temp write: open card + INDEX byte-identical, dead lock reclaimed, re-run heals, no residue', () => {
  const r = mkRepo();
  const card0 = fs.readFileSync(CARD(r)); const idx0 = r.index();
  const res = lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'concluded', '--body-file', r.body], r.root, { LEDGER_CARD_TEST_CRASH: 'after-tmp' });
  assert.equal(res.code, 137);
  assert.deepEqual(fs.readFileSync(CARD(r)), card0);
  assert.equal(r.index(), idx0);
  assert.equal(r.status().sessions[0].ended_at, null);
  assert.ok(fs.existsSync(path.join(r.root, '.agents', 'history', '.ledger.lock')), 'the killed process left its lock');
  const t0 = Date.now();
  const again = lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'concluded', '--body-file', r.body], r.root);
  assert.equal(again.code, 0, again.err);
  assert.ok(Date.now() - t0 < 5000);
  assert.equal(parseCard(fs.readFileSync(CARD(r), 'utf8')).fields.status, 'concluded');
  assert.equal(sessionCellRows(r.index(), 'claudinho/2026-10-18--alpha-build.md').length, 1);
  assert.ok(r.status().sessions[0].ended_at);
  assert.deepEqual(residueIn(path.join(r.root, '.agents')), []);
  assert.deepEqual(residueIn(r.dir), []);
});

test('ADV-LC-02 open card without implementation, BOM + CRLF, stray colons, junk siblings: upgraded in place', () => {
  const r = mkRepo();
  fs.writeFileSync(path.join(r.hist, '2026-09-04--no-front.md'), 'no frontmatter at all\n');
  fs.writeFileSync(path.join(r.hist, '2026-09-05--half.md'), '---\nsession: half\nstatus: open\n');
  fs.mkdirSync(path.join(r.hist, 'dir.md'));
  const src = ['---', 'session: alpha-build', 'alias: claudinho', `session_id: ${SID}`, 'project: repo', 'cwd: C:\\w:x', 'date: 2026-10-18', 'status: open', 'not a field', ': nokey', 'opened_at: 2026-10-18T09:00:00Z', 'tags: [init-it, build]', '---', 'old body', ''].join('\r\n');
  fs.writeFileSync(CARD(r), `\uFEFF${src}`);
  const before = fs.readdirSync(r.hist).sort();
  const res = lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'shipped', '--body-file', r.body, '--implementation', 'alpha'], r.root);
  assert.equal(res.code, 0, res.err);
  assert.deepEqual(fs.readdirSync(r.hist).sort(), before);
  const c = parseCard(fs.readFileSync(CARD(r), 'utf8'));
  assert.equal(c.fields.status, 'shipped');
  assert.equal(c.fields.implementation, '[alpha]');
  assert.equal(c.order[c.order.indexOf('status') + 1], 'implementation');
  assert.equal(c.fields.cwd, 'C:\\w:x');
  assert.equal(sessionCellRows(r.index(), 'claudinho/2026-10-18--alpha-build.md').length, 1);
});

test('ADV-LC-03 a summary quoting the open card link never makes the upsert overwrite that other row', () => {
  const r = mkRepo();
  const idx = path.join(r.root, '.agents', 'history', 'INDEX.md');
  const quoting = '| 2026-09-02 | claudinho | repo | | [legacy-two](claudinho/2026-09-02--legacy-two.md) | concluded | legacy | see [prev](claudinho/2026-10-18--alpha-build.md) |';
  // put the quoting row ABOVE the real row so a naive first-match would hit it
  fs.writeFileSync(idx, r.index().replace('|---|---|---|---|---|---|---|---|\n', `|---|---|---|---|---|---|---|---|\n${quoting}\n`));
  const res = lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'concluded', '--body-file', r.body], r.root);
  assert.equal(res.code, 0, res.err);
  assert.ok(r.index().includes(quoting), 'the quoting row is kept byte for byte');
  const rows = sessionCellRows(r.index(), 'claudinho/2026-10-18--alpha-build.md');
  assert.equal(rows.length, 1);
  assert.match(rows[0], /\| concluded \|/);
});

test('ADV-LC-04 no open card, same date + session name as another session card: the other card is not clobbered', () => {
  const r = mkRepo({ open: false, sessions: [] });
  const args = (sid) => ['upgrade', '--repo', r.root, '--session-id', sid, '--status', 'concluded', '--body-file', r.body, '--alias', 'claudinho', '--session', 'quick-fix', '--date', '2026-10-18'];
  assert.equal(lc(args('sess-A'), r.root).code, 0);
  const a = fs.readFileSync(path.join(r.hist, '2026-10-18--quick-fix.md'), 'utf8');
  assert.equal(lc(args('sess-B'), r.root).code, 0);
  assert.equal(fs.readFileSync(path.join(r.hist, '2026-10-18--quick-fix.md'), 'utf8'), a, 'session A card untouched');
  assert.equal(parseCard(fs.readFileSync(path.join(r.hist, '2026-10-18--quick-fix-2.md'), 'utf8')).fields.session_id, 'sess-B');
  // the same session concluding again rewrites its own card, no third file
  assert.equal(lc(args('sess-B'), r.root).code, 0);
  assert.equal(fs.readdirSync(r.hist).filter((f) => f.includes('quick-fix')).length, 2);
  const text = r.index();
  assert.equal(sessionCellRows(text, 'claudinho/2026-10-18--quick-fix.md').length, 1);
  assert.equal(sessionCellRows(text, 'claudinho/2026-10-18--quick-fix-2.md').length, 1);
});

test('ADV-LC-05 newlines in --tags cannot forge header fields; traversal in alias/session is refused', () => {
  const r = mkRepo();
  const res = lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'concluded', '--body-file', r.body, '--tags', 'a\nstatus: open\nimplementation: [evil]'], r.root);
  assert.equal(res.code, 0, res.err);
  const c = parseCard(fs.readFileSync(CARD(r), 'utf8'));
  assert.equal(c.fields.status, 'concluded');
  assert.equal(c.fields.implementation, '[alpha]');
  const n = mkRepo({ open: false, sessions: [] });
  const base = ['upgrade', '--repo', n.root, '--session-id', 's-x', '--status', 'concluded', '--body-file', n.body, '--date', '2026-10-18'];
  for (const [alias, session] of [['../x', 'ok'], ['claudinho', '../../x'], ['a/../../b', 'ok'], ['claudinho', 'a/b']]) {
    assert.equal(lc([...base, '--alias', alias, '--session', session], n.root).code, 2, `${alias} ${session}`);
  }
  assert.equal(fs.existsSync(path.join(n.root, '.agents', 'x')), false);
  assert.equal(lc([...base, '--alias', 'claudinho', '--session', 'ok', '--implementation', '../../etc,alpha'], n.root).code, 0);
});

test('ADV-LC-06 parallel upgrades of 6 open cards: all concluded, one row each, every ended_at set, no residue', async () => {
  const ids = Array.from({ length: 6 }, (_, i) => `par-${i}`);
  const r = mkRepo({ open: false, sessions: ids });
  const idx = path.join(r.root, '.agents', 'history', 'INDEX.md');
  let text = r.index().replace('# Session history (repo)\n\n', '# Session history (repo)\n\n| date | alias | project | impl | session | status | tags | summary |\n|---|---|---|---|---|---|---|---|\n');
  for (const id of ids) {
    fs.writeFileSync(path.join(r.hist, `2026-10-18--alpha-${id}.md`), OPEN_CARD(id).replace('session: alpha-build', `session: alpha-${id}`));
    text = text.replace('|---|---|---|---|---|---|---|---|\n', `|---|---|---|---|---|---|---|---|\n| 2026-10-18 | claudinho | repo | alpha | [alpha-${id}](claudinho/2026-10-18--alpha-${id}.md) | open | init-it | open |\n`);
  }
  fs.writeFileSync(idx, text);
  const rs = await Promise.all(ids.map((id) => lcAsync(['upgrade', '--repo', r.root, '--session-id', id, '--status', 'concluded', '--body-file', r.body], r.root)));
  for (const x of rs) assert.equal(x.code, 0, x.err);
  for (const id of ids) {
    assert.equal(parseCard(fs.readFileSync(path.join(r.hist, `2026-10-18--alpha-${id}.md`), 'utf8')).fields.status, 'concluded');
    const rows = sessionCellRows(r.index(), `claudinho/2026-10-18--alpha-${id}.md`);
    assert.equal(rows.length, 1, id);
    assert.match(rows[0], /\| concluded \|/);
  }
  for (const s of r.status().sessions) assert.ok(s.ended_at, s.session_id);
  assert.equal(w(['validate', '--file', path.join(r.dir, 'status.json')], r.root).status, 0);
  assert.deepEqual(residueIn(path.join(r.root, '.agents')), []);
  assert.deepEqual(residueIn(r.dir), []);
});

test('ADV-LC-07 a closed (frozen) status.json: the card upgrades, status.json is left byte-identical with a warning', () => {
  const r = mkRepo();
  const f = path.join(r.dir, 'status.json');
  assert.equal(w(['close', '--by', 'conclude-it', '--owner-note', 'frozen for the test', '--file', f], r.root).status, 0);
  const before = fs.readFileSync(f);
  const res = lc(['upgrade', '--repo', r.root, '--session-id', SID, '--status', 'concluded', '--body-file', r.body], r.root);
  assert.equal(res.code, 0, res.err);
  assert.match(res.err, /closed; ended_at left as is/);
  assert.deepEqual(fs.readFileSync(f), before);
  assert.equal(parseCard(fs.readFileSync(CARD(r), 'utf8')).fields.status, 'concluded');
});
