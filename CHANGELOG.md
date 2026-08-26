# Changelog

All notable changes to conclude-it are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

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
