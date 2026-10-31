/* ===========================================================
   Relay — your own relay, on Cloudflare Workers
   -----------------------------------------------------------
   The free public relays are mostly gone: dead hosts, API keys,
   or an eight-second internal timeout that kills anything heavy.
   This is the fix. It is one file, it is free, and it takes about
   two minutes to put up.

     1. dash.cloudflare.com -> Workers & Pages -> Create -> Worker
     2. Name it, Deploy, then "Edit code"
     3. Paste this file over what's there, Deploy again
     4. Copy the address it gives you (…​.workers.dev)
     5. In Relay: Settings -> Relays -> Add a relay
          Name:     My Worker
          Type:     raw bytes
          Endpoint: https://YOUR-WORKER.workers.dev/?url=%URL%
          Percent-encode: on
        then put it at the top of the list.

   The free plan allows 100,000 requests a day, which is far more
   than one person browsing. Nothing is logged by this script.

   It also strips the two headers that stop a fetched page from
   rendering in a frame (content-security-policy, x-frame-options),
   which the public relays do not do — so pages look right more
   often through your own relay than through theirs.
   =========================================================== */

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

/* keep the worker from being pointed at private networks */
const BLOCKED_HOSTS = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|0\.0\.0\.0)/i;

const STRIP = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
  "report-to",
  "set-cookie"
];

function withCors(res) {
  const headers = new Headers(res.headers);
  STRIP.forEach((h) => headers.delete(h));
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-expose-headers", "*");
  headers.set("x-relay-status", String(res.status));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function plain(body, status) {
  return withCors(new Response(body, { status, headers: { "content-type": "text/plain" } }));
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
          "access-control-allow-headers": "*",
          "access-control-max-age": "86400"
        }
      }));
    }

    const here = new URL(request.url);

    /* accept ?url=https://… and the path form /https://… */
    let target = here.searchParams.get("url");
    if (!target && here.pathname.length > 1) {
      target = decodeURIComponent(here.pathname.slice(1)) + here.search;
    }
    if (!target) {
      return plain("Relay worker is up. Call it as ?url=https://example.com", 200);
    }

    let dest;
    try {
      dest = new URL(target);
    } catch (e) {
      return plain("That is not a valid address.", 400);
    }

    if (!/^https?:$/.test(dest.protocol)) return plain("Only http and https.", 400);
    if (BLOCKED_HOSTS.test(dest.hostname)) return plain("That host is not allowed.", 403);
    if (!ALLOWED_PORTS.has(dest.port)) return plain("That port is not allowed.", 403);

    /* look like a browser, or plenty of sites answer with a block page */
    const headers = new Headers({
      "user-agent": request.headers.get("user-agent") ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      "accept": request.headers.get("accept") || "text/html,application/xhtml+xml,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "referer": dest.origin + "/"
    });
    const range = request.headers.get("range");
    if (range) headers.set("range", range);

    try {
      const res = await fetch(dest.href, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers,
        redirect: "follow"
      });
      return withCors(res);
    } catch (err) {
      return plain("Could not reach that site: " + (err && err.message ? err.message : "failed"), 502);
    }
  }
};
