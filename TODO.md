# Before launch

The repo is private and the site is not published anywhere. Nothing here is public
until the DNS ticket is filed, so all of this can be worked through at leisure.

## Photos

- [ ] New group photo. Replaces `assets/img/grouppic.jpg`. Keep the same filename and
      the home page picks it up with no code change. Landscape, roughly 1600px wide.
- [ ] Updated lab photos. `assets/img/labphoto1.jpg` (captioned "Synthesis space, Wean
      Hall 3314") and `labphoto2.jpg` ("Furnaces and preparation benches") are the two
      shown on the Facilities page. `labphoto3` and `labphoto4` are in the repo but
      unused. Captions are in `src/pages/facilities.html`.
- [ ] Photo for Dhiya Srikanth. Currently a "DS" monogram placeholder in
      `src/pages/people.html`. Add `assets/img/dhiyasrikanth.jpg` and swap the
      `<div class="mono">` for an `<img class="photo">` like the other students.
- [ ] Confirm the PI photo and the banner (a campus aerial) are the ones to keep.

## Content to verify

- [ ] Are Abby Chen, Luis Hierro, David Li, and Daniel Yin still active undergraduate
      researchers this fall? They are currently listed as active.
- [ ] CV: decide whether to link a PDF. Source of truth is
      `OneDrive/Work/CMU/CV/CV-Chamorro-CURRENT.pdf`. If yes, copy it to `assets/`
      and link it from the People page.
- [ ] Kaufman Foundation logo: courtesy check with the foundation before launch, since
      they may prefer a text acknowledgment. The NSF logo on a funded project is
      standard and needs no check.
- [ ] SCES 2026 news item says "presents at" because talk versus poster is unresolved.
      Firm it up when known.

## Software (Maestro) page

Held back from the build entirely (`draft=True` in `build.py`). To release it:

- [ ] CTTEC check with Jake Greenberg that open-sourcing generic furnace and sensor
      orchestration does not complicate the December non-provisional.
- [ ] Scrub the Maestro repo: remove live lab IP addresses and hostnames from the
      README, and either add auth on writes or document firewalling as the default.
- [ ] Juan to sign off on the crystal-quality framing in the furnace module card,
      which is currently Claude's phrasing rather than his.

## Launch mechanics

- [ ] Decide public vs private. GitHub Pages does not serve private repos on a free
      account, so the repo has to be public (or the account upgraded) to go live.
- [ ] Turn on Pages: Settings, Pages, deploy from branch `main`, folder `/docs`.
- [ ] File the DNS ticket with it-help@cmu.edu to repoint
      `chamorrolab.andrew.cmu.edu` from `ghs.googlehosted.com` to
      `jrchamorro-cmu.github.io`, plus the GitHub domain-verification TXT record.
- [ ] Enable Enforce HTTPS in Pages once the certificate issues.
- [ ] Export any remaining images from the Google Site, then retire it.
- [ ] Analytics: add GA4 or a lightweight alternative if wanted. Nothing is lost by
      leaving Google Sites.
