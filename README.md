# Eder Yepez Cuevas — Portfolio

A single-page portfolio site: hero intro, about/skills, a featured project
(Magetender), a dedicated accessibility/UX section, and contact links.

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
  in `index.html`) whenever you want to update what "View resume" downloads.
- **Contact info:** the footer currently lists email, LinkedIn, GitHub, and
  the Magetender Steam page. Your phone number is deliberately left off the
  public site to cut down on scraping/spam — add it if you'd rather it be
  there.
- **Adding more projects:** the "Selected work" section (`#work` in
  `index.html`) currently holds one `<article class="project">` block for
  Magetender. Duplicate that block's structure for additional projects
  (FlowDock, the web/React projects) whenever they're ready to show.
- **Fonts:** the page loads Fraunces, IBM Plex Sans, and IBM Plex Mono from
  Google Fonts over the network, so they'll render correctly once hosted
  live but may not load without an internet connection.
