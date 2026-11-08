#!/usr/bin/env node
// archive-package.mjs - conclude-it ship pipeline S4: the ONE way a package reaches 0-done/ (do-it 1.1 G-2).
// Never a bare `git mv`. Zero dependencies, Node 18+.
// Authored by DevOtts (https://github.com/DevOtts).
//
//   archive-package --repo R (--impl NAME | --dir PKG_DIR) [--owner-note TEXT] [--closeout-rows ROWS.json]
//                   [--by WHO] [--date YYYY-MM-DD]
//
// Package has status.json  -> guarded close: ledger-card close -> status-write close --by conclude-it --move
//                             (closed in place when the package is already in 0-done/).
//   unverified tasks and no --owner-note -> REJECTED, nothing moved, the unverified task ids are named.
// No status.json, but git tracks it at HEAD, it ever existed at that path, a folder this package was renamed from held
//   one, or an uncommitted deletion moved it here -> DENIED (board deleted; restore it). Paths use the real on-disk case.
// No status.json:
//   CLOSEOUT.md present     -> `doc-it check closeout`; ok -> moved; problems -> REJECTED, nothing moved.
//   --closeout-rows given   -> CLOSEOUT.md is written from `doc-it template closeout` (never a local copy), one row
//                              per piece, linted with `doc-it check closeout` BEFORE it lands; ok -> written + moved;
//                              problems (e.g. `carried` without a backlog link) -> REJECTED, nothing written or moved.
//   neither                 -> DENIED: write the CLOSEOUT (pass --closeout-rows) or ask the owner once.
//   doc-it missing          -> "[skip] doc-it not installed: ..." and DENIED (a package never moves on an unchecked CLOSEOUT).
// ROWS.json: [{"piece": "...", "disposition": "shipped|dropped|carried", "detail": "evidence or reason", "backlog": "path"}]
// First stdout/stderr line is the outcome: CLOSED_MOVED | CLOSED_IN_PLACE | REJECTED | DENIED | PARTIAL_FAILED.
// Exit: 0 CLOSED_MOVED / CLOSED_IN_PLACE | 1 REJECTED / DENIED / PARTIAL_FAILED | 2 usage | 4 status-write not found.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { close as guardedClose } from './ledger-card.mjs';
import { locateDocIt, skipLine, docIt } from './docit-locate.mjs';

class Outcome extends Error { constructor(kind, msg, code = 1) { super(`${kind}: ${msg}`); this.kind = kind; this.exitCode = code; } }
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Outcome('USAGE', `unexpected argument "${a}"`, 2);
    if (i + 1 >= argv.length) throw new Outcome('USAGE', `${a} needs a value`, 2);
    flags[a.slice(2)] = argv[++i];
  }
  return flags;
}
function implsDirOf(root) {
  for (const d of ['docs/implementations', 'docs/implementation']) { const p = path.join(root, d); try { if (fs.statSync(p).isDirectory()) return p; } catch { /* next */ } }
  return null;
}
function locate(root, flags) {
  let dir;
  if (nonEmpty(flags.dir)) dir = path.resolve(root, flags.dir);
  else if (nonEmpty(flags.impl)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(flags.impl)) throw new Outcome('USAGE', `unsafe package name "${flags.impl}"`, 2);
    const base = implsDirOf(root);
    if (!base) throw new Outcome('USAGE', `no docs/implementation(s)/ under ${root}; pass --dir`, 2);
    dir = [path.join(base, flags.impl), path.join(base, '0-done', flags.impl)].find((p) => fs.existsSync(p));
    if (!dir) throw new Outcome('USAGE', `package ${flags.impl} not found under ${path.relative(root, base)}/`, 2);
  } else throw new Outcome('USAGE', '--impl <name> or --dir <package dir> is required', 2);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Outcome('USAGE', `not a directory: ${dir}`, 2);
  return { dir, name: path.basename(dir), done: path.basename(path.dirname(dir)) === '0-done' };
}
function move(root, pkg) {
  if (pkg.done) return null;
  const target = path.join(path.dirname(pkg.dir), '0-done', pkg.name);
  if (fs.existsSync(target)) throw new Outcome('REJECTED', `0-done target already exists: ${path.relative(root, target)}; nothing moved`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try { fs.renameSync(pkg.dir, target); } catch (e) { throw new Outcome('REJECTED', `move failed, nothing moved: ${e.message}`); }
  return target;
}
// How git knows the package's board when the working tree has none: a sentence for the DENIED line, or null (never
// tracked, or not a git repo). Checked in order (CP-03 A1-M1, R2-A1-M3):
//   1. <dir>/status.json is in the index, or ever existed at that path in history.
//   2. Renames: every tracked file of the package is followed (`git log --follow`) to the folders it lived in; a past
//      folder that ever held a status.json means the package had a board.
//   3. Uncommitted: `git status` shows a status.json deleted (or renamed away) whose folder is gone from disk, or whose
//      folder at HEAD shares a file with this package (an uncommitted `mv` + `rm`).
// `dir` must already be the real on-disk path (realpath.native gives the true case on a case-insensitive filesystem);
// when core.ignorecase is set, git paths are matched case-insensitively too (`:(icase)` pathspecs).
const MAX_FOLLOW = 300;
function deletedBoard(root, dir) {
  const run = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  let top;
  try { top = real(run(root, 'rev-parse', '--show-toplevel').trim()); } catch { return null; }
  const g = (...a) => { try { return run(top, ...a); } catch { return ''; } };
  const icase = g('config', '--bool', 'core.ignorecase').trim() === 'true';
  const ps = (p) => (icase ? `:(icase)${p}` : `:(literal)${p}`);
  const same = (a, b) => (icase ? a.toLowerCase() === b.toLowerCase() : a === b);
  const relDir = path.relative(top, dir).split(path.sep).join('/');
  if (!relDir || relDir.startsWith('..')) return null;
  const board = `${relDir}/status.json`;
  const everAt = (p) => g('log', '-1', '--format=%H', '--', ps(p)).trim();
  // 1. this path
  if (g('ls-files', '--', ps(board)).trim()) return `${board} is tracked at HEAD`;
  let sha = everAt(board);
  if (sha) return `${board} existed in commit ${sha.slice(0, 12)}`;
  // 2. renames: the folders this package's tracked files lived in
  const files = g('ls-files', '-z', '--', ps(relDir)).split('\0').filter(Boolean).slice(0, MAX_FOLLOW);
  const seen = new Set([icase ? relDir.toLowerCase() : relDir]);
  for (const f of files) {
    const sub = f.slice(relDir.length + 1);
    for (const n of g('log', '--follow', '--name-only', '--format=', '--', f).split('\n').map((x) => x.trim()).filter(Boolean)) {
      const past = n.endsWith(`/${sub}`) ? n.slice(0, -(sub.length + 1)) : path.posix.dirname(n);
      const key = icase ? past.toLowerCase() : past;
      if (seen.has(key) || past === '.') continue;
      seen.add(key);
      sha = everAt(`${past}/status.json`);
      if (sha) return `${past}/status.json existed in commit ${sha.slice(0, 12)} (this package's ${sub} lived in ${past}/; renamed here)`;
    }
  }
  // 3. uncommitted: a deleted board whose package moved here
  const st = g('status', '--porcelain=v1', '-z', '--untracked-files=no').split('\0');
  const gone = [];
  for (let i = 0; i < st.length; i++) {
    const e = st[i]; if (e.length < 4) continue;
    const x = e[0]; const p = e.slice(3);
    if (x === 'R' || x === 'C') i++; // the next field is the original path
    if (path.posix.basename(p).toLowerCase() === 'status.json' && !fs.existsSync(path.join(top, p))) gone.push(p);
  }
  if (gone.length) {
    const here = new Set();
    const walk = (d, depth) => { if (depth > 6 || here.size > MAX_FOLLOW) return; for (const ent of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, ent.name); if (ent.isDirectory()) walk(q, depth + 1); else if (ent.isFile()) here.add(q); } };
    walk(dir, 0);
    const list = [...here];
    const blobs = new Set(list.length ? g('hash-object', '--', ...list).split('\n').map((x) => x.trim()).filter(Boolean) : []);
    blobs.delete('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'); // the empty file matches everything
    for (const p of gone) {
      const old = path.posix.dirname(p);
      if (same(old, relDir)) return `${p} is deleted in the working tree (uncommitted)`;
      const oldGone = !fs.existsSync(path.join(top, old));
      const shared = g('ls-tree', '-r', 'HEAD', '--', ps(old)).split('\n').some((l) => { const m = l.match(/^\d+ blob ([0-9a-f]{40})\t/); return m && blobs.has(m[1]); });
      if (oldGone || shared) return `${p} is deleted in the working tree (uncommitted) and its folder ${old}/ ${shared ? 'shares files with this package' : 'is gone; this package may be it, moved'}; restore it, or commit the deletion first`;
    }
  }
  return null;
}
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
const cell = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim();

// Fills doc-it's template: header placeholders, and the example rows of its table replaced by one row per piece.
// The table's columns come from the template itself; the rules stay in doc-it (checked by `check closeout`).
export function fillTemplate(template, { name, date, by, rows }) {
  const lines = template.replace(/<package name>/g, name).replace(/<YYYY-MM-DD>/g, date).replace(/<who>/g, by).split('\n');
  const h = lines.findIndex((l, i) => l.trim().startsWith('|') && /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[i + 1] || ''));
  if (h < 0) throw new Outcome('DENIED', 'doc-it template closeout has no table; cannot write CLOSEOUT.md');
  let end = h + 2; while (end < lines.length && lines[end].trim().startsWith('|')) end++;
  const body = rows.map((r) => `| ${cell(r.piece)} | ${cell(r.disposition)} | ${cell(r.detail ?? r.evidence ?? r.reason)} | ${cell(r.backlog)} |`);
  return [...lines.slice(0, h + 2), ...body, ...lines.slice(end)].join('\n');
}
function readRows(file) {
  let rows; try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Outcome('USAGE', `cannot read --closeout-rows: ${e.message}`, 2); }
  if (!Array.isArray(rows) || !rows.length || rows.some((r) => !r || !nonEmpty(r.piece))) throw new Outcome('USAGE', '--closeout-rows must be a non-empty JSON array of {piece, disposition, detail, backlog}', 2);
  return rows;
}

export function archive(flags, env = process.env) {
  const out = [];
  const root = real(path.resolve(flags.repo || process.cwd()));
  let pkg = locate(root, flags);
  // A1-L1: a symlinked package dir would move only the link; the content would stay outside the archive.
  if (fs.lstatSync(pkg.dir).isSymbolicLink()) throw new Outcome('REJECTED', `${path.relative(root, pkg.dir)} is a symlink; archive the real folder; nothing moved`);
  // R2-A1-M3: the real on-disk path and case (`--dir …/DEMO` on a case-insensitive filesystem opens demo/), so the git
  // lookups and the 0-done target use the name git and the disk know.
  { const dir = real(pkg.dir); pkg = { dir, name: path.basename(dir), done: path.basename(path.dirname(dir)) === '0-done' }; }
  // 1. status.json present: the guarded close (never a bare move).
  if (fs.existsSync(path.join(pkg.dir, 'status.json'))) {
    if (nonEmpty(flags['closeout-rows'])) throw new Outcome('USAGE', 'package has status.json: the board closes it; --closeout-rows is only for packages without a board', 2);
    let r;
    try { r = guardedClose({ repo: root, dir: pkg.dir, 'owner-note': flags['owner-note'] }, env); } catch (e) {
      const m = String(e.message || e).replace(/^REJECTED: /, '');
      if (/^PARTIAL_FAILED/.test(m)) throw new Outcome('PARTIAL_FAILED', m.replace(/^PARTIAL_FAILED: /, ''), 1);
      if (e.exitCode === 4) throw new Outcome('REJECTED', m, 4);
      throw new Outcome('REJECTED', `${m}; nothing moved`, e.exitCode === 2 ? 2 : 1);
    }
    return { out: [`${r.outcome} ${path.relative(root, r.moved || pkg.dir)}`, ...r.out.filter((l) => !/^CLOSED_/.test(l))] };
  }
  // 2. no status.json. A board that git tracks at HEAD, or that ever existed at this path, was deleted: the package
  //    had a board, so only the guarded close may archive it (CP-03 A1-M1). Never take the CLOSEOUT path then.
  const gone = deletedBoard(root, pkg.dir);
  if (gone) throw new Outcome('DENIED', `board deleted: ${gone}; ${path.relative(root, path.join(pkg.dir, 'status.json'))} is missing from the working tree; restore the board (git restore, or git checkout <sha> -- <path>) and close through the guarded close; the CLOSEOUT path is not allowed for a package that had a board; nothing moved`);
  // CLOSEOUT first.
  const closeout = path.join(pkg.dir, 'CLOSEOUT.md');
  const hasRows = nonEmpty(flags['closeout-rows']);
  if (!fs.existsSync(closeout) && !hasRows) throw new Outcome('DENIED', `${path.relative(root, pkg.dir)} has no status.json and no CLOSEOUT.md; write the CLOSEOUT (pass --closeout-rows with one row per piece) or ask the owner once; nothing moved`);
  if (fs.existsSync(closeout) && hasRows) throw new Outcome('USAGE', `${path.relative(root, closeout)} already exists; edit it or drop --closeout-rows`, 2);
  const cli = locateDocIt(env);
  if (!cli) throw new Outcome('DENIED', `doc-it is required to write and check the CLOSEOUT; nothing moved\n${skipLine('check closeout')}`);
  if (hasRows) {
    const rows = readRows(flags['closeout-rows']);
    const t = docIt(cli, ['template', 'closeout'], { env });
    if (t.code !== 0) throw new Outcome('DENIED', `doc-it template closeout failed: ${t.err.trim()}; nothing moved`);
    const text = fillTemplate(t.out, { name: pkg.name, date: flags.date || new Date().toISOString().slice(0, 10), by: flags.by || 'conclude-it', rows });
    // Lint before it lands, so a refused CLOSEOUT leaves the package untouched.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'closeout-'));
    const tmp = path.join(tmpDir, 'CLOSEOUT.md');
    try {
      fs.writeFileSync(tmp, text.endsWith('\n') ? text : `${text}\n`);
      const c = docIt(cli, ['check', 'closeout', tmp, '--root', root], { env });
      if (c.code !== 0) throw new Outcome('REJECTED', `CLOSEOUT refused by doc-it check closeout; nothing written or moved:\n${(c.out + c.err).trim()}`);
      fs.copyFileSync(tmp, closeout);
      out.push(`wrote ${path.relative(root, closeout)} (${rows.length} piece row(s)): ${c.out.trim()}`);
    } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  } else {
    const c = docIt(cli, ['check', 'closeout', closeout, '--root', root], { env });
    if (c.code !== 0) throw new Outcome('REJECTED', `${path.relative(root, closeout)} fails doc-it check closeout; nothing moved:\n${(c.out + c.err).trim()}`);
    out.push(`checked ${path.relative(root, closeout)}: ${c.out.trim()}`);
  }
  const target = move(root, pkg);
  return { out: [target ? `CLOSED_MOVED ${path.relative(root, target)}` : `CLOSED_IN_PLACE ${path.relative(root, pkg.dir)}`, ...out] };
}

export function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const r = archive(parseArgs(argv), env);
    for (const l of r.out) process.stdout.write(`${l}\n`);
    return 0;
  } catch (e) {
    if (e instanceof Outcome) { process.stderr.write(`${e.kind === 'USAGE' ? 'archive-package: usage: ' + e.message.replace(/^USAGE: /, '') : e.message}\n`); return e.exitCode; }
    process.stderr.write(`archive-package: error: ${e.stack || e.message}\n`); return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
