# Chamorro Research Group website

Static site for `chamorrolab.andrew.cmu.edu`. No frameworks, no dependencies, no CI:
edit a file, run `python3 build.py`, commit. GitHub Pages serves `docs/` directly.

## Layout

```
build.py                  the whole build (Python standard library only)
src/layout.html           page shell: head, masthead, nav, footer
src/styles.css            all styling, light and dark tokens
src/pages/*.html          one fragment per page, body content only
src/data/publications.json  publication and preprint list
assets/img/               photos and logos, already sized for web
assets/favicon.png
docs/                     BUILD OUTPUT, committed, served by GitHub Pages
```

Nothing in `docs/` is edited by hand. `build.py` deletes and regenerates it.

## Editing

- **Text on a page**: edit `src/pages/<page>.html`. These are body fragments, so no
  `<html>` or `<head>`, and the page's own `<h2>` title lives at the top of the file.
- **A new publication**: add an object to `src/data/publications.json`. Fields are
  `y` year, `t` title, `a` author list, `v` journal, `d` volume/pages/year, `u` DOI URL.
  The name in `highlight_author` is bolded automatically wherever it appears.
- **A photo**: drop the file in `assets/img/` and reference it as
  `assets/img/<name>.jpg` from the page fragment.
- **Page titles, meta descriptions, nav order**: the `PAGES` list at the top of
  `build.py`.
- **Holding a page back**: add `draft=True` to its entry in `PAGES`. The source stays
  in `src/pages/` but the page is left out of the build entirely: no file in `docs/`,
  no nav entry, no sitemap entry, nothing published. Flip it to `False` to release.
  The Software page (Maestro) is currently held back this way, pending the CTTEC
  check and the repo security scrub.

Build and preview locally:

```
python3 build.py
python3 serve.py 8000     # then open http://localhost:8000
```

`build.py` fails loudly on an unresolved `{{IMG:...}}` placeholder or a local link
that points at a file that is not in the output, so a clean build means the site has
no dead internal links.

## Deployment

1. Push this repo to GitHub.
2. Settings, Pages, Deploy from a branch: `main` and folder `/docs`.
3. Custom domain: `chamorrolab.andrew.cmu.edu` (the `CNAME` file is written by the
   build). Enable Enforce HTTPS once the certificate is issued.
4. DNS: `chamorrolab.andrew.cmu.edu` is currently a CNAME to `ghs.googlehosted.com`
   (verified 2026-08-11), pointing at the old Google Site. File a ticket with MSE IT
   or Computing Services to repoint that CNAME at the GitHub Pages host. The URL does
   not change, so nothing that links to the group breaks.
5. Export any remaining images from the Google Site before retiring it.

## Design

Flat Swiss-academic: white ground, Helvetica, CMU red for links, active nav, section
labels, and the top band. Black structural rules. No cards, shadows, rounded corners,
pill tags, or stat tiles, and no serif display face. Full dark mode via CSS tokens.
1120px content width with no narrow per-paragraph column caps.

Provenance: built 2026-08-11/12 from the mockup in
`OneDrive/Work/CMU/Website/Redesign-2026-08/`, whose session notes
(`2026-08-11-redesign-session.md`) carry the content sourcing and the open items.
