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
// The package must be inside --repo and in the same git repo (not a submodule or nested repo) -> else usage error.
// No status.json, but git tracks it at HEAD or it ever existed at that path (any ref) -> DENIED (board deleted; restore it).
// No status.json, and some other board in the repo vanished without a close (deleted on any ref, or missing from the
//   working tree; not restored, not in 0-done/, not named by a recorded owner note) -> DENIED: this package may be it,
//   renamed or rewritten. --owner-note naming that board's folder lets the CLOSEOUT path go on; the note is recorded in
//   the CLOSEOUT so later archives count that board as accounted for. Paths use the real on-disk case.
// No status.json, git knows nothing, but a STATUS.md rendered by the board writer or a plan.json remains -> DENIED too.
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
// How git knows that a board was lost, for a package that has no status.json in the working tree. Returns
// { here } (this package's own board: always DENIED), { orphans: [...] } (boards elsewhere that vanished without a close)
// or null (git knows nothing, or not a git repo). `top` is the package's own git top (R3-A1-M6) and `dir` its real path.
//   1. This path: <dir>/status.json is in the index, or ever existed at that path on any ref (`--all`).
//   2. History-wide (R3-A1-M5): every status.json that git ever saw deleted, on any ref (`git log --all -m --no-renames
//      --diff-filter=D`, uncapped; with --no-renames a rename is a delete plus an add, so a rename with an edit or a
//      rename buried under any number of files is still a delete), plus boards that live only on a history unrelated
//      to HEAD (an orphan branch, R3-L3), plus every status.json tracked at HEAD or in the
//      index that is missing on disk (an uncommitted delete or move). Outside docs/implementation(s)/ a path counts
//      only when some committed version of it is a board (an object with `implementation` and a `waves` array).
//      Such a board is accounted for, and skipped, when:
//        - a status.json is on disk at that path again (restored, or re-created), or the path is inside a 0-done/ folder;
//        - <parent>/0-done/<name>/status.json is on disk (the package was archived with its board);
//        - a CLOSEOUT.md in a 0-done/ folder carries archive-package's owner-note record naming that board.
//      Every other one is an orphan: a board that vanished with no close. The package being archived may be it,
//      renamed, moved or rewritten, and git cannot always tell (rename detection needs 50% similarity), so the CLOSEOUT
//      path is refused while any orphan is unaccounted for, unless --owner-note names the orphan's folder.
//      Whether the orphan's folder still exists does not matter: a stub folder left behind would otherwise hide it.
// When core.ignorecase is set, git paths are matched case-insensitively (`:(icase)` pathspecs).
const BOARD_ROOTS = ['docs/implementations', 'docs/implementation'];
const OWNER_NOTE_RECORD = /<!--\s*archive-package owner-note boards:\s*([^>]*?)\s*-->/g;
function boardHistory(top, dir) {
  const g = (...a) => { try { return execFileSync('git', a, { cwd: top, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 << 20 }); } catch { return ''; } };
  const icase = g('config', '--bool', 'core.ignorecase').trim() === 'true';
  const ps = (p) => (icase ? `:(icase)${p}` : `:(literal)${p}`);
  const allBoards = icase ? ':(glob,icase)**/status.json' : ':(glob)**/status.json';
  const relDir = path.relative(top, dir).split(path.sep).join('/');
  if (!relDir || relDir.startsWith('..')) return null;
  const board = `${relDir}/status.json`;
  // 1. this path
  if (g('ls-files', '--', ps(board)).trim()) return { here: `${board} is tracked at HEAD` };
  const sha = g('log', '--all', '-1', '--format=%H', '--', ps(board)).trim();
  if (sha) return { here: `${board} existed in commit ${sha.slice(0, 12)}` };
  // 2. history-wide
  const lost = new Map(); // path -> how
  let cur = '';
  for (const l of g('log', '--all', '-m', '--no-renames', '--diff-filter=D', '--format=%H', '--name-only', '--', allBoards).split('\n')) {
    const t = l.trim(); if (!t) continue;
    if (/^[0-9a-f]{40}$/.test(t)) { cur = t; continue; }
    if (path.posix.basename(t).toLowerCase() === 'status.json' && !lost.has(t)) lost.set(t, `was deleted in commit ${cur.slice(0, 12)}`);
  }
  // R3-L3: a board added only in commits that share no history with HEAD (`git checkout --orphan` leaves the old
  //   branch holding it, and nothing on HEAD's line ever deletes it). A board on an ordinary branch that shares history
  //   with HEAD is work in progress there, not lost.
  cur = '';
  const unrelated = new Map();
  for (const l of g('log', '--all', '-m', '--no-renames', '--diff-filter=A', '--format=%H', '--name-only', '--', allBoards).split('\n')) {
    const t = l.trim(); if (!t) continue;
    if (/^[0-9a-f]{40}$/.test(t)) { cur = t; continue; }
    if (lost.has(t) || path.posix.basename(t).toLowerCase() !== 'status.json') continue;
    if (!unrelated.has(cur)) unrelated.set(cur, !g('merge-base', 'HEAD', cur).trim());
    if (unrelated.get(cur)) lost.set(t, `lives only in commit ${cur.slice(0, 12)}, on a history unrelated to HEAD (an orphan branch)`);
  }
  // uncommitted: deleted from HEAD (staged or not), or added to the index and then deleted on disk
  const unc = (...a) => g('diff', '--no-renames', '--diff-filter=D', '--name-only', '-z', ...a, '--', allBoards).split('\0');
  for (const t of new Set([...unc('HEAD'), ...unc()])) {
    if (t && path.posix.basename(t).toLowerCase() === 'status.json' && !lost.has(t)) lost.set(t, 'is deleted in the working tree (uncommitted)');
  }
  const inRoot = (p) => BOARD_ROOTS.some((r) => (icase ? p.toLowerCase() : p).startsWith(`${r}/`));
  // Outside the board roots a status.json counts unless no committed version of it was ever a board; past 50 versions
  // it counts without looking (fail closed).
  const isBoard = (p) => {
    const shas = g('log', '--all', '--no-renames', '--format=%H', '--', ps(p)).split('\n').map((x) => x.trim()).filter(Boolean);
    if (shas.length > 50) return true;
    const texts = shas.map((s) => g('show', `${s}:${p}`)); texts.push(g('show', `:${p}`));
    return texts.some((txt) => { try { const j = JSON.parse(txt); return !!j && typeof j === 'object' && 'implementation' in j && Array.isArray(j.waves); } catch { return false; } });
  };
  const records = new Set();
  const readRecords = (doneDir) => {
    let ents = []; try { ents = fs.readdirSync(doneDir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      let txt = ''; try { txt = fs.readFileSync(path.join(doneDir, e.name, 'CLOSEOUT.md'), 'utf8'); } catch { continue; }
      for (const m of txt.matchAll(OWNER_NOTE_RECORD)) for (const b of m[1].split(',').map((x) => x.trim()).filter(Boolean)) records.add(icase ? b.toLowerCase() : b);
    }
  };
  const readDone = new Set();
  const orphans = [];
  for (const [p, how] of lost) {
    if (p.split('/').some((s) => s.toLowerCase() === '0-done')) continue;
    if (fs.existsSync(path.join(top, p))) continue;
    const folder = path.posix.dirname(p);
    const parent = path.posix.dirname(folder);
    const doneDir = path.join(top, parent, '0-done');
    if (fs.existsSync(path.join(doneDir, path.posix.basename(folder), 'status.json'))) continue;
    if (!readDone.has(doneDir)) { readDone.add(doneDir); readRecords(doneDir); }
    if (records.has(icase ? p.toLowerCase() : p)) continue;
    if (!inRoot(p) && !isBoard(p)) continue;
    orphans.push({ board: p, folder, how });
  }
  return orphans.length ? { orphans } : null;
}
// The owner note names an orphan board when it holds the board's folder (repo-relative, or relative to the
// docs/implementation(s)/ root) as a whole token.
function noteNames(note, folder) {
  if (!nonEmpty(note)) return false;
  const names = [folder];
  for (const r of BOARD_ROOTS) if (folder.toLowerCase().startsWith(`${r}/`)) names.push(folder.slice(r.length + 1));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return names.some((n) => new RegExp(`(^|[^\\w./-])${esc(n)}/?($|[^\\w./-])`, 'i').test(note));
}
// R3-A1-M5: the owner note that accounted for orphan boards, recorded in the CLOSEOUT (an HTML comment doc-it's lint
// ignores, plus a visible line). Later archives read the comment from CLOSEOUTs in 0-done/ folders.
function ownerRecord(orphans, note) {
  if (!orphans.length) return '';
  return `\n<!-- archive-package owner-note boards: ${orphans.map((o) => o.board).join(', ')} -->\nOwner note on boards deleted without a close (${orphans.map((o) => o.folder).join(', ')}): ${cell(note)}\n`;
}
// The writer's render marker (build-it status-render RENDER_MARKER, first line of a generated STATUS.md).
const RENDER_MARKER = '<!-- generated from status.json by status-write';
function boardTrace(dir) {
  for (const f of [path.join(dir, 'STATUS.md'), path.join(dir, 'delivery', 'STATUS.md')]) {
    try { if (fs.readFileSync(f, 'utf8').slice(0, 200).trimStart().startsWith(RENDER_MARKER)) return f; } catch { /* absent */ }
  }
  const plan = path.join(dir, 'plan.json');
  return fs.existsSync(plan) ? plan : null;
}
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
// The innermost git repo holding `cwd` (a submodule's own top, not the outer repo's), real path; null outside git.
function gitTop(cwd) {
  try { return real(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { return null; }
}
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
  // R3-A1-M6: the package must be inside --repo, and in the same git repo (not a submodule or a nested clone), so the
  //   board checks below ask the repo that really holds the package.
  { const rel = path.relative(root, pkg.dir);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Outcome('USAGE', `package dir ${pkg.dir} is outside --repo ${root}; pass --repo <the repo that holds the package>; nothing moved`, 2);
    const pkgTop = gitTop(pkg.dir);
    if (pkgTop && pkgTop !== gitTop(root)) throw new Outcome('USAGE', `${rel} is inside the git repo ${pkgTop} (a submodule or nested repo), not the repo of --repo ${root}; pass --repo ${pkgTop}; nothing moved`, 2); }
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
  //    R3-A1-M5: any other board that vanished without a close (deleted on any ref, or missing from the working tree)
  //    may be this package renamed or rewritten, so the CLOSEOUT path also waits for it, unless --owner-note names it.
  const top = gitTop(pkg.dir);
  const hist = top ? boardHistory(top, pkg.dir) : null;
  if (hist?.here) throw new Outcome('DENIED', `board deleted: ${hist.here}; ${path.relative(root, path.join(pkg.dir, 'status.json'))} is missing from the working tree; restore the board (git restore, or git checkout <sha> -- <path>) and close through the guarded close; the CLOSEOUT path is not allowed for a package that had a board; nothing moved`);
  let noted = [];
  if (hist?.orphans) {
    const open = hist.orphans.filter((o) => !noteNames(flags['owner-note'], o.folder));
    if (open.length) {
      const list = open.slice(0, 5).map((o) => `${o.board} ${o.how}`).join('; ') + (open.length > 5 ? `; and ${open.length - 5} more` : '');
      throw new Outcome('DENIED', `board deleted: ${list}, with no close: its folder has no board, it is not in a 0-done/ folder, and no archive-package owner note names it. This package may be that board's package, renamed, moved or rewritten, so the CLOSEOUT path is not allowed. If it is, restore the board and close through the guarded close. If that board is unrelated, pass --owner-note naming its folder (${open[0].folder}); the note is recorded in the CLOSEOUT; nothing moved`);
    }
    noted = hist.orphans;
  }
  // R2-L2: a board git never saw (never committed, or no git) leaves traces the board writer and plan-it put there: a
  //   STATUS.md rendered from status.json (its first line is the writer's marker) or plan.json. Either one means the
  //   package had a board, so the CLOSEOUT path is not allowed.
  const trace = boardTrace(pkg.dir);
  if (trace) throw new Outcome('DENIED', `board deleted: ${path.relative(root, path.join(pkg.dir, 'status.json'))} is missing, but ${path.relative(root, trace)} shows the package had one; restore the board and close through the guarded close; the CLOSEOUT path is not allowed for a package that had a board; nothing moved`);
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
    const text = fillTemplate(t.out, { name: pkg.name, date: flags.date || new Date().toISOString().slice(0, 10), by: flags.by || 'conclude-it', rows }) + ownerRecord(noted, flags['owner-note']);
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
    if (noted.length) fs.appendFileSync(closeout, ownerRecord(noted, flags['owner-note']));
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
