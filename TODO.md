# Before launch

The repo is private and the site is not published anywhere. Nothing here is public
until the DNS ticket is filed, so all of this can be worked through at leisure.

## Photos

- [x] New group photo. Replaced 2026-09-10 with Matt Todd's September 2026 shot from
      `OneDrive/Work/CMU/Website/LabPhotos/group-sept2026.jpeg`, 1600px wide. Keep the same filename and
      the home page picks it up with no code change. Landscape, roughly 1600px wide.
- [ ] Updated lab photos. `assets/img/labphoto1.jpg` (captioned "Synthesis space, Wean
      Hall 3314") and `labphoto2.jpg` ("Furnaces and preparation benches") are the two
      shown on the Facilities page. `labphoto3` and `labphoto4` are in the repo but
      unused. Captions are in `src/pages/facilities.html`.
- [x] Photo for Dhiya Srikanth. Added 2026-09-10. Placeholder convention for anyone
      without a photo is now the tartan swatch, `assets/img/tartan.svg`. Megan Yeager's
      photo added 2026-09-11 (`meganyeager-45.jpg`, cropped from the selfie she sent, the
      second person cropped out). Old note for reference:
  - [ ] (was) monogram placeholder in
      `src/pages/people.html`. Add `assets/img/dhiyasrikanth.jpg` and swap the
      `<div class="mono">` for an `<img class="photo">` like the other students.
- [x] PI photo. Replaced 2026-08-12 with a crop of the full-length
      `OneDrive/Work/CMU/Website/juanchamorro.jpg`.
- [x] Campus banner removed from the home page 2026-09-10; the group photo leads.

## Content to verify

- [x] Abby Chen, Luis Hierro, David Li and Daniel Yin moved to alumni 2026-09-10.
      Gary Zhang (NSF REU, summer 2026) added. Emma Greco, T'Ana Moore and Megan
      Yeager added as current undergraduates. Emma is a physics major and the page
      says so. Still open: no email addresses shown for the three new undergraduates
      (only Emma's is on record).
- [ ] CV: decide whether to link a PDF. Source of truth is
      `OneDrive/Work/CMU/CV/CV-Chamorro-CURRENT.pdf`. If yes, copy it to `assets/`
      and link it from the People page.
- [ ] Kaufman Foundation logo: courtesy check with the foundation before launch, since
      they may prefer a text acknowledgment. The NSF logo on a funded project is
      standard and needs no check.
- [x] Resolved: it is a poster. The whole news list was rebuilt 2026-09-10 from the
      vault as past events only, so no SCES item appears until it has happened.

## Software (Maestro) page

Held back from the build entirely (`draft=True` in `build.py`). To release it:

- [ ] CTTEC check with Jake Greenberg that open-sourcing generic furnace and sensor
      orchestration does not complicate the December non-provisional.
- [ ] Scrub the Maestro repo: remove live lab IP addresses and hostnames from the
      README, and either add auth on writes or document firewalling as the default.
- [ ] Juan to sign off on the crystal-quality framing in the furnace module card,
      which is currently Claude's phrasing rather than his.

## Launch mechanics

- [ ] Make the repo public. GitHub Pages does not serve private repos on a free
      account. THIS IS NOW THE BLOCKER: the DNS ticket was sent 2026-09-10, so once
      CMU repoints the CNAME the domain serves a GitHub 404 until this is done.
- [ ] Turn on Pages: Settings, Pages, deploy from branch `main`, folder `/docs`.
- [x] DNS ticket sent to it-help@cmu.edu 2026-09-10 to repoint
      `chamorrolab.andrew.cmu.edu` from `ghs.googlehosted.com` to
      `jrchamorro-cmu.github.io`. The domain-verification TXT record was not
      included and can be added later.
- [ ] Enable Enforce HTTPS in Pages once the certificate issues.
- [ ] Export any remaining images from the Google Site, then retire it.
- [ ] Analytics: add GA4 or a lightweight alternative if wanted. Nothing is lost by
      leaving Google Sites.
