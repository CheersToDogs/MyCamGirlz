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
```bash
python3 -c "import ast; ast.parse(open('auth_api.py').read()); print('OK')"
```

---

## Git Protocol

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
