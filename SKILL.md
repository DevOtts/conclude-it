---
name: conclude-it
description: >-
  The single front door for every Claude Code session close — and the ship stage of the
  *-it lifecycle (plan-it plans it, build-it builds it, review-it reviews it, conclude-it
  concludes it). A mechanical Step-0 triage detects ship-shaped sessions (deploys run,
  feature work merged, DoD met without prod verification) and runs the ship pipeline
  first: local test gate → merge+deploy → prod gate → archive plan docs → backlog → PM
  board. Then the session-close core every session gets: knowledge debrief with a
  supersession sweep (old docs get updated or deprecated, never left "current"),
  session-history ledger card, mid-flight + controlled-sessions verification,
  idle-subagent reaping, own-footprint sweep including secrets at rest, a local
  CONCLUDE_REPORT.html double-check report, and an honest safe-to-exit verdict.
  Fail-closed gates, no fake greens. First run in a repo: a five-question setup
  interview (docs home, second brain + scope, deploy skill, debrief skill) saved
  INSIDE the repo — once per repo, global only on explicit request. Trigger on
  "/conclude-it", "conclude", "exit", "close this session", "wrap up and exit",
  "I'm done for now", "end session", "clean up before I leave", "ship it and close",
  or "is it safe to exit". It prepares the quit; the user types it.
version: 2.1.1
license: MIT
author: DevOtts
author_url: https://github.com/DevOtts
homepage: https://github.com/DevOtts/conclude-it
repository: https://github.com/DevOtts/conclude-it
metadata:
  platforms: [claude-code, cursor, openclaw, mcp, openai]
  category: "Agents & Orchestration"
keywords: [session-close, ship-it, deploy-gate, prod-verification, knowledge-capture, session-debrief, cleanup, exit-ritual, claude-code, agent-skills]
---

# /conclude-it — one door for every session close

`/plan-it` plans it, `/build-it` builds it, `/review-it` reviews it,
**`/conclude-it` concludes it** — whether "it" is a shipped epic or an ordinary
working session. Closing a long session without a ritual leaves debris: knowledge
that lived only in the conversation is lost, background jobs keep running,
unmerged work is stranded, finished subagents linger as RAM-holding zombies —
and, worst, features get filed as "done" that were never proven in prod. This
skill sequences the close so none of that survives it.

**First run in a repo:** a five-question setup interview (docs home, second
brain + scope, deploy skill, debrief skill) — answered once, saved **inside the
repo**, asked again only in a repo without the block. See the setup section
below.

**One command, two legs.** Step 0 triages mechanically; the user never chooses:

- **Ship-shaped session** (deploys ran, feature work at the merge boundary, a
  Definition of Done met without prod verification, or the user said "ship it")
  → run the **ship pipeline** first, then the close core.
- **Plain session** (research, planning, Q&A, hygiene — the common case) → the
  **close core** only.
- **Ambiguous** → ask ONE question ("conclude — ship to prod — or just close?").
  Never deploy on a guess.

## First run in a repo — the setup interview (once per repo)

Before the first close in a repo, resolve five facts. They are **per-repo
memory, saved inside the repo** — never global unless the user says so. Look
for the block `## conclude-it — project setup` in `CLAUDE.md` → `AGENTS.md` →
`.conclude-it/config.md`; found (or derivable from existing agent
instructions) → use silently. Missing → **detect first** (candidate docs
folders, `*deploy*`/`*debrief*` skills, vault signals), then ask ONE batch of
five questions, each pre-filled with what detection found:

1. **Docs home** — "Where is this project's documentation folder? Give me the path."
2. **Second brain** — "Do you keep a second brain (Obsidian or similar)? Give me the path." (or: none)
3. **Second-brain scope** — "Global across projects, or per-project? Explain
   the layout — or just say the word and I'll inspect it and guess where
   session knowledge should be filed." Record a guess AS a guess; propose it
   for approval, never silently trust it.
4. **Deploy** — "I use generic deploy steps by default. Create — or point me
   to — a `<project>-deploy` skill with this repo's exact instructions and
   I'll follow it every ship." Record the skill, or `none` + the
   recommendation; offer to scaffold it now.
5. **Debrief** — "Create — or point me to — a `<project>-debrief` skill that
   explains how your documentation structure works and I'll follow those
   guidelines." Record it; else the generic debrief flow.

Write the answers into the repo (the file it already uses — `CLAUDE.md`, else
`AGENTS.md`, else create `CLAUDE.md`):

```markdown
## conclude-it — project setup
- docs_home: docs/
- second_brain: ~/Vault/MyBrain            # or: none
- second_brain_scope: global               # global | per-project | none
- second_brain_notes: session knowledge → wiki/projects/<slug>/ (guessed — confirm)
- deploy_skill: acme-deploy                # or: none (recommended: create acme-deploy)
- debrief_skill: acme-debrief              # or: generic
- configured: YYYY-MM-DD
```

If the user explicitly says "save this globally", ALSO write the answers as
user-level defaults; per-repo blocks always override. Consumers: the debrief
step runs `debrief_skill` against `docs_home`; the ledger card mirrors to the
second brain only when its scope says global; the ship pipeline deploys via
`deploy_skill` — `none` values degrade inline and the verdict repeats the
create-a-skill recommendation once.

## The ship pipeline (ship-shaped sessions only)

Fail-closed, in order. (The Claude Code plugin carries an expanded version in
`references/ship-pipeline.md`, loaded only when triage says ship-shaped; **this
file is self-contained** — on any other agent, run the steps below as written.)

1. **S0 Scope + rename** — name the epic in one line; rename the session
   `done-<name>`.
2. **S1 Local gate** — run the project's REAL test/e2e scripts (dead placeholder
   scripts are never gate targets). RED → diagnose→fix→re-run via `/iterate`
   until green; a red local gate never proceeds to prod. No runnable suite? say
   "unverified", don't manufacture a pass.
3. **S2 Merge + deploy** — merge hygiene per repo (never strand unmerged work),
   then the project's own deploy skill/path. Irreversible destructive steps
   still need an explicit yes.
4. **S3 Prod gate** — smoke/e2e against prod. RED → fix, re-deploy, re-verify.
   No reachable prod target → close as "deployed-but-unverified", loudly.
5. **S4 Archive** — `git mv` the epic's plan docs to their home's `0-done/`
   sibling; fix links.
6. **S5 Backlog** — write deferred follow-ups where the next session will look,
   each note naming the originating session.
7. **S6 PM board** — flip the epic's rows on the project's tracker, if one exists.

## The session-close core (every session)

1. **Confirm intent** — one line on what's about to happen.
2. **Debrief** — run the project's session-debrief (a generic one is bundled) so
   patterns/gotchas/decisions land in durable docs. Skip-if-done guard (check
   artifacts, not memory). **Require the supersession line**: a session that
   changed behaviour must show old docs updated or `status: deprecated` — never
   two "current" docs describing two versions of the same feature.
3. **Ledger card** — a ≤40-line OKR-style card (objective, honest key results,
   files touched, pointers, next) into `<repo>/.agents/history/` + INDEX row;
   every session gets one, so "which session did X?" stays answerable for ~150
   tokens instead of a transcript distillation.
4. **Mid-flight check** — background tasks, unmerged/uncommitted work, live
   server-side jobs, and sessions THIS session orchestrated (peers, headless
   spawns): each must be terminal or handed to the user by name. Never exit an
   orchestrator with a worker running unowned.
   **Finish-line gate:** when `.do-it/finish-line.json` exists (root resolved from
   `DO_IT_HOME`, else the main checkout's `.do-it`), refuse to close (G-13) while a
   row is unaccounted (state OPEN, or DONE/PARKED/BLOCKED with no evidence or
   reason), a worker is live, or a wake-up is pending; name each one. Read-only.
5. **Reap** — stop finished subagents once their output is captured in files;
   kill lingering headless processes by exact recorded PID only (never a
   pattern-matched kill).
6. **Footprint sweep** — remove what this session created and nothing
   references: worktrees, landed branches, remote/pod files, scratch. **Secrets
   at rest are swept FIRST and verified absent.** Clean only what you can prove
   you created; report the rest. Keep config backups and anything a durable doc
   cites.
7. **CONCLUDE_REPORT.html** (ship sessions) — a local, deterministic HTML
   double-check report (manifest + bundled `build-report.py` + template:
   light/dark toggle, badge cards, per-item "How to test" blocks, embedded
   markdown reports). RED/UNVERIFIED items get their own badge — a report that
   only shows the green half is a fake.
8. **Verdict** — ✅ safe to exit (with what was cleaned, what was deliberately
   left and why, and that no written credential is still at rest) or ⚠️ not yet
   (the specific blocker + the choice). Then STOP — the user types the quit.

## What it never does

- Advance past a red gate, skip a gate for a faster close, or report GREEN off a
  mock/skipped suite/targetless prod check.
- Deploy on a guess, or run irreversible destructive prod steps without an
  explicit yes.
- Re-run a debrief that already ran; skip the ledger card; glob-delete in shared
  locations; delete what a durable doc cites.
- Quit the process itself — it prepares the exit, the user takes it.

## Portability — graceful degradation outside Claude Code

This file is the complete, self-contained ritual: it runs on any
SKILL.md-compatible agent (Cursor, Codex CLI, Copilot, OpenCode, Windsurf,
Gemini CLI, and 70+ others via the Agent Skills standard). Some helpers it
names are Claude Code plugin pieces; when one is absent, degrade **inline and
say so** — never skip the step and never pretend the helper ran:

- **`/iterate` / `/full-qa` absent** → run the diagnose→fix→re-test loop and
  the e2e/smoke verification yourself, inline. The gates and their fail-closed
  rules are unchanged.
- **Report machinery absent** (`build-report.py` + template ship only in the
  plugin) → write `CONCLUDE_REPORT.md` (markdown) with the identical structure:
  gates scoreboard first, per-item sections with status + "How to test" steps,
  RED/UNVERIFIED first-class.
- **Bundled `session-debrief` absent and the project has no debrief skill** →
  capture inline: dated session-log entry in the project's docs + the
  promotion/supersession sweep from the debrief spec (update durable pages, bump
  their verified-date, deprecate what the change replaced).
- **No subagent/rename primitives on this harness** → do the work in the main
  loop and emit the rename line for the user; the sweeps and verdict still run.

Whatever ran inline gets named in the verdict ("debrief ran inline — no debrief
skill installed"), so the close is honest about its own machinery.

## Install

**Claude Code (plugin, recommended — full bundle: ship-pipeline reference, HTML
report machinery, bundled session-debrief):**

```
/plugin marketplace add DevOtts/conclude-it
/plugin install conclude-it@conclude-it
```

**Any SKILL.md-compatible agent (Cursor, Codex CLI, Copilot, OpenCode, Windsurf, …):**

```
npx skills add DevOtts/conclude-it -a <agent>    # peek first: npx skills add DevOtts/conclude-it --list
gh skill install DevOtts/conclude-it             # GitHub CLI alternative
```

**Getting started:** at the end of any working session —

```
/conclude-it
```

Plain sessions get the close core (debrief → ledger card → verification → reap →
sweep → verdict). Sessions that shipped get the full ship pipeline first — gates,
deploy, prod verification, archive — and a local `CONCLUDE_REPORT.html` you open
in the browser to double-check everything with "How to test" steps per item.

## Security considerations

- **Secrets-at-rest sweep**: the footprint step explicitly hunts credentials the
  session wrote to disk, remote hosts, or pods — removes them and verifies
  absence rather than trusting the delete.
- **Exact-PID kills only**: lingering processes are killed by the exact recorded
  PID, never by pattern match — a grep-kill can take out another session's work.
- **Proven ownership**: the sweep deletes only what the session can show it
  created; everything else is reported, never touched.
- **Deploy authorization is scoped**: invoking the ship path authorizes the
  deploy sequence, but irreversible destructive actions (data-dropping
  migrations, volume deletion) always require an explicit yes.
- **No hosted publishing**: the closeout report is a local file; nothing is
  published to hosted surfaces uninvited.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
