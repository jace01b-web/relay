/* ===========================================================
   Relay — proxy backend on Cloudflare Workers
   -----------------------------------------------------------
   This is what makes proxy mode work on a site with no server:
   a Bare v3 endpoint, which is what Ultraviolet talks to when it
   needs a page fetched. Deploying it is clicks, not commands.

     1. dash.cloudflare.com -> Workers & Pages -> Create -> Worker
     2. Name it (say "relay-bare"), Deploy, then "Edit code"
     3. Select all, paste this file over it, Deploy
     4. Copy the address: https://relay-bare.<you>.workers.dev
     5. In Relay: Settings -> Connection
          Transport:    bare
          Bare server:  https://relay-bare.<you>.workers.dev/bare/
        (keep the /bare/ on the end)

   Free plan: 100,000 requests a day. A page is roughly 20-60 of
   them, so that is a few thousand pages.

   What it cannot do: WebSockets. Sites that stream over a socket
   (chat, live video, cloud gaming) need the Wisp transport and a
   Node host — server/ in this repo. Ordinary sites don't care.

   It is a plain web-standard handler, so the same file also runs
   under Deno Deploy, Bun, and Node 18+ (worker/run-local.mjs).
   =========================================================== */

const MAX_HEADER_VALUE = 3072;   /* headers above this get split */

/* Addresses a public proxy should not be pointed at. */
const BLOCKED = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^\[?::1\]?$/i, /\.local$/i,
  /^metadata\./i, /^169\.254\.169\.254$/
];

function cors(headers) {
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "*");
  headers.set("access-control-allow-headers", "*");
  headers.set("access-control-expose-headers", "*");
  headers.set("access-control-max-age", "7200");
  return headers;
}

function fail(code, id, message, status) {
  const h = cors(new Headers({ "content-type": "application/json" }));
  return new Response(JSON.stringify({ code, id, message }), { status: status || 400, headers: h });
}

/* The client splits a long header into x-bare-headers-0, -1, … */
function joinSplitHeader(headers, name) {
  const whole = headers.get(name);
  if (whole !== null) return whole;

  let out = "";
  for (let i = 0; ; i++) {
    const part = headers.get(`${name}-${i}`);
    if (part === null) break;
    out += part;
  }
  return out || null;
}

/* …and expects the same back when our side is long. */
function setSplitHeader(headers, name, value) {
  if (value.length <= MAX_HEADER_VALUE) {
    headers.set(name, value);
    return [name];
  }
  const names = [];
  for (let i = 0, part = 0; i < value.length; i += MAX_HEADER_VALUE, part++) {
    const key = `${name}-${part}`;
    headers.set(key, value.slice(i, i + MAX_HEADER_VALUE));
    names.push(key);
  }
  return names;
}

function splitList(value) {
  if (!value) return [];
  return value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function handle(request, env) {
  const url = new URL(request.url);
  const allowPrivate = env && env.ALLOW_PRIVATE === "1";   /* local testing only */

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(new Headers()) });
  }

  /* anything that is not the bare endpoint gets a friendly note */
  if (!/\/bare\/?/.test(url.pathname)) {
    return new Response(
      "Relay bare server is up.\n\nPut this in Relay:\n  Settings -> Connection -> Transport: bare\n  Bare server: " +
      url.origin + "/bare/\n",
      { status: 200, headers: cors(new Headers({ "content-type": "text/plain" })) }
    );
  }

  /* the version handshake Ultraviolet's client does first */
  if (/\/bare\/?$/.test(url.pathname)) {
    return new Response(JSON.stringify({
      versions: ["v3"],
      language: "JS",
      maintainer: { email: "", website: "" },
      project: { name: "relay-bare-worker", version: "1.0.0" }
    }), { status: 200, headers: cors(new Headers({ "content-type": "application/json" })) });
  }

  if (!/\/bare\/v3\/?$/.test(url.pathname)) {
    return fail("UNKNOWN", "error.path", "Only v3 is implemented.", 404);
  }

  /* ---- what the client is asking for ---- */

  const targetRaw = joinSplitHeader(request.headers, "x-bare-url");
  if (!targetRaw) return fail("MISSING_BARE_HEADER", "request.headers.x-bare-url", "Header missing.");

  let target;
  try { target = new URL(targetRaw); }
  catch (e) { return fail("INVALID_BARE_HEADER", "request.headers.x-bare-url", "Not a valid address."); }

  if (!/^https?:$/.test(target.protocol)) {
    return fail("INVALID_BARE_HEADER", "request.headers.x-bare-url", "Only http and https.");
  }
  if (!allowPrivate && BLOCKED.some(rx => rx.test(target.hostname))) {
    return fail("FORBIDDEN", "request.headers.x-bare-url", "That address is not allowed.", 403);
  }

  let sendHeaders = {};
  const rawHeaders = joinSplitHeader(request.headers, "x-bare-headers");
  if (rawHeaders) {
    try { sendHeaders = JSON.parse(rawHeaders); }
    catch (e) { return fail("INVALID_BARE_HEADER", "request.headers.x-bare-headers", "Not valid JSON."); }
  }

  const outgoing = new Headers();
  for (const key of Object.keys(sendHeaders)) {
    const value = sendHeaders[key];
    if (Array.isArray(value)) value.forEach(v => outgoing.append(key, v));
    else if (value != null) outgoing.set(key, String(value));
  }

  /* headers the client wants copied from the real request */
  for (const name of splitList(request.headers.get("x-bare-forward-headers"))) {
    const value = request.headers.get(name);
    if (value !== null) outgoing.set(name, value);
  }

  /* a browser-ish identity, or plenty of sites answer with a block page */
  if (!outgoing.has("user-agent")) {
    outgoing.set("user-agent", request.headers.get("user-agent") ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36");
  }
  outgoing.delete("host");
  outgoing.delete("connection");
  outgoing.delete("content-length");

  /* ---- go and get it ---- */

  let upstream;
  try {
    upstream = await fetch(target.href, {
      method: request.method,
      headers: outgoing,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual"
    });
  } catch (err) {
    return fail("UNKNOWN", "error.fetch", "Could not reach " + target.hostname + ": " +
      (err && err.message ? err.message : "failed"), 500);
  }

  /* ---- hand it back the way the client expects ---- */

  const responseHeaders = {};
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "content-encoding" || k === "content-length" || k === "transfer-encoding") return;
    if (responseHeaders[k] === undefined) responseHeaders[k] = value;
    else if (Array.isArray(responseHeaders[k])) responseHeaders[k].push(value);
    else responseHeaders[k] = [responseHeaders[k], value];
  });

  const out = cors(new Headers());
  const added = setSplitHeader(out, "x-bare-headers", JSON.stringify(responseHeaders));
  out.set("x-bare-status", String(upstream.status));
  out.set("x-bare-status-text", upstream.statusText || "");
  out.set("content-type", "application/octet-stream");
  out.set("access-control-expose-headers",
    ["x-bare-status", "x-bare-status-text"].concat(added).join(", ") + ", *");

  /* statuses and headers the client asked to see directly */
  for (const name of splitList(request.headers.get("x-bare-pass-headers"))) {
    const value = upstream.headers.get(name);
    if (value !== null) out.set(name, value);
  }
  const passStatus = splitList(request.headers.get("x-bare-pass-status")).map(Number);
  const status = passStatus.includes(upstream.status) ? upstream.status : 200;

  return new Response(upstream.body, { status, headers: out });
}

export default { fetch: handle };
export { handle };
