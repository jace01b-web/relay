/* ==========================================================================
 * js/ui/home.js
 * Main-menu buttons, sign-out, open chat, Global/Rooms/Announcements picker
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Home ---------- */
$('#goGlobal').onclick=()=>modalGlobalChoice();
$('#goDMs').onclick=()=>openChat('dms');
$('#goSettings').onclick=()=>openSettings(false);
$('#goGameHubs').onclick=()=>modalGameHubs();
$('#homeChip').onclick=()=>openAccount();
// Shared sign-out logic — called from the Account modal's Sign Out button.
async function doSignOut(){
  $('#modalRoot').innerHTML='';
  await DB.signOut();ME=null;lastCount={};_styleSig='';_styleApplySig='';   // both style caches, or the next sign-in skips re-applying
  // reset app-wide look on the sign-in screen
  const r=document.documentElement;['--ui-alpha','--ui-blur'].forEach(p=>r.style.removeProperty(p));
  paintBg($('#bgLayer'),$('#bgDimEl'),{bgType:'none'});
  show('authPage');
}
$('#backHome').onclick=()=>{view.roomKey=null;view.section=null;DB.watchMessages(null);$('#sidebar').classList.remove('open');goHome(true)};

/* ---------- Chat page ---------- */
function openChat(mode,section){
  view.mode=mode;view.section=section||null;view.pending=[];clearPendingFiles();renderPreviews();
  if(mode==='global'){
    if(section==='rooms'){
      const myRooms=DB.myRooms(ME.id);
      view.roomKey=myRooms.length?myRooms[0].id:null;
    }else if(section==='announcements'){
      view.roomKey=CFG.ANNOUNCEMENTS_ROOM;
    }else if(section==='shitpost'){
      view.roomKey=CFG.SHITPOST_ROOM;
    }else if(section==='vip'){
      view.roomKey=CFG.VIP_ROOM;
    }else if(section==='mvp'){
      view.roomKey=hasMvpPerks(ME.id)?CFG.MVP_ROOM:CFG.GLOBAL_ROOM;
    }else{
      view.roomKey=CFG.GLOBAL_ROOM;
    }
  }else{
    // Always land on Friends & Requests first when opening DMs — jumping
    // straight into whichever friend's chat used to be first felt random,
    // and buried the friend-request/add-friend flows people actually want.
    view.roomKey=null;view.dmView='friends';
  }
  DB.watchMessages(view.roomKey);
  show('chatPage');renderChat();bumpRoomSwitch();
  DB.ensureDmMemberships();
}
// Home screen "Itsukis Chat" tile: ask Global Chat vs Rooms instead of assuming Global Chat.
function modalGlobalChoice(){
  $('#modalRoot').innerHTML=`<div class="modal-bg gc-overlay" id="gcBg"><div class="modal gc-modal" style="max-width:760px;text-align:center">
    <div class="gc-grid">
    ${(()=>{
      const vi=DB.vipInfo(ME.id);
      const state=!vi?'🔒 Locked':(vi.kind==='perm'?'VIP forever':(vi.kind==='mvp'?'Free with MVP':(vi.kind==='owner'?'Owner access':'Ends in '+fmtDur(vi.until-(Date.now()+SKEW)))));
      const sub=vi?'Your members-only lounge is open.':'Members only. Win VIP from the Daily Spin to get in.';
      const sparks=Array.from({length:14},(_,i)=>`<i style="--x:${(i*37+11)%96}%;--y:${(i*53+7)%88}%;--s:${3+(i%3)*2}px;--d:${(2.4+(i%5)*.6).toFixed(1)}s;--t:${((i*0.37)%3).toFixed(2)}s"></i>`).join('');
      return `<div class="vip-hero${vi?' open':' locked'}">
      <button class="gc-card gc-vip" id="gcVip" type="button">
        <span class="vip-ring"></span><span class="vip-sheen"></span><span class="vip-sparks" aria-hidden="true">${sparks}</span>
        <span class="vip-gem">💎</span>
        <span class="vip-copy"><span class="vip-title">VIP Chat</span><span class="vip-sub">${sub}</span><span class="vip-state">${state}</span></span>
      </button>
      <button class="vip-spin" id="gcSpin" type="button">🎡 Daily Spin</button>
    </div>`})()}
      ${hasMvpPerks(ME.id)?(()=>{
        const sp=Array.from({length:18},(_,i)=>`<i style="--x:${(i*29+9)%94}%;--s:${2+(i%3)*2}px;--d:${(2.6+(i%5)*.55).toFixed(1)}s;--t:${((i*0.41)%3.2).toFixed(2)}s"></i>`).join('');
        return `<div class="mvp-hero"><button class="gc-card gc-mvp" id="gcMvp" type="button">
        <span class="mvp-aurora"></span><span class="mvp-ring"></span><span class="mvp-sheen"></span><span class="mvp-sparks" aria-hidden="true">${sp}</span>
        <span class="mvp-trophy"><span class="mvp-crown">👑</span>🏆</span>
        <span class="mvp-copy"><span class="mvp-kicker">★ Exclusive ★</span><span class="mvp-title">MVP Chat</span><span class="mvp-sub">The top room. Permanent, above everyone.</span>
          <span class="mvp-perks"><i>🖼 Banners</i><i>✍ ${CFG.MAX_MSG*CFG.MVP_MSG_MULT} chars</i><i>🎡 ${CFG.MVP_SPINS_PER_DAY} spins/day</i><i>💎 Free VIP</i></span></span>
        <span class="mvp-state">${isOwner(ME.id)?'Owner access':'MVP · Forever'}</span>
      </button></div>`})():''}
      <button class="gc-card gc-global" id="gcGlobal">
        <div class="gc-ic">🌐</div>
        <h3>Global Chat</h3>
      </button>
      <button class="gc-card gc-rooms" id="gcRooms">
        <div class="gc-ic">🚪</div>
        <h3>Rooms</h3>
      </button>
      <button class="gc-card gc-announcements" id="gcAnnouncements">
        <div class="gc-ic">📢</div>
        <h3>Announcements</h3>
        <span class="ann-badge" id="gcAnnBadge"></span>
      </button>
      <button class="gc-card gc-shitpost" id="gcShitpost" type="button">
        <div class="gc-ic">💩</div>
        <div class="gc-sp-copy"><h3>Shitpost</h3><span class="gc-sp-sub">Staff post the dumb stuff. Everyone can read.</span></div>
        <span class="ann-badge" id="gcShitBadge"></span>
      </button>
    </div>
  </div></div>`;
  refreshAnnPicker();
  const close=(after)=>{const bg=$('#gcBg');if(!bg){if(after)after();return}bg.classList.add('closing');setTimeout(()=>{if($('#modalRoot'))$('#modalRoot').innerHTML='';if(after)after()},240)};
  $('#gcBg').onclick=e=>{if(e.target.id==='gcBg')close()};
  $('#gcGlobal').onclick=()=>close(()=>openChat('global','global'));
  $('#gcRooms').onclick=()=>close(()=>openChat('global','rooms'));
  $('#gcAnnouncements').onclick=()=>close(()=>openChat('global','announcements'));
  $('#gcShitpost').onclick=()=>close(()=>openChat('global','shitpost'));
  $('#gcVip').onclick=()=>close(()=>openChat('global','vip'));
  if($('#gcMvp'))$('#gcMvp').onclick=()=>close(()=>openChat('global','mvp'));
  $('#gcSpin').onclick=()=>close(()=>openSpin());
}
