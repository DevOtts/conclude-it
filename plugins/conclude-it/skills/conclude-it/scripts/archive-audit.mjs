#!/usr/bin/env node
// archive-audit.mjs - conclude-it Step 0: run `doc-it check archive` and REPORT what it finds. Never fixes anything,
// never writes a file. Without doc-it it prints "[skip] doc-it not installed: check archive" and exits 0.
// Zero dependencies, Node 18+. Authored by DevOtts (https://github.com/DevOtts).
//
//   archive-audit [--repo R] [--json]
// Exit: always 0 (report only; findings never block the close), 2 on a usage error.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateDocIt, skipLine, docIt } from './docit-locate.mjs';

const TITLES = {
  done_unclosed: 'archived but board not closed (close in place: ledger-card close --dir <pkg> [--owner-note])',
  done_without_closeout: 'archived with no board and no CLOSEOUT.md (write a CLOSEOUT)',
  stale_active: 'active board older than the stale limit while newer files exist',
  unowned: 'paths with no doc-it role',
};

export function audit({ repo, json = false } = {}, env = process.env) {
  const root = path.resolve(repo || process.cwd());
  const cli = locateDocIt(env);
  if (!cli) return { lines: [skipLine('check archive')], findings: null };
  const r = docIt(cli, ['check', 'archive', '--root', root, '--json'], { cwd: root, env });
  if (r.code === 2) {
    // Config or usage error (e.g. no .doc-it/config.json): not a PASS, not a failure of the close.
    const why = (r.err || r.out).trim().split('\n')[0];
    return { lines: [`[skip] doc-it check archive not run: ${why}`], findings: null };
  }
  // Step 0 must stay short (~15 lines) on a real archive. Newer doc-it has `check archive --summary`; older ones
  // ignore unknown flags silently, so ask `--help` whether it is supported before relying on it.
  const supportsSummary = !json && /--summary/.test(docIt(cli, ['check', 'archive', '--help'], { cwd: root, env }).out);
  if (supportsSummary) {
    const s = docIt(cli, ['check', 'archive', '--root', root, '--summary'], { cwd: root, env });
    const sum = s.out.split('\n').find((l) => l.startsWith('summary: '));
    if (s.code !== 2 && sum) {
      const n = [...sum.matchAll(/(done_unclosed|done_without_closeout|stale_active|unowned)=(\d+)/g)].reduce((t, m) => t + Number(m[2]), 0);
      const body = s.out.split('\n').filter((l) => l !== '' && l !== sum && l !== 'clean');
      const lines = [n ? `doc-it check archive: ${n} finding(s) (report only; nothing was changed)` : 'doc-it check archive: clean', ...(n ? [sum] : []), ...body];
      return { lines: capLines(lines), findings: n };
    }
  }
  let res; try { res = JSON.parse(r.out); } catch { return { lines: [`[skip] doc-it check archive gave unreadable output (exit ${r.code})`], findings: null }; }
  const n = Object.values(res).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
  if (json) return { lines: [JSON.stringify({ findings: n, ...res }, null, 2)], findings: n };
  // Fallback (doc-it without --summary): done_unclosed in full, a count line for everything else.
  const lines = [n ? `doc-it check archive: ${n} finding(s) (report only; nothing was changed)` : 'doc-it check archive: clean'];
  if (Array.isArray(res.done_unclosed) && res.done_unclosed.length) {
    lines.push(`${TITLES.done_unclosed} (${res.done_unclosed.length}):`);
    for (const x of res.done_unclosed) lines.push(`  ${x}`);
  }
  const rest = Object.entries(res).filter(([k, xs]) => k !== 'done_unclosed' && Array.isArray(xs) && xs.length).map(([k, xs]) => `${k}=${xs.length}`);
  if (rest.length) lines.push(`also found (counts only; run doc-it check archive for the lists): ${rest.join(' ')}`);
  return { lines: capLines(lines), findings: n };
}

const MAX_LINES = 15;
function capLines(lines) {
  return lines.length <= MAX_LINES ? lines : [...lines.slice(0, MAX_LINES - 1), `  ... +${lines.length - (MAX_LINES - 1)} more line(s); run doc-it check archive for the full report`];
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') flags.json = true;
    else if (argv[i] === '--repo' && i + 1 < argv.length) flags.repo = argv[++i];
    else { process.stderr.write('usage: archive-audit [--repo R] [--json]\n'); return 2; }
  }
  for (const l of audit(flags, env).lines) process.stdout.write(`${l}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
