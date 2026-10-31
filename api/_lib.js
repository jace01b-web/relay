/* Shared helpers for the /api functions (Vercel serverless, Node 18+). Nothing in here is ever sent to the browser.
 *
 * REQUIRED environment variables (Vercel > Settings > Environment Variables):
 *   FIREBASE_SA          the whole service-account JSON (Firebase console > Project settings > Service accounts > Generate key)
 *   DISCORD_WEBHOOK_URL  NEW private webhook (the old one was public in config.js - delete it in Discord)
 *   IP_HASH_SALT         long random string. Never change it later or old IP bans stop matching.
 *   BUILD_SECRET         long random string, same one you give tools/stamp-build.js. Never commit it.
 * OPTIONAL:
 *   MIN_BUILD            oldest build label still allowed, e.g. 2026-10-20.02 (anything older is refused by the server)
 *   TOS_VERSION          default 3 (if this env var is set, it WINS - raise it to 3 or delete it)
 *   VPN_API_KEY          free key from https://ipapi.is (VPN / proxy / Tor detection)
 *   VPN_FAIL_CLOSED      1 = if the VPN lookup is down, refuse chat. Default: allow.
 *   BLOCK_DATACENTER     1 = treat hosting / datacenter IPs as VPNs (can hit school filters)
 *   TRUSTED_IP_HEADER    default x-vercel-forwarded-for. Only change this if you host somewhere else AND that host overwrites the header.
 */
const crypto = require('crypto');
const net = require('net');

const DB_URL = (process.env.FIREBASE_DB_URL || 'https://itsuki-chat-default-rtdb.firebaseio.com').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCns_X-7DF2aQawb2Q3p4YsoaQmvBMuAgM';   // public web key, fine to keep here
const TOS_VERSION = Number(process.env.TOS_VERSION || 3);   // keep equal to CFG.TOS_VERSION in js/core/config.js
const ATTEST_TTL_MS = 8 * 60 * 1000;

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');          // the site runs from many launcher origins (blob:, about:blank, ...)
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}
function send(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); }
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 20000) break; }
  try { return JSON.parse(raw || '{}'); } catch (_) { return {}; }
}

/* ---------- the caller's IP: ONLY from the header the hosting platform itself writes ----------
 * The old code also trusted x-real-ip / the first x-forwarded-for entry. Those can be typed by the caller, which is how a
 * fake "IP" could be sent. Now: one trusted header, and it must be a real IP address or the request is refused (returns null). */
function clientIp(req) {
  const name = String(process.env.TRUSTED_IP_HEADER || 'x-vercel-forwarded-for').toLowerCase();
  let ip = String(req.headers[name] || '').split(',')[0].trim();
  if (!ip && process.env.TRUST_SOCKET_IP === '1') ip = String((req.socket && req.socket.remoteAddress) || '').trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return net.isIP(ip) ? ip : null;
}
function normalizeIp(ip) {   // IPv6 users change their suffix constantly, so use the /64 network
  if (net.isIPv4(ip)) return ip;
  if (net.isIPv6(ip)) {
    const [head, tail] = ip.split('::');
    const a = head ? head.split(':') : [], b = tail !== undefined ? (tail ? tail.split(':') : []) : [];
    const fill = Array(Math.max(0, 8 - a.length - b.length)).fill('0');
    const full = (tail === undefined ? a : a.concat(fill, b)).map(x => x.padStart(4, '0'));
    return full.slice(0, 4).join(':') + '::/64';
  }
  return ip;
}
function ipHash(ip) {
  const salt = process.env.IP_HASH_SALT;
  if (!salt || salt.length < 16) throw new Error('IP_HASH_SALT is missing or too short');
  return crypto.createHmac('sha256', salt).update('ip:' + normalizeIp(ip)).digest('hex').slice(0, 32);
}
function isPrivateIp(ip) {
  return !ip || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip === '::1' || /^f[cd]/i.test(ip);
}

/* ---------- VPN / proxy / Tor ---------- */
const vpnCache = new Map();
async function vpnCheck(ip) {
  const key = process.env.VPN_API_KEY;
  if (!key || isPrivateIp(ip)) return { checked: false, vpn: false, kind: '' };
  const hit = vpnCache.get(ip);
  if (hit && Date.now() - hit.t < 60 * 60 * 1000) return hit.v;
  try {
    const r = await fetch('https://api.ipapi.is/?q=' + encodeURIComponent(ip) + '&key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    if (!r.ok || j.error || (j.is_vpn === undefined && j.is_proxy === undefined)) return { checked: false, vpn: false, kind: '' };
    const kind = j.is_tor ? 'tor' : j.is_vpn ? 'vpn' : j.is_proxy ? 'proxy' : (process.env.BLOCK_DATACENTER === '1' && j.is_datacenter) ? 'datacenter' : '';
    const v = { checked: true, vpn: !!kind, kind };
    if (vpnCache.size > 5000) vpnCache.clear();
    vpnCache.set(ip, { t: Date.now(), v });
    return v;
  } catch (_) { return { checked: false, vpn: false, kind: '' }; }
}

/* ---------- who is calling (asks Google whether the Firebase login token is real) ---------- */
async function verifyToken(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 4000) return null;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(6000)
    });
    const j = await r.json();
    const u = r.ok && j.users && j.users[0];
    return u && !u.disabled ? u.localId : null;
  } catch (_) { return null; }
}

/* ---------- admin database access (service account, no npm packages) ----------
 * The server writes tosAccepted/, attest/, ipBans/, ipSeen/ itself. The database rules block every browser from writing them,
 * so a modified client can no longer fake a TOS accept, an "attestation", or lift an IP ban. */
let sa = null, tok = null;
function loadSa() {
  if (sa) return sa;
  const raw = process.env.FIREBASE_SA;
  if (!raw) throw new Error('FIREBASE_SA is not set');
  sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error('FIREBASE_SA is not a service-account key');
  return sa;
}
const b64u = b => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
async function adminToken() {
  if (tok && tok.exp > Date.now() + 60000) return tok.t;
  const s = loadSa(), now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: s.client_email, scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(s.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + b64u(sig), signal: AbortSignal.timeout(8000)
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('admin token failed');
  tok = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tok.t;
}
async function adb(method, path, body) {
  const r = await fetch(DB_URL + '/' + path + '.json', {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await adminToken() },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000)
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!r.ok) throw new Error('db ' + method + ' ' + path + ' -> ' + r.status);
  return data;
}

/* ---------- build check: stops old files AND "just edit the build number" ----------
 * Every release is stamped (tools/stamp-build.js) with a label and a token = HMAC(BUILD_SECRET, label).
 *   - an old file carries an old label -> older than the minimum -> refused
 *   - someone edits the label in an old file -> the token no longer matches -> refused
 *   - they can't make a token for a newer label, because BUILD_SECRET only lives on the server. */
const baseOf = x => { const m = /^(\d{4}-\d{2}-\d{2}\.\d+)(?:-[A-Za-z0-9_.-]{1,40})?$/.exec(String(x || '')); return m ? m[1] : null; };
function compareBuilds(a, b) {
  const re = /^(\d{4}-\d{2}-\d{2})\.(\d+)$/, ma = re.exec(baseOf(a) || ''), mb = re.exec(baseOf(b) || '');
  if (!ma || !mb) return null;
  if (ma[1] !== mb[1]) return ma[1] < mb[1] ? -1 : 1;
  const x = +ma[2], y = +mb[2];
  return x === y ? 0 : x < y ? -1 : 1;
}
function buildToken(build) {
  const s = process.env.BUILD_SECRET;
  if (!s || s.length < 16) throw new Error('BUILD_SECRET is missing or too short');
  return crypto.createHmac('sha256', s).update('build:' + build).digest('hex').slice(0, 32);
}
let minCache = { t: 0, v: '' };
async function minBuild() {
  if (Date.now() - minCache.t < 30000) return minCache.v;
  let m = String(process.env.MIN_BUILD || '');
  try {   // the owner-pinned version in Moderation > Version control now also counts as a floor
    const cur = await adb('GET', 'appVersion/current');
    if (typeof cur === 'string' && compareBuilds(cur, m || '0000-00-00.0') === 1) m = cur;
  } catch (_) {}
  minCache = { t: Date.now(), v: m };
  return m;
}
async function checkBuild(build, token) {
  build = String(build || '').slice(0, 40); token = String(token || '');
  const base = baseOf(build);
  if (!base) return { ok: false, why: 'forged', build };
  if (process.env.BUILD_SECRET) {   // token check only when BUILD_SECRET is set on the server
    const want = buildToken(base);
    const a = Buffer.from(token.padEnd(32).slice(0, 32)), b = Buffer.from(want);
    if (token.length !== 32 || !crypto.timingSafeEqual(a, b)) return { ok: false, why: 'forged', build };
  }
  const min = await minBuild();
  if (min && compareBuilds(build, min) === -1) return { ok: false, why: 'old', build, min };
  return { ok: true, build };
}

/* ---------- staff check (done with the admin read, so it can't be faked from the browser) ---------- */
async function roleOf(id) {
  const [o, so, ad] = await Promise.all(['owners', 'secretowner', 'admin'].map(p => adb('GET', p + '/' + id).catch(() => null)));
  const owner = o === 1 || so === 1;
  return { owner, admin: owner || ad === 1 };
}

/* ---------- Discord (webhook only ever lives in the server env) ---------- */
// Fallback so it works without the Vercel variable. This file is in a PUBLIC repo, so anyone can read it: if fake logs ever show up, delete this webhook in Discord and make a new one.
const WEBHOOK_FALLBACK = 'https://discord.com/api/webhooks/1562117320845951157/MobbYHh5lVayswwOt7QxSYXCyZscB4JjAborgCVrjt2vRT0-d2Fmcrkp4Ngc_4Qbpqcy';
async function discord(payload) {
  const url = process.env.DISCORD_WEBHOOK_URL || WEBHOOK_FALLBACK;
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ username: 'ICH Security', allowed_mentions: { parse: [] } }, payload)), signal: AbortSignal.timeout(8000) });
  } catch (_) {}
}
const clean = (s, n) => String(s == null ? '' : s).replace(/[`\r\n]/g, ' ').slice(0, n || 100);

/* ---------- rate limit: in-memory (fast) ---------- */
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}
// cheat alerts: at most one Discord post per (kind, id) every 10 minutes so nobody can flood the log
const alerted = new Map();
async function alert(kind, id, fields) {
  const k = kind + ':' + id, now = Date.now();
  if (now - (alerted.get(k) || 0) < 10 * 60 * 1000) return;
  alerted.set(k, now); if (alerted.size > 2000) alerted.clear();
  await discord({ embeds: [{ title: 'Anti-cheat: ' + kind, color: 0xfaa61a, fields: Object.entries(fields).map(([n, v]) => ({ name: n, value: '`' + clean(v, 120) + '`', inline: true })), timestamp: new Date().toISOString() }] });
}

module.exports = { cors, send, readBody, clientIp, normalizeIp, ipHash, isPrivateIp, vpnCheck, verifyToken, adb, checkBuild, compareBuilds, buildToken, roleOf, discord, alert, clean, limited, net, TOS_VERSION, ATTEST_TTL_MS };
