---
name: conclude-it
description: Close a Claude Code session the right way — and if the session shipped something, prove it in prod first. The single front door for EVERY session close. A mechanical Step-0 triage detects ship-shaped sessions (deploys run, feature work merged, DoD met without prod verification) and runs the ship pipeline first (references/ship-pipeline.md — local test gate → merge+deploy → prod gate → archive plan docs → backlog → PM board), then the session-close core every session gets — knowledge debrief (with supersession sweep), session-history ledger card, mid-flight + controlled-sessions verification, idle-subagent reaping, own-footprint sweep (incl. secrets at rest), stop-gate, CONCLUDE_REPORT.html for ship sessions, honest safe-to-exit verdict. Use when the user says "conclude", "/conclude-it", "exit", "close this session", "wrap up and exit", "I'm done for now", "end session", "shut it down", "clean up before I leave", "ship it and close", "it's built — ship it and wrap up", "did you clean up after yourself", or asks whether it's safe to exit. First run in a repo: a five-question setup interview (docs home, second brain + scope, deploy skill, debrief skill) saved INSIDE the repo — asked once per repo, global only on explicit request. It prepares the quit; the user types it.
author: DevOtts
author_url: https://github.com/DevOtts
---

# /conclude-it — one door for every session close

`/plan-it` plans it, `/build-it` builds it, `/review-it` reviews it, **`/conclude-it`
concludes it** — whether "it" is a shipped epic or an ordinary working session.

Every close runs the same **session-close core** (Steps 1–6 below). Sessions that
shipped — or should ship — run the **ship pipeline first**
(`references/ship-pipeline.md`), so nothing gets filed as done that wasn't proven
in prod. Step 0 decides which path you're on; the user never chooses a command.

Like the rest of the family, this skill is a **conductor, not a replacement**: test
cycles, fix loops, deploys, and knowledge capture live in `/full-qa`, `/iterate`,
the project's deploy skill, and the project's session-debrief (a generic
`session-debrief` ships in this plugin). This skill sequences them behind
fail-closed gates and ends with an honest verdict.

## Principles

- **Durable beats resumable.** A session's hard-won context belongs in files
  (docs, knowledge base, memory, task-state) — greppable and shareable, not
  trapped in an agent's transcript. Externalize, then tear down.
- **Fail-closed gates.** On the ship path, nothing advances past a red gate, and a
  skipped gate is a failed gate.
- **Honest, not theatrical.** If a suite can't run, a prod check has no target, or
  work is unfinished — say so and stop. Never fake a green to reach "safe to exit."
- **Verify before you reap.** Never stop a subagent, kill a process, or declare
  safe-to-exit while real work is mid-flight.
- **Delegate, don't reimplement.** Call `/full-qa`, `/iterate`, the deploy skill,
  and the debrief by name; degrade to inline only when one is absent, and say so.
- **Outward actions are deliberate.** Invoking the ship path authorizes the deploy
  sequence — but never truly irreversible sub-actions (destructive prod
  migrations, volume drops). Those still need an explicit yes.

## Model tiering — who KNOWS vs who TYPES

The main loop is the coordinator: it holds gates, reads evidence, declares
verdicts. Mechanical work goes to the cheapest model that fits; escalate on
struggle rather than pre-paying:

| Step | Where it runs |
|---|---|
| 0 triage, 1 intent, 6 verdict | Main (needs session context; trivial cost) |
| Ship pipeline S1–S7 | Its own tiering table (see `references/ship-pipeline.md`) |
| 2 debrief | The debrief skill's own tiering (e.g. a mid-tier doc-curator) |
| 2.5 ledger card | Main AUTHORS the card verbatim → ONE small-model subagent does the mechanics (write card, INDEX rows, optional mirror), returns written paths |
| 3 mid-flight sweep | small-model subagent for the git sweep across touched repos; background-task + controlled-session checks stay Main (harness-visible only here) |
| 4 reap | Main (stopping subagents is coordinator-only) |
| 4.5 footprint sweep | Main decides WHAT it created and owns secret-at-rest removal; a small-model subagent may execute deletions from an exact named list |
| 5 stop-gate | small-model subagent (check state files reflect reality, report back) |
| 5.5 CONCLUDE_REPORT.html | small-model subagent authors the JSON manifest (mid-tier if the honest-states need nuance); `build-report.py` renders deterministically |

Rules: hand subagents exact content and paths — they weren't in the session and
must not invent. Require evidence back (paths written, counts), never a bare
"done". For a genuinely tiny close (2–3 file ops), inline is cheaper than
spawning — do it inline and say so.

## First run in a repo — the setup interview (once per repo)

Before the first close in a repo, conclude-it needs five facts. They are
**per-repo memory, saved inside the repo** — never global unless the user says
so. On every invocation, resolve the config first:

1. Look for the block `## conclude-it — project setup` in `CLAUDE.md` →
   `AGENTS.md` → `.conclude-it/config.md` at the repo root.
2. **Found** — or the answers are already derivable from the repo's existing
   agent instructions (a declared docs home, a named deploy/debrief skill) →
   use it silently and continue to Step 0. Opening a different repo/folder
   without the block → the interview runs again there.
3. **Missing** → run the interview NOW, before anything that depends on it.

**Detect first, then ask.** Pre-scan so every question arrives with proposed
answers: candidate docs folders (`docs/`, `documentation/`, `wiki/`),
`.claude/skills/*deploy*` and `*debrief*` matches, vault signals (an
`.obsidian/` dir in common locations). Never ask what detection already
answered — present it for confirmation. Then ask the five questions in ONE
batch:

1. **Docs home** — "Where is this project's documentation folder? Give me the
   path." (Offer detected candidates; offer to create `docs/` if none.)
2. **Second brain** — "Do you keep a second brain — an Obsidian vault or
   similar? Give me the path." (Or: none.)
3. **Second-brain scope** — "Is your second brain global (one vault across all
   projects) or per-project? Explain the setup — or just say the word and I'll
   inspect it and guess where session knowledge should be filed." A guess is
   recorded AS a guess and proposed for approval — never silently trusted.
4. **Deploy** — "I use generic deploy steps by default. I recommend you create
   — or point me to — a `<project>-deploy` skill with this repo's exact deploy
   instructions, and I'll follow it on every ship." Record the named skill, or
   `none` plus the recommendation. Offer to scaffold the skill now from what
   this session already knows about deploying this repo.
5. **Debrief** — same shape: "create — or point me to — a `<project>-debrief`
   skill that explains how your documentation structure works, and I'll follow
   those guidelines." Record it; else the bundled generic `session-debrief`.

Write the block (prefer the file the repo already uses — `CLAUDE.md`, else
`AGENTS.md`; create `CLAUDE.md` if it has neither):

```markdown
## conclude-it — project setup
- docs_home: docs/
- second_brain: ~/Vault/MyBrain            # or: none
- second_brain_scope: global               # global | per-project | none
- second_brain_notes: session knowledge → wiki/projects/<slug>/ (guessed — confirm)
- deploy_skill: acme-deploy                # or: none (recommended: create acme-deploy)
- debrief_skill: acme-debrief              # or: session-debrief (generic)
- configured: YYYY-MM-DD
```

**Global only on request:** if the user explicitly says "save this globally",
ALSO write the answers as defaults in the user-level instructions
(`~/.claude/CLAUDE.md` or the agent's equivalent). Per-repo blocks always
override the global defaults.

**Consumers:** Step 2 runs `debrief_skill`; Step 2.5 mirrors the ledger card to
the second brain only when `second_brain_scope: global` (or the notes say so);
ship-pipeline S2 deploys via `deploy_skill`. Where a value is `none`, the step
degrades as specified — and the verdict repeats the recommendation once (e.g.
"deploy ran inline — consider creating `acme-deploy`").

## Step 0 — Triage: plain close or ship-close?

Decide from **mechanical signals**, not vibes. Check, in order:

1. **Deploys this session?** Did the session invoke a deploy skill, `vercel
   --prod`, a deploy script, or push images/infra changes to prod?
2. **Feature work at the merge boundary?** Commits merged to the deploy branch
   this session, or a feature branch green and awaiting merge, that the user
   expects live?
3. **DoD met without prod verification?** A `/build-it` (or equivalent) run
   reached its Definition of Done, and prod was never re-verified after?
4. **The user's words:** "ship it", "it's done", "deploy and close".

- **Any signal → ship-shaped:** say so in one line, **Read
  `references/ship-pipeline.md` (in this skill's folder) and execute S0–S7 now**,
  then return here to Step 1. The ship pipeline handles: session rename to
  `done-*`, local test gate, merge + deploy, prod gate, plan-doc archive, backlog
  capture, PM board. It does NOT debrief, write the ledger, reap, or sweep —
  those run once, below, for every path.
- **No signal → plain close** (research, planning, Q&A, parked work, hygiene —
  the common case): continue directly to Step 1.
- **Genuinely ambiguous** (e.g. work is green locally but the user never asked to
  ship): ask ONE question — "conclude (ship to prod) or just close?" Never deploy
  on a guess.

## Step 1 — Confirm intent + scope

Restate in one line what you're about to do ("wrapping up: debrief → ledger card
→ verify nothing mid-flight → reap → footprint sweep → verdict", prefixed by the
ship pipeline's outcome if it ran). If the user only asked "is it safe to exit?",
run the read-only checks (Steps 3–4) first, report, then offer the full close.

## Step 2 — Capture the knowledge (debrief)

**Skip-if-done guard (durable, not memory):** before running, check for evidence a
debrief already ran this session — a debrief report in the transcript, promoted
pages listed in run state, or the user saying they ran it. If found, do NOT
re-run: confirm which pages it touched and move on. One debrief per session.
(Don't trust recall alone — in long/compacted sessions, check the artifacts.)

Otherwise run the project's debrief skill so patterns, gotchas, decisions, and
fixes land in durable storage BEFORE teardown:

- Run the **`debrief_skill` named in the setup block**; if none is configured,
  detect a project-specific one (`.claude/skills/*debrief*` at the repo root);
  else the generic **`session-debrief`** bundled with this plugin (pointed at
  the configured `docs_home`); else capture inline (dated session-log entry + a
  memory note per the user's conventions) — and repeat the "create a
  `<project>-debrief` skill" recommendation once in the verdict.
- **Require the supersession line.** A debrief for a session that changed
  behaviour must report both "pages promoted" AND "contradictions swept: N pages
  updated/deprecated" (the promotion rule's supersede sweep). A debrief that
  only added new pages while old pages still describe the OLD behaviour is
  incomplete — send it back for the sweep.
- Record what the debrief touched (pages + `verified:` dates) — Steps 5.5/6 cite it.

Skip only if the session did nothing worth remembering (pure Q&A, trivial edits) —
and say so explicitly rather than silently skipping.

## Step 2.5 — Session-history ledger card (never skip)

Write this session's card into the **Session History Ledger** — a token-lean
catalog future sessions read INSTEAD of distilling transcripts:

- **Primary:** `<repo>/.agents/history/` at the project root (create the folder +
  a stub INDEX.md on first use).
- **Optional global mirror:** if the setup block declares a global second brain
  (`second_brain_scope: global`) or the user's `CLAUDE.md` declares a global
  session-history location, copy the card there (per `second_brain_notes`) and
  append that INDEX row too. Don't invent one.

Unlike the debrief, this runs for EVERY session, even trivial ones (a 3-line card
is fine) — the catalog's value is completeness ("which session did X?" must
always be answerable).

1. **Identify the account alias** if the user runs multiple Claude
   subscriptions/config dirs (derive from `$CLAUDE_CONFIG_DIR`'s basename, e.g.
   `.claude-work` → `work`); else use `default`.
2. **Write the card** to
   `<repo>/.agents/history/<alias>/YYYY-MM-DD--<session-name>.md` (≤40 lines):
   frontmatter (`session`, `alias`, `session_id` from `$CLAUDE_CODE_SESSION_ID`,
   `project`, `cwd`, `date`, `status`, `tags`) + OKR-style body — **Objective**
   (one sentence), **Key results** (honest: RED/unverified stays RED), **Files
   touched** (key paths + 5-word why), **Pointers** (debrief page / STATUS row /
   PRs), **Next** (deferred items).
3. **Append one row to `<repo>/.agents/history/INDEX.md`** (newest first, under
   the header): `| date | alias | project | [name](path) | status | tags |
   one-line summary |`. One line only — never restructure the index.
4. **Mirror** (only if a global tier is declared): `cp` the card + append the
   same INDEX row there. The card lives in the PRIMARY repo's ledger if the
   session spanned several repos.

The card is a pointer + outcome summary, NOT a second debrief.

## Step 3 — Verify nothing is mid-flight (read-only)

Check, and report what you find:

- **Background tasks** — any still `running`? (Don't stop real work; wait or tell
  the user.)
- **Unmerged / uncommitted work** — per repo touched: feature branch with
  unmerged commits? Uncommitted changes that are *yours* (ignore tool scratch)?
  Surface anything a close would strand.
- **Live jobs** — anything server-side the session kicked off (backfill, deploy,
  CI, cron)? Confirm terminal or note it's still going.
- **Controlled sessions** — did THIS session orchestrate OTHER sessions (peers
  dispatched missions, headless `claude -p` processes it spawned, remote/cloud
  sessions it drove)? List the agents it can see and cross-check the session's
  own dispatch records (state board, task-state files, transcript). Each must be
  in a terminal state: reported done/held, ran its own close, or explicitly stood
  down. A controlled session still mid-mission is mid-flight work — resolve it
  (wait, probe, or hand it to the user by name); never exit an orchestrator with
  a worker running unowned.

If anything load-bearing is mid-flight, STOP here, report it, and let the user
decide (wait, merge, or accept). Do not proceed to reaping.

## Step 4 — Reap idle subagents and the control plane

The anti-zombie step; the durable default:

> **Close finished subagents once their output is merged and captured in files.**

- For each subagent whose work is DONE and captured (Steps 2–3): stop it. Keep
  one alive ONLY while actively iterating within minutes; an idle subagent past
  the warm prompt-cache window costs more to resume than a fresh targeted agent
  reading the durable files. Default: reap.
- **Headless processes this session spawned:** if still alive after their mission
  concluded, `kill` by the **exact recorded PID only** — never a pattern-matched
  kill (a grep-kill can take out another session's process).
- **Peer terminal sessions it dispatched:** you can't close another terminal —
  hand the user a per-terminal list: concluded (safe to close / rename `done-*`),
  stood down with nothing run (close, no rename), or stuck. Reflect each final
  state on the state board so nothing must be re-derived.

Report how many you stopped and the controlled-sessions list.

## Step 4.5 — Sweep the session's OWN footprint (never skip)

Clean everything *this session created* that isn't durable and isn't referenced.
This step has **receipts**: the session knows what it made, because it made it.
That is the whole safety model — and the boundary:

> **Clean only what you can show you created. Anything you cannot date or
> attribute gets REPORTED, never touched.**

### 1. Secrets at rest — FIRST

Did this session write a credential anywhere that outlives it? A URI/token echoed
to a file on a remote host or **inside a running pod/container** (`/tmp/uri.txt`
with a DB password is the canonical case); a secret in a heredoc/script/`.env`
copy; credentials in a redirected log. Remove them, then **verify absence**
rather than trusting the `rm` — and say in the report that you checked. A
credential left behind is the one cleanup failure that is not cosmetic.

### 2. The rest

| Artifact | Disposition |
|---|---|
| Worktrees it created | remove — only when clean AND content is on main |
| Branches it created | delete local(+remote) only when **content-verified** landed; else KEEP and report |
| Files written to remote hosts / pods | remove — invisible to git-shaped checks |
| Background tasks, monitors, wakeups it started | stop, or confirm terminal |
| Local scratch (`/tmp` scripts, probes) | remove |
| Config backups it made (`*.bak-*`) | **KEEP** — the rollback path for what it shipped |
| Anything a durable doc REFERENCES | **KEEP** — see below |

### 3. Two rules that stop this step doing harm

**Ownership is proven, never globbed.** `rm /tmp/q*.js` deletes another session's
file. Check dates/attribution; delete by exact name.

**"Debris" ≠ "unreferenced".** Run-state and evidence files are frequently cited
by the very ledger card written in Step 2.5 — deleting them dangles the pointer.
Check before deleting.

### 4. Report it

What was removed, and — just as important — **what was deliberately left and
why**. "Left X because the ledger card cites it" is a result, not an omission.

## Step 5 — Satisfy the task-state stop-gate (if the project has one)

If the project gates close on task-state hygiene (features/progress tracker +
stop hook) and the session did feature work: status file reflects reality,
session-log has an entry, completed feature code is committed. If no such gate
exists, skip — don't invent one.

## Step 5.5 — CONCLUDE_REPORT.html (ship-path sessions only)

If the ship pipeline ran, produce the **local HTML double-check report** — a
local file the user opens in a browser, **never a hosted artifact** unless they
ask for a link:

1. **Where:** `CONCLUDE_REPORT.html` in the epic's implementation folder at its
   **post-archive** location (e.g. `docs/implementation/0-done/<epic>/`); else
   the docs root, and say so.
2. **How:** this skill's folder ships the machinery — a small-model subagent
   authors ONLY a small JSON manifest (facts handed to it by the coordinator:
   gates + evidence, what shipped, what was archived/debriefed, honest
   remainders, markdown reports to embed); then
   `python3 <this-skill-folder>/build-report.py <manifest.json> --open` renders
   deterministically (light/dark toggle, badge cards, "How to test" blocks,
   embedded `.md` reports as collapsed toggles). Manifest shape: the script's
   docstring.
3. **Content rules:** summary/gates table first; per-item cards with status
   badges (`ok`/`hold`/`open`/`act`); every card gets a **"How to test"** block
   with steps the USER can perform; RED/UNVERIFIED items get their own badge and
   the blocker named — a report showing only the green half is a fake.
4. **Coordinator verifies + delivers:** non-zero exit / WARNING = broken report
   (fix manifest, rebuild). Open it in the browser, hand the user the path, and
   commit it with the closeout if it lives in a tracked docs tree.

Plain closes skip this step — the Step 6 verdict is enough.

## Step 6 — Verdict

**Plain close:**

- **Safe to exit** — one line on what landed (captured + reaped + swept),
  confirmation nothing is mid-flight, the Step 4.5 line (what was cleaned, what
  was deliberately left and why, and — explicitly — that no credential it wrote
  is still at rest).
- **Not yet** — the specific blocker and the choices (wait / merge / accept).

**Ship close** — the full scannable report:

```
# Conclude-it Report — <epic, one line>
Session: done-<name>   |   Repos: <list>

## Gates
| Gate            | Result | Evidence / Blocker |
|-----------------|--------|--------------------|
| Local tests+e2e | GREEN / RED / UNVERIFIED | <suites, counts> |
| Prod smoke      | GREEN / RED / UNVERIFIED | <what ran against prod> |

## Shipped
- Deploy: <what, where, commit/URL>   ·   Merged: <branches → main, per repo>

## Documented
- Archived to 0-done: <paths>  ·  Debrief promoted: <pages + verified: dates>
- Contradictions swept: <N pages updated/deprecated> (supersession sweep)
- Backlog: <deferred notes + files> / none  ·  PM updated: <where> / n.a.
- Ledger: <card + INDEX rows>  ·  Report: <CONCLUDE_REPORT.html path>

## Open / unverified (if any)
- <anything that did NOT reach green, with why>

## Verdict
✅ Safe to exit — <shipped, prod-verified, filed, closed>
⚠️ Not fully concluded — <the blocker and the choice: wait / accept / fix>
```

Then STOP. Do not run the quit command — the user takes it themselves.

## What NOT to do

- Don't skip Step 0's triage, and don't deploy on a guess when ship intent is
  ambiguous — ask the one question.
- Don't advance past a red gate or skip a gate for a faster close; don't report
  GREEN off a mock, a skipped suite, or a prod check with no real target.
- Don't re-run a debrief that already ran (Step 2 guard — check artifacts, not
  memory), and don't accept a debrief with no supersession line for a session
  that changed behaviour.
- Don't stop a subagent or background task that's doing real work; don't declare
  safe-to-exit over a stranded branch or running job — surface it.
- Don't skip the ledger card — even a trivial session gets one.
- Don't glob-delete in shared locations; prove ownership per file. Don't delete
  what a durable doc cites.
- Don't publish CONCLUDE_REPORT.html to a hosted surface uninvited — local file,
  opened in the browser; and never let it show only the green half.
- Don't invent a PM surface, backlog convention, archive convention, or
  task-state gate the project doesn't have.
- Don't re-run the setup interview in a repo whose setup block (or equivalent
  existing declarations) already answers it — and never write the answers
  globally unless the user explicitly asks.
- Don't quit the process yourself; you prepare the exit, the user takes it.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
