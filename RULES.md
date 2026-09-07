# MyCamGirlz — Rules & Session Protocol
**Last Updated:** 2026-05-29

---

## Session Start (every chat)

1. Read `PROJECT.md` from repo — confirms current state
2. `git log --oneline -3` — confirms what's deployed
3. `curl -s https://mycamgirlz.com/api/auth/me` — must return JSON not HTML
4. `curl -s http://127.0.0.1:8880/health` on AWS — must return `{"ok":true}`

---

## Code Rules — NEVER BREAK

1. **Single file** — everything in `index.html`. No separate .css/.js files.
2. **No build step** — no npm, no webpack. Vanilla JS + CDN only.
3. **No Base64** — anywhere, ever.
4. **Never commit secrets** — repo is public.
5. **`body` height = `100vh`** — removing breaks tile aspect-ratio.
6. **`strictManifestParsing: false`** — on every HLS instance. Stripchat EXT-X-MOUFLON tag.
7. **`destroyAll()` before every grid re-render** — prevents HLS memory leaks.
8. **Gender filter double-enforced** — API param + client-side `.filter()`.
9. **Single audio source** — unmute one → mute all others.
10. **Age gate is visual overlay only** — `load()` fires at init regardless.

---

## File Editing Rules

### index.html (Claude container)
```python
with open('index.html', encoding='utf-8', newline='') as f:
    c = f.read()
# ... edits ...
with open('index.html', 'w', encoding='utf-8', newline='') as f:
    f.write(c)
```

### AWS files — always use Python heredocs
```bash
cat << 'PYEOF' > /tmp/script.py
# python script here
PYEOF
python3 /tmp/script.py
```
**Never PowerShell** — injects BOM that silently breaks JS.

### Syntax check before every push

**Backend (`auth_api.py`):**
```bash
python3 -c "import ast; ast.parse(open('auth_api.py').read()); print('OK')"
```

**Frontend (`index.html`) — browser-accurate, MANDATORY.** Extract every inline `<script>` and compile each as a *classic script* (the same parser mode a `<script>` tag uses):
```bash
python3 - << 'PY'
import re
html=open('index.html',encoding='utf-8').read()
for i,b in enumerate(re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>',html,re.S)):
    open(f'/tmp/blk{i}.js','w',encoding='utf-8').write(b)
PY
for f in /tmp/blk*.js; do
  node -e "new (require('vm').Script)(require('fs').readFileSync('$f','utf8'))" && echo "$f OK" || { echo "$f PARSE FAIL"; exit 1; }
done
```
**Why `vm.Script` and NOT `node --check`:** `node --check` parses leniently and PASSED a top-level `await` that the browser rejected as a SyntaxError — the entire script died and the grid went blank (fixed in `ddbf4f3`). `vm.Script` compiles as a classic script and throws on exactly what a `<script>` tag would. Never trust `node --check` alone for inline browser JS. (`node --check` also returns a false OK because Node tolerates top-level await that classic scripts forbid.)

**Ground truth = a real browser.** For "it deploys but renders wrong," run the Playwright diagnostic from a residential box (`C:\Users\kb\bf_scraper\diag_mcg.py`): it reports tile count, computed grid columns, `pageerror`s, and console output. Static checks cannot see runtime state.

---

## Git Protocol

**Working push path:** Ken's Windows repo `C:\Users\kb\Projects\MyCamGirlz` — `git add index.html && git commit -m "..." && git push`. Credential Manager supplies auth; **no token needed**. (This is how `ddbf4f3` shipped.) The token method below is the alternate for container-side pushes only.

```bash
TOKEN="ghp_..."  # ask Ken for current token — do not store in repo
cd /home/claude/MyCamGirlz
git add index.html functions/
git commit -m "Fix: what broke and how / Add: feature / Update: what changed"
git push https://${TOKEN}@github.com/CheersToDogs/MyCamGirlz.git main
git remote set-url origin https://github.com/CheersToDogs/MyCamGirlz.git  # scrub token
```

After push, wait ~60s for Cloudflare Pages deploy.

**Rollback:**
```bash
git checkout <good-commit> -- index.html
git commit -m "Revert: reason"
git push ...
```

---

## AWS Operations

```
host: 98.95.155.84
user: ubuntu
```

```bash
sudo systemctl status mcg-auth --no-pager
sudo systemctl restart mcg-auth
sudo journalctl -u mcg-auth -n 50 --no-pager
```

**Port map:**
```
8880 — mcg-auth (THIS PROJECT) ← use this
8080 — other project api.app   ← do not disturb
8766 — livegrid-api            ← do not disturb
```

---

## Deployment Verification

```bash
curl -s https://mycamgirlz.com/api/auth/me
# Must return: {"detail":"Not authenticated"}  (JSON, not HTML, not error code 1003)

curl -s http://127.0.0.1:8880/health
# Must return: {"ok":true}
```

If `/api/auth/me` returns 1003: Pages Function is hitting a Cloudflare loop-detection block.
Fix: ensure Pages Function uses `https://auth.mycamgirlz.com` not a raw IP.

---

## Security Rules

**Never expose:** JWT_SECRET, GitHub PAT, AWS SSH key, CCBill credentials, config.py contents.

**Cookie:** HttpOnly + Secure + SameSite=Lax + domain=mycamgirlz.com + 30-day max-age.

**CF WAF:** OWASP managed rules ON. Bot Fight Mode OFF (breaks HLS fetches).

---

## Session Protocol

- Hash save every 5 tool calls
- Rotation prep at tool call ~40: call `hash_store_content_v2` FIRST before anything else
- Save session context at end of session
- Check for previous hash context at start of session

---

## One-Line Wires (do these when approvals come through)

```js
// Stripcash approval → wire AFF.id:
const AFF = {id:'YOUR_STRIPCASH_ID', campaign:'mycamgirlz'};

// CCBill approval → swap CCBILL_URL constant:
const CCBILL_URL = 'https://billing.ccbill.com/jpost/signup.cgi?clientSubacc=...';
```

---

## Analytics Canon (ANALYTICS.md)

- **ANALYTICS.md is the single source of truth** for every tracked event, its properties, and the KPIs built on them.
- Any new `A.track()` call **must** be added to ANALYTICS.md **in the same commit**. No undocumented events.
- **Never rename an existing event** — it severs PostHog history. Deprecate and add a new one instead.
- Property keys stay short and stable (`u`, `n`, `trig`, `cyc`, `secs`). Use `A.track()` only — it stamps `variant`, `fp`, `tier`, `rv` on every event, which the KPIs depend on.
- Changing a `V` knob for an A/B test → bump `V.id` so the variant is separable in PostHog.
