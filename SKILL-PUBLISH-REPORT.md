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

## Re-probe 2026-08-27 (scheduled follow-up)

Run ~24h after initial publish. **Network note:** this scheduled session's
egress proxy blocks `skillsmp.com`, `skillsllm.com`, `skillhub.club`, and
`trustedskills.dev` outright (gateway returns `403` to the CONNECT tunnel —
an organization egress-policy denial, confirmed via the proxy status
endpoint at `/root/.ccr/__agentproxy/status`, not a marketplace-side
error). Only the skills.sh CLI path (which resolves over the allowed git/
npm proxy) was reachable. Four of five probes below are therefore
UNREACHABLE from this environment, not negative results — they are not
evidence the listings are still pending, only that this session couldn't
check.

| # | Marketplace | Status | Evidence |
|---|---|---|---|
| 0 | **skills.sh** (Agent Skills CLI) | **VERIFIED — installable** | `npx --yes skills@latest add DevOtts/conclude-it --list` → "Found 1 skill" with full `conclude-it` description, same as the initial probe (re-probed 2026-08-27). The `skills.sh/DevOtts/conclude-it` web directory page could not be checked — `skills.sh` itself is blocked by this session's egress proxy (see below). |
| 1 | **SkillsLLM** (skillsllm.com) | **UNREACHABLE** | `WebFetch https://skillsllm.com/search?q=conclude-it` → `EGRESS_BLOCKED: Access to skillsllm.com is blocked by the network egress proxy.` Could not confirm whether the ~24h review completed. |
| 2 | **SkillsMP** (skillsmp.com) | **UNREACHABLE** | `curl -s 'https://skillsmp.com/api/v1/skills/search?q=conclude-it'` → connection failed (curl exit 56); proxy status endpoint shows `connect_rejected`: "gateway answered 403 to CONNECT (policy denial or upstream failure)" for `skillsmp.com:443` at 2026-08-27T17:09Z. Not a repeat of the prior honest-zero JSON response — the API could not be reached at all this time. |
| 3 | **SkillHub** (skillhub.club) | **UNREACHABLE** | `WebFetch https://www.skillhub.club/search?q=conclude-it` → `EGRESS_BLOCKED: Access to www.skillhub.club is blocked by the network egress proxy.` |
| 4 | **TrustedSkills** (trustedskills.dev) | **UNREACHABLE** | `WebFetch https://trustedskills.dev` → `EGRESS_BLOCKED: Access to trustedskills.dev is blocked by the network egress proxy.` |

**Recommended next action:** re-probe SkillsLLM, SkillsMP, SkillHub, and
TrustedSkills from a session/environment whose egress policy allows those
domains (or manually, in a browser) — this scheduled environment cannot
reach any of them. skills.sh CLI install remains confirmed working; no
action needed there.

---
_Authored by [DevOtts](https://github.com/DevOtts)._
