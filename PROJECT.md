# MyCamGirlz — Project Master Doc
**Last Updated:** 2026-04-08
**Commit:** 93e0230
**Live URL:** https://mycamgirlz.com + https://mycamgirlz.pages.dev
**Repo:** https://github.com/CheersToDogs/MyCamGirlz (PUBLIC — never commit secrets)
**Deploy:** git push origin main → Cloudflare Pages auto-deploys (~60s)
**Auth API:** ubuntu@98.95.155.84, port 8767, systemd service `mcg-auth`
**Pages Function proxy:** /functions/api/auth.js → proxies /api/* to AWS:8767

---

## What It Is
Multi-stream live cam grid viewer. CamSoda-inspired UI. Stripchat affiliate revenue + $9.99/mo subscriptions.
Single static `index.html` + Cloudflare Pages Function for API proxy.
No build step, no npm, no framework — vanilla JS + hls.js from CDN.

---

## Repository Structure
```
CheersToDogs/MyCamGirlz/
├── index.html              ← entire frontend (CSS + JS + HTML, ~64KB)
└── functions/
    └── api/
        └── auth.js         ← CF Pages Function — proxies /api/* to AWS:8767
```

---

## Architecture

### Frontend (index.html)
- **HLS:** hls.js 1.4.12 from CDN, `strictManifestParsing: false` (EXT-X-MOUFLON tag)
- **Stripchat API:** `https://go.stripchat.com/api/models` — public, no auth
- **Auth API calls:** `/api/auth/*` → proxied via Pages Function to AWS:8767
- **Session:** HttpOnly JWT cookie `mcg_session`, 30-day expiry
- **Age gate:** localStorage key `mcg_age`, visual overlay only (JS loads behind it)
- **Analytics:** PostHog stub at `A.track()` — endpoint `A.ep` null until wired
- **Variant config:** `const V` object at top of JS — controls free_minutes, reset_hours, price, grid limits

### Backend Auth API (AWS)
- **Location:** `/home/ubuntu/projects/mycamgirlz/auth_api.py`
- **Port:** 8767 (bound to 0.0.0.0, UFW allows only Cloudflare IP ranges)
- **Service:** `mcg-auth.service` (systemd, auto-restart)
- **Env file:** `/home/ubuntu/projects/mycamgirlz/.env`
  - `JWT_SECRET` — 256-bit random hex (already set)
  - `RESEND_API_KEY` — placeholder, needs real key from resend.com
  - `SITE_URL=https://mycamgirlz.com`
  - `MCG_DB=/home/ubuntu/projects/mycamgirlz/auth.db`
- **DB:** SQLite WAL mode, tables: users, magic_tokens, favorites, sessions

### Cloudflare
- **Pages project:** mycamgirlz (mycamgirlz.pages.dev)
- **Custom domains:** mycamgirlz.com + www.mycamgirlz.com (both active)
- **Domain registrar:** Cloudflare (registered 2026-04-08)
- **Account:** Kb@banemedia.com
- **GitHub token:** stored locally — do not commit (MyCamGirlz scope)

---

## Access Tiers

| Tier | Streams | Features | Price |
|---|---|---|---|
| Anonymous | 4 (2×2) + 4 signup tiles | Random, no save | Free |
| Free account | 8 (2×2 + scroll) | Favorites, notifications | Free |
| Paid | 36 (6×6) | Everything, no timer | $9.99/mo |

**Timer system:** Free users get `V.free_minutes` (2min) then `V.reset_hours` (3hr) cooldown.
Controlled by `VARIANT` object — change values to run A/B cohort tests (sequential, not parallel).

---

## Features Complete
- CamSoda-inspired dark purple/pink UI
- Grid selector 1×1 to 6×6 (tier-gated)
- Gender, Sort, Country, Age, Body, Ethnicity filters
- Category pill bar (22 tags)
- Tag text search (Enter to apply)
- HLS playback with snapshot preload
- Auto-refresh every 60s with progress bar
- Pause/Play All toggle
- Active audio tile: snaps to [0,0], pink glow, mutes all others
- Tile hover: name, viewers, country, age, online time, tags
- "Go Private" CTA on tile hover → affiliate link
- Private show modal: 4 upsell options (private, spy, tip, profile)
- Favorite button (♥) on tiles — requires free account
- Signup upsell tiles (anonymous: 4 free-signup tiles; free: paid upsell tiles)
- Paywall modal with countdown timer
- Age gate (18+ confirmation, localStorage persistent)
- Legal pages overlay: ToS, Privacy Policy, 18 U.S.C. 2257
- Footer with legal links + support email
- Loading state (spinner) and empty state (with "Clear Filters" button)
- Mobile responsive (hides secondary filters on small screens)
- Logo links to homepage
- Magic link auth (email → single-use token → HttpOnly JWT cookie)
- User pill in header (email, tier, sign out)
- User menu dropdown
- Favorites CRUD (free: 20 max, paid: 500)
- Fullscreen + arrow key scroll (auto-unmutes focused tile)
- Escape key closes all modals
- Analytics event tracking stub (PostHog-ready)

---

## Auth API Endpoints
```
GET  /health                    → {"ok":true}
POST /auth/magic                → send magic link email
GET  /auth/verify?token=xxx     → verify token, set JWT cookie, redirect to site
GET  /auth/me                   → current user info (requires session)
POST /auth/logout               → revoke session, clear cookie
GET  /favorites                 → list favorites (requires session)
POST /favorites                 → add favorite {username, notify}
DELETE /favorites/{username}    → remove favorite
GET  /favorites/live            → list favorited usernames (for frontend cross-ref)
```

**Rate limits:** 10 magic link requests/15min per IP, 3/hr per email address.
**Security:** bcrypt tokens (SHA-256 hashed in DB), single-use, 15min expiry, no stack traces in prod.

---

## Stripchat API
**Endpoint:** `https://go.stripchat.com/api/models`
**Params:** `limit`, `sortBy` (viewersCount|onlineTime|new), `gender`, `tag`, `country`
**Client-side filters applied:** status=public, gender match, bodyType, ethnicity, age range
**HLS:** `stream.urls.original` → `720p` → `480p` → `240p` (fallback chain)
**strictManifestParsing: false** required for EXT-X-MOUFLON non-standard tag

---

## Affiliate Config
```js
const AFF = { id: '', campaign: 'mycamgirlz' };
```
**Stripcash ID not yet wired** — site sends traffic for free until this is set.
Get ID from stripcash.company → wire into `AFF.id` → push.

---

## Variant / A/B Config
```js
const V = {
  id: 'v1',
  free_minutes: 2,      // free watch window
  reset_hours: 3,       // cooldown before next free window
  price: 9.99,          // displayed subscription price
  modal_copy: 'A',      // paywall modal copy variant
  max_anon_grid: 2,     // anonymous max grid N (2=2x2=4 tiles)
  max_free_grid: 4,     // free account max grid N (shows 8 streams)
  max_paid_grid: 6,     // paid max grid N (6x6=36)
};
```
**Cohort testing:** Run one variant at a time site-wide. Change V, push, new cohort begins.
Do NOT run parallel variants (confuses user experience).

---

## Payment / Business Status
- **CCBill application:** NOT YET SUBMITTED — needs live domain + LLC + EIN
- **Segpay:** Backup processor — same requirements
- **Wyoming LLC:** NOT YET FORMED — use Northwest Registered Agent (~$225/yr)
- **EIN:** NOT YET — get immediately after LLC (irs.gov, free, instant on weekdays)
- **Mercury bank account:** NOT YET — requires LLC docs + EIN
- **Stripcash affiliate account:** NOT YET SIGNED UP

---

## Email / Notifications
- **Resend.com:** NOT YET SET UP — need account + DNS records + API key
- **DNS records needed:** SPF, DKIM TXT records for mycamgirlz.com in Cloudflare
- **API key goes in:** `/home/ubuntu/projects/mycamgirlz/.env` → RESEND_API_KEY
- **Restart after:** `sudo systemctl restart mcg-auth`
- **Cloudflare Email Routing:** Set up noreply@mycamgirlz.com → your personal email
- **Notification system:** NOT YET BUILT — background watcher for favorites going live

---

## AWS Services
```
Port 8765 — mcp-distributed.service (DO NOT USE)
Port 8766 — livegrid-api.service (vision API)
Port 8767 — mcg-auth.service (MyCamGirlz auth — THIS PROJECT)
```
**UFW:** 8767 open to Cloudflare IP ranges only (15 CIDR blocks added).
**DB path:** /home/ubuntu/projects/mycamgirlz/auth.db
**Env path:** /home/ubuntu/projects/mycamgirlz/.env

---

## Critical Rules (DO NOT BREAK)
1. `body` height must stay `100vh` — removing breaks tile aspect-ratio
2. `#app` height must stay `calc(100vh - 54px - 40px - 36px)` — header + catbar + footer
3. `hls.js` config must keep `strictManifestParsing: false`
4. Always call `destroyAll()` before re-rendering grid (prevents HLS memory leaks)
5. Gender filter must be double-enforced: API param AND client-side `.filter()`
6. When any tile unmuted, ALL others must mute — single audio source only
7. Never commit secrets to repo (repo is public)
8. Age gate is a VISUAL OVERLAY only — `load()` fires at init regardless, gate just covers the UI

---

## Next Priority TODO
- [ ] **Fix age gate** — button click not entering site (BUG ACTIVE as of 93e0230)
- [ ] **Resend.com signup** → get API key → wire into .env → restart mcg-auth
- [ ] **Cloudflare Email Routing** → forward noreply@mycamgirlz.com
- [ ] **Stripcash signup** → get affiliate ID → wire into AFF.id → push
- [ ] **Wyoming LLC** → Northwest Registered Agent → northwestregisteredagent.com
- [ ] **EIN** → irs.gov immediately after LLC
- [ ] **Mercury bank account** → after LLC + EIN
- [ ] **CCBill application** → after domain + LLC + EIN
- [ ] **PostHog on AWS** → wire A.ep endpoint → real analytics
- [ ] **Admin dashboard** → /admin route, CF Access gated, Cloudflare API + AWS data
- [ ] **Notification watcher** → background process checks model live status, sends emails
- [ ] **Cloudflare KV** → variant config editable from admin without deploy
- [ ] **Named CF tunnel** → replace direct AWS IP exposure with tunnel

---

## Coding Rules for This Project
- Single file only — everything stays in index.html (no separate CSS/JS)
- No build step, no npm, no framework
- All pushes via GitHub API from Claude container using token above
- Python for all file edits on AWS (never PowerShell for JS — BOM injection risk)
- Run syntax check before every push: `python3 -c "import ast; ..."` for Python files
- Pages Function at functions/api/auth.js proxies all /api/* calls to AWS:8767
- JWT secret already generated and in .env — do not regenerate
