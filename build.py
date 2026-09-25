#!/usr/bin/env python3
"""Build the Chamorro Research Group site.

    python3 build.py

Reads src/ (layout, page fragments, stylesheet, publications data) and writes a
complete static site into docs/, which is what GitHub Pages serves. Standard
library only, no dependencies, no build tools.
"""

import html
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
ASSETS = ROOT / "assets"
OUT = ROOT / "docs"

DOMAIN = "chamorrolab.andrew.cmu.edu"
BASE = f"https://{DOMAIN}"
SITE_NAME = "Chamorro Research Group"

# One entry per page. Order is nav order.
#   key   : matches src/pages/<key>.html and the id on the <section>
#   file  : output filename
#   nav   : label in the navigation bar
#   title : <title> and og:title
#   desc  : meta description
#   draft : True keeps the page's source in src/ but leaves it out of the build
#           entirely: no file in docs/, no nav entry, no sitemap entry. Use for
#           pages not cleared to go public. Flip to False to publish.
#   unlisted : True builds the page into docs/ but keeps it out of the nav and
#           the sitemap and marks it noindex. Use for drafts you want to look at
#           in the browser. Reachable only by typing its filename.
#   noanalytics : True strips the Google Analytics block from the page. Use for the
#           members-only tools, so nothing typed there is ever sent to Google.
PAGES = [
    dict(key="home", file="index.html", nav="Home",
         title=f"{SITE_NAME} | Carnegie Mellon University",
         desc="The Chamorro Lab is a quantum materials research group in Materials Science "
              "and Engineering at Carnegie Mellon University. We grow high-quality single "
              "crystals of candidate quantum materials and measure them at low temperature."),
    dict(key="research", file="research.html", nav="Research",
         title=f"Research | {SITE_NAME}",
         desc="Emergent transport in correlated and magnetic materials, quantum magnetism and "
              "frustration, superconductivity and competing electronic orders, and autonomous "
              "crystal growth with AutoFlux."),
    dict(key="people", file="people.html", nav="People",
         title=f"People | {SITE_NAME}",
         desc="Faculty, graduate students, undergraduate researchers, and alumni of the "
              "Chamorro Research Group at Carnegie Mellon University."),
    dict(key="publications", file="publications.html", nav="Publications",
         title=f"Publications | {SITE_NAME}",
         desc="Journal articles and preprints from the Chamorro Research Group and from "
              "Prof. Chamorro's earlier work."),
    # Not public: the Maestro page is held back pending the CTTEC check and the
    # repo security scrub. Source stays in src/pages/software.html.
    dict(key="software", file="software.html", nav="Software", draft=True,
         title=f"Software | {SITE_NAME}",
         desc="Maestro, the group's laboratory orchestration software for furnaces, sensors, "
              "and experiment logging."),
    # Held back 2026-09-10 at Juan's direction: the page waits for a lab clean-up
    # and new photographs. Source stays in src/pages/facilities.html.
    dict(key="facilities", file="facilities.html", nav="Facilities", draft=True,
         title=f"Facilities | {SITE_NAME}",
         desc="Synthesis and crystal growth laboratories in Wean Hall and the shared "
              "characterization facilities available to the group at Carnegie Mellon."),
    dict(key="teaching", file="teaching.html", nav="Teaching",
         title=f"Teaching | {SITE_NAME}",
         desc="Courses taught by Prof. Juan R. Chamorro in Materials Science and Engineering "
              "at Carnegie Mellon University."),
    dict(key="resources", file="resources.html", nav="Resources",
         title=f"Resources | {SITE_NAME}",
         desc="Crystallographic databases, computational tools, and references used by the "
              "Chamorro Research Group."),
    # Members-only tools, linked from Resources. Behind a group passphrase that is checked
    # in the browser (src/pages/members.html). The gate hides the page from casual visitors;
    # it is not security, since the page source is public.
    dict(key="members", file="members.html", nav="Members", unlisted=True, noanalytics=True,
         title=f"Group tools | {SITE_NAME}",
         desc="Tools for members of the Chamorro Research Group."),
]

EXT = {"IMG": ".jpg", "PNG": ".png", "SVG": ".svg"}
NOINDEX = '<meta name="robots" content="noindex">\n'

errors = []


def resolve_assets(text, where):
    """Replace {{IMG:name}} / {{PNG:name}} / {{SVG:name}} with real asset paths."""
    def sub(m):
        kind, name = m.group(1), m.group(2)
        rel = f"assets/img/{name}{EXT[kind]}"
        if not (ASSETS / "img" / f"{name}{EXT[kind]}").exists():
            errors.append(f"{where}: missing asset {rel}")
        return rel
    return re.sub(r"\{\{(IMG|PNG|SVG):([A-Za-z0-9_-]+)\}\}", sub, text)


def render_publications():
    """Render publications.json to static HTML: submitted first, then a numbered list."""
    data = json.loads((SRC / "data/publications.json").read_text())
    out = ['<div class="pyear">In press or submitted</div>']
    for p in data["preprints"]:
        out.append(
            f'<div class="pub"><span class="n"></span><div>'
            f'<span class="t">{p["t"]}</span><br>'
            f'<span class="a">{p["a"]}</span><br>'
            f'<span class="v">{p["d"]}</span> '
            f'<a class="lk" href="{p["u"]}">[arXiv]</a></div></div>'
        )
    pubs = data["publications"]
    out.append('<div class="pyear">Published</div>')
    for i, p in enumerate(pubs):
        num = len(pubs) - i
        out.append(
            f'<div class="pub"><span class="n">{num}.</span><div>'
            f'<span class="t">{p["t"]}</span><br>'
            f'<span class="a">{p["a"]}</span><br>'
            f'<span class="v"><i>{p["v"]}</i> {p["d"]}</span> '
            f'<a class="lk" href="{p["u"]}">[DOI]</a></div></div>'
        )
    return "\n".join(out)


def nav_html(active):
    rows = []
    for pg in PAGES:
        if pg.get("draft") or pg.get("unlisted"):
            continue
        cls = ' class="active"' if pg["key"] == active else ""
        rows.append(f'      <a href="{pg["file"]}"{cls}>{pg["nav"]}</a>')
    return "\n".join(rows)


def build():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "assets").mkdir(parents=True)

    layout = (SRC / "layout.html").read_text()
    # cache-bust the stylesheet so browsers pick up CSS changes at once
    import hashlib
    css_hash = hashlib.sha1((SRC / "styles.css").read_bytes()).hexdigest()[:8]
    layout = layout.replace('href="assets/styles.css"', f'href="assets/styles.css?v={css_hash}"')
    year = date.today().year

    # assets: stylesheet, images, anything else dropped in assets/
    shutil.copy2(SRC / "styles.css", OUT / "assets/styles.css")
    shutil.copytree(ASSETS, OUT / "assets", dirs_exist_ok=True)

    for pg in PAGES:
        if pg.get("draft"):
            print(f"skipping draft page: {pg['file']}")
            continue
        body = (SRC / f"pages/{pg['key']}.html").read_text().strip()
        if pg["key"] == "publications":
            body = body.replace('<div id="pubs"></div>',
                                f'<div id="pubs">\n{render_publications()}\n</div>')
        body = resolve_assets(body, pg["file"])
        shell = (re.sub(r"<!-- ANALYTICS-START -->.*?<!-- ANALYTICS-END -->\n?", "", layout, flags=re.S)
                 if pg.get("noanalytics") else layout)
        page = (shell
                .replace("<!-- ANALYTICS-START -->\n", "").replace("\n<!-- ANALYTICS-END -->", "")
                .replace("{{TITLE}}", html.escape(pg["title"], quote=True))
                .replace("{{DESCRIPTION}}", html.escape(pg["desc"], quote=True))
                .replace("{{CANONICAL}}", f'{BASE}/{"" if pg["file"] == "index.html" else pg["file"]}')
                .replace("{{BASE}}", BASE)
                .replace("{{HEADEXTRA}}", NOINDEX if pg.get("unlisted") else "")
                .replace("{{NAV}}", nav_html(pg["key"]))
                .replace("{{PAGE}}", pg["key"])
                .replace("{{CONTENT}}", body)
                .replace("{{YEAR}}", str(year)))
        (OUT / pg["file"]).write_text(page)

    # 404: the home page shell with a short message. No analytics tag: search engines still
    # list the squatter's spam URLs from Sept 2026, and every click on one lands here, so a
    # tagged 404 page fills the GA4 property with those visits (about 5,000 views a day on
    # 2026-09-22). A 404 for a typo is of no interest either.
    notfound = (re.sub(r"<!-- ANALYTICS-START -->.*?<!-- ANALYTICS-END -->\n?", "", layout, flags=re.S)
                .replace("{{TITLE}}", f"Page not found | {SITE_NAME}")
                .replace("{{DESCRIPTION}}", "That page does not exist.")
                .replace("{{CANONICAL}}", f"{BASE}/404.html")
                .replace("{{BASE}}", BASE)
                .replace("{{HEADEXTRA}}", NOINDEX)
                .replace("{{NAV}}", nav_html(""))
                .replace("{{PAGE}}", "notfound")
                .replace("{{CONTENT}}",
                         "<h2>Page not found</h2>\n"
                         '<p>That page does not exist. Try the <a href="index.html">home page</a>.</p>')
                .replace("{{YEAR}}", str(year)))
    (OUT / "404.html").write_text(notfound)

    # GitHub Pages plumbing
    (OUT / "CNAME").write_text(DOMAIN + "\n")
    (OUT / ".nojekyll").write_text("")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n")

    today = date.today().isoformat()
    urls = "\n".join(
        f"  <url><loc>{BASE}/{'' if p['file'] == 'index.html' else p['file']}</loc>"
        f"<lastmod>{today}</lastmod></url>"
        for p in PAGES if not (p.get("draft") or p.get("unlisted")))
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}\n</urlset>\n")

    # sanity checks
    for f in sorted(OUT.glob("*.html")):
        text = f.read_text()
        for leftover in re.findall(r"\{\{[^}]+\}\}", text):
            errors.append(f"{f.name}: unresolved placeholder {leftover}")
        for href in re.findall(r'(?:href|src)="(?!https?:|mailto:|#)([^"]+)"', text):
            if not (OUT / href.split("?")[0]).exists():
                errors.append(f"{f.name}: broken local link {href}")

    if errors:
        print("BUILD FAILED")
        for e in errors:
            print("  " + e)
        sys.exit(1)

    pages = len(list(OUT.glob("*.html")))
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file()) / 1e6
    print(f"built {pages} pages into {OUT.relative_to(ROOT)}/  ({size:.1f} MB total)")


if __name__ == "__main__":
    build()
