// ── GEO-BLOCK: States with active real-ID age verification laws ─────────────
// As of May 2026, 24 US states have enacted laws requiring identity-based
// age verification for adult content sites. A click-through age gate is
// insufficient in these jurisdictions.
//
// Strategy: block at edge, serve a legal/compliant page, zero cost.
// When real-ID provider integration is added (Yoti/Veriff/Persona),
// remove the block for that state and route through verification instead.
//
// Sources: Free Speech Coalition tracker, AVPA state law list, SCOTUS ruling
// Free Speech Coalition v. Paxton (June 2025).
//
// Last updated: 2026-05-28

const BLOCKED_STATES = new Set([
  'AL', // Alabama       - Oct 1, 2024
  'AR', // Arkansas      - Jul 31, 2023
  'AZ', // Arizona       - Sep 26, 2025
  'FL', // Florida       - Jan 1, 2025 (requires FL-issued ID via 3rd party)
  'GA', // Georgia       - Jul 1, 2025
  'ID', // Idaho         - Jul 1, 2024
  'IN', // Indiana       - Aug 16, 2024
  'KS', // Kansas        - Jul 1, 2024
  'KY', // Kentucky      - Jul 15, 2024
  'LA', // Louisiana     - Jan 1, 2023 (first state, $10K/day penalty)
  'MS', // Mississippi   - Jul 1, 2023
  'MT', // Montana       - Jan 1, 2024
  'NC', // North Carolina- Jan 1, 2024
  'ND', // North Dakota  - Aug 1, 2025
  'NE', // Nebraska      - Jul 18, 2024
  'OH', // Ohio          - Sep 30, 2025
  'OK', // Oklahoma      - Nov 1, 2024
  'SC', // South Carolina- Jan 1, 2025
  'SD', // South Dakota  - Jul 1, 2025
  'TN', // Tennessee     - Jan 1, 2025 (Class C felony for violations)
  'TX', // Texas         - Sep 19, 2023 ($10K/day + $250K if minor accesses)
  'UT', // Utah          - active
  'VA', // Virginia      - Jul 1, 2023
  'WY', // Wyoming       - Jul 1, 2025 (no content threshold — very broad)
]);

const BLOCKED_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not Available in Your Region — MyCamGirlz</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;background:#0a0612;color:#e8e0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:480px;width:100%;text-align:center;padding:48px 40px;background:#12091e;border:1px solid rgba(255,62,138,.15);border-radius:20px}
  .logo{font-size:24px;font-weight:900;background:linear-gradient(135deg,#ff3e8a,#7b2fff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:32px}
  .icon{font-size:48px;margin-bottom:20px}
  h1{font-size:20px;font-weight:800;margin-bottom:14px;color:#fff}
  p{font-size:14px;color:#9e8fb0;line-height:1.7;margin-bottom:12px}
  .legal{font-size:11px;color:#5a4d6a;margin-top:24px;line-height:1.6}
  a{color:#9e8fb0}
</style>
</head>
<body>
<div class="card">
  <div class="logo">MyCamGirlz</div>
  <div class="icon">🔒</div>
  <h1>Not Available in Your State</h1>
  <p>MyCamGirlz is not currently available in your state due to local laws governing access to adult content.</p>
  <p>Your state requires identity-based age verification that we do not yet support. We are working to add compliant access for your region.</p>
  <div class="legal">
    This site contains adult content intended for users 18 years of age or older.<br>
    &copy; 2026 MyCamGirlz &mdash; <a href="mailto:support@mycamgirlz.com">support@mycamgirlz.com</a>
  </div>
</div>
</body>
</html>`;

export async function onRequest(context) {
  const { request, next } = context;

  // Only apply geo-block to page requests (not API calls — those handle auth separately)
  // Also skip for Cloudflare's own health checks
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    return next();
  }

  const cf = request.cf || {};
  const country = cf.country || '';
  const regionCode = cf.regionCode || '';

  if (country === 'US' && BLOCKED_STATES.has(regionCode)) {
    return new Response(BLOCKED_HTML, {
      status: 451, // 451 Unavailable For Legal Reasons — correct HTTP status for this
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'no-store',
        'X-Block-Reason': 'state-av-law',
      },
    });
  }

  return next();
}
