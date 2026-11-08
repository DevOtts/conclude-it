# conclude-it ship pipeline (S0–S7)

Loaded by `/conclude-it` Step 0 ONLY when the session is ship-shaped. Runs the
epic from met-DoD to **deployed, prod-verified, filed** — then control returns to
the SKILL.md core (Step 1) for the debrief, ledger card, sweeps, report, and
verdict. This file contains NO debrief / ledger / reap / footprint logic — those
run exactly once, in the core.

## Tiering for this leg

| Step | Executor |
|---|---|
| S1 local gate | **mid-tier** verifier subagent (or the project's verifier agent): runs the REAL scripts, returns verdict + counts + failing output. RED fix loops via `/iterate` start mid-tier; escalate to the top tier if it thrashes |
| S2 merge + deploy | **Main** — outward and authorization-sensitive; never delegate the deploy decision (the deploy skill's machinery may spawn its own agents) |
| S3 prod gate | **mid-tier** verifier / `/full-qa`'s own machinery; Main reads the evidence and declares |
| S4 archive | **small-model** subagent with the exact `archive-package.mjs` command (and the CLOSEOUT rows Main authored); returns its outcome line + fixed links |
| S5 backlog | Main authors the item content (session knowledge) → **small-model** subagent files the notes |
| S6 PM/STATUS | **small-model** subagent with the exact rows to flip; returns the diff |

A gate verdict is never a subagent's word alone — the coordinator reads the
returned evidence (counts, failing output, URLs) before declaring GREEN; a
subagent reporting "done" without evidence is treated as not done.

## S0 — Scope the epic and rename the session

1. **Name the epic.** Identify the single feature/epic being concluded and the
   repos it touches; state it in one line. If the session spans several unrelated
   efforts, ask which one to conclude — don't guess and half-close two.
2. **Rename the session to `done-<previous name>`:** emit `/rename done-<current-name>`
   (run it if the harness allows; else give the user the exact line and continue —
   don't block on it).
3. **Locate the moving parts once**, so the gates don't stall: project test
   commands (`package.json` scripts, `Makefile`, CI config), the project's deploy
   skill (S2), the epic's plan/implementation docs to archive (S4).

## S1 — Local gate: tests + e2e must go green

1. **Discover the real gates.** A script is a gate only if it EXISTS and runs real
   assertions. Dead/placeholder `test:e2e` scripts are never gate targets —
   wiring one ships a false green. Say which you skipped and why.
2. **Run them.** Unit/integration/API + build/lint → the project scripts directly
   (or via `/iterate` for its diagnose loop). UI / end-to-end → delegate to
   **`/full-qa`** (wraps browser automation + iterate, captures evidence).
3. **On RED → fix and loop** via **`/iterate`**: diagnose → fix → re-run the same
   gate, until green or approaches are exhausted. If it won't go green, STOP
   here, report the failing suite + what you tried, and do not deploy. A red
   local gate never proceeds to prod.
4. **On GREEN → record the evidence** (suite names, pass counts) and continue.

> If the project genuinely has no runnable tests, don't manufacture a pass.
> Record "no local suite — unverified" and let the user decide about deploying.

## S2 — Merge and deploy to prod

Only reachable with a green (or explicitly-accepted) local gate.

1. **Merge hygiene.** Per repo touched: work committed and on/merged into the
   deploy branch. Surface any unmerged branch or uncommitted change BEFORE
   deploying — a deploy that strands local work is a silent regression.
2. **Deploy via the `deploy_skill` named in the repo's conclude-it setup
   block** (see SKILL.md — the first-run interview records it); if none is
   configured, detect one in the project's `.claude/skills/` and user skills
   (names like `deploy`, `*cicd-deploy*`, `<project>-deploy`) and invoke by
   name; honor its own fail-closed pre-deploy gate. If none exists, use the
   project's documented deploy path (CI trigger, `vercel --prod`, deploy
   script), note in the report that deploy ran inline, and repeat the "create a
   `<project>-deploy` skill" recommendation once in the verdict.
3. **Never** run irreversible destructive steps (dropping/rewriting prod data,
   volume deletion) without an explicit yes — conclude-it's authorization does
   not cover them.

## S3 — Prod gate: prove the deploy didn't break anything

1. **Run e2e/smoke against prod** (point the suite at the prod URL; `/full-qa`
   where a UI is involved). The goal is regression detection.
2. **On RED → fix, iterate, re-deploy:** `/iterate` to diagnose and fix, then
   **return to S2** (merge, re-deploy), then re-run this gate. A failing prod
   gate is a failing conclusion.
3. **No reachable prod target?** Do NOT invent a green. Record "prod unverified —
   <why>" and flag it loudly; the epic closes as deployed-but-unverified, not
   done.
4. **On GREEN → record the prod evidence** and continue.

## S4 — Archive the epic's plan docs

Move THIS epic's implementation/plan package into the `0-done/` sibling of
wherever it lives, so the active tree shows only in-flight work. **There is one
way in, and it is a script — never a bare `git mv` or `mv`** (a folder in `0-done/`
must never mean "shipped" when nobody checked):

```
A=${CLAUDE_PLUGIN_ROOT}/skills/conclude-it/scripts/archive-package.mjs
node "$A" --repo <repo root> --impl <name>   # or --dir <package dir> for another docs home
          [--owner-note "<why unverified tasks stay, in the owner's words>"]
          [--closeout-rows <rows.json>]       # only for a package without status.json
```

What it does (CONTRACT 3.3); the first output line is the outcome:

| Package has | Outcome |
|---|---|
| `status.json`, all tasks verified | guarded close (`ledger-card close` → `status-write close --by conclude-it --move`): `CLOSED_MOVED`, board `closed: true` |
| `status.json`, unverified tasks, owner note | `CLOSED_MOVED`, the note lands in the board history |
| `status.json`, unverified tasks, no note | `REJECTED`, nothing moved; the message names the unverified tasks. Ask the owner once, or leave it open. Never invent a note |
| `status.json`, already in `0-done/` but `closed: false` | closed in place (`CLOSED_IN_PLACE`, no move) |
| no `status.json` in the tree, but git tracks it at HEAD, it exists in the package's history, a folder the package was renamed from held one, or an uncommitted deletion moved it here (paths matched in their real case) | `DENIED: board deleted`, nothing written or moved. Restore the board and use the guarded close; the CLOSEOUT path is never taken (CP-03 A1-M1, R2-A1-M3) |
| no `status.json`, git knows nothing, but a writer-rendered `STATUS.md` or a `plan.json` remains | `DENIED: board deleted`, nothing written or moved (CP-03 R2-L2). A hand-written legacy `STATUS.md` does not count |
| no `status.json`, no `CLOSEOUT.md` | `DENIED`, nothing moved. Write the CLOSEOUT: author one row per piece of the program into `rows.json` (`[{"piece","disposition":"shipped\|dropped\|carried","detail":"evidence or reason","backlog":"path"}]`) and re-run with `--closeout-rows`, or ask the owner once |
| no `status.json`, `--closeout-rows` | `CLOSEOUT.md` is written from doc-it's template (`doc-it template closeout`; conclude-it keeps no copy), linted with `doc-it check closeout` before it lands, then moved. A row doc-it refuses (e.g. `carried` without a backlog path) → `REJECTED`, nothing written or moved |
| no `status.json`, a hand-written `CLOSEOUT.md` | linted with `doc-it check closeout`; ok → moved, else `REJECTED` |
| killed after the freeze, before the move | `PARTIAL_FAILED` (board closed, folder not moved). Re-run the same command: it completes the move with no second close entry |
| `status.json` with `closed: true` that status-write did not freeze (set by hand, or edited after the freeze) | `REJECTED` (tampered), nothing moved. Reopen it with a note (`status-write reopen --by conclude-it --note ...`) and close it through the guard (CP-03 A1-H1) |

Without doc-it, a package with no `status.json` is `DENIED` with
`[skip] doc-it not installed: check closeout` — it never moves on an unchecked
CLOSEOUT. The move is one rename (git sees it as a rename on the next commit);
then fix any index/link pointing at the old path. If the plan spans two
locations or no convention is obvious, **ask once**. Never move a plan out of
its home repo just to archive it.

(The durable *content* promotion — `verified:` bumps, references — is the
debrief's job in the core, not this move.)

## S5 — Capture deferred follow-ups to the backlog

Sweep the session for **deferred, non-blocking loose ends** (durability gaps,
cleanups, "do X once Y unblocks") and write them where the next session will
look:

- **Where:** the repo's backlog folder — detect via
  `docs/implementation/*backlog*` (or the project's equivalent) and honor a
  weekly-folder layout if its README declares one. No backlog convention? List
  the items in the final report instead — don't invent a folder.
- **Format:** one note per topic; **every note MUST name the originating
  session** (the `done-<name>` from S0) so a future worker can pull the full
  context a one-line note can't hold.
- **Scope:** only genuinely deferred items. Anything that failed a gate belongs
  in the verdict's "Open / unverified", never quietly parked here.

## S6 — Update the project manager (if any)

If the project is wired to a PM surface (Linear/Jira/GitHub Projects/an
MCP-connected PM, or an in-repo STATUS/features board): mark the epic's items
done, link the deploy, note the prod-verification result. No PM surface? Skip
silently — don't invent one.

## S7 — Return to the core

Hand back to SKILL.md Step 1 carrying: the gate results + evidence (S1/S3), what
shipped (S2), archive paths (S4), backlog notes (S5), PM updates (S6). The core
runs the debrief (with supersession sweep), ledger card, mid-flight +
controlled-sessions verification, reaping, footprint sweep, stop-gate, the
CONCLUDE_REPORT.html (Step 5.5), and the final verdict.
