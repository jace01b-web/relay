/* POST /api/tos  {idToken, id, version, build, bt}
 * Only called when someone presses "I accept". The SERVER reads their IP and writes tosAccepted/<id> (the browser is not allowed to),
 * then writes the full record - IP, browser, build - to tosLog/<id>, which ONLY owners can read (see database.rules.json).
 * That replaced the Discord webhook: the log lives with the site instead of behind a webhook URL that anybody holding it can read.
 * Note what goes where: tosAccepted/<id> is the receipt (version, time, IP *hash*) and is readable by the person and by staff;
 * tosLog/<id> is the owner-only record and is the only place the raw IP is kept. A decline never reaches this file. */
const L = require('./_lib');
module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  if (req.method !== 'POST') return L.send(res, 405, { error: 'POST only' });
  try {
    const ip = L.clientIp(req);
    if (!ip) return L.send(res, 400, { error: 'Could not read a trustworthy IP for this request.' });
    if (L.limited('tos:' + ip, 6, 10 * 60 * 1000)) return L.send(res, 429, { error: 'Too many tries, wait a few minutes.' });
    const b = await L.readBody(req);
    const uid = await L.verifyToken(b.idToken);
    if (!uid) return L.send(res, 401, { error: 'Not signed in.' });
    const id = Number(await L.adb('GET', 'uidToId/' + uid));
    if (!id || id !== Number(b.id)) return L.send(res, 403, { error: 'Account mismatch.' });
    const bc = await L.checkBuild(b.build, b.bt);
    if (!bc.ok) return L.send(res, 426, { error: 'Please reload the site to get the newest version.', block: 'build' });
    if ((await L.adb('GET', 'banned/' + id)) === true) return L.send(res, 403, { error: 'This account is banned.' });

    const h = L.ipHash(ip);
    if ((await L.adb('GET', 'ipBans/' + h)) !== null) {
      await L.alert('ban evasion (TOS)', id, { Account: id, Network: h.slice(0, 8) });
      return L.send(res, 403, { error: 'This network has been banned from chatting.', block: 'ipban' });
    }
    const v = await L.vpnCheck(ip);
    if (v.vpn) return L.send(res, 403, { error: 'VPN / proxy detected. Turn it off and try again.', block: 'vpn' });

    const username = String((await L.adb('GET', 'users/' + id + '/username')) || '(unknown)');
    const at = Date.now();
    // The receipt. No raw IP here any more - only the salted hash, which is what bans match on.
    await L.adb('PUT', 'tosAccepted/' + id, { v: L.TOS_VERSION, at, h, srv: 1 });
    await L.adb('PATCH', 'ipSeen/' + id, { [h]: at });
    // The owner-only record, shown in Settings > Moderation > TOS acceptances.
    await L.adb('PUT', 'tosLog/' + id, {
      at, v: L.TOS_VERSION, ip, h,
      name: L.clean(username, 40),
      ua: L.clean(req.headers['user-agent'], 200),
      build: L.clean(bc.build, 30),
      vpn: v.checked ? 'clear' : 'not checked'
    });
    L.send(res, 200, { ok: true });
  } catch (e) {
    L.send(res, 500, { error: 'Service unavailable. Try again in a minute.' });
  }
};
