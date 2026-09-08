# MyCamGirlz — Project State
**Last Updated:** 2026-09-07
**Live URL:** https://mycamgirlz.com
**Repo:** https://github.com/CheersToDogs/MyCamGirlz (PUBLIC — never commit secrets)
**Deploy:** push from the EC2 working copy `/home/ubuntu/projects/mycamgirlz-web` → SSH remote `git@github-account:CheersToDogs/MyCamGirlz.git` → Cloudflare Pages auto-deploys (~60–80s, no build step). **Do NOT push from the Windows node or a container** — pushes originate on EC2.
**Auth API:** LIVE at https://auth.mycamgirlz.com → proxied via /api/*

---

## SESSION START PROTOCOL

1. Read PROJECT.md from repo
2. `git log --oneline -3` on working copy
3. `curl -s https://mycamgirlz.com/api/auth/me` — must return JSON not HTML
4. `curl -s http://127.0.0.1:8880/health` on AWS — must return `{"ok":true}`

---

## CURRENT STATE (2026-09-07)

### What's live and working
- Frontend `index.html` serving at mycamgirlz.com (HTTP 200)
- Cloudflare Pages Function `functions/api/[[path]].js` proxies `/api/*` → `https://auth.mycamgirlz.com`
- Auth backend: FastAPI on AWS port 8880, nginx HTTPS on port 443, Let's Encrypt cert (expires 2026-08-26)
- Magic link auth working end-to-end via AWS SES (sends from noreply@banemedia.com)
- Password login for paid users (PBKDF2-HMAC-SHA256)
- `/api/health` → `{"ok":true}` ✓
- `/api/auth/me` → `{"detail":"Not authenticated"}` ✓
- Geo-blocking: 24 states with active AV laws → HTTP 451 (functions/_middleware.js); legal paths exempt so Terms/Privacy/etc stay reachable everywhere
- Age gate with VPN badges (NordVPN/ExpressVPN/Surfshark — placeholder URLs, not yet affiliate)
- **Compliance pages SHIPPED (commit 0286794):** static Terms / Privacy / Refund / 2257 / DMCA / Contact pages at repo root; age-gate + footer + signup links repointed to them; dead in-app legal overlay removed (kills stale 2257 + legal@/privacy@ bounce mail)
- **Timeout paywall is a HARD WALL (commit 500ff0d):** during an active cooldown (`S.cd`) the dismiss button is non-interactive (`#disbtn.hardlock` → pointer-events:none) and background-click + Escape are gated — the only exits are subscribe or wait out the cooldown. Premium (filter/grid) soft-nudge keeps its "Not now". The `dismiss` analytics event is retired

### Conversion mechanics implemented
- Anon **and** free accounts see the most-popular live streams: **top 4 in 2×2, top 9 in 3×3** (`V.free_tiles` = 9 cap). Lands on 3×3
- **Filters are premium:** the 6 pulldowns + tag search show ⭐. Non-paid can open, browse and type — selecting or pressing Enter opens the premium modal and reverts. Category pills stay free
- Audio gated behind email capture — clicking 🔇 shows email modal
- Timer: engagement-triggered (not page load), randomized 90–180s, loss framing "X:XX left"
- 60–90s stream rotation, rotating only within the top-10 so the preview stays "most popular"
- On timer expiry: videos pause, snapshots visible, active audio stream continues
- **Real, escalating cooldown:** 20 min lockout, +10 min each cycle, cap 60 min. Live countdown in the paywall. Persisted in localStorage — refresh does not clear it
- **Bonus window:** when a cooldown ends → fresh streams + **60s free** (a taste, not a meal) → wall again. Each cycle the free path costs more waiting while $9.99 stays fixed
- Lockout is airtight: `load()` and the anon rotation refuse to re-render live streams while locked (previously leaked playable video behind the translucent paywall)
- Paywall: semi-transparent (72% opacity, 3px blur) — paused streams / thumbnails visible behind it
- Paywall copy: loss framing + live social proof count
- **Grid sizes:** 2×2 and 3×3 free; 1×1, 4×4, 6×6 show ⭐ and open the subscription modal for anyone not paid
- Micro-commitment tracking: tile clicks/audio gate attempts → escalate at 3 and 5 interactions
- Return visitor: models lightly shuffled, 1-in-5 visits gets 25% bonus timer
- Every conversion mechanic is instrumented — see **ANALYTICS.md** (the analytics canon)

### Access tiers
| Tier | Streams | Grid | Features | Price |
|---|---|---|---|---|
| Anonymous | top 4 (2×2) / top 9 (3×3) | 2×2 / 3×3 | Filters ⭐ premium-gated; timer → cooldown loop | Free |
| Free account | top 3 / 8 + "Keep Watching" CTA | 2×2 / 3×3 | Audio, favorites; filters ⭐ premium-gated; same timer/cooldown | Free + email |
| Paid | 36 | Up to 6×6, 1×1 fullscreen | Everything, no timer, no cooldown | $9.99/mo |

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
- **Stripcash integration plan — JS mode:** wire Stripcash via their JS smartlink/SDK ("JS mode") for attribution/cookies rather than relying solely on static deep-links. Current `aurl(username)` + `AFF.id` static path stays as the placeholder until Stripcash approves; drop in the JS-mode snippet per Stripcash's affiliate docs at integration time
- `subbtn` (Keep My Access button) has placeholder CCBill URL — swap `CCBILL_URL` constant when approved
- VPN badge URLs are placeholder — sign up for NordVPN/ExpressVPN/Surfshark affiliate programs
- SES sends from `noreply@banemedia.com` — add `mycamgirlz.com` SES identity when DNS records added

---

## PENDING (no blockers — build when ready)

- Notification watcher — background process alerts users when favorites go live
- **PostHog reverse-proxy** — events post direct to `us.i.posthog.com`, so ad/tracker blockers drop some. Proxy through a first-party path (Pages Function or `/e/` route) to recover them.

### Shipped this session (2026-09-07) — backend was well ahead of the old PENDING list
- **Rate limiting on `/auth/magic`** — in-memory per-IP (10 / 15 min) + per-email (4 / 15 min) → HTTP 429. Protects SES quota + link spam. Single-process uvicorn, in-memory buckets; keys prune on window expiry.
- **Server-side revenue event WIRED** — the CCBill webhook fires a fire-and-forget PostHog `purchase` on `NewSaleSuccess`/`RenewalSuccess`, `distinct_id` = user id (stitches to the client funnel). `subscribe` stays click-intent; `purchase` is the conversion truth. Isolated in `asyncio.create_task` + try/except so it can never delay or break the webhook 200.
- **`/auth/set-password` + `/auth/login` UI already present** (index.html ~1336 / 1442 / 1511) — the old "no UI yet" note was stale.
- **`/admin/set-tier`** — manual tier flip (`X-Admin-Token` header or `?k=`), for CCBill testing/support.
- **CCBill webhook state machine (backend, live)** — `NewSaleSuccess`/`RenewalSuccess` → paid (+`period_end` +32d, `subscription_id`, `sub_status`, `processor`); `Cancellation` → cancelled; `Expiration`/`Chargeback`/`Refund`/`Void`/`Failure` → free. Fail-closed `?k=` shared secret; every event audited to `billing_events`. Subscription state lives in `users` columns + `billing_events` — no separate table needed. Still blocked on the live CCBill `clientSubacc` URL to drive real sales (see `CCBILL_URL` placeholder above).

> **Backend deploy model:** `mcg-auth` (`auth_api.py`) is deployed in-place on EC2 (NOT in this repo) and reloaded via `sudo systemctl restart mcg-auth`; each edit keeps a timestamped `.bak`. Only `index.html` + `functions/` + docs live in git.

---

## ROADMAP / FUTURE (boarded)

### boyfriend.tv (BF) - gay male cams  [boarded 2026-09-06]
- Pipeline LIVE: residential scraper (Ken box, scheduled ~3min) -> `POST /bf/ingest` (token-gated) -> `GET /bf/models` (~570 live gay cams). Endpoints exist in auth_api.py.
- Two-track plan: (1) eventually a dedicated "boyz" site for BF. (2) ALSO surface BF here on MyCamGirlz as an opt-in **source pill** - minimal port of the proven LiveGrid pattern (source state + BF toggle + `fetchModels` branch -> `/api/bf/models`, reuse existing tile/HLS + premium-gate; blue heart badge, `aurl()` affiliate). DEFERRED: product/funnel + branding decision before it touches the girls funnel.
- Alt roster discovered: xHamsterLive SSR `/men/gays` (~147) + `/men/{twinks,daddies,muscular,bisexuals}` = xhl's OWN gay models (different performers than boyfriend.tv), reachable via existing `/xhl/browse`. Candidate complement/backup.

### Filters + grid (shipped 2026-09-06)
- Category/ethnicity/body/age/tag filtering works via xHamsterLive v1 `filterGroupTags=[["camelCaseTagId"]]` (JSON array-of-arrays; OUTER=AND across groups, INNER=OR within) through `/api/xhl/models`. Verified live: disjoint rosters, AND-combine (asian&bbw ~23). Invalid tag id -> empty (not baseline), so no silent no-ops. Dead id note: `bodyTypeSkinny` returns 0 (slim survives via OR `bodyTypePetite`).
- Premium-gated for non-subscribers: star (premium) marks on all 6 pulldowns + tag search; apply -> "Hey - those are premium features" $9.99/mo paywall + revert + grid unchanged. Genuinely applies for paid.
- GRID-EMPTY regression fixed (commit 555aae8): v1 rejects `sortBy=viewersCount|onlineTime|new` (HTTP 400 "invalid sortBy"); always send `stripRanking` (new-sort handled via `autoTagNew` filter group).

## KNOWN BUGS / ISSUES

- **AV geo-block has no WAF backstop (free CF plan):** the state block lives entirely in `functions/_middleware.js` (a Pages Function). The free Cloudflare plan has no custom WAF geo-rules, so there is no edge-level backstop — if the middleware is bypassed or errors, blocked-state traffic is not stopped. Mitigation: keep the middleware fail-closed; move to a paid CF plan with WAF geo-rules before scaling traffic.

---

## REPOSITORY STRUCTURE

```
CheersToDogs/MyCamGirlz/
├── index.html                  ← entire frontend (~1980 lines)
├── terms.html · privacy.html · refund.html · 2257.html · dmca.html · contact.html   ← compliance pages (commit 0286794)
├── functions/
│   ├── _middleware.js          ← geo-block 24 AV states (HTTP 451); LEGAL_PATHS exempt
│   └── api/
│       └── [[path]].js         ← proxies /api/* → https://auth.mycamgirlz.com
├── PROJECT.md
├── ARCH.md
├── ANALYTICS.md
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
  id:'v1', price:9.99, modal_copy:'A',
  free_tiles:9,          // non-paid cap: 3x3 = top 9, 2x2 = top 4
  max_paid_grid:6,       // paid: 6x6 = 36
  cooldown_min:20,       // 1st lockout length (minutes)
  cooldown_step_min:10,  // minutes added per successive lockout (escalation)
  cooldown_cap_min:60,   // ceiling
  bonus_secs:60,         // viewing granted when a cooldown ends
};
// All V knobs are A/B levers: V.id is stamped on every analytics event (see ANALYTICS.md).
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
