# MyCamGirlz — Analytics Canon

**This file is the single source of truth for what is measured and how it is read.** Every `A.track()` event in `index.html` is listed here. If it isn't here, it isn't canon. (Discipline rules live in RULES.md.)

## Stack
- **PostHog** (project token `phc_vAPm…` — a public client-side token, safe in this repo). `posthog.init` runs in the first inline `<script>`; `autocapture` + `capture_pageview` are on.
- **Wrapper:** `A.track(event, props)` → `posthog.capture`. It stamps these on **every** event, so never pass them manually:

| auto-prop | meaning |
|---|---|
| `variant` | `V.id` — the A/B variant. **Bump `V.id` whenever you change a `V` knob for a test.** |
| `fp` | device fingerprint (`fp()`), stable across sessions — the anonymous user key |
| `tier` | `anon` / `free` / `paid` at the moment of the event |
| `rv` | return-visit count (`mcg_rv`) |

- **Identity:** `A.identify(user)` on login → `posthog.identify(user.id, {email, tier, verified})` stitches the `fp` history to the account. Paid conversions must be read on the identified user.

## Event taxonomy (41 events)

### Session & lifecycle
| event | fires when | props |
|---|---|---|
| `start` | page boot | `ref` (referrer) |
| `loaded` | grid rendered after a fetch | `count` (models fetched), `n` (grid size) |
| `session_end` | `beforeunload` | — |
| `scroll_depth` | scroll milestone in `#gw` | `pct` |
| `watch_time` | a tile stops being watched | `u` (model), `secs` |

### Browsing & grid
| event | fires when | props |
|---|---|---|
| `grid_n` | grid size changed (allowed) | `n` |
| `grid_gate` | paid-only grid size clicked by non-paid → subscription modal | `n` |
| `cat` / `tag` / `tag_search` | category pill / tile tag / typed tag | `tag` |
| `filter` | gender/sort/country/age/body/ethnicity change | `key`, `val` |
| `tile_click` | tile body clicked | `u`, `vc` (viewers) |
| `cta` | model out-link clicked (affiliate) | `u` |
| `pm_open` / `pm_click` | profile modal opened / clicked through | `u` (`id`) |
| `audio` / `audio_gate` | audio enabled / audio attempted while gated | `u` |
| `locked_tile_click` | locked tile clicked | `idx` |
| `interaction` | micro-commitment counter tick (escalates at 3 & 5) | `type`, `ix` |
| `favorite_toggle` | ♥ toggled (free/paid) | `username`, `action` |
| `microgrid_open` / `microgrid_timeout` | micro-grid modal | — |

### Timer & lockout loop  ← the core of the conversion model
| event | fires when | props |
|---|---|---|
| `free_start` | engagement timer starts | `secs` (drawn from `randTimer()` or the bonus) |
| `bonus_time` | return visitor won the 25% timer bonus | — |
| `expired` | free timer hit 0 → degradation + paywall + **cooldown armed** | `w` (watching flag), **`cyc`** (0 = first wall, ≥1 = a bonus window just expired) |
| `reset` | cooldown countdown hit 0 → fresh streams + bonus granted | `cyc` (new cycle #), `bonus` (secs granted) |
| `scroll_preview_expire` | legacy 45s scroll counter (rarely fires with 5 tiles) | — |

### Paywall & conversion
| event | fires when | props |
|---|---|---|
| `paywall` | subscription modal shown | `trig` ∈ `expired` · `grid` · `grid_1x1` · `scroll_preview` · `resume` (restored from a live cooldown on reload), `copy` (`V.modal_copy`) |
| `subscribe` | "Keep My Access" clicked → CCBill | `price` |
| `dismiss` | paywall dismissed | — |
| `keep_watching_click` | free-account CTA tile | `grid` |
| `signup_tile_click` | signup tile | `type` free/paid |

### Auth & email
| event | fires when | props |
|---|---|---|
| `email_unlock` / `email_unlock_offline` | email submitted (audio/paywall gate) | `email_domain` |
| `magic_link_sent` / `magic_link_verified` | magic link flow | `email_domain` |
| `auth_modal_shown` | auth modal | `title` |
| `login_pw` / `set_password` / `logout` | password auth | — |

> **`subscribe` is INTENT, not revenue.** It fires on the click, before checkout. The truth of a paid conversion is the tier flip from `POST /webhooks/ccbill` (`NewSaleSuccess`). See *Gaps*.

## The canonical funnel
```
start → loaded → tile_click / interaction → free_start → expired(cyc=0) → paywall(trig=expired)
   ├─ subscribe ────────────────────────────────────────────────► CCBill → webhook tier=paid
   ├─ email_unlock → magic_link_verified (free account)
   └─ dismiss / leave → [cooldown 20m+] → reset(cyc=1) → free_start(60s) → expired(cyc=1) → paywall … (escalates)
```

## KPIs — the numbers that matter, and how to build them in PostHog
| KPI | definition | why |
|---|---|---|
| **Paywall conversion** | `subscribe` ÷ `paywall`, broken down by `trig` | The headline. `trig=expired` vs `trig=grid` tells you which wall sells. |
| **Grid-gate conversion** | funnel `grid_gate → subscribe` (same session) | Did making 4×4/6×6 paid-only produce money or just friction? |
| **Lockout return rate** | `reset` ÷ `expired` where `cyc=0` | Do people come back when the urge returns? **If low → shorten `cooldown_min`.** |
| **Bonus → convert** | funnel `reset → subscribe` | Does the taste sell? |
| **Bonus burn** | `expired` where `cyc ≥ 1` ÷ `reset` | People burning bonuses without buying. **If high → shorten `bonus_secs`.** |
| **Escalation depth** | distribution of `reset.cyc` | How many cycles before they pay or leave. Long tails = the escalation isn't biting. |
| **Time-to-wall** | distribution of `free_start.secs`; median `watch_time.secs` | Is 90–180s the right window? |
| **Email capture** | `email_unlock` ÷ `paywall` | The free-account lead funnel. |
| **Tier progression** | users `tier=anon → free → paid` (by `fp`, then identified) | Lifetime path. |
| **Affiliate click-through** | `cta` ÷ `tile_click` | Stripcash revenue side (once `AFF.id` is wired). |

**Always segment by `variant`.** That is the whole point of stamping `V.id`.

## A/B protocol
1. Change one `V` knob (e.g. `cooldown_min: 20 → 15`).
2. Bump `V.id` (`v1` → `v2`).
3. Ship. Compare the KPIs above filtered by `variant` in PostHog.
4. Record the result in PROJECT.md before changing the next knob.

## Gaps (known, honest)
- **No server-side revenue event.** `subscribe` = click. Add a PostHog capture in the CCBill webhook handler on `NewSaleSuccess` (`purchase`, `{amount, user_id}`) so real revenue is in the same tool as the funnel.
- `scroll_preview_expire` is near-dead with 5 tiles (nothing to scroll). Keep the event; don't build KPIs on it.
- Anon → identified stitching depends on `posthog.identify` at login. Anonymous conversions that never log in are only attributable via `fp`.
- `AFF.id` is still empty — `cta` measures clicks, not credited Stripcash revenue, until Stripcash approves.

## Change log
- 2026-09-06 — Canon established. `expired` gained `cyc` so bonus-window expiries are separable from first walls (`faeec1f` shipped the lockout loop; this commit makes it measurable).
