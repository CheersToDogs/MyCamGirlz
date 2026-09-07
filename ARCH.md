# MyCamGirlz — Technical Architecture
**Last Updated:** 2026-05-29

---

## System Overview

```
User Browser
    │
    ▼
Cloudflare Edge (mycamgirlz.com)
    │
    ├── _middleware.js      → geo-block 24 US states (HTTP 451)
    │
    ├── Static index.html   → Cloudflare Pages (GitHub auto-deploy)
    │
    ├── /api/*              → Pages Function [[path]].js
    │                            → https://auth.mycamgirlz.com (nginx)
    │                                → http://127.0.0.1:8880 (FastAPI)
    │
    └── Stream content      → go.stripchat.com (Stripchat API, direct)
                            → doppiocdn.com (HLS CDN, direct)
```

---

## Layer 1 — Cloudflare Edge

### Geo-block Middleware (`functions/_middleware.js`)
- Runs before every request
- Blocks 24 US states with active real-ID age verification laws
- Returns HTTP 451 (Unavailable For Legal Reasons) with branded block page
- API routes (`/api/*`) bypass geo-block — auth doesn't need to be geo-restricted
- States: AL AR AZ FL GA ID IN KS KY LA MS MT NC ND NE OH OK SC SD TN TX UT VA WY

### Pages Function (`functions/api/[[path]].js`)
- Catches all `/api/*` requests
- Proxies to `https://auth.mycamgirlz.com` (DNS-only subdomain, bypasses CF loop detection)
- Forwards cookies, Content-Type, CF-Connecting-IP headers
- Adds CORS headers on all responses
- Returns 503 JSON if upstream unreachable (never serves HTML error)

---

## Layer 2 — Frontend (`index.html`)

Single file. No build step. No framework. No npm. ~1550 lines vanilla JS/CSS/HTML.

### Key JS objects
```js
const V = { ... }        // variant config — timers, price, grid limits
const AFF = { id, campaign }  // affiliate config — wire AFF.id when Stripcash approves
const S = { ... }        // global state — user, models, HLS instances, timer state
```

### Conversion flow (anonymous visitor)
1. Age gate → localStorage `mcg_age`
2. Land on the 5 most-popular live streams (`V.free_tiles`, 3 cols forced)
3. First scroll/click → engagement timer starts (90–180s random)
4. Audio button click → email capture modal (audio gated)
5. Timer expires → progressive degradation (video pauses, thumbnails visible, audio continues) → paywall **with live cooldown countdown**
6. **Cooldown** (20m, +10m per cycle, cap 60m) → countdown ends → fresh streams + **60s bonus** → back to step 5, escalated
7. Grid buttons 1×1 / 4×4 / 6×6 → subscription modal (paid-only for all non-paid)
8. Email submit → free account (magic link async). Paywall "Keep My Access" → CCBill checkout (CCBILL_URL constant)

### Timer + cooldown system
- `randTimer()`: 90–180 random seconds; return visitors get 25% bonus 1-in-5 visits
- `attachEngagementTrigger()`: fires `startTimer(secs?)` on first scroll/click; `secs` overrides the duration (used for the bonus window)
- `S.ta` / `S.ts`: timer active / seconds left. `S.cd` / `S.cds`: cooldown active / seconds left. `S.cyc`: lockout cycle count — drives escalation
- `expireT()`: pauses video, keeps snapshots, audio continues, shows paywall, then **arms the cooldown**: `S.cds = min(cooldown_min + cooldown_step_min*cyc, cooldown_cap_min)*60`, persists `cu`, starts `tickCD()`
- `tickCD()`: 1s countdown rendered into `#rclk` / `#rcinl`; at 0 → `S.cyc++`, `load()` (fresh streams), `startTimer(V.bonus_secs)`
- **Lockout integrity:** `load()` returns early while `S.cd`; `startAnonRotation()` is gated on `S.cd`. Nothing playable is ever rendered behind the wall
- Session in localStorage (`mcg_s`): `ex` (timer end), `cu` (cooldown end), `cyc` — all survive refresh; `loadSess()` restores state and resumes the countdown

### HLS playback
- `hls.js` 1.4.12 from CDN
- `strictManifestParsing: false` on every instance (EXT-X-MOUFLON non-standard tag)
- `destroyAll()` before every grid re-render (prevents memory leaks)
- Micro-grid: pure thumbnail images (`snapshotUrl`), no HLS — performance

### Auth state
- `S.user`: null (anon) | `{id, email, tier}` (logged in)
- `S.paid`: boolean shortcut
- `initAuth()` calls `/api/auth/me` at startup — restores session from HttpOnly JWT cookie

---

## Layer 3 — Auth Backend (AWS EC2)

### Stack
- **Python 3.12** + **FastAPI** + **uvicorn**
- **SQLite** (WAL mode) at `/home/ubuntu/projects/mycamgirlz/mcg.db`
- **AWS SES v2** (boto3) for magic link emails — sends from `MyCamGirlz <noreply@banemedia.com>`
- **python-jose** for JWT (HS256, 30-day expiry)
- **PBKDF2-HMAC-SHA256** for password hashing (260k iterations, no bcrypt dependency)

### Service
```
systemd: mcg-auth.service
working dir: /home/ubuntu/projects/mycamgirlz/
command: uvicorn auth_api:app --host 0.0.0.0 --port 8880 --workers 1
```

### nginx proxy
- Listens on 443 (HTTPS) for `auth.mycamgirlz.com`
- Let's Encrypt cert (certbot, auto-renew)
- Proxies to `http://127.0.0.1:8880`
- Config: `/etc/nginx/sites-enabled/mcg-auth`

### Why auth.mycamgirlz.com not a raw IP
Cloudflare Workers' `fetch()` returns HTTP 403/1003 when targeting a raw IP that Cloudflare
recognizes as a proxied origin. Using a DNS-only subdomain (`auth.mycamgirlz.com`, orange
cloud OFF in CF dashboard) bypasses this loop-detection mechanism.

### DB Schema
```sql
users         (id, email, tier, password_hash, created, last_seen)
magic_tokens  (token, email, expires, used)
favorites     (user_id, username, added)
```

### Endpoints
```
GET  /health                    → {"ok":true}
POST /auth/magic                → send magic link email (SES)
GET  /auth/verify?token=        → validate token, set JWT cookie, redirect /?auth=ok
GET  /auth/me                   → current user or 401
POST /auth/logout               → clear JWT cookie
POST /auth/login                → email+password for paid users → JWT cookie
POST /auth/set-password         → set/change password (paid users only)
GET  /favorites                 → list user favorites
POST /favorites                 → add/remove favorite {username, action}
POST /webhooks/ccbill           → NewSaleSuccess/Cancellation → flip tier
```

### JWT cookie
```
name: mcg_session
httpOnly: true
secure: true
sameSite: lax
domain: mycamgirlz.com
max-age: 30 days
```

---

## Layer 4 — Business / Revenue

### Affiliate (Stripcash)
- Program: stripcash.company, 20% lifetime revshare
- Cookie: 30-day last-click
- Tracking: `aurl(username)` builds affiliate link when `AFF.id` populated
- **AFF.id is currently empty — zero revenue attribution**

### Subscriptions (CCBill)
- Application in progress
- Webhook: `POST /webhooks/ccbill` — `NewSaleSuccess` → tier=paid, `Cancellation` → tier=free
- Frontend: `CCBILL_URL` constant in index.html → swap when approved

### Email
- AWS SES production access (50k/day, 14/sec)
- Sending domain: `banemedia.com` (verified)
- From: `MyCamGirlz <noreply@banemedia.com>`
- Add `mycamgirlz.com` SES identity when DNS TXT records added to CF

---

## Network Security

### AWS Security Group (sg-0f60e597393a30c17)
- Port 443: open to 0.0.0.0/0 (nginx HTTPS)
- Port 8880: open to all 15 Cloudflare IP ranges only
- Port 22: restricted to specific IPs

### UFW (software firewall)
- Port 8880: allowed from Cloudflare IP ranges (same 15 blocks as SG)
- Redundant with SG — defense in depth

### Cloudflare
- Pages serves static assets + runs Functions at edge
- WAF: managed OWASP rules enabled
- Bot Fight Mode: OFF (interferes with HLS stream fetches from Stripchat CDN)
