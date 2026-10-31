/* POST /api/ipban  {idToken, action:'ban'|'unban', ip? | userId?, reason?}
 * Staff only (checked on the server). ban and unban: owners + admins. Browsers can no longer write ipBans/ themselves.
 * Banning an account bans EVERY network that account has been seen on (ipSeen/), not just the last one. */
const L = require('./_lib');
module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  if (req.method !== 'POST') return L.send(res, 405, { error: 'POST only' });
  try {
    const ipc = L.clientIp(req) || 'x';
    if (L.limited('ban:' + ipc, 30, 10 * 60 * 1000)) return L.send(res, 429, { error: 'Slow down.' });
    const b = await L.readBody(req);
    const uid = await L.verifyToken(b.idToken);
    if (!uid) return L.send(res, 401, { error: 'Not signed in.' });
    const me = Number(await L.adb('GET', 'uidToId/' + uid));
    if (!me) return L.send(res, 403, { error: 'No account.' });
    const role = await L.roleOf(me);
    const action = b.action === 'unban' ? 'unban' : 'ban';
    if (!role.admin) return L.send(res, 403, { error: 'Owners and admins only.' });   // role.admin is true for owners too

    let hashes = [], shown, targetId = null;
    if (b.ip) {
      const ip = String(b.ip).trim();
      if (!L.net.isIP(ip)) return L.send(res, 400, { error: 'That is not a valid IP address.' });
      hashes = [L.ipHash(ip)]; shown = ip;
    } else if (b.userId) {
      targetId = Number(b.userId);
      if (!targetId) return L.send(res, 400, { error: 'Bad user id.' });
      const tRole = await L.roleOf(targetId);
      if (tRole.owner) return L.send(res, 403, { error: 'Owners cannot be IP-banned.' });
      if (!role.owner && tRole.admin) return L.send(res, 403, { error: 'Admins cannot IP-ban other admins.' });
      const seen = (await L.adb('GET', 'ipSeen/' + targetId)) || {};
      const t = await L.adb('GET', 'tosAccepted/' + targetId + '/h');
      hashes = Object.keys(seen); if (typeof t === 'string' && !hashes.includes(t)) hashes.push(t);
      if (!hashes.length) return L.send(res, 404, { error: 'No network on file for that user (they never accepted the TOS).' });
      shown = 'user #' + targetId + ' (' + hashes.length + ' network' + (hashes.length > 1 ? 's' : '') + ')';
    } else return L.send(res, 400, { error: 'Give an ip or userId.' });

    let n = 0;
    for (const h of hashes) {
      if (action === 'ban') { await L.adb('PUT', 'ipBans/' + h, { at: Date.now(), by: me, uid: targetId, reason: L.clean(b.reason, 120) }); n++; }
      else {
        const cur = await L.adb('GET', 'ipBans/' + h);
        if (cur && (targetId === null || Number(cur.uid) === targetId)) { await L.adb('DELETE', 'ipBans/' + h); n++; }
      }
    }
    await L.discord({ username: 'ICH TOS Log', embeds: [{ title: action === 'ban' ? 'IP banned' : 'IP unbanned', color: action === 'ban' ? 0xed4245 : 0xfee75c,
      description: 'Target: ' + L.clean(shown, 80) + '\nNetworks changed: ' + n + '\nBy: account #' + me + (b.reason ? '\nReason: ' + L.clean(b.reason, 120) : ''), timestamp: new Date().toISOString() }] });
    L.send(res, 200, { ok: true, changed: n });
  } catch (e) {
    L.send(res, 500, { error: 'Service unavailable.' });
  }
};
