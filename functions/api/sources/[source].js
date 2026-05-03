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

  // Build upstream URL with whitelisted params (+ defaults)
  const upstream = new URL(cfg.upstream);
  for (const [k, v] of Object.entries(cfg.defaults || {})) upstream.searchParams.set(k, v);
  for (const k of cfg.allowedParams || []) {
    const v = url.searchParams.get(k);
    if (v != null) upstream.searchParams.set(k, v);
  }

  let upstreamResp;
  try {
    upstreamResp = await fetch(upstream.toString(), {
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

  // Pass through the JSON body, replace headers with our CORS + cache hints
  const body    = await upstreamResp.arrayBuffer();
  const headers = new Headers({
    'Content-Type':  'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=30',
    ...corsHeaders(origin),
  });
  return new Response(body, { status: 200, headers });
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
