# MyCamGirlz — Rules & Session Protocol

---

## Session Start (every chat)

1. Read `PROJECT.md` from repo — confirms current state
2. `git log --oneline -3` — confirms what's deployed
3. `curl -s https://mycamgirlz.com | head -5` — confirm live site is current
4. `curl -s http://127.0.0.1:8767/health` on AWS — confirm auth API is up
5. Check `KNOWN ISSUES` section of PROJECT.md before touching anything

---

## Code Rules — NEVER BREAK

### The absolute rules
1. **Single file** — everything stays in `index.html`. No separate .css or .js files ever.
2. **No build step** — no npm, no webpack, no vite, no framework. Vanilla JS + CDN only.
3. **No Base64** — anywhere, ever, for any reason.
4. **Never commit secrets** — repo is public. No API keys, tokens, passwords, or JWTs in any file.
5. **`body` height = `100vh`** — removing breaks tile aspect-ratio. Do not touch.
6. **`#app` height = `calc(100vh - 54px - 40px - 36px)`** — header + catbar + footer. Do not touch.
7. **`strictManifestParsing: false`** — required in every HLS instance. Stripchat uses non-standard EXT-X-MOUFLON tag. Removing breaks all streams.
8. **`destroyAll()` before every grid re-render** — prevents HLS memory leaks and zombie instances.
9. **Gender filter double-enforced** — API `gender` param is unreliable. Always also `.filter(m => m.gender === f.gender)` client-side.
10. **Single audio source** — when any tile unmutes, ALL other tiles must mute immediately.

### Age gate rule
The age gate (`#agegate`) is a **visual overlay only**. `load()` fires at page init regardless of gate state. The button click just hides the div. Do not gate `load()` or any other JS behind the age gate.

### Variant config rule
`const V` controls all A/B test parameters. Run **one variant at a time, site-wide**. Never split users in parallel — breaks the user experience. Change `V.id` when starting a new cohort so analytics can distinguish.

---

## File Editing Rules

### For index.html (local edits via Claude container)
```python
# ALWAYS read before editing
content = open('/home/claude/index.html', 'r', encoding='utf-8').read()

# ALWAYS write back correctly
open('/home/claude/index.html', 'w', encoding='utf-8', newline='').write(content)
```

### For AWS files
**Always use Python heredocs** — never shell echo or cat with strings that contain JS/quotes:
```bash
cat << 'PYEOF' > /tmp/script.py
# python script here
PYEOF
python3 /tmp/script.py
```

### NEVER use PowerShell for JS
PowerShell `Out-File` and `Set-Content` inject BOM (bytes 0xEF 0xBB 0xBF) that silently breaks `var`/`const`/`let` declarations at runtime. All JS must be written via Python or direct file operations.

### Syntax check before every push
```bash
# For Python files
python3 -c "import ast; ast.parse(open('file.py').read()); print('OK')"

# For JS (node available)
node --check file.js
```

---

## Git Protocol

### Standard push (from Claude container)
```bash
TOKEN="ghp_..."  # ask Ken for current token
cd /home/claude
git add index.html functions/api/[[path]].js
git commit -m "concise description of change"
git push origin main
```

### Never force push to main without confirming
Force push rewrites history. Only acceptable to remove accidentally committed secrets (use `--amend` + force push in that case only).

### Rollback pattern
```bash
git checkout <good-commit-hash> -- index.html
git add index.html
git commit -m "revert: <reason>"
git push origin main
```
Never use `git revert` on single-file projects — creates confusing merge commits.

### Commit message format
- `Fix: <what broke and how fixed>`
- `Add: <new feature>`
- `Update: <what changed>`
- `Config: <config change>`
Never commit with generic messages like "update" or "fix bug".

---

## AWS Operations

### Connect
```
host: 98.95.155.84
user: ubuntu
key:  C:/Users/kb/.ssh/id_rsa
```

### Auth API service
```bash
sudo systemctl status mcg-auth --no-pager
sudo systemctl restart mcg-auth
sudo journalctl -u mcg-auth -n 50 --no-pager
```

### Environment file
```bash
cat /home/ubuntu/projects/mycamgirlz/.env
# Edit:
nano /home/ubuntu/projects/mycamgirlz/.env
sudo systemctl restart mcg-auth  # always restart after .env change
```

### Port safety
```
8765 — mcp-distributed.service — DO NOT TOUCH, DO NOT KILL, DO NOT REASSIGN
8766 — livegrid-api.service    — separate project, do not disturb
8767 — mcg-auth.service        — this project only
```

---

## Deployment Verification

After every push, verify:
```bash
# 1. Check Cloudflare deployment (wait ~60s)
curl -s -o /dev/null -w "%{http_code}" https://mycamgirlz.com
# Expected: 200

# 2. Check Pages Function routing
curl -s https://mycamgirlz.com/api/auth/me
# Expected: {"detail":"Not authenticated"} (JSON, not HTML)

# 3. Check auth API directly
curl -s http://127.0.0.1:8767/health
# Expected: {"ok":true}
```

If `/api/auth/me` returns HTML instead of JSON: Pages Function is not routing. Check that `functions/api/[[path]].js` exists in the repo (not `auth.js`).

---

## Security Rules

### Never expose
- JWT_SECRET
- RESEND_API_KEY  
- GitHub personal access token
- AWS SSH private key
- CCBill credentials (when obtained)
- Stripcash affiliate ID (not a secret but don't hardcode in public commits carelessly)

### Always enforce
- HTTPS only (Cloudflare handles)
- HttpOnly + Secure + SameSite=Strict on session cookie
- No stack traces in API error responses
- Rate limiting on all auth endpoints
- Input validation before any DB write

### Cloudflare WAF (free tier)
- Managed Rules → OWASP: ENABLED
- Bot Fight Mode: OFF (interferes with HLS stream fetches)
- Block AI Bots: ON

---

## What Requires Business Setup Before Building

| Feature | Requires |
|---|---|
| Subscription payments | Wyoming LLC + EIN + Mercury + CCBill approval |
| Email sending (magic links) | Resend.com signup + DNS records |
| Revenue attribution | Stripcash signup + affiliate ID |
| Admin auth gate | Cloudflare Access (free, just needs setup) |
| Named CF tunnel | Custom domain on tunnel (mycamgirlz.com already registered) |
| TrafficJunky/ExoClick ads | Live site + sufficient traffic |

---

## Project File Locations

```
GitHub (source of truth):
  CheersToDogs/MyCamGirlz/
  ├── index.html                    ← entire frontend
  ├── functions/api/[[path]].js     ← CF Pages Function proxy
  └── PROJECT.md                    ← master state doc

Claude container (working copy):
  /home/claude/
  ├── index.html                    ← edit here, push to GitHub
  ├── functions/api/[[path]].js
  ├── PROJECT.md
  ├── ARCH.md                       ← this project's arch doc
  └── RULES.md                      ← this file

AWS (backend):
  /home/ubuntu/projects/mycamgirlz/
  ├── auth_api.py                   ← FastAPI auth server
  ├── auth.db                       ← SQLite database
  └── .env                          ← secrets (NOT in git)
```

---

## Context Rotation Protocol

**Every ~5 tool calls:** save session state to hash.
**At rotation prep:** call `hash_store_content_v2` with full session state BEFORE saying anything else.
**At session end:** update PROJECT.md on AWS and in repo with any new decisions/features/bugs.

**Hash project name:** `mycamgirlz` (not `livegrid` — separate project)

---

## New Project Space Setup

This project lives in its own Claude project space. The project instructions should contain:
- Repo URL and live URL
- Session start protocol (read PROJECT.md, check git log, verify live)
- Pointer to ARCH.md and RULES.md in the repo
- One-line reminder: single file, no build, no framework, no Base64

The three key docs are:
1. `PROJECT.md` — current state, what's built, what's pending, bugs
2. `ARCH.md` — how everything works technically
3. `RULES.md` — this file — how to work on it safely

---

## Background Context (for new chat sessions)

**What MyCamGirlz is:**
Multi-stream live cam grid viewer. Users watch multiple Stripchat models simultaneously. Monetized via Stripcash affiliate revshare (20% lifetime) + $9.99/mo subscriptions. CamSoda-inspired UI. No competitors in this exact space — ModelTrackr (Chaturbate only, tracker-focused) is closest but different.

**Why it works:**
Stripchat public API returns HLS stream URLs with no auth. Streams are intentionally public — Stripchat's model is freemium, affiliate-driven traffic benefits them. Stripcash explicitly supports building cam sites on their API. MyCamGirlz surfaces 4-36 streams simultaneously — a discovery experience their own UI doesn't offer.

**Revenue logic:**
Free users discover models → get hooked → click through via affiliate link (resets 30-day cookie) → register on Stripchat → buy tokens → you earn 20% of every dollar they ever spend. "Favorite is live" notification emails re-click the affiliate link → resets cookie each time → maximizes lookback window monetization.

**Business status:**
Wyoming LLC not yet formed. CCBill application not yet submitted. Stripcash account not yet created. All three needed before real revenue flows. Domain mycamgirlz.com registered 2026-04-08 on Cloudflare.

**Tech stack summary:**
Frontend: single HTML file, vanilla JS, hls.js CDN, Cloudflare Pages.
Backend: FastAPI on AWS port 8767, SQLite, magic link auth, PyJWT, Resend (pending).
Infra: Cloudflare (CDN, Pages, DNS, WAF), AWS EC2 (auth API only).
No React, no Node, no databases beyond SQLite, no paid services beyond AWS.
