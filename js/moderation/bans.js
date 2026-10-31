/* ==========================================================================
 * js/moderation/bans.js
 * Mute presets, ban lock overlay, kick/paused-session overlay
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

// Live cache of appVersion/, populated by a listener started in DB.startListeners().
// appVersion/current is the version label an owner has pinned as canonical (usually
// the build-version they're currently running, right after deploying it) and
// appVersion/history/$at is an append-only log of every time an owner has done that.
// The client never enforces anything just by rendering this — every write is still
// independently checked server-side (owners/.write only), this is just the live view.
let APP_VERSION_CACHE=null;
let APP_VERSION_LOADED=false;
// Timeout durations mods are allowed to use, in minutes (must match the rules' allow-list
// in muted/$id/.validate exactly, or a mod's mute attempt gets rejected server-side).
const MOD_MUTE_OPTS=[[5,'5 minutes'],[60,'1 hour'],[360,'6 hours'],[720,'12 hours'],[1440,'1 day']];
const ADMIN_MUTE_OPTS=[[5,'5 minutes'],[60,'1 hour'],[360,'6 hours'],[720,'12 hours'],[1440,'1 day'],[4320,'3 days'],[10080,'7 days']];   // admins: anything up to 7 days (rules cap it)
const OWNER_MUTE_OPTS=[[5,'5 minutes'],[60,'1 hour'],[1440,'24 hours'],[10080,'7 days']];
/* ---------- Menu lockout on ban ----------
   isOwner() above now reads live from the real database (owners/$id, populated by
   your own backend), not a hardcoded client array — so there's no longer a separate
   "local claim" that could disagree with the server to forge owner status with.
   Any owner-only write is still independently checked server-side by the rules on
   every attempt, regardless of what this page renders. What's left to handle
   client-side is just the UX case: if this account is banned, lock the menu so a
   banned user (or anyone who edits banned/ back to false locally, which does
   nothing server-side) can't keep interacting with a UI that will reject every
   real write anyway. */
let MENU_LOCKED=false;
let BAN_OVERLAY=null;
function lockMenuBanned(msg,title){
  if(MENU_LOCKED)return;MENU_LOCKED=true;
  try{$('#modalRoot').innerHTML='';}catch(_){}
  document.querySelectorAll('.sidebar,.app-shell,#settingsBtn,.composer,.tabs').forEach(el=>el&&(el.style.pointerEvents='none',el.style.opacity='.35'));
  const bg=document.createElement('div');
  bg.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(6,7,16,.92);color:#eef0ff;font-family:inherit;text-align:center;padding:24px';
  bg.innerHTML='<div style="max-width:360px"><div style="font-size:40px;margin-bottom:10px">🚫</div><div style="font-weight:700;font-size:16px;margin-bottom:8px">'+esc(title||'Account banned')+'</div><div style="opacity:.75;font-size:13.5px;line-height:1.5">'+esc(msg||'This account has been banned. The menu and chat are locked.')+'</div></div>';
  document.body.appendChild(bg);
  BAN_OVERLAY=bg;
}
// Reverses lockMenuBanned() once banned/$myId is cleared (or this id becomes an owner)
// — without this, an unban never took visible effect and the page stayed locked until
// a full reload, which is why "unban doesn't work" even though the database was fine.
function unlockMenuBanned(){
  if(!MENU_LOCKED)return;MENU_LOCKED=false;
  document.querySelectorAll('.sidebar,.app-shell,#settingsBtn,.composer,.tabs').forEach(el=>el&&(el.style.pointerEvents='',el.style.opacity=''));
  if(BAN_OVERLAY){BAN_OVERLAY.remove();BAN_OVERLAY=null}
}
/* Re-evaluated every time banned/ or owners/ changes (they load independently and
   in no guaranteed order). Owner status always overrides a banned/$myId flag,
   including a stale one left over from before an account became an owner.
   NOTE: myId/C live inside the DB closure below, not out here — this function is
   only ever actually called via DB internally, which passes its own myId/banned
   state in. Calling checkBanLock() directly from outside DB would throw
   "myId is not defined" since no such variable exists at this scope. */
function checkBanLock(currentId,bannedMap){
  if(!currentId)return;
  const flagged=bannedMap&&bannedMap[currentId];
  if(flagged&&isOwner(currentId)){
    // Stray ban on an owner (leftover from before they became an owner, or a bug) —
    // self-heal by actually clearing it server-side instead of only hiding the
    // overlay, so message-sending (blocked server-side regardless of owner status
    // if the flag is real) doesn't silently stay broken while the UI looks fine.
    // Requires the updated database rules that let an owner clear (not set) a
    // banned/muted flag on any target, including another owner.
    if(!checkBanLock._healing){
      checkBanLock._healing=true;
      DB.unbanUser(currentId).catch(()=>{}).finally(()=>{checkBanLock._healing=false});
    }
    unlockMenuBanned();
    return;
  }
  if(flagged){lockMenuBanned()}
  else if(!(typeof ipBanActive==='function'&&ipBanActive()&&CFG.IP_BAN_FULL_LOCK)){unlockMenuBanned()}   // keep an IP-ban lock in place when the account itself isn't banned
}

/* ---------- Single-active-session pause overlay ----------
   Same UX pattern as the ban lockout above: freeze the shell, show a full-screen
   card. This one fires when DB notices (via sessions/$myId, see the DB closure)
   that a different tab/device has claimed this account more recently than us —
   so we stop competing for onlineUsers/myId and let the person explicitly choose
   which client should be the live one. */
let KICK_OVERLAY=null;
function showKickOverlay(){
  if(KICK_OVERLAY)return;
  try{$('#modalRoot').innerHTML='';}catch(_){}
  document.querySelectorAll('.sidebar,.app-shell,#settingsBtn,.composer,.tabs').forEach(el=>el&&(el.style.pointerEvents='none',el.style.opacity='.35'));
  const bg=document.createElement('div');
  bg.className='modal-bg gc-overlay';
  bg.style.zIndex='99999';
  bg.innerHTML='<div class="modal gc-modal sess-modal"><div class="sess-ic">🔌</div>'
    +'<h2>Disconnected</h2>'
    +'<div class="hint">This account just signed in somewhere else, so this tab has been paused (and won\'t show as online) until you reconnect it.</div>'
    +'<div class="sess-btn-row"><button class="btn" id="sessReconnectBtn">Reconnect here</button></div></div>';
  document.body.appendChild(bg);
  KICK_OVERLAY=bg;
  const btn=bg.querySelector('#sessReconnectBtn');
  btn.addEventListener('click',()=>{
    if(btn.disabled)return;
    btn.disabled=true;btn.innerHTML='<span class="sess-spin"></span>Reconnecting…';
    DB.reconnectSession();
    setTimeout(()=>{if(btn&&document.body.contains(btn)&&btn.disabled){btn.disabled=false;btn.textContent='Reconnect here'}},8000);
  });
}
function hideKickOverlay(){
  if(!KICK_OVERLAY)return;
  const el=KICK_OVERLAY;KICK_OVERLAY=null;
  document.querySelectorAll('.sidebar,.app-shell,#settingsBtn,.composer,.tabs').forEach(el2=>el2&&(el2.style.pointerEvents='',el2.style.opacity=''));
  el.classList.add('closing');
  setTimeout(()=>{try{el.remove()}catch(_){}},260);
}

/* ---------- Owner live announcement banner ----------
   database.js calls this for every signed-in client when an owner sends an announcement (v={id,text,kind,by}).
   Non-blocking: sits at the top for ms milliseconds (<=10s) and can be dismissed early. */
let OWNANN_BANNER=null,OWNANN_TIMER=null;
function ownerAnnouncementBanner(v,ms){
  if(!v||typeof v.text!=='string')return;
  if(OWNANN_BANNER){clearTimeout(OWNANN_TIMER);try{OWNANN_BANNER.remove()}catch(_){}OWNANN_BANNER=null}
  const kind=['info','event','warn'].includes(v.kind)?v.kind:'info';
  const icon={info:'📢',event:'🎉',warn:'⚠️'}[kind];
  const el=document.createElement('div');
  el.className='ownann ownann-'+kind;el.setAttribute('role','alert');
  el.innerHTML='<span class="ownann-ic">'+icon+'</span><div class="ownann-body"><b>Announcement</b><div class="ownann-text"></div></div><button class="ownann-x" type="button" aria-label="Dismiss">✕</button>'
    +'<div class="ownann-bar" style="animation-duration:'+Math.max(1500,ms||10000)+'ms"></div>';
  el.querySelector('.ownann-text').textContent=v.text;      // textContent: never render announcement text as HTML
  document.body.appendChild(el);OWNANN_BANNER=el;
  try{if(typeof beep==='function')beep()}catch(_){}
  const close=()=>{if(OWNANN_BANNER!==el)return;clearTimeout(OWNANN_TIMER);OWNANN_BANNER=null;el.classList.add('closing');setTimeout(()=>{try{el.remove()}catch(_){}},260)};
  el.querySelector('.ownann-x').onclick=close;
  OWNANN_TIMER=setTimeout(close,Math.max(1500,ms||10000));
}

/* ---------- Owner "Reconnect everyone" prompt ----------
   Shown to every live client after an owner runs the online check. Everyone was set offline; pressing the
   button puts this account back online. Same look as the duplicate-client pause screen, different message. */
let RC_OVERLAY=null;
function onReconnectCheck(){
  if(RC_OVERLAY||KICK_OVERLAY)return;
  const bg=document.createElement('div');
  bg.className='modal-bg gc-overlay';bg.style.zIndex='99998';
  bg.innerHTML='<div class="modal gc-modal sess-modal"><div class="sess-ic">📡</div>'
    +'<h2>Online check</h2>'
    +'<div class="hint">An owner just reset everyone to offline to check who is really here. <b>If you\'re actually online, press Reconnect</b> to show as online again.</div>'
    +'<div class="sess-btn-row"><button class="btn" id="rcBtn">Reconnect</button></div></div>';
  document.body.appendChild(bg);RC_OVERLAY=bg;
  const btn=bg.querySelector('#rcBtn');
  btn.addEventListener('click',()=>{
    if(btn.disabled)return;btn.disabled=true;
    try{DB.confirmOnline()}catch(_){}
    const el=RC_OVERLAY;RC_OVERLAY=null;
    el.classList.add('closing');setTimeout(()=>{try{el.remove()}catch(_){}},260);
  });
}
