// docit-locate.mjs - how conclude-it finds doc-it (one rule for every consumer, do-it 1.1 D14 / X10).
// (1) env DOC_IT_CLI = absolute path to doc-it.mjs; else (2) the newest installed plugin copy
// $HOME/.claude/plugins/cache/<any marketplace>/doc-it/<version>/scripts/doc-it.mjs; else (3) missing: the caller
// prints exactly "[skip] doc-it not installed: <what was not checked>" and never reports that check as PASS.
// conclude-it keeps no copy of doc-it's rules, enum or template: it always calls the CLI. Zero dependencies.
// Authored by DevOtts (https://github.com/DevOtts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const verNum = (v) => v.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
const cmpVer = (a, b) => { const x = verNum(a); const y = verNum(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

// Returns the absolute path of doc-it.mjs, or null when doc-it is not installed.
export function locateDocIt(env = process.env) {
  if (env.DOC_IT_CLI && env.DOC_IT_CLI.trim() !== '') return fs.existsSync(env.DOC_IT_CLI) ? path.resolve(env.DOC_IT_CLI) : null;
  const home = env.HOME || os.homedir();
  const cache = path.join(home, '.claude', 'plugins', 'cache');
  const found = [];
  let mkts = []; try { mkts = fs.readdirSync(cache); } catch { return null; }
  for (const m of mkts) {
    const b = path.join(cache, m, 'doc-it');
    let vs = []; try { vs = fs.readdirSync(b); } catch { continue; }
    for (const v of vs) { const p = path.join(b, v, 'scripts', 'doc-it.mjs'); if (fs.existsSync(p)) found.push({ v, p }); }
  }
  return found.length ? found.sort((a, b) => cmpVer(a.v, b.v)).pop().p : null;
}

export const skipLine = (what) => `[skip] doc-it not installed: ${what}`;

// Runs `node <doc-it.mjs> <args>`; returns { code, out, err }.
export function docIt(cli, args, { cwd, env = process.env } = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd, env });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
