#!/usr/bin/env python3
"""Build a CONCLUDE_REPORT.html from a small JSON manifest + the report template.

Usage:  python3 build-report.py <manifest.json> [--open]

The authoring agent writes ONLY the manifest (content); this script deterministically
renders the HTML: template skeleton (theme toggle, light/dark tokens, md renderer),
summary/queue tables, per-item cards with badges, "How to test" blocks, and referenced
markdown files embedded as collapsed <details> toggles (rendered client-side, GFM
tables supported; `</script` is escaped so embeds can't break the page).

Manifest shape (all *_html values are raw HTML snippets; everything optional except
title/output):
{
  "title": "Payments Retry Epic",
  "subtitle_html": "concluded 2026-08-26 · session <code>done-payments-retry</code>",
  "output": "docs/implementation/0-done/payments-retry/CONCLUDE_REPORT.html",
  "sections": [
    {"heading": "Scoreboard",
     "table": {"headers": ["Gate", "Result", "Evidence"],
               "rows": [["Local tests", "<b>GREEN</b>", "412 passing"]]}},
    {"heading": "What was done",
     "cards": [
       {"id": "E1", "title": "Retry queue",
        "badge": {"label": "shipped", "tone": "ok"},     // tones: ok|hold|open|act
        "rename_html": "→ <code>done-*</code>",           // optional right-side chip
        "body_html": "<p>…what happened…</p>",
        "test_html": "<ul><li>…user-performable check…</li></ul>",  // optional
        "embeds": [{"path": ".taskstate/x/FINAL-REPORT.md", "label": "Full report"}]
       }]},
    {"html": "<p class=\"sub\">free-form footer note</p>"}
  ]
}
Paths in "embeds" are resolved relative to the manifest's directory, then CWD.
"""
import json, os, sys, html, subprocess

TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report-template.html")
TONES = {"ok": "b-ok", "hold": "b-hold", "open": "b-open", "act": "b-act"}


def die(msg):
    print("build-report: ERROR:", msg, file=sys.stderr)
    sys.exit(1)


def read_embed(path, bases):
    for base in bases:
        p = os.path.join(base, path)
        if os.path.isfile(p):
            content = open(p, encoding="utf-8").read()
            return content.replace("</script", "<\\/script")
    return None


def render_table(t):
    out = ['<div class="overflow"><table>']
    if t.get("headers"):
        out.append("<tr>" + "".join(f"<th>{h}</th>" for h in t["headers"]) + "</tr>")
    for row in t.get("rows", []):
        out.append("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>")
    out.append("</table></div>")
    return "\n".join(out)


def render_card(c, bases, problems):
    out = ['<div class="card"><h3>']
    if c.get("id"):
        out.append(f'<span class="id">{html.escape(str(c["id"]))}</span>')
    out.append(f' {c.get("title", "")}')
    b = c.get("badge")
    if b:
        cls = TONES.get(b.get("tone", "act"), "b-act")
        out.append(f' <span class="badge {cls}">{html.escape(b.get("label", ""))}</span>')
    if c.get("rename_html"):
        out.append(f'<span class="rename">{c["rename_html"]}</span>')
    out.append("</h3>")
    out.append(c.get("body_html", ""))
    if c.get("test_html"):
        out.append(f'<div class="test"><b>How to test</b>{c["test_html"]}</div>')
    for e in c.get("embeds", []):
        content = read_embed(e["path"], bases)
        if content is None:
            problems.append(f'embed not found: {e["path"]} (card {c.get("id") or c.get("title")})')
            content = f'*(report file not found at build time: `{e["path"]}`)*'
        label = html.escape(e.get("label", "Full report"))
        out.append(
            f'<details class="more"><summary>{label}</summary>\n'
            f'<p class="srcnote">Rendered from <code>{html.escape(e["path"])}</code>:</p>\n'
            f'<div class="mdout"><script type="text/markdown">\n{content}\n</script></div>\n'
            f"</details>"
        )
    out.append("</div>")
    return "\n".join(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    do_open = "--open" in sys.argv
    if len(args) != 1:
        die("usage: build-report.py <manifest.json> [--open]")
    manifest_path = os.path.abspath(args[0])
    m = json.load(open(manifest_path, encoding="utf-8"))
    if not m.get("title") or not m.get("output"):
        die("manifest needs at least: title, output")
    bases = [os.path.dirname(manifest_path), os.getcwd()]
    problems = []

    body = []
    for s in m.get("sections", []):
        if s.get("heading"):
            body.append(f"<h2>{s['heading']}</h2>")
        if s.get("table"):
            body.append(render_table(s["table"]))
        for c in s.get("cards", []):
            body.append(render_card(c, bases, problems))
        if s.get("html"):
            body.append(s["html"])

    tpl = open(TEMPLATE, encoding="utf-8").read()
    page = (
        tpl.replace("{{TITLE}}", html.escape(m["title"]))
        .replace("{{SUBTITLE}}", m.get("subtitle_html", ""))
        .replace("{{BODY}}", "\n".join(body))
    )
    if "{{" in page.replace("{{TITLE}}", ""):
        pass  # leftover braces in content are fine; template slots above are all replaced

    out_path = m["output"]
    if not os.path.isabs(out_path):
        out_path = os.path.join(bases[0], out_path)
        if not os.path.isdir(os.path.dirname(out_path)):
            out_path = os.path.join(os.getcwd(), m["output"])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    open(out_path, "w", encoding="utf-8").write(page)

    print("built:", out_path, f"({len(page)} bytes)")
    for p in problems:
        print("WARNING:", p)
    if do_open:
        subprocess.run(["open", "-a", "Google Chrome", out_path], check=False)
        print("opened in Chrome")
    sys.exit(2 if problems else 0)


if __name__ == "__main__":
    main()
