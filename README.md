# Enchanted Place

Forest bathing site for Metro Vancouver: experiences, about, booking (Stripe Checkout), and a monthly letter signup.

Static HTML/CSS/JS served by a small Express app on port 4242.

## Pages

| URL | File | Role |
|-----|------|------|
| `/home.html` | `home.html` | Home — belonging card |
| `/` or `/index.html` | `index.html` | Experiences (family / team / community) |
| `/about.html` | `about.html` | Story, land acknowledgement, guide & host forms |
| `/book.html` | `book.html` | Start a booking |
| `/admin` | `admin.html` | Password-protected inbox (letters + messages) |

`experiences.html` redirects to `index.html`.

## Run locally

```bash
cp .env.example .env
# Add Stripe keys and ADMIN_PASSWORD
npm install
npm start
```

Open http://localhost:4242 — use `/home.html` for the home card, `/` for Experiences.

Forward Stripe webhooks (optional, for paid fulfillments):

```bash
stripe listen --forward-to localhost:4242/api/webhook
```

## Environment

See `.env.example`. Important:

- `STRIPE_*` — Checkout and webhooks
- `ADMIN_PASSWORD` — unlocks `/admin`
- Letter emails and form submissions append to `data/messages.json` (gitignored; created at runtime)

## Design assets

Production images live in `design_assets/` with clear names:

| File | Use |
|------|-----|
| `favicon.png` | Site icon |
| `home-card.png` | Home page mark |
| `session-forest.jpg` | Experience & book cards |
| `about-hero.jpg` | About hero photo |
| `leaf.png` | Small leaf graphic |

Drafts, HEICs, screenshots, and unused video stay in `design_assets/_raw/` (gitignored).

## Structure

```
about.html book.html home.html index.html admin.html
styles.css          # site styles
site.js             # nav, letter forms, booking sheet
server.js           # Express + Stripe + messages + admin
data/               # messages.json / orders.json at runtime
design_assets/      # web images
.env.example
```

## Deploy notes

Set the same env vars on the host. Ensure `data/` is writable so letter signups persist. Do not commit `.env` or `data/*.json`.
