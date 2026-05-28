/**
 * Cloudflare Pages Function — /api/auth/*
 * Proxies auth requests to AWS:8767
 * Keeps AWS endpoint private — never exposed to client
 * Adds CORS, strips internal headers
 */

const UPSTREAM = 'http://98.95.155.84:8880';
const ALLOWED  = ['https://mycamgirlz.com', 'https://www.mycamgirlz.com'];

export async function onRequest(context) {
  const { request, env } = context;
  const url    = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  // Debug: confirm function is running
  if (url.pathname === '/api/_ping') {
    return new Response(JSON.stringify({pong:true, ts:Date.now()}), {
      headers: {'Content-Type':'application/json'}
    });
  }

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  // Block non-allowed origins in production
  if (origin && !ALLOWED.includes(origin) && !url.hostname.endsWith('pages.dev')) {
    return new Response('Forbidden', { status: 403 });
  }

  // Build upstream URL — strip /api prefix, keep rest of path + query
  // For catch-all [[path]], context.params.path has segments after /api/
  const pathStr = Array.isArray(context.params.path) ? context.params.path.join('/') : (context.params.path || '');
  const upstreamPath = '/' + pathStr + url.search;
  const upstreamUrl  = UPSTREAM + upstreamPath;

  // Forward request
  const upstreamReq = new Request(upstreamUrl, {
    method:  request.method,
    headers: forwardHeaders(request, origin),
    body:    ['GET','HEAD'].includes(request.method) ? undefined : request.body,
  });

  let resp;
  try {
    resp = await fetch(upstreamReq);
  } catch (e) {
    return new Response(JSON.stringify({ detail: 'Auth service unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  // Return response with CORS headers added
  const body    = await resp.arrayBuffer();
  const headers = new Headers(resp.headers);
  Object.entries(corsHeaders(origin)).forEach(([k,v]) => headers.set(k,v));

  // Security: remove any internal headers
  headers.delete('X-Powered-By');
  headers.delete('Server');

  return new Response(body, { status: resp.status, headers });
}

function forwardHeaders(request, origin) {
  const h = new Headers();
  // Forward content-type and cookies
  const ct = request.headers.get('Content-Type');
  if (ct) h.set('Content-Type', ct);
  const cookie = request.headers.get('Cookie');
  if (cookie) h.set('Cookie', cookie);
  // Pass real IP to upstream for rate limiting
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) h.set('CF-Connecting-IP', cfIp);
  h.set('X-Forwarded-Proto', 'https');
  return h;
}

function corsHeaders(origin) {
  const allowedOrigin = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin':      allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods':     'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type',
    'Access-Control-Max-Age':           '86400',
  };
}
