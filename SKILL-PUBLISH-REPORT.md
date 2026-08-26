# Skill publish report — DevOtts/conclude-it

Run: 2026-08-26 · via `/skill-publisher` · repo state at run time: public · MIT ·
default branch `main` · release `v1.1.0` · topics `openclaw-skill, agent-skill,
skill, skills, mcp, claude, claude-code, session-management` · root `SKILL.md`
(12.6K, frontmatter validated) + `LICENSE` present · 0 stars.

| # | Marketplace | Status | Evidence |
|---|---|---|---|
| 0 | **skills.sh** (Agent Skills CLI) | **VERIFIED — installable** | `npx skills@latest add DevOtts/conclude-it --list` → "Found 1 skill: conclude-it" with full description (probed 2026-08-26). The public directory page populates from install telemetry and lags — not claimed as listed. |
| 1 | **SkillsLLM** (skillsllm.com) | **SUBMITTED — pending review** | Form submitted signed-in as DevOtts (GitHub OAuth, read-only scope; the authorize click was made by the owner personally). Green toast: *"Skill submitted successfully! It will be reviewed shortly."* Their async review + security scan takes ~24h. Note: the "at least 100 stars" requirement on the page is advisory — the 0-star submission was accepted. |
| 2 | **SkillsMP** (skillsmp.com) | **QUALIFIED — awaiting crawl** | Pure auto-crawl, no submit form. Negative probe at run time (honest zero): `GET /api/v1/skills/search?q=conclude-it` → `{"skills":[], "total":0}`. Repo meets all indexing requirements. |
| 3 | **SkillHub** (skillhub.club) | **QUALIFIED — awaiting crawl** | Pure auto-index, no submit form (`/submit` is 404). No search API to probe; check the site for `conclude-it` in a day. |
| 4 | **TrustedSkills** (trustedskills.dev) | **QUALIFIED — awaiting scraper (≤6h)** | Discovery is via the `openclaw-skill` GitHub topic + a tagged release; both in place (`v1.1.0` with zip artifact). Appears first at "Unverified" tier, then "Community" after its 6 security scans. |

## Recommended next actions

- **In 6–24h, re-run the probes**: the SkillsMP search above; browse SkillsHub
  and TrustedSkills for `conclude-it`; check `skillsllm.com` for the listing
  after their review.
- **Stars help**: SkillsLLM's "Featured" tier keys on ~100 stars; the listing
  itself does not.
- Any future release: keep the version consistent across root `SKILL.md`,
  `plugin.json`, and `marketplace.json`, and cut a tagged GitHub release —
  TrustedSkills versions from release metadata.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
