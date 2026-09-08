// Cloudflare Pages Function — /ingest/*  (PostHog reverse proxy)
// Serves PostHog first-party to recover events dropped by ad/tracker blockers.
// Routing per PostHog self-hosted proxy reference:
//   /static/*  and  /array/*  -> us-assets.i.posthog.com  (SDK + remote config)
//   everything else            -> us.i.posthog.com         (capture, flags, decide)
// index.html sets posthog api_host to https://mycamgirlz.com/ingest

const API_HOST   = 'us.i.posthog.com';
const ASSET_HOST = 'us-assets.i.posthog.com';

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);

  // params.path = path segments after /ingest/
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');

  const useAsset = path.startsWith('static/') || path.startsWith('array/');
  const upstream = 'https://' + (useAsset ? ASSET_HOST : API_HOST) + '/' + path + url.search;

  // Fresh headers — fetch() derives the Host header from the upstream URL,
  // which PostHog requires (wrong Host -> 401).
  const headers = new Headers();
  for (const h of ['Content-Type', 'Accept', 'Accept-Encoding']) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.set('X-Forwarded-For', ip);

  const resp = await fetch(upstream, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
  });

  // Re-wrap so we can force permissive CORS (matches PostHog proxy examples).
  const out = new Response(resp.body, resp);
  out.headers.set('Access-Control-Allow-Origin', '*');
  return out;
}
