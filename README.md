# Eder Yepez Cuevas — Portfolio

A single-page portfolio site: a photo/bio intro with a "Sections" index
(Game Design, Music/Sound Design, UX/UI), horizontal per-section pages —
currently just Game Design, featuring Magetender — and contact links.

No build step, no dependencies. Plain HTML, CSS, and JS.

## Run it locally

Open `index.html` directly in a browser, or serve the folder:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Host it on GitHub Pages

1. Push this folder's contents to a new (or existing) GitHub repo's `main`
   branch, with `index.html` at the repo root — not nested in a subfolder.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`.
4. Save. Your site will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.
   If this repo is private, GitHub Pages requires a paid GitHub plan — make
   the repo public if you want the free hosting tier.

## Before you publish

- **Resume:** `assets/resume.pdf` is the UX-framed resume already built.
  Swap in a different file (keep the name `resume.pdf`, or update the link
  in `index.html`) whenever you want to update what the footer's "Resume"
  link downloads.
- **Contact info:** the footer currently lists resume, email, LinkedIn,
  GitHub, and the Magetender Steam page. Your phone number is deliberately
  left off the public site to cut down on scraping/spam — add it if you'd
  rather it be there.
- **Adding more projects:** each project inside a category section
  (`#game-design` in `index.html`) is an `<article class="project-row">`
  with a square `.project-image` and `.project-copy` text block. Duplicate
  that structure for more Game Design projects, and add new `<section
  class="category">` blocks (with a matching entry in `.sections-list`)
  for Music/Sound Design and UX/UI (FlowDock, the web/React projects) when
  they're ready to show.
- **Project images:** `.project-image` is currently a dashed placeholder box.
  Replace its inner `<span>` with an `<img>` once real project screenshots
  exist.
- **Fonts:** the page loads Fraunces, IBM Plex Sans, and IBM Plex Mono from
  Google Fonts over the network, so they'll render correctly once hosted
  live but may not load without an internet connection.
