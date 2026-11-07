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
  const root = path.resolve(flags.repo || process.cwd());
  const pkg = locate(root, flags);
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
  // 2. no status.json: CLOSEOUT first.
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
      const c = docIt(cli, ['check', 'closeout', tmp], { env });
      if (c.code !== 0) throw new Outcome('REJECTED', `CLOSEOUT refused by doc-it check closeout; nothing written or moved:\n${(c.out + c.err).trim()}`);
      fs.copyFileSync(tmp, closeout);
      out.push(`wrote ${path.relative(root, closeout)} (${rows.length} piece row(s)): ${c.out.trim()}`);
    } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  } else {
    const c = docIt(cli, ['check', 'closeout', closeout], { env });
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
