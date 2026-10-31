/* GET /api/ipcheck
 * Tells the browser (1) a scrambled fingerprint of ITS OWN IP so it can look up the IP-ban list, and (2) whether the IP is a VPN/proxy.
 * Nothing is stored or logged here - the IP is used for this one request and forgotten. */
const L = require('./_lib');
module.exports = async (req, res) => {
  if (L.cors(req, res)) return;
  try {
    const ip = L.clientIp(req);
    if (L.limited('chk:' + ip, 60, 60 * 1000)) return L.send(res, 429, { error: 'slow down' });
    const v = await L.vpnCheck(ip);
    L.send(res, 200, { h: L.ipHash(ip), vpn: v.vpn, kind: v.kind || '', checked: v.checked });
  } catch (e) {
    L.send(res, 500, { error: 'not configured' });
  }
};
