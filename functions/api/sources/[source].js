/**
 * /api/sources/[source]
 *
 * Lightweight metadata-only proxy for cam-network listing APIs whose CORS
 * blocks browser-side cross-origin reads. Only the (small, cacheable) JSON
 * model list flows through us — actual HLS video bytes still stream direct
 * from each network's CDN to the user's browser. So bandwidth on this box
 * stays effectively zero; we're just a CORS-bypass + header-fixup hop.
 *
 * Currently supports: bongacams
 * Cached at the edge for 30s — one fetch per source per 30s globally.
 */

const SOURCES = {
  bongacams: {
    upstream: 'https://en.bongacams.com/tools/listing_v3.php',
    // BongaCams' listing API only responds when called like a same-origin XHR.
    // From the Cloudflare edge with these headers it returns 200 JSON.
    upstreamHeaders: {
      'Accept':           'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin':           'https://en.bongacams.com',
      'Referer':          'https://en.bongacams.com/',
      'User-Agent':       'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    // Whitelist of query params we forward upstream — drop anything else
    allowedParams: ['livetab', 'offset', 'category'],
    defaults:      { livetab: 'female', offset: '0' },
    // Body is already JSON — pass through as-is
    transform: (text) => text,
  },
  cam4: {
    // Cam4 has no public listing JSON API. Their /female (etc.) page ships server-rendered
    // HTML containing an Apollo cache state with `BroadcastItem:N`:{...}` entries — one per
    // online model on the page (~60). Each entry includes username, viewers, country,
    // gender, showType, tags, profileImageURL, and crucially the live HLS URL in
    // `preview.src`. So one fetch + parse = ready-to-play tiles, no per-model second hop.
    upstreamHeaders: {
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    allowedParams: ['gender'],
    defaults:      { gender: 'female' },
    // Build the actual upstream URL based on the gender param (it's a path, not a query).
    upstreamFor:   (params) => {
      const g = (params.get('gender') || 'female').toLowerCase();
      const allowed = new Set(['female','male','trans','couple']);
      const path    = allowed.has(g) ? g : 'female';
      return `https://www.cam4.com/${path}`;
    },
    transform: (html) => {
      const models = [];
      // Apollo cache markers: "BroadcastItem:12345":{...}
      // Walk the HTML, pull each balanced object, decode escaped slashes, JSON.parse.
      const re = /"BroadcastItem:\d+":/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        let i = m.index + m[0].length;
        while (i < html.length && html[i] !== '{') i++;
        if (i >= html.length) continue;
        const start = i;
        let depth = 0, inStr = false;
        for (; i < html.length; i++) {
          const c = html[i];
          if (inStr) {
            if (c === '\\') { i++; continue; }
            if (c === '"')  { inStr = false; }
          } else {
            if      (c === '"') inStr = true;
            else if (c === '{') depth++;
            else if (c === '}') {
              depth--;
              if (depth === 0) {
                const raw = html.slice(start, i + 1)
                  .replace(/\\u002F/g, '/').replace(/\\u003D/g, '=');
                try {
                  const obj = JSON.parse(raw);
                  if (obj && obj.username) models.push(obj);
                } catch (e) { /* skip malformed */ }
                break;
              }
            }
          }
        }
      }
      return JSON.stringify({ models });
    },
  },
};

const ALLOWED_ORIGINS = ['https://mycamgirlz.com', 'https://www.mycamgirlz.com'];

export async function onRequest(context) {
  const { request, params } = context;
  const url    = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'GET') {
    return jsonError(405, 'method_not_allowed', origin);
  }

  const sourceKey = (params.source || '').toLowerCase();
  const cfg       = SOURCES[sourceKey];
  if (!cfg) return jsonError(404, 'unknown_source', origin);

  // Build upstream URL — either via the source's own upstreamFor() builder (path-based)
  // or by appending whitelisted query params to a fixed upstream URL.
  let upstreamUrl;
  if (typeof cfg.upstreamFor === 'function') {
    // Pass a copy of the params with allowedParams applied + defaults
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(cfg.defaults || {})) p.set(k, v);
    for (const k of cfg.allowedParams || []) {
      const v = url.searchParams.get(k);
      if (v != null) p.set(k, v);
    }
    upstreamUrl = cfg.upstreamFor(p);
  } else {
    const upstream = new URL(cfg.upstream);
    for (const [k, v] of Object.entries(cfg.defaults || {})) upstream.searchParams.set(k, v);
    for (const k of cfg.allowedParams || []) {
      const v = url.searchParams.get(k);
      if (v != null) upstream.searchParams.set(k, v);
    }
    upstreamUrl = upstream.toString();
  }

  let upstreamResp;
  try {
    upstreamResp = await fetch(upstreamUrl, {
      method:  'GET',
      headers: cfg.upstreamHeaders,
      // Edge cache for 30s — one fetch per (source, params) globally per 30s
      cf: { cacheTtl: 30, cacheEverything: true },
    });
  } catch (e) {
    return jsonError(502, 'upstream_unreachable', origin);
  }

  if (!upstreamResp.ok) {
    return jsonError(upstreamResp.status, `upstream_${upstreamResp.status}`, origin);
  }

  // Apply per-source transform — HTML→JSON for Cam4, identity for BongaCams.
  // Always return application/json; transform must yield a JSON string.
  let bodyText = await upstreamResp.text();
  try {
    bodyText = (cfg.transform || ((s) => s))(bodyText);
  } catch (e) {
    return jsonError(502, 'transform_failed', origin);
  }

  const headers = new Headers({
    'Content-Type':  'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=30',
    ...corsHeaders(origin),
  });
  return new Response(bodyText, { status: 200, headers });
}

function corsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) || /\.mycamgirlz\.pages\.dev$/.test(safeHost(origin));
  return {
    'Access-Control-Allow-Origin':  ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}

function safeHost(origin) {
  try { return new URL(origin).hostname; } catch { return ''; }
}

function jsonError(status, code, origin) {
  return new Response(
    JSON.stringify({ error: code }),
    { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
  );
}
