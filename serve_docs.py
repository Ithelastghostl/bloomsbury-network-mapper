#!/usr/bin/env python3
"""
Serve workspace markdown files as plain HTML for review.
Usage: python3 serve_docs.py [port]
Default port: 7070
"""

import http.server
import socketserver
import os
import sys
import urllib.parse
import markdown

WORKSPACE = os.path.join(os.path.dirname(__file__), "workspace")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 7070

HTML_WRAPPER = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f7f8; color: #1a1a1a; }}
  #layout {{ display: flex; min-height: 100vh; }}
  #nav {{ width: 280px; min-width: 280px; background: #1e1e2e; color: #cdd6f4; padding: 1rem 0; overflow-y: auto; position: sticky; top: 0; height: 100vh; }}
  #nav h2 {{ font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: #6c7086; padding: 0.75rem 1.25rem 0.25rem; margin: 0.5rem 0 0; }}
  #nav h2:first-child {{ margin-top: 0; }}
  #nav a {{ display: block; padding: 0.3rem 1.25rem; font-size: 0.82rem; color: #cdd6f4; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  #nav a:hover {{ background: #313244; color: #cba6f7; }}
  #nav a.active {{ background: #45475a; color: #cba6f7; font-weight: 600; }}
  #content {{ flex: 1; padding: 2.5rem 3rem; max-width: 860px; }}
  #content h1 {{ font-size: 1.8rem; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.5rem; }}
  #content h2 {{ font-size: 1.3rem; margin-top: 2rem; color: #2a2a4a; }}
  #content h3 {{ font-size: 1.05rem; color: #3a3a5a; }}
  #content table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.88rem; }}
  #content th {{ background: #e8e8f0; padding: 0.5rem 0.75rem; text-align: left; border: 1px solid #ccc; }}
  #content td {{ padding: 0.45rem 0.75rem; border: 1px solid #ddd; vertical-align: top; }}
  #content tr:nth-child(even) td {{ background: #f9f9fc; }}
  #content code {{ background: #f0f0f5; padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.88em; }}
  #content pre {{ background: #1e1e2e; color: #cdd6f4; padding: 1rem 1.25rem; border-radius: 6px; overflow-x: auto; }}
  #content pre code {{ background: none; padding: 0; font-size: 0.85rem; }}
  #content blockquote {{ border-left: 4px solid #cba6f7; margin: 1rem 0; padding: 0.5rem 1rem; background: #f4f0ff; color: #444; }}
  #content a {{ color: #7c3aed; }}
  #content hr {{ border: none; border-top: 1px solid #ddd; margin: 2rem 0; }}
  #home-link {{ display: block; padding: 1rem 1.25rem 0.75rem; font-weight: 700; font-size: 0.95rem; color: #cba6f7; text-decoration: none; border-bottom: 1px solid #313244; margin-bottom: 0.5rem; }}
</style>
</head>
<body>
<div id="layout">
<nav id="nav">
  <a href="/" id="home-link">Bloomsbury NM Docs</a>
  {nav}
</nav>
<main id="content">
  {body}
</main>
</div>
</body>
</html>"""

INDEX_PAGE = """<h1>Bloomsbury Network Mapper — Planning Output</h1>
<p>Select a document from the left navigation to begin reviewing.</p>
<h2>Layer 1 — Decision artefacts</h2>
<ul>
{decision_links}
</ul>
<h2>Layer 2 — Per-strategy build kits</h2>
{strategy_sections}
"""


def build_nav(current_path=None):
    sections = []

    decision_files = sorted(f for f in os.listdir(os.path.join(WORKSPACE, "decision_layer")) if f.endswith(".md"))
    sections.append('<h2>Decision layer</h2>')
    for f in decision_files:
        url = f"/decision_layer/{f}"
        active = ' class="active"' if url == current_path else ''
        label = f.replace(".md", "").replace("_", " ")
        sections.append(f'<a href="{url}"{active}>{label}</a>')

    strategies_dir = os.path.join(WORKSPACE, "strategies")
    for strat in sorted(os.listdir(strategies_dir)):
        strat_path = os.path.join(strategies_dir, strat)
        if not os.path.isdir(strat_path):
            continue
        sections.append(f'<h2>{strat.replace("_", " ")}</h2>')
        for f in sorted(os.listdir(strat_path)):
            if not f.endswith(".md"):
                continue
            url = f"/strategies/{strat}/{f}"
            active = ' class="active"' if url == current_path else ''
            label = f.replace(".md", "")
            sections.append(f'<a href="{url}"{active}>{label}</a>')

    return "\n".join(sections)


def build_index():
    decision_files = sorted(f for f in os.listdir(os.path.join(WORKSPACE, "decision_layer")) if f.endswith(".md"))
    decision_links = "\n".join(
        f'<li><a href="/decision_layer/{f}">{f.replace(".md","").replace("_"," ")}</a></li>'
        for f in decision_files
    )

    strategy_sections = []
    strategies_dir = os.path.join(WORKSPACE, "strategies")
    for strat in sorted(os.listdir(strategies_dir)):
        strat_path = os.path.join(strategies_dir, strat)
        if not os.path.isdir(strat_path):
            continue
        files = sorted(f for f in os.listdir(strat_path) if f.endswith(".md"))
        links = " &nbsp;·&nbsp; ".join(
            f'<a href="/strategies/{strat}/{f}">{f.replace(".md","")}</a>' for f in files
        )
        strategy_sections.append(f'<p><strong>{strat.replace("_"," ")}</strong><br>{links}</p>')

    body = INDEX_PAGE.format(decision_links=decision_links, strategy_sections="\n".join(strategy_sections))
    return HTML_WRAPPER.format(title="Bloomsbury NM Docs", nav=build_nav(), body=body)


def render_md_file(rel_path):
    full_path = os.path.join(WORKSPACE, rel_path.lstrip("/"))
    if not os.path.isfile(full_path):
        return None
    with open(full_path, encoding="utf-8") as f:
        raw = f.read()
    md = markdown.Markdown(extensions=["tables", "fenced_code", "toc"])
    body = md.convert(raw)
    title = os.path.basename(full_path).replace(".md", "")
    return HTML_WRAPPER.format(title=title, nav=build_nav(rel_path), body=body)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress access log noise

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "":
            content = build_index().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(content)
            return

        if path.endswith(".md"):
            rendered = render_md_file(path)
            if rendered:
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(rendered.encode("utf-8"))
                return

        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"Not found")


with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    print(f"Workspace: {WORKSPACE}")
    httpd.serve_forever()
