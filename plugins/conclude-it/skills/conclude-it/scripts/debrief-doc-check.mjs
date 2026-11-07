#!/usr/bin/env node
// debrief-doc-check.mjs - conclude-it Step 2 (debrief): run `doc-it check expiry` and keep the pages THIS session
// touched, for the verdict. Report only: it never rewrites a page or a `verified:` date, and writes no file.
// It also answers the supersession sweep's question "where is the one home of this fact kind?" only from doc-it;
// doc-it 0.1.0 has no such lookup (DS-1 ships "not yet checked", D12), so the answer is "not yet checked" and no
// home is ever invented here. Without doc-it: "[skip] doc-it not installed: <check>" per check, exit 0.
// Zero dependencies, Node 18+. Authored by DevOtts (https://github.com/DevOtts).
//
//   debrief-doc-check --repo R (--pages a.md,b.md | --since <git ref>) [--today YYYY-MM-DD] [--json]
//   --since: the pages changed between <ref> and the working tree, plus untracked files.
// Exit: always 0 (report only), 2 on a usage error.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { locateDocIt, skipLine, docIt } from './docit-locate.mjs';

class Usage extends Error {}
const HOMES = 'fact-kind homes (DS-1)';

function touchedPages(root, flags) {
  if (flags.pages) return [...new Set(flags.pages.split(',').map((p) => p.trim()).filter(Boolean).map((p) => path.relative(root, path.resolve(root, p))))];
  if (!flags.since) throw new Usage('--pages <a,b> or --since <git ref> is required');
  const g = (...a) => { const r = spawnSync('git', a, { cwd: root, encoding: 'utf8' }); if (r.status !== 0) throw new Usage(`git ${a.join(' ')}: ${(r.stderr || '').trim()}`); return r.stdout.split('\n').filter(Boolean); };
  return [...new Set([...g('diff', '--name-only', flags.since), ...g('ls-files', '--others', '--exclude-standard')])];
}

export function check(flags, env = process.env) {
  const root = path.resolve(flags.repo || process.cwd());
  const pages = touchedPages(root, flags);
  const cli = locateDocIt(env);
  if (!cli) return { lines: [skipLine('check expiry'), skipLine(HOMES)], result: null };
  const lines = []; const result = { pages, expired: [], missing_verified: [], homes: 'not yet checked' };
  const args = ['check', 'expiry', '--root', root, '--json'];
  if (flags.today) args.push('--today', flags.today);
  const r = docIt(cli, args, { cwd: root, env });
  let res = null;
  if (r.code === 2) lines.push(`[skip] doc-it check expiry not run: ${(r.err || r.out).trim().split('\n')[0]}`);
  else { try { res = JSON.parse(r.out); } catch { lines.push(`[skip] doc-it check expiry gave unreadable output (exit ${r.code})`); } }
  if (res) {
    const touched = new Set(pages);
    result.expired = (res.expired || []).filter((e) => touched.has(e.path));
    result.missing_verified = (res.missing_verified || []).filter((p) => touched.has(p));
    result.expiry_days = res.expiry_days;
    const n = result.expired.length + result.missing_verified.length;
    lines.push(`doc-it check expiry on ${pages.length} page(s) this session touched: ${n ? `${n} need review` : 'none expired'} (report only; nothing rewritten)`);
    for (const e of result.expired) lines.push(`  expired ${e.path}: verified ${e.verified} (${e.age_days} days, limit ${res.expiry_days})`);
    for (const p of result.missing_verified) lines.push(`  no verified: date ${p}`);
  }
  lines.push(`${HOMES}: not yet checked (doc-it has no home lookup; D12). The supersession sweep names no home on doc-it's behalf.`);
  return { lines, result };
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const flags = {};
  try {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--json') { flags.json = true; continue; }
      if (!['--repo', '--pages', '--since', '--today'].includes(a) || i + 1 >= argv.length) throw new Usage(`unexpected argument "${a}"`);
      flags[a.slice(2)] = argv[++i];
    }
    const r = check(flags, env);
    if (flags.json) process.stdout.write(`${JSON.stringify({ ...r.result, lines: r.lines }, null, 2)}\n`);
    else for (const l of r.lines) process.stdout.write(`${l}\n`);
    return 0;
  } catch (e) {
    if (e instanceof Usage) { process.stderr.write(`usage: debrief-doc-check: ${e.message}\n`); return 2; }
    process.stderr.write(`debrief-doc-check: error: ${e.stack || e.message}\n`); return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
