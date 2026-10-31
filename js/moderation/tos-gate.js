/* ==========================================================================
 * js/moderation/tos-gate.js
 * Terms of Service gate: nobody can SEND messages until they accept the TOS. Everything else still works.
 *  - Accepting records username + account ID + IP + browser to tosLog/$id (via /api/tos), which the database rules make
 *    readable by OWNERS ONLY - shown in Settings > Moderation > TOS acceptances. Nothing goes to Discord any more.
 *    The receipt on the account (tosAccepted/$id) keeps only the version, the time and a scrambled IP fingerprint,
 *    so staff can see that somebody accepted without seeing their address.
 *  - Declining records nothing and sends nothing anywhere - the gate never runs any IP lookup for people who haven't accepted.
 *  - IP bans (ipBans/$hash), VPN / proxy / Tor detection (checked in the browser, accepted users only).
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * ========================================================================== */
'use strict';

const TOS_GATE={accepted:null,vpn:false,vpnKind:'',ipBanned:false,banned:false,exp:0,h:null,checkedAt:0,apiOk:null};
let TOS_STATE=null;                       // {v,at,h} once accepted
const TOS_DECLINE_KEY='ich_tos_declined'; // sessionStorage only - a decline is never sent anywhere
function tosDeclinedThisSession(){try{return sessionStorage.getItem(TOS_DECLINE_KEY)==='1'}catch(_){return false}}

const TOS_SECTIONS=[
  {ic:'💬',t:'Chatting needs this',d:'To <b>send messages</b> you have to accept these terms. If you don\'t, you can still use <b>everything else</b>: read every chat, use the games, hubs, tools, settings and the rest of the site. You just can\'t chat.'},
  {ic:'📝',hot:true,t:'What gets logged when you accept',d:'When you press <b>Accept</b>, your <b>username</b>, <b>account ID</b>, <b>IP address</b>, the <b>time</b> and your <b>browser info</b> are recorded <b>on this site</b>, where only the owner can read them. They are <b>not</b> sent to Discord or to any outside service. A scrambled (hashed) copy of your IP is also saved on your account so IP bans can work — moderators see that hash, never your address. This is used <b>only</b> to stop raids, spam and ban evasion, and so the owner can IP-ban people when needed.'},
  {ic:'🔒',t:'Private. Never shared.',d:'The log is private to the site owner only. It is never shared, sold, posted or leaked, to anyone, for any reason.'},
  {ic:'🙅',t:'If you decline',d:'<b>Nothing is logged.</b> Your username, account ID and IP are not recorded anywhere. You will just be unable to chat. You can change your mind any time in <b>Settings → About</b>.'},
  {ic:'🔨',t:'IP bans',d:'If you are banned, your IP can be banned too, so new accounts from the same network can\'t chat. On a shared network (like a school) other people on that network can be affected until the ban is lifted.'},
  {ic:'🛡️',t:'No VPNs, proxies or Tor',d:'Chat is blocked while your connection looks like a VPN, proxy or Tor exit. Your IP is checked with a third-party detection service for this, only once you have accepted. Turn it off and reload to chat.'},
  {ic:'🚨',t:'Raiding and abuse',d:'Raiding, spamming, harassment, and dodging a ban (alt accounts, VPNs, proxies) will get you banned, including by IP. The server rules still apply on top of these terms.'}
];

/* ---------- state ---------- */
function tosApiBase(){return String(CFG.TOS_API||'').replace(/\/$/,'')}
function ipBanActive(){return !!TOS_GATE.ipBanned&&typeof ME!=='undefined'&&!!ME&&ownersKnown()&&!isOwner(ME.id)}
// Returns a short message when the current user may NOT send chat messages, or null when they may. Owners are exempt.
function chatBlockReason(){
  if(typeof ME==='undefined'||!ME)return null;
  if(ownersKnown()&&isOwner(ME.id))return null;
  if(TOS_GATE.accepted!==true)return TOS_GATE.accepted===null?'Checking your account…':'You need to accept the Terms of Service to chat. You can still use everything else.';
  if(TOS_GATE.ipBanned)return 'This network has been banned from chatting.';
  if(TOS_GATE.vpn)return 'VPN / proxy detected. Turn it off and reload to chat.';
  if(TOS_GATE.banned)return 'Your account has been banned.';
  return null;
}
// Called right before a message is sent/edited: refreshes the VPN / IP-ban check if it is stale, then throws if chat is blocked.
async function tosGateGuard(){
  let r=chatBlockReason();
  if(!r&&TOS_GATE.accepted===true&&!(TOS_GATE.apiOk===false&&Date.now()-TOS_GATE.checkedAt<60000)&&(!TOS_GATE.exp||TOS_GATE.exp-(Date.now()+(typeof SKEW==='number'?SKEW:0))<90000)){
    try{await Promise.race([tosCheckIp(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),9000))])}catch(_){}
    r=chatBlockReason();
  }
  if(r)throw new Error(r);
}
function tosUiSync(){
  try{if(typeof updateMuteLock==='function')updateMuteLock()}catch(_){}
  try{
    if(ipBanActive()&&CFG.IP_BAN_FULL_LOCK)lockMenuBanned('This network has been banned.','Network banned');
  }catch(_){}
}
function tosBannerSync(reason){
  let b=$('#tosBanner');
  if(!b){
    const anchor=$('#announceBanner')||$('#mutedBanner');
    if(!anchor||!anchor.parentNode)return;
    b=document.createElement('div');b.id='tosBanner';b.className='banned-banner hidden';
    b.style.cssText='background:#2d1f3d;border-color:#5b3a82;color:#e3ccff;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
    anchor.parentNode.insertBefore(b,anchor.nextSibling);
  }
  if(!reason||reason==='Checking your account…'){b.classList.add('hidden');return}
  b.classList.remove('hidden');
  const needTos=TOS_GATE.accepted!==true;
  b.innerHTML='<span style="flex:1;min-width:200px">🔒 '+esc(reason)+'</span>'
    +(needTos?'<button class="btn small" id="tosBannerBtn" type="button">Read &amp; accept TOS</button>':'<button class="btn sec small" id="tosBannerBtn" type="button">Re-check</button>');
  $('#tosBannerBtn').onclick=()=>{
    if(needTos){modalTos({})}
    else{
      const btn=$('#tosBannerBtn');if(btn){btn.disabled=true;btn.textContent='Checking…'}
      tosCheckIp().catch(()=>{}).finally(tosUiSync);
    }
  };
}

/* ---------- server calls: the SERVER reads the IP, checks VPN / bans / build, and hands out the attestation the database rules require ---------- */
const BUILD_TOKEN=document.querySelector('meta[name="build-token"]')?.content||'';
async function tosApi(path,body){
  const t=await auth.currentUser.getIdToken();
  const c=typeof AbortController!=='undefined'?new AbortController():null,tm=setTimeout(()=>{try{c&&c.abort()}catch(_){}},9000);
  try{
    const r=await fetch(tosApiBase()+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:c?c.signal:undefined,
      body:JSON.stringify(Object.assign({idToken:t,build:MY_BUILD,bt:BUILD_TOKEN},body||{}))});
    let j=null;try{j=await r.json()}catch(_){}
    return{status:r.status,j:j||{}};
  }finally{clearTimeout(tm)}
}
let _attestBusy=null;
// Asks the server to clear this login. Sets TOS_GATE from the server's answer; the database rules only accept chat writes while the grant is live.
async function tosCheckIp(){
  if(_attestBusy)return _attestBusy;
  _attestBusy=(async()=>{
    try{
      const {status,j}=await tosApi('attest');
      TOS_GATE.checkedAt=Date.now();TOS_GATE.apiOk=!(status>=500||status===0);
      TOS_GATE.ipBanned=j.block==='ipban';TOS_GATE.vpn=j.block==='vpn';TOS_GATE.vpnKind=j.kind||'';
      TOS_GATE.banned=j.block==='banned';TOS_GATE.exp=j.ok?j.exp:0;
      if(j.block==='tos'){TOS_GATE.accepted=false}
      if(j.block==='build'){tosBuildLock(j.min)}
    }catch(e){TOS_GATE.apiOk=false;TOS_GATE.checkedAt=Date.now();TOS_GATE.exp=0;console.warn('attest unavailable',e&&e.message||e)}
  })().finally(()=>{_attestBusy=null});
  return _attestBusy;
}
// Server says this build is too old (or its token doesn't match). Same full-screen wall the owner version pin uses.
function tosBuildLock(min){
  try{lockForVersionMismatch(min||'the newest version')}catch(_){}
  try{if(/^https?:$/.test(location.protocol)&&!window.opener){const k='tosBuildReload';if(!sessionStorage.getItem(k)){sessionStorage.setItem(k,'1');setTimeout(()=>location.reload(),1800)}}}catch(_){}
}
async function tosAccept(){
  if(!ME)throw new Error('You need to be signed in.');
  let res=null;
  try{res=await tosApi('tos',{id:ME.id,version:CFG.TOS_VERSION})}catch(_){res=null}
  const apiAnswered=!!(res&&res.status&&res.j&&(res.j.ok||res.j.error));
  if(apiAnswered){
    if(res.status!==200||!res.j.ok){
      if(res.j.block==='build')tosBuildLock();
      throw new Error(res.j.error||'Could not save. Try again in a minute.');
    }
  }else{
    // API not reachable (not deployed yet / blocked). Save it the old way. The database rules only allow this while security/enforce is NOT true.
    try{await set(R('tosAccepted/'+ME.id),{v:CFG.TOS_VERSION,at:Date.now()+SKEW,h:'unverified'})}   // no ip: raw IPs are the server's to write, into owner-only tosLog/
    catch(e){throw new Error('Could not reach the server to save this. Check your connection and try again.')}
  }
  await tosLoadState(ME.id);
  TOS_GATE.accepted=true;
  try{sessionStorage.removeItem(TOS_DECLINE_KEY)}catch(_){}
  tosCheckIp().then(tosUiSync).catch(()=>{});
}
async function tosLoadState(id){
  try{
    const sn=await get(R('tosAccepted/'+id));
    const v=sn.exists()?sn.val():null;
    TOS_STATE=v;TOS_GATE.accepted=!!(v&&Number(v.v)>=CFG.TOS_VERSION);
  }catch(e){
    console.warn('tos state unreadable',e&&e.code||e);
    TOS_STATE=null;TOS_GATE.accepted=false;
  }
}

/* ---------- ban hooks (called from DB.banUser / DB.unbanUser, and the staff IP-ban tool). The server does the work,
   and re-checks the caller's role itself — owners and admins may both ban and unban an IP. ---------- */
async function tosIpBanUser(id){const {j}=await tosApi('ipban',{action:'ban',userId:Number(id),reason:'account banned'});return !!j.ok}
async function tosIpUnbanUser(id){const {j}=await tosApi('ipban',{action:'unban',userId:Number(id)});return !!j.ok}
async function tosManualIpBan(action,ip,reason){
  ip=String(ip||'').trim();
  if(!tosValidIp(ip))throw new Error('That is not a valid IP address.');
  const {j}=await tosApi('ipban',{action:action==='ban'?'ban':'unban',ip,reason:String(reason||'').slice(0,120)});
  if(!j.ok)throw new Error(j.error||'The server refused it.');
  return true;
}
function tosValidIp(ip){return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)||/^[0-9a-f:]{2,45}$/i.test(ip)&&ip.indexOf(':')>=0}

/* ---------- the TOS modal ---------- */
function modalTos(opts){
  opts=opts||{};
  const root=$('#modalRoot');if(!root)return;
  const force=!!opts.force;
  const accepted=TOS_GATE.accepted===true;
  const rec=TOS_STATE;
  const footer=accepted
    ?`<div class="rules-status">✅ You accepted the Terms of Service${rec&&rec.at?' on '+fmtRulesDate(rec.at):''}</div>
      <button class="rules-ok" id="tosClose" type="button">${opts.back?'Back':'Close'} 💖</button>`
    :`<label class="rules-agree"><input type="checkbox" id="tosChk"> I have read the Terms of Service. I understand my username and IP will be logged privately for moderation.</label>
      <div class="tos-err" id="tosErr"></div>
      <button class="rules-ok" id="tosOk" type="button" disabled>Accept &amp; allow chat 💖</button>
      <button class="tos-decline" id="tosNo" type="button">Decline (nothing is logged, I just won't be able to chat)</button>`;
  root.innerHTML=`<div class="modal-bg" id="tosBg"><div class="modal rules-modal" role="dialog" aria-modal="true" aria-label="Terms of Service">
    ${(force&&!accepted)?'':'<button class="modal-x" id="tosX" type="button">✕</button>'}
    <div class="rules-hero">
      <h2>Terms of Service</h2>
      <div class="rules-sub">${accepted?'Here\'s what you agreed to':'Please read before you chat ✨'}</div>
    </div>
    <div class="rules-body">
      ${TOS_SECTIONS.map(r=>`<div class="rule-card${r.hot?' rule-hot':''}"><div class="rule-ic">${r.ic}</div><div><div class="rule-t">${r.t}</div><div class="rule-d">${r.d}</div></div></div>`).join('')}
      ${footer}
    </div>
  </div></div>`;
  const leave=()=>closeModalAnimated(root,opts.back||null);
  const x=$('#tosX');
  if(x){x.onclick=leave;$('#tosBg').onclick=e=>{if(e.target.id==='tosBg')leave()}}
  if(accepted){$('#tosClose').onclick=leave;return}
  const chk=$('#tosChk'),ok=$('#tosOk'),no=$('#tosNo'),err=$('#tosErr');
  chk.onchange=()=>{ok.disabled=!chk.checked};
  no.onclick=()=>{
    // Declining does NOTHING but remember, in this browser tab only, that you said no. No network request, no log.
    try{sessionStorage.setItem(TOS_DECLINE_KEY,'1')}catch(_){}
    toast('Declined. Nothing was logged. You can use everything except chat.');
    leave();tosUiSync();
  };
  ok.onclick=async()=>{
    if(!chk.checked||ok.disabled)return;
    ok.disabled=true;no.disabled=true;ok.textContent='Saving…';err.textContent='';
    try{
      await tosAccept();
      toast('Thanks! You can chat now. 💖');
      leave();tosUiSync();
    }catch(e){
      console.warn('tos accept failed',e);
      err.textContent=e.message||'Could not save. Try again.';
      ok.disabled=false;no.disabled=false;ok.innerHTML='Accept &amp; allow chat 💖';
    }
  };
}

/* ---------- runner: loads state for whoever is signed in, prompts once per session ---------- */
(function(){
  let forId=null,promptTimer=null;
  function reset(){TOS_GATE.accepted=null;TOS_GATE.vpn=false;TOS_GATE.vpnKind='';TOS_GATE.ipBanned=false;TOS_GATE.h=null;TOS_GATE.checkedAt=0;TOS_GATE.apiOk=null;TOS_GATE.exp=0;TOS_GATE.banned=false;TOS_STATE=null;if(window._attestTimer){clearInterval(window._attestTimer);window._attestTimer=null}if(promptTimer){clearInterval(promptTimer);promptTimer=null}}
  function promptWhenIdle(){
    let tries=0;
    promptTimer=setInterval(()=>{
      if(++tries>200||!ME||TOS_GATE.accepted!==false){clearInterval(promptTimer);promptTimer=null;return}
      const r=$('#modalRoot');
      const rulesDone=RULES_STATE!==undefined&&rulesAgreed(RULES_STATE);
      if(r&&!r.innerHTML.trim()&&(rulesDone||tries>45)){clearInterval(promptTimer);promptTimer=null;modalTos({force:true})}
    },800);
  }
  setInterval(async()=>{
    if(typeof ME==='undefined'||!ME){if(forId!==null){forId=null;reset();tosUiSync()}return}
    if(forId===ME.id)return;
    forId=ME.id;reset();
    const id=ME.id;
    await tosLoadState(id);
    if(ME&&ME.id!==id)return;
    if(TOS_GATE.accepted)await tosCheckIp();
    tosUiSync();
    if(TOS_GATE.accepted&&!window._attestTimer)window._attestTimer=setInterval(()=>{if(TOS_GATE.accepted&&ME)tosCheckIp().then(tosUiSync)},CFG.ATTEST_EVERY_MS);
    if(TOS_GATE.accepted===false&&!tosDeclinedThisSession()&&!(DB.isBanned&&DB.isBanned(id)))promptWhenIdle();
    // owners/ loads a moment after sign-in; re-sync until it has, so owners are never left locked out of their own chat
    let n=0;const t=setInterval(()=>{tosUiSync();if(ownersKnown()||++n>30)clearInterval(t)},1000);
  },1500);
})();
