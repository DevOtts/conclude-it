// Shared fixtures for the conclude-it A1 tests (do-it 1.1). Boards are written by the REAL build-it status-write
// (env DOIT_STATUS_WRITE, or an installed build-it); doc-it is the REAL CLI (env DOC_IT_CLI, or an installed copy).
// Authored by DevOtts (https://github.com/DevOtts).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveStatusWrite } from '../plugins/conclude-it/skills/conclude-it/scripts/ledger-card.mjs';
import { locateDocIt } from '../plugins/conclude-it/skills/conclude-it/scripts/docit-locate.mjs';

export const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../plugins/conclude-it/skills/conclude-it/scripts');
export const W = resolveStatusWrite(process.env);
export const DOC_IT = locateDocIt(process.env);
export const tmpDirs = [];
export function cleanup() { for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); }

export function sw(args, cwd) { const r = spawnSync(process.execPath, [W, ...args], { encoding: 'utf8', cwd }); return { code: r.status, out: r.stdout, err: r.stderr }; }
// Runs one conclude-it script with a minimal env (no inherited DOC_IT_CLI unless given).
export function script(name, args, { cwd, env = {} } = {}) {
  const base = { PATH: process.env.PATH, HOME: env.HOME || os.tmpdir(), DOIT_STATUS_WRITE: W };
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, name), ...args], { encoding: 'utf8', cwd, env: { ...base, ...env } });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
export function mkTmp(prefix) { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))); tmpDirs.push(d); return d; }

export function git(root, ...args) {
  const r = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

// A repo with docs/implementation/<name>/ holding a status.json board (real writer) of the given tasks.
export function mkBoardRepo({ name = 'pkg', tasks = ['T-01', 'T-02'], base = 'docs/implementation', where = null } = {}) {
  const root = mkTmp('a1-');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  const dir = path.join(root, base, ...(where ? [where] : []), name);
  fs.mkdirSync(dir, { recursive: true });
  const plan = path.join(root, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ implementation: name, waves: [{ id: 'W1', title: 'W', tasks: tasks.map((id) => ({ id, title: id })) }], pieces: [] }));
  const file = path.join(dir, 'status.json');
  const r = sw(['init', '--file', file, '--plan', plan, '--by', 'plan-it'], root);
  assert.equal(r.code, 0, r.err);
  const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  return { root, dir, file, read };
}

export function verify(r, ids) {
  const rel = path.relative(r.root, r.dir);
  for (const id of ids) {
    fs.mkdirSync(path.join(r.dir, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(r.dir, 'evidence', `${id}.log`), 'all green\n');
    fs.writeFileSync(path.join(r.dir, 'evidence', `${id}.verdict.md`), `review-it verdict\ntask: ${id}\nverdict: PASS\n`);
    assert.equal(sw(['set', id, '--status', 'done', '--evidence', `${rel}/evidence/${id}.log`, '--by', 'build-it', '--file', r.file], r.root).code, 0);
    const v = sw(['set', id, '--status', 'verified', '--evidence', `${rel}/evidence/${id}.verdict.md`, '--by', 'review-it', '--file', r.file], r.root);
    assert.equal(v.code, 0, v.err);
  }
}

// Every path under dir, relative and sorted.
export function tree(dir) {
  const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); out.push(path.relative(dir, p)); if (e.isDirectory()) walk(p); } };
  walk(dir); return out.sort();
}
