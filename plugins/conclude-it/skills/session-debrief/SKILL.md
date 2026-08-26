---
name: session-debrief
description: End-of-session knowledge capture for any project — updates the project's documentation folder, repo skills, and (optionally) the user's knowledge vault with the patterns, gotchas, and fixes discovered during the session. Includes the anti-rot promotion rule (durable pages updated + verified-date bumped, never just session notes) and the supersession sweep (pages describing the OLD behaviour get updated or deprecated — never left "current"). Invoked by /conclude-it Step 2; also usable standalone at the end of any working session ("debrief the session", "capture what we learned").
author: DevOtts
author_url: https://github.com/DevOtts
---

# /session-debrief — Session Knowledge Capture (generic)

Consolidate everything learned in this session into the right persistent
locations: the **project's own documentation folder** (canonical), repo-level
skill gotchas, and — if the user keeps one — a knowledge vault (cross-project
narrative + thin pointers). Run at the end of any working session before
logging off. If a project-specific debrief skill exists, prefer it over this one.

**Source-of-truth rule:** the project's docs folder is canonical for technical
claims. A vault holds lessons, narrative, and *thin pointers* to project docs.
Write deep technical detail once (project docs), link from the vault — never
duplicate into both.

**Model tiering — author here, apply via subagent.** The survey needs THIS
session's context: do it in the main thread and draft every insight yourself
(it's a few lines — cheap). Applying it across files is mechanical: dispatch ONE
mid-tier doc-curator subagent with the drafted content + exact target paths
(never ask it to remember the session; it wasn't there). It applies dedupe-first,
re-verifies `path:line` cites, fixes references its edits break, and returns a
per-file report. For a small debrief (≤2 files), apply inline — spawning costs
more than it saves; say which you chose.

---

## Phase 0 — Locate the project's documentation home

Do this BEFORE surveying. The debrief is useless if it writes to the wrong place.

0. **Check the conclude-it setup block first** — `## conclude-it — project
   setup` in `CLAUDE.md` / `AGENTS.md` / `.conclude-it/config.md`. If it
   declares `docs_home` (and optionally `second_brain` + scope/notes for Phase
   4), use those and skip to Phase 1.
1. **Check the project's `CLAUDE.md`** for a `Docs home:` pointer; if declared,
   use it and skip to Phase 1.
2. **Look for conventional locations** (`docs/`, `documentation/`, `wiki/`) if
   CLAUDE.md is silent.
3. **If nothing is found — or candidates are ambiguous — ASK THE USER.** Don't
   guess and don't dump docs into the repo root.
4. **Persist the answer in the project's `CLAUDE.md`** (`## Documentation` /
   `Docs home: <path>`) so future runs never ask again.

## Phase 1 — Survey the session

```bash
git log --oneline --since="12 hours ago"     # adjust to session length; per repo touched
git diff HEAD~N HEAD --stat
```

List the functional changes — not file names, but **what they fix or enable**.
Then keep only knowledge worth preserving:

| Category | Worth saving? | Where |
|----------|--------------|-------|
| Bug fixed that will happen again | Yes — gotcha | Repo skill + vault lessons |
| New pattern introduced | Yes — reference | Project docs |
| Architectural decision | Yes — ADR | `<docs-home>/architecture/decisions/` |
| Operational discovery (port, restart, env) | Yes — runbook note | `<docs-home>/operations/` |
| One-off fix unlikely to recur | No | Skip |
| Refactor with no new pattern | No | Skip |

## Phase 2 — Update the project docs (canonical)

Follow `<docs-home>/CONVENTIONS.md` if it exists; otherwise use this frontmatter
on every touched file:

```yaml
---
type: architecture | guide | operations | concept | adr | index | reference
title: <human title>
description: <one sentence: what this doc answers>
status: current | draft | needs-review | deprecated
verified: YYYY-MM-DD          # date claims were confirmed against the LIVE system
repos: [<repo>, ...]
tags: [<topic>, ...]
---
```

`verified:` is mandatory; `status: current` is **earned** (claims re-verified
against the live system), not default. Every behavioural claim cites evidence
(`<repo>@<sha>` / PR + path). Keep docs under 200 lines; dense > verbose; grep
before creating — append to existing docs rather than near-duplicating.

### Promotion rule (anti-rot — MANDATORY)

**Shipping a behaviour change must promote the fact into the durable doc, not
only session notes.** For every fact kept in Phase 1:

1. Find the durable page describing that behaviour:
   ```bash
   grep -rl --include="*.md" "<topic keyword>" "<docs-home>" | xargs grep -l "^status: current"
   ```
   If none exists, create it.
2. Update the page so its claims match the live system, citing evidence.
3. **Bump `verified:` to today** (bounded to the frontmatter block):
   ```bash
   sed -i '' "2,/^---$/ s/^verified: .*/verified: $(date +%Y-%m-%d)/" "<page>"
   ```
4. Register/refresh the page's row in its area `index.md` in the same change.
5. **Supersede sweep — retire what the change REPLACED.** Step 1's grep finds
   pages sharing the NEW concept's vocabulary; a *replaced* concept's old page
   often uses different words, survives that grep, and stays `status: current` —
   leaving two "current" docs describing two versions of the same feature. So,
   per behaviour change, also grep for the **OLD** behaviour's terms/values (the
   old flag name, the old default, the old endpoint/flow):
   ```bash
   grep -rln --include="*.md" -e "<old term>" -e "<old value>" "<docs-home>"
   ```
   Disposition every hit — there are only two honest ones:
   - **Still partly true** → update the page in place (steps 2–4 again).
   - **Fully superseded** → flip `status:` to `deprecated` (don't add frontmatter
     fields) and put the forward pointer in the body, first line after the
     frontmatter: `> **Superseded by** [<new page title>](<relative path>) — <date>.`
   Zero hits is a valid result — say so. Never leave a page asserting the old
   behaviour with `status: current`.

A debrief that writes only session notes but leaves the durable page stale is
**incomplete**. List every promoted page + new `verified:` date, and every
swept contradiction, in the final report.

## Phase 3 — Update repo skills

For every repo touched, check `<repo>/.claude/skills/*/SKILL.md` and append
**only new, non-obvious gotchas**:

```markdown
### Gotcha: <short title>

<One paragraph: the surprising behavior, why it exists, how you'd hit it again.>

**Fix:** `<the minimal fix>`

**Pattern:** <when to apply this in future work>
```

Do not restate existing gotchas; keep numbering continuity; never remove
existing authorship frontmatter or footers.

## Phase 4 — Update the knowledge vault (optional)

Only if the user keeps a vault (the `second_brain` path from the conclude-it
setup block, or an Obsidian/wiki tree declared in their `CLAUDE.md` / project
instructions) — skip gracefully otherwise. Honor `second_brain_notes` for where
session knowledge is filed; if it's marked as a guess, confirm before writing.

**Thin-pointer rule:** vault technical pages for a project are thin
current-state summaries pointing at the canonical project doc. Fix the project
doc first (Phase 2), then refresh the vault page: one-line summary + link. What
lives natively in the vault: lessons (numbered, each with "How to apply"),
session narratives, decisions journal, cross-project concepts.

## Phase 5 — Verify and wrap up

`git status --short` per touched repo — everything committed/pushed? Then report:

```
## Session Debrief Complete

### Docs home
- <path> (from CLAUDE.md | discovered | created + recorded)

### Project docs updated
- <files created or updated>

### Promotions (durable pages, verified: bumped)
- <area>/<page>.md — verified: <date> (<fact promoted>)
- (or: none — no behaviour change shipped) ← only with justification

### Contradictions swept (supersede sweep)
- <area>/<old-page>.md — updated in place / status: deprecated → superseded by <new page>
- (or: 0 hits — old-behaviour greps: "<terms searched>") ← name the terms, so zero is a measured zero

### Skill files updated
- <repo>/.claude/skills/<name>/SKILL.md — N new gotchas

### Vault updated
- <pages> (or: no vault — skipped)

### Skipped (not worth preserving)
- <anything that didn't meet the bar>
```

---
_Authored by [DevOtts](https://github.com/DevOtts)._
