# MyCamGirlz — Technical Architecture
**Last Updated:** 2026-04-08

---

## System Overview

```
User Browser
    │
    ▼
Cloudflare Edge (mycamgirlz.com)
    │
    ├── Static HTML/CSS/JS → Cloudflare Pages (GitHub auto-deploy)
    │
    ├── /api/* → Pages Function [[path]].js → AWS:8767 (Auth API)
    │
    └── Stream content → go.stripchat.com (direct, no proxy)
                      → doppiocdn.com HLS CDN (direct)
```

---

## Layer 1 — Frontend (index.html)

**Single file. No build step. No framework. No npm.**

Everything lives in one file: `index.html` (~64KB).
Deployed via Cloudflare Pages. Auto-deploys on `git push origin main` (~60s).

### Key dependencies (CDN only)
- `hls.js 1.4.12` — HLS stream playback
- `Nunito` + `Outfit` — Google Fonts

### HLS Configuration
```js
new Hls({
  strictManifestParsing: false,  // REQUIRED — Stripchat uses EXT-X-MOUFLON tag
  maxBufferLength: 10,
  maxMaxBufferLength: 20,
  liveSyncDurationCount: 3,
})
```

### Script Execution Order (critical)
Variables must be declared before use. Current order in `<script>`:
1. `const LEGAL` — legal page content
2. `showLegal()`, `hideLegal()` — functions
3. `const AG_KEY` — age gate key
4. `checkAgeGate()` — function
5. `ag-enter` click listener
6. `const V` — variant config
7. `const AFF` — affiliate config
8. `aurl()` — affiliate URL builder
9. `const A` — analytics object (references S, must be after S conceptually but method bodies are lazy)
10. `fp()` — fingerprint function
11. `const S` — state object
12. Session, timer, HLS, tile, render functions
13. Event listeners
14. Auth/favorites/signup functions (API-dependent)
15. INIT block — `checkAgeGate(); loadSess(); initAuth(); load();`

**Age gate is a visual overlay only. `load()` fires at init regardless of gate state.**
Gate dismissal just hides the div — does not trigger any JS.

### State Object (S)
```js
const S = {
  fp,           // browser fingerprint (string)
  user,         // null | {id, email, tier, verified}
  paid,         // boolean
  ta,           // timer active
  ts,           // timer seconds remaining
  cd,           // in cooldown
  cds,          // cooldown seconds remaining
  n,            // current grid N (1-6)
  models,       // array of model objects from API
  hls,          // {username: HlsInstance}
  at,           // active audio tile element | null
  paused,       // boolean
  f,            // filter state {gender, sort, country, tag, age, body, ethnicity}
  ws,           // watch seconds per model {username: seconds}
  t0,           // session start timestamp
  favorites,    // Set of favorited usernames
}
```

### Variant Config (V)
```js
const V = {
  id:            'v1',   // cohort ID — logged with every analytics event
  free_minutes:  2,      // free watch window before timer expires
  reset_hours:   3,      // cooldown before next free window
  price:         9.99,   // subscription price shown in modal
  modal_copy:    'A',    // paywall modal copy variant (A/B/C)
  max_anon_grid: 2,      // anonymous max grid N → 4 tiles
  max_free_grid: 4,      // free account max grid N → 8 visible (with upsell tiles)
  max_paid_grid: 6,      // paid max grid N → 36 tiles
}
```
**To run a cohort test:** change V values, push. One variant runs site-wide at a time. Never split simultaneously — users must have consistent experience.

### Access Tiers
```
gridLimit()  → 4  (anon) | 8  (free account) | 36 (paid)
maxGridN()   → 2  (anon) | 3  (free)         | 6  (paid)
```
Anonymous users see 4 real tiles + 4 signup upsell tiles.
Free users see 8 real tiles + paid upsell tiles if grid has gaps.

### Session Persistence
- `localStorage['mcg_s']` — timer expiry, cooldown expiry, paid status, fingerprint
- `localStorage['mcg_age']` — age gate confirmation
- `cookie['mcg_session']` — JWT session (HttpOnly, Secure, SameSite=Strict, 30 days)
- `cookie['mcgfp']` — fingerprint (for Cloudflare Worker future use)

### Analytics
```js
const A = { ep: null, track(ev, props) {...} }
```
`A.ep` is null until PostHog endpoint is wired. All events queue silently.
Events: `session_start`, `free_start`, `timer_expired`, `cooldown_reset`,
`paywall_shown`, `subscribe_click`, `modal_dismiss`, `tile_click`, `audio_unmute`,
`affiliate_cta_click`, `tag_click`, `cat_click`, `grid_gate`, `filter`, `auth_modal_shown`,
`magic_link_sent`, `favorite_toggle`, `signup_tile_click`, `session_end`

---

## Layer 2 — Cloudflare Pages Function (/api/*)

**File:** `functions/api/[[path]].js`
**Pattern:** catch-all — handles all `/api/*` routes

Proxies requests from browser → AWS:8767.
Adds CORS headers. Strips internal headers. Passes `CF-Connecting-IP` for rate limiting.
Blocks non-allowed origins (only mycamgirlz.com and www.mycamgirlz.com).

```
Browser GET /api/auth/me
    → Pages Function [[path]].js
    → fetch http://98.95.155.84:8767/auth/me
    → return response with CORS headers
```

AWS port 8767 is open in UFW **only to Cloudflare IP ranges** (15 CIDR blocks).
Direct browser access to AWS:8767 is blocked.

---

## Layer 3 — Auth API (AWS FastAPI)

**File:** `/home/ubuntu/projects/mycamgirlz/auth_api.py`
**Port:** 8767 (bound 0.0.0.0, UFW restricted)
**Service:** `mcg-auth.service` (systemd, Restart=always)
**Runtime:** Python 3.12, uvicorn, FastAPI

### Environment
```
JWT_SECRET=<256-bit hex>
RESEND_API_KEY=<from resend.com — NOT YET SET>
SITE_URL=https://mycamgirlz.com
MCG_DB=/home/ubuntu/projects/mycamgirlz/auth.db
```

### Database (SQLite WAL)
```sql
users         (id, email, tier, verified, created_at, last_login, banned)
magic_tokens  (token_hash, user_id, expires_at, used, created_at)
favorites     (user_id, username, added_at, notify)
sessions      (jti, user_id, created_at, revoked)
```

### Auth Flow (Magic Link)
```
1. POST /auth/magic {email}
   → Rate limit: 10/15min/IP, 3/hr/email
   → Upsert user record
   → Generate raw_token = secrets.token_urlsafe(32)
   → Store SHA-256(raw_token) in magic_tokens, expires in 15min
   → Email magic link via Resend: https://mycamgirlz.com/auth/verify?token=raw_token
   → Return {"ok": true} (same response whether user exists or not)

2. GET /auth/verify?token=raw_token
   → Hash token, look up in DB
   → Validate: exists, not used, not expired, user not banned
   → Mark token used=1
   → Update user verified=1, last_login=now
   → Generate JWT {sub, email, tier, jti, iat, exp}
   → Store jti in sessions table (for revocation)
   → Set cookie: mcg_session=JWT; HttpOnly; Secure; SameSite=Strict; Max-Age=30days
   → Redirect 302 → https://mycamgirlz.com

3. GET /auth/me (requires cookie)
   → Decode JWT, verify signature
   → Check jti not revoked in sessions table
   → Return {id, email, tier, verified, created_at}
```

### Security Implementation
- **No stack traces in prod** — generic 500 handler returns `{"detail": "Internal server error"}`
- **CORS** — locked to mycamgirlz.com + www only
- **Rate limiting** — in-memory bucket per IP+endpoint
- **Token storage** — SHA-256 hash only, raw token never stored
- **JWT** — PyJWT 2.x, HS256, jti stored for revocation
- **Session revocation** — logout marks jti revoked, all auth checks verify jti
- **Security headers** — middleware adds X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **Input validation** — email regex, username alphanumeric-only, max lengths enforced
- **Docs disabled** — `/docs` and `/redoc` disabled in prod

---

## Layer 4 — Stripchat API (External)

**Endpoint:** `https://go.stripchat.com/api/models`
**Auth:** None required — public endpoint
**Usage:** Frontend calls directly (not proxied)

### Request
```
GET https://go.stripchat.com/api/models?limit=48&sortBy=viewersCount&gender=female&tag=latina
```

### Response shape
```json
{
  "models": [
    {
      "username": "modelname",
      "status": "public",
      "gender": "female",
      "country": "RO",
      "age": 24,
      "viewersCount": 1243,
      "onlineTime": 7200000,
      "broadcastHD": true,
      "stream": {
        "urls": {
          "original": "https://b-hls-XX.doppiocdn.com/hls/STREAMID/master/STREAMID_auto.m3u8",
          "720p": "https://...",
          "480p": "https://...",
          "240p": "https://..."
        }
      },
      "snapshotUrl": "https://...",
      "tags": ["latina", "lovense", "bigboobs"],
      "ethnicity": "latina",
      "bodyType": "slim"
    }
  ]
}
```

### Client-side filter chain (applied after API response)
1. `status === 'public'`
2. `gender === S.f.gender` (double-enforce — API param unreliable)
3. `stream && stream.urls` (must have playable stream)
4. `bodyType` match if filter set
5. `ethnicity` match if filter set
6. Age range match if filter set

### HLS URL Structure
`https://b-hls-{serverNum}.doppiocdn.com/hls/{streamId}/master/{streamId}_auto.m3u8`

Stream segments: `https://media-hls.saawsedge.com/...` — **403 for unauthenticated requests on paid/private shows** (paywall enforced at segment level, not manifest level).

---

## Layer 5 — Affiliate (Stripcash)

**Affiliate ID:** NOT YET SET — wire into `AFF.id` in index.html

```js
const AFF = { id: '', campaign: 'mycamgirlz' };

function aurl(username) {
  if (!AFF.id) return `https://stripchat.com/${username}`;
  return `https://go.stripchat.com/?userId=${AFF.id}&campaign=${AFF.campaign}&trackingKey=${username}`;
}
```

Every model tile CTA, private show modal link, and signup upsell passes through `aurl()`.
**Until AFF.id is set, all clicks send traffic to Stripchat with no affiliate attribution.**

---

## Deployment Pipeline

```
Local edit → git push origin main
    → GitHub webhook → Cloudflare Pages CI
    → Build (no build command, output: /)
    → Deploy to mycamgirlz.com (~60s)
```

**Pushes from Claude container:**
```bash
TOKEN="ghp_..." # stored securely, not in repo
cd /home/claude
git add index.html functions/api/[[path]].js
git commit -m "description"
git push origin main
```

**AWS service management:**
```bash
sudo systemctl restart mcg-auth
sudo systemctl status mcg-auth
sudo journalctl -u mcg-auth -n 50 --no-pager
```

---

## Cloudflare Configuration

**Pages project:** mycamgirlz
**Custom domains:** mycamgirlz.com, www.mycamgirlz.com
**Build command:** (none)
**Build output:** /
**Production branch:** main

**DNS (auto-configured by Cloudflare):**
- mycamgirlz.com → CNAME → mycamgirlz.pages.dev (proxied)
- www.mycamgirlz.com → CNAME → mycamgirlz.pages.dev (proxied)

**Security settings applied:**
- Block AI bots: ON
- Bot Fight Mode: OFF (can interfere with HLS fetches)
- AI Labyrinth: OFF

**Pending:**
- Cloudflare KV → store variant config (editable from admin without deploy)
- Cloudflare Access → protect /admin route (your email only)
- Named tunnel → replace direct AWS IP with tunnel (needs custom domain on tunnel)
- WAF rules → rate limit /api/auth/* at edge level
- Security headers transform rule → add CSP, HSTS

---

## AWS Instance

**Host:** 98.95.155.84 (ubuntu@)
**Key:** C:/Users/kb/.ssh/id_rsa

**Port map:**
```
8765 — mcp-distributed.service     ← DO NOT TOUCH
8766 — livegrid-api.service        ← Vision API (LiveGrid project)
8767 — mcg-auth.service            ← MyCamGirlz Auth API (THIS PROJECT)
```

**UFW rules for 8767:**
15 Cloudflare CIDR blocks (173.245.48.0/20 etc.) — all tagged "Cloudflare Workers"
Direct internet access to 8767 blocked. Only reachable through Cloudflare.

---

## Email Architecture

**Transactional email (magic links, notifications):** Resend.com
- API key goes in `/home/ubuntu/projects/mycamgirlz/.env` → `RESEND_API_KEY`
- From address: `noreply@mycamgirlz.com`
- DNS records needed in Cloudflare: SPF TXT + DKIM TXT (provided by Resend on signup)
- **NOT YET SET UP**

**Inbound forwarding:** Cloudflare Email Routing
- `noreply@mycamgirlz.com` → personal email
- `support@mycamgirlz.com` → personal email
- `legal@mycamgirlz.com` → personal email
- **NOT YET SET UP**

**Notification system (future):**
Background process on AWS polls Stripchat API for favorited models' online status.
When model goes live → query users with that model favorited + notify=true → send email via Resend.
Each notification email contains affiliate deep-link → resets 30-day Stripcash lookback cookie.

---

## Payment Architecture (Pending)

**Primary processor:** CCBill
**Backup processor:** Segpay
**Stripe:** EXCLUDED — does not support adult content

CCBill webhook on successful subscription → Cloudflare Pages Function → sets `tier='paid'` in AWS users table → next `/auth/me` call returns paid tier → frontend unlocks full grid.

**Requirements before applying:**
- Wyoming LLC (active)
- EIN (obtained)
- Mercury business bank account (funded)
- mycamgirlz.com live with ToS/PP/2257/age gate visible
- CCBill application: ccbill.com/cs/signup.cgi

---

## Financial Model Summary

**Revenue tracks:**
1. Stripcash revshare — 20% lifetime of all referred user spend on Stripchat
2. Subscriptions — $9.99/mo via CCBill (pending)
3. Display/preroll ads — TrafficJunky/ExoClick (pending scale)

**Lookback mechanics:**
- Stripcash: 30-day last-click cookie
- Every affiliate link click resets the 30-day window
- "Favorite is live" notification emails contain affiliate link → resets cookie on click
- Once user converts (first purchase within 30 days), tagged to affiliate **permanently**

**Break-even estimate (subscriptions only):**
- AWS: ~$20/mo
- Resend Pro: $20/mo (at scale)
- Northwest Registered Agent: ~$10/mo amortized
- Total fixed: ~$50/mo → 6 paying subscribers covers costs

**Domain research (RDAP-verified available, checked 2026-03):**
Both .com and .cam available: mygirlgrid, camtile, glimpsegrid, babegrid
.cam/.xxx available but .com taken: camgrid, gridgirls, peekgrid, camvee
mycamgirlz.com — REGISTERED (Cloudflare, 2026-04-08)

---

## Known Issues / Active Bugs

- [ ] **Age gate** — button click not entering site. Root cause: `/api/auth/me` was returning HTML (Pages Function not routing correctly). Fixed by renaming to `[[path]].js` catch-all. Verify after deploy.
- [ ] **Stripcash affiliate ID** — not wired. All traffic unattributed.
- [ ] **Resend API key** — not set. Magic links log to console only, not sent.
- [ ] **PostHog** — `A.ep` is null. Analytics stub in place, no data flowing.
- [ ] **Notification watcher** — not built.
- [ ] **CCBill** — not applied.
- [ ] **Admin dashboard** — not built.
