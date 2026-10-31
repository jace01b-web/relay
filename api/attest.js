/* POST /api/attest  {idToken, build, bt}
 * The one gate the database rules look at. A signed-in, TOS-accepted user calls this every few minutes. If EVERYTHING checks out the
 * server writes attest/<uid> = {exp}. The rules only let a message through while that exp is in the future, and no browser can write attest/.
 * Checked here, on the server, where the user can't touch it:
 *   real IP (platform header only) | build label + token | account not banned | network not IP-banned | no VPN/proxy/Tor | TOS accepted (current version) */
const L = require('./_lib');
module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  if (req.method !== 'POST') return L.send(res, 405, { error: 'POST only' });
  try {
    const ip = L.clientIp(req);
    if (!ip) return L.send(res, 400, { ok: false, block: 'ip', error: 'Could not read a trustworthy IP for this request.' });
    if (L.limited('att:' + ip, 40, 60 * 1000)) return L.send(res, 429, { ok: false, block: 'rate', error: 'Slow down.' });
    const b = await L.readBody(req);

    const uid = await L.verifyToken(b.idToken);
    if (!uid) return L.send(res, 401, { ok: false, block: 'auth', error: 'Not signed in.' });
    if (L.limited('attu:' + uid, 12, 60 * 1000)) return L.send(res, 429, { ok: false, block: 'rate', error: 'Slow down.' });
    const id = Number(await L.adb('GET', 'uidToId/' + uid));
    if (!id) return L.send(res, 403, { ok: false, block: 'auth', error: 'No account.' });
    const role = await L.roleOf(id);

    // 1) build: old file, edited label, or forged token
    const bc = await L.checkBuild(b.build, b.bt);
    if (!bc.ok && !role.owner) {
      if (bc.why !== 'server') await L.alert(bc.why === 'forged' ? 'forged build' : 'old build', id, { Account: id, Claimed: String(b.build || '').slice(0, 30), Min: bc.min || '-' });
      return L.send(res, 426, { ok: false, block: 'build', min: bc.min || '', why: bc.why });
    }

    // 2) banned account
    if (!role.owner && (await L.adb('GET', 'banned/' + id)) === true) return L.send(res, 403, { ok: false, block: 'banned' });

    // 3) banned network (hash is HMAC with a secret salt, so the stored list can't be reversed into IPs)
    const h = L.ipHash(ip);
    if (!role.owner && (await L.adb('GET', 'ipBans/' + h)) !== null) {
      await L.alert('ban evasion', id, { Account: id, Network: h.slice(0, 8) });
      return L.send(res, 403, { ok: false, block: 'ipban' });
    }

    // 4) VPN / proxy / Tor
    const v = await L.vpnCheck(ip);
    if (!role.owner && v.vpn) return L.send(res, 403, { ok: false, block: 'vpn', kind: v.kind });
    if (!role.owner && !v.checked && process.env.VPN_FAIL_CLOSED === '1') return L.send(res, 503, { ok: false, block: 'vpncheck' });

    // 5) TOS (written only by /api/tos, so it can't be faked from the browser)
    const tos = await L.adb('GET', 'tosAccepted/' + id);
    if (!role.owner && !(tos && Number(tos.v) >= L.TOS_VERSION && tos.srv === 1)) return L.send(res, 200, { ok: false, block: 'tos' });

    // remember every network this account has used, so banning the account bans all of them
    const now = Date.now();
    await L.adb('PATCH', 'ipSeen/' + id, { [h]: now });
    const exp = now + L.ATTEST_TTL_MS;
    await L.adb('PUT', 'attest/' + uid, { exp, id, b: bc.build || 'owner', at: now });
    L.send(res, 200, { ok: true, exp });
  } catch (e) {
    L.send(res, 500, { ok: false, block: 'server', error: 'Service unavailable.' });
  }
};
