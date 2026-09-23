# enchanted_place_website

Reusable single-page site frame: sticky nav, hero, split section with cards, case study with animated stats, three-column process, team grid, story split, and contact form (FormSubmit).

Static HTML — no build step.

## Run locally

Open `index.html` in a browser, or:

```bash
npx serve .
```

## Customize

1. **Copy & text** — Edit section comments in `index.html` (`NAV`, `HERO`, etc.).
2. **Images** — Add an `images/` folder; swap `.img-placeholder` divs for `<img src="images/…">` tags.
3. **Colors** — Palette lives in compiled Tailwind utilities in `styles.css` (`navy-900`, `rust-600`, `cream-50`, …). Regenerate from source Tailwind config if you maintain one, or find-replace hex values in `styles.css`.
4. **Contact form** — Set `hello@example.com` in the form `action`, hidden `_next` URL, and `DEST_EMAIL` in the script. First live submission triggers a one-time FormSubmit confirmation email.
5. **Deploy** — Add `CNAME` for a custom domain (GitHub Pages), or use default `*.github.io` hosting.

## Structure

```
index.html      # page sections + inline JS (menu, stats, form)
styles.css      # Tailwind build + small custom rules
images/         # (you add) photos, logo, og-image.jpg
```
