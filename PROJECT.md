# MyCamGirlz — Project State
**Last Updated:** 2026-05-29
**Live URL:** https://mycamgirlz.com
**Repo:** https://github.com/CheersToDogs/MyCamGirlz (PUBLIC — never commit secrets)
**Deploy:** git push origin main → Cloudflare Pages auto-deploys (~60s)
**Auth API:** LIVE at https://auth.mycamgirlz.com → proxied via /api/*

---

## SESSION START PROTOCOL

1. Read PROJECT.md from repo
2. `git log --oneline -3` on working copy
3. `curl -s https://mycamgirlz.com/api/auth/me` — must return JSON not HTML
4. `curl -s http://127.0.0.1:8880/health` on AWS — must return `{"ok":true}`

---

## CURRENT STATE (2026-05-29)

### What's live and working
- Frontend `index.html` serving at mycamgirlz.com (HTTP 200)
- Cloudflare Pages Function `functions/api/[[path]].js` proxies `/api/*` → `https://auth.mycamgirlz.com`
- Auth backend: FastAPI on AWS port 8880, nginx HTTPS on port 443, Let's Encrypt cert (expires 2026-08-26)
- Magic link auth working end-to-end via AWS SES (sends from noreply@banemedia.com)
- Password login for paid users (PBKDF2-HMAC-SHA256)
- `/api/health` → `{"ok":true}` ✓
- `/api/auth/me` → `{"detail":"Not authenticated"}` ✓
- Geo-blocking: 24 states with active AV laws → HTTP 451 (functions/_middleware.js)
- Age gate with VPN badges (NordVPN/ExpressVPN/Surfshark — placeholder URLs, not yet affiliate)

### Conversion mechanics implemented
- Anon sees 3×5 live grid (15 HLS streams)
- Audio gated behind email capture — clicking 🔇 shows email modal
- Timer: engagement-triggered (not page load), randomized 90–180s, loss framing "X:XX left"
- Scroll past row 3 → secondary 45s counter (bottom-left pill) → paywall
- 60–90s random stream rotation (variable interval schedule)
- On timer expiry: videos pause, snapshots visible, active audio stream continues
- Paywall: semi-transparent (72% opacity, 3px blur) — streams visible behind it
- Paywall copy: loss framing + live social proof count
- Micro-commitment tracking: tile clicks/audio gate attempts → escalate at 3 and 5 interactions
- Return visitor: models lightly shuffled, 1-in-5 visits gets 25% bonus timer

### Access tiers
| Tier | Streams | Grid | Features | Price |
|---|---|---|---|---|
| Anonymous | 15 (3×5 preview) | 3-col forced | Thumbnails on locked tiles | Free |
| Free account | 8 | Up to 3×3 | Audio, favorites, filters | Free + email |
| Paid | 36 | Up to 6×6 | Everything, no timer | $9.99/mo |

---

## BUSINESS STATUS

| Item | Status |
|---|---|
| Wyoming LLC | ✅ Formed (Northwest Registered Agent) |
| EIN | ✅ Obtained |
| Mercury bank | ⚠️ Opened but adult industry prohibited — use Paxum |
| Paxum | ✅ Approved — primary payout account |
| Stripcash affiliate | ⏳ Applied, pending approval |
| CCBill merchant | ⏳ Application in progress |
| Segpay | Backup processor (same requirements) |

---

## PENDING (blocked on business approvals)

- `AFF.id` in index.html is empty — zero affiliate credit until Stripcash ID wired
- `subbtn` (Keep My Access button) has placeholder CCBill URL — swap `CCBILL_URL` constant when approved
- VPN badge URLs are placeholder — sign up for NordVPN/ExpressVPN/Surfshark affiliate programs
- SES sends from `noreply@banemedia.com` — add `mycamgirlz.com` SES identity when DNS records added

---

## PENDING (no blockers — build when ready)

- Rate limiting on `/auth/magic` (currently none — SES quota at risk from spam)
- Admin endpoint to manually upgrade user tier (useful for CCBill testing)
- PostHog analytics wired (A.ep endpoint = null, events tracked but not sent)
- Notification watcher — background process alerts users when favorites go live
- `POST /auth/set-password` frontend UI (backend exists, no UI yet)

---

## KNOWN BUGS / ISSUES

- None currently active

---

## REPOSITORY STRUCTURE

```
CheersToDogs/MyCamGirlz/
├── index.html                  ← entire frontend (~1550 lines)
├── functions/
│   ├── _middleware.js          ← geo-block 24 states (HTTP 451)
│   └── api/
│       └── [[path]].js         ← proxies /api/* → https://auth.mycamgirlz.com
├── PROJECT.md
├── ARCH.md
└── RULES.md
```

---

## AWS SERVICES

```
Port 8880  — mcg-auth.service (MyCamGirlz — THIS PROJECT)
Port 8080  — other project (api.app)
Port 8767  — free (was planned for MCG, moved to 8880)
Port 8766  — livegrid-api.service (separate project)
```

nginx: `auth.mycamgirlz.com` → 127.0.0.1:8880
Certs: `/etc/letsencrypt/live/auth.mycamgirlz.com/` (auto-renew via certbot)
DB: `/home/ubuntu/projects/mycamgirlz/mcg.db`
Config: `/home/ubuntu/projects/mycamgirlz/config.py` (secrets — NOT in git)

EC2 security group: port 8880 open to all 15 Cloudflare IP ranges, port 443 open to 0.0.0.0/0

---

## KEY CONSTANTS IN index.html

```js
const V = {
  id:'v1',
  free_minutes:2,      // legacy — timer now randomized via randTimer()
  reset_hours:3,
  price:9.99,
  modal_copy:'A',
  max_anon_grid:2,     // unused — anon locked to 3-col via renderGrid()
  max_free_grid:4,
  max_paid_grid:6,
};
const AFF = {id:'', campaign:'mycamgirlz'};  // WIRE id WHEN STRIPCASH APPROVES
const CCBILL_URL = 'https://ccbill.com/PLACEHOLDER';  // SWAP WHEN APPROVED
```

---

## STRIPCHAT API

Endpoint: `https://go.stripchat.com/api/models`
Params: `limit`, `sortBy`, `gender`, `tag`, `country`
HLS fallback: `stream.urls.original` → `720p` → `480p` → `240p`
`strictManifestParsing: false` required (EXT-X-MOUFLON non-standard tag)

---

## AFFILIATE CONFIG

```js
const AFF = { id: '', campaign: 'mycamgirlz' };
```
**Empty = zero affiliate credit.** Wire Stripcash ID the moment it arrives.
URL builder: `aurl(username)` in index.html — already wired, just needs `AFF.id`.
