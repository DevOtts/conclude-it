# Changelog

All notable changes to conclude-it are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## 2.2.0 — 2026-11-07

Minor release, from do-it 1.1: guarded archive S4 (A1-02, A1-04), Step 0 doc-it audit (A1-03),
close in place for `0-done/` packages (A1-05), debrief doc-it expiry (K2-01), and the
`[skip] doc-it not installed` rule (K2-03, D14).

### Requires
- build-it >= 4.2.0 for close in place (`status-write close` without `--move`) and the crash-safe
  `close --move`.
- doc-it >= 0.1.0 is optional; without it the doc-it steps print `[skip] doc-it not installed: ...`
  and exit 0.

### Changed
- S4 archive has one way into `0-done/`: `scripts/archive-package.mjs`. A package with `status.json`
  takes the guarded close (`ledger-card close` → `status-write close --move`); unverified tasks
  without an owner note are REJECTED and the tasks are named. A package without `status.json` is
  DENIED until a CLOSEOUT exists; S4 writes it from doc-it's template (`doc-it template closeout`,
  no local copy), one row per piece, and lints it with `doc-it check closeout` before it lands.
  The bare `git mv` instruction is gone.
- `ledger-card close` closes a package already in `0-done/` in place (no `--move`), accepts
  `--dir`, and reports PARTIAL_FAILED when a close dies between the freeze and the move; a re-run
  completes the move.

### Fixed (CP-03 adversarial review, G-2)
- **A1-H1** a hand-set `closed: true` was resumed as PARTIAL_FAILED and moved. `ledger-card close`
  now reports it REJECTED (tampered) when status-write refuses to resume a freeze it did not record
  (needs build-it 4.2.0 with the freeze digest). Step 0 counts every doc-it finding kind, including
  `done_closed_unverified`.
- **A1-H2** regression: an empty board is refused both by `status-write close --move` directly
  (build-it 4.2.0) and by S4 without an owner note.
- **A1-M1** deleting a tracked `status.json` sent the package down the CLOSEOUT path. S4 now checks
  git: a board tracked at HEAD, or present in the package's history, but missing from the working
  tree is DENIED (board deleted; restore it and use the guarded close). Never the CLOSEOUT path.
- **A1-M2** regression: CLOSEOUT rows with `shipped` evidence "yes" or a `dropped` reason "."
  are REJECTED by doc-it `check closeout` (doc-it's stricter evidence lint), nothing written.
- **A1-L1** S4 refuses a symlinked package dir (the link would move, the content would not).

### Added
- Step 0 archive audit: `scripts/archive-audit.mjs` runs `doc-it check archive` and reports; it
  never fixes or writes. Without doc-it: `[skip] doc-it not installed: check archive`, exit 0.
- `scripts/docit-locate.mjs`: finds doc-it via `DOC_IT_CLI`, else the newest installed plugin copy.
- Step 2 expiry check: `scripts/debrief-doc-check.mjs` runs `doc-it check expiry` on the pages the
  session touched and gives the verdict lines; it never rewrites a page. Fact-kind homes (DS-1) are
  reported as "not yet checked" (doc-it has no lookup yet). Eval `evals/doc-it-expiry.yaml`.
- `package.json` with `npm test` (quoted globs) and tests under `tests/`.

## 2.1.1 — 2026-10-18

Patch release, from the first real run of the do-it harness.

### Changed
- The marketplace is named `conclude-it`, and the install line is `conclude-it@conclude-it`. plan-it,
  review-it, conclude-it and do-it all called theirs `devotts`, so adding two of them clashed;
  `devotts` is now only the do-it hub. Someone who added this repo as `devotts` should remove that
  entry and add `conclude-it`. Nothing else changes.

## 2.1.0 — 2026-10-18

Minor release. conclude-it works with sessions registered by init-it and closes an implementation
through build-it's status writer.

### Added
- `scripts/ledger-card.mjs` (Step 2.5): `upgrade` rewrites a card that `/init-it` opened, in the same
  file and the same INDEX row, to `concluded` or `shipped`, keeps `implementation:` and extends it
  with what the session touched, and sets the session's `ended_at` in `status.json`. With no open
  card it writes the card as before. `close` closes an implementation through `status-write`: it ends
  the open sessions, refuses to move the folder to `0-done` while any task is not `verified` unless
  an owner note is given, and a board with no tasks also needs the owner note. It never edits
  `status.json` by hand.

## 2.0.0 — 2026-10-14

Major release: conclude-it moves to 2.0.0 together with the rest of the *-it
lifecycle family (prompt-it 1.0.0, plan-it 5.0.0, build-it 4.0.0, review-it 2.0.0,
parallel-lifecycle 1.0.0). No behaviour change beyond 1.2.0; the do-it
finish-line gate is carried unchanged. Version bump in `plugin.json`,
`marketplace.json` and `SKILL.md` frontmatter.

## 1.2.0 — 2026-10-14

New: **do-it finish-line gate** (companion change for the do-it program).

When `.do-it/finish-line.json` exists (root from `DO_IT_HOME`, else the main
checkout's `.do-it`), conclude-it refuses to close (G-13) while a row is
unaccounted (OPEN), a worker is live, or a wake-up is pending, and names each
one. DONE, PARKED and BLOCKED rows with evidence or a reason count as accounted.
Sessions without a finish line are unaffected. Under a do-it run the close ends
with an atomic `it-result/1`. Minor bump: additive gate, no behaviour change
outside do-it runs.

## 1.1.0 — 2026-08-26

New: **the first-run setup interview** — per-repo memory, saved inside the repo.

The first close in a repo now resolves five facts before anything depends on
them: **docs home** · **second brain path** (Obsidian or similar) · **second
brain scope** (global / per-project — or "just say the word" and conclude-it
inspects the vault and *proposes* where session knowledge is filed, with the
guess labeled as a guess) · **deploy skill** (recommends creating or pointing to
a `<project>-deploy` skill with the repo's exact deploy instructions, and offers
to scaffold it) · **debrief skill** (same shape: `<project>-debrief`, else the
bundled generic).

- **Detect first, then ask**: candidate docs folders, existing
  `*deploy*`/`*debrief*` skills, and vault signals are pre-scanned so the ONE
  batched interview arrives pre-answered for confirmation. Repos whose existing
  agent instructions already answer the questions are treated as configured —
  no nagging.
- **Stored in the repo**, not globally: a `## conclude-it — project setup`
  block in `CLAUDE.md` / `AGENTS.md` / `.conclude-it/config.md`. A different
  repo without the block interviews again there. Global defaults are written
  only when the user explicitly says "save this globally", and per-repo blocks
  always override them.
- **Wired into the flow**: Step 2 runs the configured `debrief_skill` (the
  bundled `session-debrief`'s Phase 0 reads the block too), Step 2.5 mirrors
  the ledger card per the second-brain scope, ship-pipeline S2 deploys via the
  configured `deploy_skill` — and every `none` degrades inline with the
  create-a-skill recommendation repeated once in the verdict.

## 1.0.1 — 2026-08-26

Positioning + cross-agent portability release. No behavior change on Claude Code.

- **New headline.** The README now leads with the pain, not the family slogan:
  *"Done" is a claim. Concluded is proven.* — stop closing sessions on hope.
- **Full-ecosystem install docs**, matching the build-it convention: per-agent
  sections (Claude Code · Codex · OpenClaw · Cursor · VS Code + Copilot ·
  Copilot CLI · Kiro · others), the two universal installers
  (`npx skills add DevOtts/conclude-it -a <agent>`, `gh skill install
  DevOtts/conclude-it`), and a **Platform compatibility** table covering the
  same 18-row agent matrix (Claude Code native; 70+ agents via the Agent
  Skills standard).
- **Portability contract in the root `SKILL.md`** (the file every non-Claude
  agent installs): an explicit graceful-degradation section — `/iterate` and
  `/full-qa` phases run inline when absent; the HTML report machinery degrades
  to a `CONCLUDE_REPORT.md` with the identical honest structure; a missing
  debrief skill degrades to inline capture *including* the
  promotion/supersession sweep; and whatever ran inline is **named in the
  verdict** rather than silently absorbed. The root SKILL.md is confirmed
  self-contained: the ship pipeline is carried inline, so single-file installs
  run the full ritual.

## 1.0.0 — 2026-08-26

Initial public release — but not a first draft. conclude-it 1.0.0 is the public
merge of two field-hardened private skills that closed real sessions for months:

- **`exit-it`** (the session-close ritual: debrief → ledger card → mid-flight
  verification → subagent reaping → footprint sweep → stop-gate → verdict;
  itself the successor of `exit-session`), and
- the private **`conclude-it`** (the ship ritual: local gate → merge+deploy →
  prod gate → archive → backlog → PM board → CONCLUDE_REPORT.html).

The two-skill split was the bug generator: the controlled-sessions sweep existed
twice and drifted, the "did the debrief already run?" guard crossed a file
boundary on model memory, and users had to decide which command to type. 1.0.0
removes the seam:

- **One front door.** A mechanical Step-0 triage (deploys run? merges pending?
  DoD met without prod verification?) picks the leg; ambiguous cases get exactly
  one question, and nothing deploys on a guess.
- **Progressive disclosure.** The always-loaded core carries the close ritual;
  the ship pipeline lives in `references/ship-pipeline.md` and is read only when
  triage says ship-shaped — plain daily closes never pay for it.
- **One implementation of everything.** Debrief, ledger card, mid-flight +
  controlled-sessions verification, reaping, and the footprint sweep each exist
  exactly once, in the core, for both legs.
- **Durable debrief guard.** "Already debriefed?" is answered from artifacts on
  disk, never from model recall (long/compacted sessions broke the old guard).
- **Supersession sweep** (new, in the bundled `session-debrief`): every
  behaviour change also greps the docs for the OLD behaviour's terms; each hit
  is updated in place or flipped to `status: deprecated` with a forward pointer —
  never two "current" docs describing two versions of one feature.
- **Deterministic reporting.** `CONCLUDE_REPORT.html` is rendered by
  `build-report.py` from a small JSON manifest an agent authors — light/dark
  toggle, gates scoreboard, per-item badge cards with "How to test" blocks,
  embedded markdown reports; RED/UNVERIFIED items are first-class.

Field lessons baked in as hard rules: exact-PID kills only (a grep-kill once took
out another session's gate process), ownership proven before any delete (a glob
nearly removed another session's six-week-old file), secrets-at-rest swept first
and verified absent, and orchestrators never close while a dispatched worker is
still running unowned.
