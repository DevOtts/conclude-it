#!/usr/bin/env node
// ledger-card.mjs - conclude-it Step 2.5 helper: upgrade an /init-it open card in place, or write the card
// as before; set ended_at and close an implementation through build-it's status-write (never by hand).
// Zero dependencies, Node 18+. No network, no model calls.
// Exit codes: 0 ok | 1 refused (close pre-check or status-write refusal) | 2 usage | 4 status-write not found
// Authored by DevOtts (https://github.com/DevOtts).
//
//   ledger-card upgrade --repo R --status concluded|shipped --body-file F [--session-id ID] [--alias A]
//                       [--session NAME] [--project P] [--date YYYY-MM-DD] [--cwd C] [--tags a,b]
//                       [--summary TEXT] [--implementation a,b]
//   ledger-card close   --repo R --impl NAME [--owner-note TEXT]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

class Fail extends Error { constructor(m, code = 1) { super(m); this.exitCode = code; } }
const BOOL = new Set([]);
function parseArgs(argv) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); if (BOOL.has(k)) flags[k] = true; else { if (i + 1 >= argv.length) throw new Fail(`--${k} needs a value`, 2); flags[k] = argv[++i]; } }
    else pos.push(a);
  }
  return { pos, flags };
}
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

// ---------- card format (same as init-it's ledger.mjs; pinned by both test suites) ----------
function stripComment(v) {
  let depth = 0; let q = null;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '[') depth++; else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === '#' && depth === 0 && i > 0 && /\s/.test(v[i - 1])) return v.slice(0, i).trimEnd();
  }
  return v;
}
export function parseCard(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/);
  const fields = {}; const order = [];
  if (lines[0]?.trim() !== '---') return { fields, order, body: lines.join('\n'), ok: false };
  let end = -1; for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { end = i; break; }
  if (end < 0) return { fields, order, body: lines.join('\n'), ok: false };
  for (let i = 1; i < end; i++) {
    const c = lines[i].indexOf(':'); if (c <= 0) continue;
    const k = lines[i].slice(0, c).trim(); if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k)) continue;
    if (!(k in fields)) order.push(k);
    fields[k] = stripComment(lines[i].slice(c + 1).trim());
  }
  return { fields, order, body: lines.slice(end + 1).join('\n'), ok: true };
}
export function parseList(v) {
  if (v == null) return null; const s = String(v).trim();
  if (s === '' || s === '[]') return [];
  const inner = s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s;
  return inner.split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}
const yamlList = (xs) => `[${xs.join(', ')}]`;
const cell = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim();
function splitCells(line) {
  const t = line.trim(); if (!t.startsWith('|')) return null;
  const out = []; let cur = '';
  for (let i = 1; i < t.length; i++) { const ch = t[i]; if (ch === '\\' && t[i + 1] === '|') { cur += '\\|'; i++; continue; } if (ch === '|') { out.push(cur.trim()); cur = ''; continue; } cur += ch; }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}
const HDR8 = '| date | alias | project | impl | session | status | tags | summary |';
const SEP8 = '|---|---|---|---|---|---|---|---|';
const isSep = (l) => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(l);
function headerAt(lines) {
  let first = null; // prefer a table that already has the Impl column anywhere in the file
  for (let i = 0; i < lines.length; i++) {
    const c = splitCells(lines[i] || ''); if (!c || !isSep(lines[i + 1] || '')) continue;
    const low = c.map((x) => x.toLowerCase());
    if (low.includes('date') && low.includes('session')) { if (low.includes('impl')) return { i, impl: true }; if (!first) first = { i, impl: false }; }
  }
  return first;
}
// A row belongs to a card only when its session cell (first cell that is exactly one link) points at it;
// a summary that quotes another card's link never matches (INIT-08).
function rowLinksTo(line, link) {
  const cells = splitCells(line); if (!cells) return false;
  const c = cells.find((x) => /^\[[^\]]*\]\([^()\s]+\)$/.test(x)); if (!c) return false;
  const t = /\]\(([^()\s]+)\)$/.exec(c)[1];
  return t === link || t.endsWith(`/${link}`);
}
// r: {date, alias, project, impl (string|null), session, link, status, tags, summary}
function upsertIndex(text, r) {
  const row8 = `| ${cell(r.date)} | ${cell(r.alias)} | ${cell(r.project)} | ${cell(r.impl ?? '')} | [${cell(r.session)}](${r.link}) | ${cell(r.status)} | ${cell(r.tags)} | ${cell(r.summary)} |`;
  const row7 = `| ${cell(r.date)} | ${cell(r.alias)} | ${cell(r.project)} | [${cell(r.session)}](${r.link}) | ${cell(r.status)} | ${cell(r.tags)} | ${cell(r.summary)} |`;
  if (text == null || text.trim() === '') {
    return r.impl == null
      ? `# Session history (${r.project})\n\n| date | alias | project | session | status | tags | summary |\n|---|---|---|---|---|---|---|\n${row7}\n`
      : `# Session history (${r.project})\n\n${HDR8}\n${SEP8}\n${row8}\n`;
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (rowLinksTo(l, r.link)) {
      // Replace in place, keeping the row's own layout: 8 cells stay 8, a legacy 7-cell row stays 7 unless an impl must be shown.
      const n = (splitCells(l) || []).length;
      lines[i] = n >= 8 || r.impl ? row8 : row7;
      return { text: lines.join(eol), replaced: true };
    }
  }
  const h = headerAt(lines);
  if (!h) return { text: `${text}${text.endsWith('\n') ? '' : eol}${eol}${HDR8}${eol}${SEP8}${eol}${row8}${eol}`, replaced: false };
  if (h.impl) lines.splice(h.i + 2, 0, row8);
  else if (r.impl == null) lines.splice(h.i + 2, 0, row7); // exactly as before init-it
  else lines.splice(h.i, 0, HDR8, SEP8, row8, '');
  return { text: lines.join(eol), replaced: false };
}

// ---------- fs helpers ----------
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function withLockSync(lock, fn, timeoutMs = 8000) {
  const start = Date.now(); let delay = 5;
  for (;;) {
    try { const fd = fs.openSync(lock, 'wx'); fs.writeSync(fd, `${process.pid} ${Date.now()}\n`); fs.closeSync(fd); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let seen = null; let dead = false; let age = 0;
      try { age = Date.now() - fs.statSync(lock).mtimeMs; seen = fs.readFileSync(lock, 'utf8'); const pid = parseInt(seen, 10); if (pid > 0 && pid !== process.pid) { try { process.kill(pid, 0); } catch (k) { dead = k.code === 'ESRCH'; } } } catch { continue; }
      if (age > 30000 || dead) {
        const grave = `${lock}.${process.pid}.${Date.now()}.stale`;
        try { fs.renameSync(lock, grave); } catch { continue; }
        let moved = null; try { moved = fs.readFileSync(grave, 'utf8'); } catch { /* gone */ }
        if (moved !== seen) { try { fs.linkSync(grave, lock); } catch { /* re-taken */ } }
        try { fs.unlinkSync(grave); } catch { /* gone */ }
        continue;
      }
      if (Date.now() - start > timeoutMs) throw new Fail(`could not acquire lock ${lock}`, 3);
      sleepSync(delay + Math.floor(Math.random() * delay)); delay = Math.min(delay * 2, 100);
    }
  }
  try { return fn(); } finally { try { fs.unlinkSync(lock); } catch { /* gone */ } }
}
function writeAtomicText(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  // Under the ledger lock: drop `<file>.<pid>.tmp` left by a writer killed before its rename (INIT-08).
  try {
    const base = path.basename(file);
    for (const n of fs.readdirSync(path.dirname(file))) {
      if (!n.startsWith(`${base}.`) || !n.endsWith('.tmp')) continue;
      const pid = Number(n.slice(base.length + 1, -4));
      if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
      let dead = false; try { process.kill(pid, 0); } catch (k) { dead = k.code === 'ESRCH'; }
      if (dead) { try { fs.unlinkSync(path.join(path.dirname(file), n)); } catch { /* gone */ } }
    }
  } catch { /* best effort */ }
  try { fs.unlinkSync(tmp); } catch { /* absent */ }
  const fd = fs.openSync(tmp, 'wx');
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (process.env.LEDGER_CARD_TEST_CRASH === 'after-tmp') process.exit(137); // test-only hook
  fs.renameSync(tmp, file);
}
function implsDirOf(root) {
  for (const d of ['docs/implementations', 'docs/implementation']) { const p = path.join(root, d); try { if (fs.statSync(p).isDirectory()) return p; } catch { /* next */ } }
  return null;
}
function implDir(root, name) {
  const base = implsDirOf(root); if (!base || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return null;
  for (const p of [path.join(base, name), path.join(base, '0-done', name)]) { try { if (fs.statSync(p).isDirectory()) return { dir: p, done: p.includes(`${path.sep}0-done${path.sep}`) }; } catch { /* next */ } }
  return null;
}

// ---------- status-write (by path, the single writer) ----------
const verNum = (v) => v.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
const cmpVer = (a, b) => { const x = verNum(a); const y = verNum(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
export function resolveStatusWrite(env = process.env) {
  if (env.DOIT_STATUS_WRITE) { if (fs.existsSync(env.DOIT_STATUS_WRITE)) return env.DOIT_STATUS_WRITE; throw new Fail(`DOIT_STATUS_WRITE points at a missing file: ${env.DOIT_STATUS_WRITE}`, 4); }
  const home = env.HOME || os.homedir();
  const found = [];
  for (const cache of [...new Set([env.CLAUDE_CONFIG_DIR, path.join(home, '.claude')].filter(Boolean).map((d) => path.join(d, 'plugins', 'cache')))]) {
    let mkts = []; try { mkts = fs.readdirSync(cache); } catch { continue; }
    for (const m of mkts) { const b = path.join(cache, m, 'build-it'); let vs = []; try { vs = fs.readdirSync(b); } catch { continue; } for (const v of vs) { const p = path.join(b, v, 'scripts', 'status', 'status-write.mjs'); if (fs.existsSync(p)) found.push({ v, p }); } }
  }
  if (found.length) return found.sort((a, b) => cmpVer(a.v, b.v)).pop().p;
  const dev = path.join(home, 'Workspace', 'Devotts', 'build-it', 'plugins', 'build-it', 'scripts', 'status', 'status-write.mjs');
  if (fs.existsSync(dev)) return dev;
  throw new Fail('status-write.mjs not found (install build-it or set DOIT_STATUS_WRITE)', 4);
}
const writer = (w, args, cwd) => spawnSync(process.execPath, [w, ...args], { encoding: 'utf8', cwd });

// ---------- implementation derivation (no git command: reads .git/HEAD and .taskstate) ----------
export function deriveImplementations(root) {
  const base = implsDirOf(root); if (!base) return [];
  const names = new Set();
  for (const sub of ['', '0-done']) { try { for (const e of fs.readdirSync(path.join(base, sub), { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== '0-done' && e.name !== '1-backlog') names.add(e.name); } catch { /* none */ } }
  const out = new Set();
  try {
    const t = fs.readFileSync(path.join(root, '.taskstate', 'implementation'), 'utf8');
    for (const n of parseList(t.trim()) || []) if (names.has(n)) out.add(n);
  } catch { /* absent */ }
  try {
    let gitDir = path.join(root, '.git');
    if (fs.statSync(gitDir).isFile()) { const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(gitDir, 'utf8')); if (m) gitDir = path.resolve(root, m[1].trim()); }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8');
    const m = /^ref:\s*refs\/heads\/(.+)$/m.exec(head);
    if (m) for (const seg of m[1].trim().split('/')) if (names.has(seg)) out.add(seg);
  } catch { /* not a repo / detached */ }
  return [...out];
}

// ---------- find the open card ----------
function findOpen(hist, sid) {
  if (!nonEmpty(sid) || sid === 'unknown') return null;
  let dirs = []; try { dirs = fs.readdirSync(hist, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')); } catch { return null; }
  for (const d of dirs) {
    let fl = []; try { fl = fs.readdirSync(path.join(hist, d.name)).filter((f) => f.endsWith('.md')); } catch { continue; }
    for (const f of fl) {
      const p = path.join(hist, d.name, f); let c;
      try { c = parseCard(fs.readFileSync(p, 'utf8')); } catch { continue; }
      if (c.ok && c.fields.status === 'open' && c.fields.session_id === sid) return { path: p, alias: d.name, file: f, card: c };
    }
  }
  return null;
}

function renderCard(order, fields, body) {
  // One line per header value: a newline in a value (tags, ids) would forge another field (INIT-08).
  const head = ['---', ...order.filter((k) => fields[k] != null).map((k) => `${k}: ${String(fields[k]).replace(/[\r\n]+/g, ' ')}`), '---'];
  return `${head.join('\n')}\n${body.replace(/^\n+/, '').replace(/\s+$/, '')}\n`;
}

// ---------- upgrade ----------
export function upgrade(flags, env = process.env) {
  const out = []; const warn = [];
  const root = path.resolve(flags.repo || process.cwd());
  const status = flags.status;
  if (!['concluded', 'shipped'].includes(status)) throw new Fail('--status must be concluded or shipped', 2);
  if (!nonEmpty(flags['body-file'])) throw new Fail('--body-file <card body markdown> is required', 2);
  let body; try { body = fs.readFileSync(flags['body-file'], 'utf8'); } catch (e) { throw new Fail(`cannot read --body-file: ${e.message}`, 2); }
  const sid = nonEmpty(flags['session-id']) ? flags['session-id'] : (nonEmpty(env.CLAUDE_CODE_SESSION_ID) ? env.CLAUDE_CODE_SESSION_ID : 'unknown');
  const hist = path.join(root, '.agents', 'history');
  const explicitImpl = nonEmpty(flags.implementation) ? parseList(flags.implementation) : [];
  const derived = deriveImplementations(root);
  const date0 = flags.date || new Date().toISOString().slice(0, 10);
  let result;
  fs.mkdirSync(hist, { recursive: true });
  withLockSync(path.join(hist, '.ledger.lock'), () => {
    const hit = findOpen(hist, sid);
    let cardPath; let alias; let file; let fields; let order; let impl;
    if (hit) {
      ({ alias, file } = hit); cardPath = hit.path;
      fields = { ...hit.card.fields }; order = [...hit.card.order];
      const prev = parseList(fields.implementation) || [];
      impl = [...new Set([...prev, ...explicitImpl, ...derived])];
      fields.status = status;
      fields.implementation = yamlList(impl);
      if (!order.includes('implementation')) order.splice(order.indexOf('status') + 1, 0, 'implementation');
      if (nonEmpty(flags.tags)) fields.tags = yamlList(parseList(flags.tags));
      fields.concluded_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      if (!order.includes('concluded_at')) order.splice(order.indexOf('tags') >= 0 ? order.indexOf('tags') : order.length, 0, 'concluded_at');
      out.push(`upgraded open card in place: ${path.relative(root, cardPath)}`);
    } else {
      for (const k of ['alias', 'session']) if (!nonEmpty(flags[k])) throw new Fail(`no open card for session ${sid}; --${k} is required to write a new card`, 2);
      alias = flags.alias; if (!/^[A-Za-z0-9_-]+$/.test(alias)) throw new Fail(`unsafe alias "${alias}"`, 2);
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(flags.session)) throw new Fail(`unsafe session name "${flags.session}"`, 2);
      // Never clobber another session's card that has the same date and name: suffix -2, -3, ... like init-it.
      // The same session re-running conclude (same id, not unknown) rewrites its own card.
      const stem = `${date0}--${flags.session}`; file = `${stem}.md`;
      for (let n = 2; ; n++) {
        let other = null; try { other = parseCard(fs.readFileSync(path.join(hist, alias, file), 'utf8')); } catch { break; }
        if (sid !== 'unknown' && other.fields.session_id === sid) break;
        if (sid === 'unknown' && other.fields.session_id === 'unknown' && other.fields.status === 'open') break; // init-it's unknown-id open card

        file = `${stem}-${n}.md`;
      }
      cardPath = path.join(hist, alias, file);
      impl = [...new Set([...explicitImpl, ...derived])];
      order = ['session', 'alias', 'session_id', 'project', 'cwd', 'date', 'status'];
      fields = { session: flags.session, alias, session_id: sid, project: flags.project || path.basename(root), cwd: flags.cwd || process.cwd(), date: date0, status };
      if (impl.length) { order.push('implementation'); fields.implementation = yamlList(impl); } // only when derivable
      order.push('tags'); fields.tags = yamlList(parseList(flags.tags || '') || []);
      fs.mkdirSync(path.dirname(cardPath), { recursive: true });
      out.push(`wrote card: ${path.relative(root, cardPath)}`);
    }
    // 0-done pointers (CARD-A section 5 step 4)
    let finalBody = body;
    for (const n of impl) { const d = implDir(root, n); if (d && d.done) { const rel = path.relative(root, d.dir); if (!finalBody.includes(rel)) finalBody = `${finalBody.replace(/\s+$/, '')}\n**Moved:** ${rel}\n`; } }
    writeAtomicText(cardPath, renderCard(order, fields, finalBody));
    const idxFile = path.join(hist, 'INDEX.md');
    let text = null; try { text = fs.readFileSync(idxFile, 'utf8'); } catch { /* new */ }
    const link = `${alias}/${file}`;
    const summary = nonEmpty(flags.summary) ? flags.summary : (body.split('\n').find((l) => l.trim()) || '').replace(/\*\*[^*]+:\*\*\s*/, '').slice(0, 160);
    const u = upsertIndex(text, {
      date: fields.date, alias, project: fields.project, impl: impl.length || hit ? impl.join(', ') : null, session: fields.session, link,
      status, tags: (parseList(fields.tags) || []).join(', '), summary,
    });
    writeAtomicText(idxFile, u.text);
    out.push(u.replaced ? 'INDEX row updated in place' : 'INDEX row added');
    result = { cardPath, impl, sid };
  });
  // ended_at (CARD-A section 5 step 3), through the writer only
  if (result.sid === 'unknown') warn.push('warning: session id unknown; ended_at not set in any status.json');
  else {
    let w = null;
    for (const n of result.impl) {
      const d = implDir(root, n); if (!d) { warn.push(`warning: implementation ${n} not found; ended_at not set`); continue; }
      const f = path.join(d.dir, 'status.json');
      let doc; try { doc = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { warn.push(`warning: ${path.relative(root, f)} missing or invalid; ended_at not set`); continue; }
      const s = (doc.sessions || []).find((x) => x.session_id === result.sid);
      if (!s) { warn.push(`warning: session ${result.sid} not registered in ${path.relative(root, f)}; ended_at not set`); continue; }
      if (s.ended_at) continue;
      if (doc.closed === true) { warn.push(`warning: ${path.relative(root, f)} is closed; ended_at left as is`); continue; }
      w = w || resolveStatusWrite(env);
      const r = writer(w, ['session', 'end', '--session-id', result.sid, '--by', 'conclude-it', '--file', f], root);
      if (r.status !== 0) warn.push(`warning: session end refused for ${n}: ${(r.stderr || '').trim()}`);
      else out.push(`ended_at set on ${n}`);
    }
  }
  return { out, warn, ...result };
}

// ---------- close (all verified, or an owner note; then move to 0-done) ----------
export function close(flags, env = process.env) {
  const out = [];
  const root = path.resolve(flags.repo || process.cwd());
  const name = flags.impl;
  if (!nonEmpty(name)) throw new Fail('--impl <name> is required', 2);
  const base = implsDirOf(root);
  const dir = base && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ? path.join(base, name) : null;
  const file = dir && path.join(dir, 'status.json');
  if (!file || !fs.existsSync(file)) throw new Fail(`no status.json for implementation ${name}`, 2);
  let doc; try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Fail(`invalid JSON in ${file}: ${e.message}`, 1); }
  const note = nonEmpty(flags['owner-note']) ? flags['owner-note'] : null;
  if (doc.closed === true) throw new Fail(`close refused: ${name} is already closed`, 1);
  const tasks = (doc.waves || []).flatMap((w) => w.tasks || []);
  const open = tasks.filter((t) => t.status !== 'verified');
  // Pre-check before ANY write, so a refused close leaves sessions and the board byte-identical.
  if (!tasks.length && !note) throw new Fail(`close refused: ${name} has no tasks on its board, so nothing is verified; pass --owner-note to close it knowingly`, 1);
  if (open.length && !note) throw new Fail(`close refused: ${open.length} task(s) not verified (${open.map((t) => t.id).join(', ')}); pass --owner-note to override`, 1);
  if (fs.existsSync(path.join(base, '0-done', name))) throw new Fail('close --move refused: 0-done target already exists', 1);
  const w = resolveStatusWrite(env);
  for (const s of (doc.sessions || []).filter((x) => !x.ended_at)) {
    const r = writer(w, ['session', 'end', '--session-id', s.session_id, '--by', 'conclude-it', '--impl', name], root);
    if (r.status !== 0) throw new Fail(`session end refused for ${s.session_id}: ${(r.stderr || '').trim()}; close not attempted`, r.status === 3 ? 3 : 1);
    out.push(`session end ${s.session_id}`);
  }
  const args = ['close', '--by', 'conclude-it', '--move', '--impl', name];
  if (note) args.push('--owner-note', note);
  const r = writer(w, args, root);
  if (r.status !== 0) throw new Fail(`status-write close refused: ${(r.stderr || '').trim()}`, r.status === 3 ? 3 : 1);
  out.push((r.stdout || '').trim() || 'closed');
  return { out, moved: path.join(base, '0-done', name) };
}

export function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const { pos, flags } = parseArgs(argv);
    const cmd = pos[0];
    const r = cmd === 'upgrade' ? upgrade(flags, env) : cmd === 'close' ? close(flags, env) : null;
    if (!r) throw new Fail('usage: ledger-card upgrade|close ... (see header of ledger-card.mjs)', 2);
    for (const l of r.warn || []) process.stderr.write(`ledger-card: ${l}\n`);
    for (const l of r.out) process.stdout.write(`${l}\n`);
    return 0;
  } catch (e) {
    if (e instanceof Fail) { process.stderr.write(`ledger-card: ${e.message}\n`); return e.exitCode; }
    process.stderr.write(`ledger-card: error: ${e.stack || e.message}\n`); return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
