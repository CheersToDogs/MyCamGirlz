/**
 * Cloudflare Pages Function — /api/*
 * Proxies auth requests to auth.mycamgirlz.com (EC2 via HTTPS, DNS-only)
 * Direct IP fetch blocked by CF loop detection — subdomain bypasses it
 */

const UPSTREAM = 'https://auth.mycamgirlz.com';
const ALLOWED  = ['https://mycamgirlz.com', 'https://www.mycamgirlz.com'];

export async function onRequest(context) {
  const { request } = context;
  const url    = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (origin && !ALLOWED.includes(origin) && !url.hostname.endsWith('pages.dev')) {
    return new Response('Forbidden', { status: 403 });
  }

  const pathStr     = Array.isArray(context.params.path) ? context.params.path.join('/') : (context.params.path || '');
  const upstreamUrl = UPSTREAM + '/' + pathStr + url.search;

  const upstreamReq = new Request(upstreamUrl, {
    method:  request.method,
    headers: forwardHeaders(request),
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

  const body    = await resp.arrayBuffer();
  const headers = new Headers(resp.headers);
  Object.entries(corsHeaders(origin)).forEach(([k,v]) => headers.set(k,v));
  headers.delete('X-Powered-By');
  headers.delete('Server');

  return new Response(body, { status: resp.status, headers });
}

function forwardHeaders(request) {
  const h = new Headers();
  const ct = request.headers.get('Content-Type');
  if (ct) h.set('Content-Type', ct);
  const cookie = request.headers.get('Cookie');
  if (cookie) h.set('Cookie', cookie);
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
