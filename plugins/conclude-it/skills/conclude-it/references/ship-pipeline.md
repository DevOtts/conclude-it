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
| S4 archive | **small-model** subagent with the exact `git mv` paths; returns moved paths + fixed links |
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
2. **Deploy via the project's deploy skill** — detect it in the project's
   `.claude/skills/` and user skills (names like `deploy`, `*cicd-deploy*`,
   `<project>-deploy`) and invoke by name; honor its own fail-closed pre-deploy
   gate. If none exists, use the project's documented deploy path (CI trigger,
   `vercel --prod`, deploy script) and note in the report that deploy ran inline.
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

Move THIS epic's implementation/plan docs into a done archive so the active tree
shows only in-flight work. **Archive into a `0-done/` sibling of wherever the
package actually lives — not a fixed path:**

- `<repo>/docs/implementation/<epic>/` → `<repo>/docs/implementation/0-done/<epic>/`
  (create the sibling if missing).
- Any other docs home: that home's own done/archive convention.
- Never move a plan out of its home repo just to archive it.

Mechanics: preserve history with `git mv`; fix any index/link pointing at the old
path. If the plan spans two locations or no convention is obvious, **ask once**.

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
