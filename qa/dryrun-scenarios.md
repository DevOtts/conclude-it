# QA — specification walkthroughs (v1.0.0)

Two dry-run walkthroughs of the skill as specified. **These are design
walkthroughs, not executed transcripts** — they document the expected behavior
per step so a reviewer (or an eval harness) can check a real run against them.
The private predecessors of both legs ran in production sessions for months; the
merged flow below is what 1.0.0 specifies.

## Scenario A — plain close (the common case)

**Setup:** a research/planning session; no deploys, no merges to main, no DoD.

| Step | Expected behavior |
|---|---|
| 0 triage | All four signals negative → "plain close" declared in one line. `references/ship-pipeline.md` is **never read** (verify: no Read of that file in the transcript). |
| 1 intent | One-line restatement of the wind-down sequence. |
| 2 debrief | Runs the project debrief (or bundled generic). If the session produced nothing durable, says so explicitly instead of silently skipping. |
| 2.5 ledger | Card ≤40 lines at `<repo>/.agents/history/<alias>/…`, INDEX row appended. Runs even for a trivial session. |
| 3 mid-flight | Background tasks, per-repo git state, controlled sessions checked; findings reported read-only. |
| 4 reap | Finished subagents stopped; count reported. |
| 4.5 footprint | Secrets checked FIRST; deletions by exact name only; "deliberately left" list included. |
| 5.5 report | **Skipped** — plain closes get no HTML report. |
| 6 verdict | ✅/⚠️ with the credential-absence line. Process NOT quit by the skill. |

**Failure modes this scenario guards:** running the ship pipeline on a session
with nothing to ship; skipping the ledger card because the session felt trivial;
a verdict that omits what was left behind.

## Scenario B — ship close

**Setup:** a feature session; commits merged to main, a deploy skill exists,
prod URL reachable.

| Step | Expected behavior |
|---|---|
| 0 triage | Signal 1 or 2 positive → "ship-shaped" declared; `references/ship-pipeline.md` read NOW. |
| S0 | Epic named in one line; `/rename done-<name>` emitted. |
| S1 | REAL test scripts discovered and run (placeholders named + skipped). RED → `/iterate` loop; still RED → STOP, no deploy. |
| S2 | Merge hygiene per repo; project deploy skill invoked by name; destructive sub-actions still gated on explicit yes. |
| S3 | Smoke/e2e against prod. RED → fix → S2 → S3 again. No target → "deployed-but-unverified" recorded, loudly. |
| S4–S6 | Docs `git mv`'d to `0-done/` sibling with links fixed; backlog notes each name the `done-*` session; PM rows flipped only if a PM surface exists. |
| 1–5 core | Same as Scenario A — debrief must include the **supersession line** ("contradictions swept: N pages" or a measured zero naming the greps). |
| 5.5 report | Manifest authored by a small-model subagent; `build-report.py` exit 0 (exit 2 = broken embeds = fix + rebuild); report opened locally; RED/UNVERIFIED items carry their own badges. |
| 6 verdict | Full report format: gates table with evidence, shipped, documented (incl. contradictions swept), open/unverified, ✅/⚠️. |

**Failure modes this scenario guards:** green-by-mock; deploy with unmerged
work; prod "verified" with no target; docs archived but old concept pages left
`status: current`; a report showing only the green half.

## How to evaluate a real run against these

1. Save the session transcript.
2. For the scenario that applies, walk the table top to bottom; every row is a
   binary check against the transcript.
3. Any row that fails is a finding — file it against the step, not the vibe.
