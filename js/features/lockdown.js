/* ==========================================================================
 * js/features/lockdown.js
 * LOCKDOWN MODE: while LOCKDOWN.ON is true, every signed-in user is redirected to one locked page:
 *     [ Announcements ]  [ Game Hubs & Tools ]  [ MVP Chat ]
 * Everything else (Global chat, rooms, DMs, VIP, spin, ...) is unreachable. Sign in / sign up, Settings
 * and the Account menu keep working. A 2-page "notice" popup explains why ("I understand" waits PAGE2_WAIT_SECONDS on page 2).
 *
 * TO TURN IT OFF AFTER THE SHUTDOWN: set  ON:false  below (and bump build-version in index.html).
 * Signed-out visitors are never affected - they just see the normal sign-in page.
 *
 * Hooks into: ui/navigation.js (show / goHome), ui/home.js (openChat), social/user-profile.js (openDmWith).
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * ========================================================================== */
'use strict';

const LOCKDOWN={
  ON:true,                       // <<< master switch
  OWNER_BYPASS:true,             // owners get a small "Owner: open full site" button (resets on reload)
  PAGE2_WAIT_SECONDS:5,          // how long "I understand" stays locked after page 2 opens
  DEADLINE:'October 28th',
  DISCORD:'@AniItsuki',
  GAMEPASS_URL:'https://www.roblox.com/game-pass/2039811188/45000-Because-Tax',
  GAMEPASS_ROBUX:'45,000'
};

const _lk={bypass:false,unsub:{},msgs:{},sig:{},marked:{},noticeShownThisLoad:false,denied:{},tab:'apps',q:'',col:'ann',built:false,
  react:{},reactUnsub:{},reply:{},edit:{},max:null,pending:{},files:{},dmKey:null,dmPeer:null,dmOpen:false};

/* Is the lockdown currently applying to THIS tab? (only for signed-in users; owners may bypass) */
function lockActive(){
  return !!(LOCKDOWN.ON&&typeof ME!=='undefined'&&ME&&!_lk.bypass);
}

/* ---------- entering / leaving the locked page ---------- */
function lockEnter(){
  try{DB.watchMessages(null)}catch(_){}          // drop any normal chat listener / presence
  lockBuild();
  lockRenderAll();
  lockWatch(CFG.ANNOUNCEMENTS_ROOM);
  lockWatch(CFG.MVP_ROOM);                         // everyone may READ MVP chat (the database rules decide if that's allowed)
  if(!_lk.noticeShownThisLoad){_lk.noticeShownThisLoad=true;lockOpenNotice(true)}
}
function lockLeave(){
  Object.keys(_lk.unsub).forEach(k=>{try{_lk.unsub[k]()}catch(_){}});
  _lk.unsub={};_lk.msgs={};_lk.sig={};_lk.marked={};_lk.denied={};_lk.noticeShownThisLoad=false;
  Object.keys(_lk.reactUnsub).forEach(k=>{try{_lk.reactUnsub[k]()}catch(_){}});
  _lk.reactUnsub={};_lk.react={};_lk.reply={};_lk.edit={};_lk.max=null;_lk.pending={};_lk.dmKey=null;_lk.dmPeer=null;_lk.dmOpen=false;
  lockCloseNotice(true);
}

/* ---------- live message listeners (one per room; the normal DB layer only watches one room at a time) ---------- */
function lockColOf(key){return key===CFG.ANNOUNCEMENTS_ROOM?'ann':(key===CFG.MVP_ROOM?'mvp':'dm')}
function lockWatchReactions(key){
  if(_lk.reactUnsub[key]||!ME)return;
  try{
    _lk.reactUnsub[key]=onValue(R('reactions/'+key),s=>{
      _lk.react[key]=s.val()||{};
      _lk.sig[lockColOf(key)]=null;       // force a repaint of that list
      lockRenderMsgs(key);
    },()=>{_lk.react[key]={};try{delete _lk.reactUnsub[key]}catch(_){}});
  }catch(_){}
}
function lockWatch(key){
  if(_lk.unsub[key]||!ME)return;
  lockWatchReactions(key);
  const q=query(R('messages/'+key),orderByChild('at'),limitToLast(60));
  _lk.unsub[key]=onValue(q,s=>{
    const arr=[];s.forEach(c=>{arr.push({...c.val(),id:c.key})});
    _lk.msgs[key]=arr.map(m=>({...m,images:m.images||[],files:m.files||[],pings:m.pings||[],text:m.text||''}));
    lockRenderMsgs(key);
    lockMarkRead(key);
  },err=>{console.warn('lockdown: messages denied',key,err&&err.code);_lk.msgs[key]=[];_lk.denied[key]=true;try{delete _lk.unsub[key]}catch(_){}if(key===CFG.MVP_ROOM)lockRenderMvpState();else lockRenderMsgs(key)});
}
function lockMarkRead(key){
  try{
    if(document.visibilityState!=='visible'||!ME)return;
    if(lockColOf(key)==='dm'&&!(_lk.dmOpen&&key===_lk.dmKey))return;
    const list=_lk.msgs[key]||[];
    const newest=list.length?Math.max.apply(null,list.map(m=>Number(m.at)||0)):0;
    if(!newest||newest<=(_lk.marked[key]||0))return;
    _lk.marked[key]=newest;
    set(R('lastRead/'+ME.id+'/'+key),newest).catch(()=>{});
  }catch(_){}
}
document.addEventListener('visibilitychange',()=>{if(view&&view.page==='lockPage')Object.keys(_lk.msgs).forEach(lockMarkRead)});

/* ---------- build the static skeleton (once) ---------- */
const LK_MAX_ICON='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
const LK_MIN_ICON='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';
function lockColHead(c,icon,title,sub){
  return `<div class="lk-col-h"><div class="lk-col-t"><span class="lk-col-ic">${icon}</span><b>${title}</b></div>
    <div class="lk-col-r">${sub}<button type="button" class="lk-max" data-max="${c}" title="Maximize" aria-label="Maximize ${title}">${LK_MAX_ICON}</button></div></div>`;
}
function lockBuild(){
  const root=document.getElementById('lockPage');if(!root)return;
  if(_lk.built){return}
  _lk.built=true;
  root.innerHTML=`
  <header class="lk-top">
    <div class="lk-brand"><span class="lk-logo">Itsukis Chat Hub</span><span class="lk-pill"><i class="lk-dot"></i>Limited mode</span></div>
    <div class="lk-top-r">
      <button class="btn sec small hidden" id="lkBypass" type="button" title="Owners only">🔓 <span class="lk-t">Owner: open full site</span></button>
      <button class="btn sec small hidden" id="lkDmBtn" type="button" title="MVP direct messages">💬 <span class="lk-t">MVP DMs</span></button>
      <button class="btn sec small" id="lkNoticeBtn" type="button">📢 <span class="lk-t">Read notice</span></button>
      <button class="btn sec small" id="lkSettings" type="button">⚙️ <span class="lk-t">Settings</span></button>
      <div class="userchip" id="lkChip"><div class="avatar" id="lkAv"></div><span id="lkName"></span></div>
    </div>
  </header>
  <div class="lk-strip" role="note">
    <span class="lk-strip-ic">🎃</span>
    <span class="lk-strip-tx">The site is on hold. Only <b>Announcements</b>, <b>MVP Chat</b> and <b>Hubs &amp; Tools</b> are open. If the Headless Horseman isn't bought by <b>${esc(LOCKDOWN.DEADLINE)}</b>, the site shuts down for good.</span>
    <button type="button" class="lk-strip-btn" id="lkStripBtn">Why?</button>
  </div>
  <nav class="lk-tabs" id="lkTabs" aria-label="Sections">
    <button type="button" data-col="ann" class="on">📢 Announcements</button>
    <button type="button" data-col="hub">🎮 Game Hubs</button>
    <button type="button" data-col="mvp">👑 MVP Chat</button>
  </nav>
  <main class="lk-grid" data-col="ann">
    <section class="lk-col lk-ann" data-c="ann">
      ${lockColHead('ann','📢','Announcements','<small>Read-only</small>')}
      <div class="lk-msgs" id="lkMsgs_ann"></div>
      <div class="lk-foot" id="lkFoot_ann"></div>
    </section>
    <section class="lk-col lk-hub" data-c="hub">
      ${lockColHead('hub','🎮','Game Hubs &amp; Tools','<small id="lkHubCount"></small>')}
      <div class="lk-hub-search"><input id="lkHubQ" type="text" placeholder="Search hubs, apps, tools…" autocomplete="off" spellcheck="false"></div>
      <div class="lk-hub-tabs" id="lkHubTabs"></div>
      <div class="lk-hub-list" id="lkHubList"></div>
    </section>
    <section class="lk-col lk-mvp" data-c="mvp">
      ${lockColHead('mvp','👑','MVP Chat','<small id="lkMvpSub"></small>')}
      <div class="lk-msgs" id="lkMsgs_mvp"></div>
      <div class="lk-foot" id="lkFoot_mvp"></div>
    </section>
  </main>
  <aside class="lk-dm" id="lkDm" aria-label="MVP direct messages">
    <div class="lk-col lk-dmcol">
      <div class="lk-col-h"><div class="lk-col-t"><button type="button" class="lk-max hidden" id="lkDmBack" title="Back" aria-label="Back">←</button><span class="lk-col-ic">💬</span><b id="lkDmTitle">MVP DMs</b></div>
        <div class="lk-col-r"><button type="button" class="lk-max" id="lkDmClose" title="Close" aria-label="Close">✕</button></div></div>
      <div class="lk-dm-list" id="lkDmList"></div>
      <div class="lk-dm-chat hidden" id="lkDmChat"><div class="lk-msgs" id="lkMsgs_dm"></div><div class="lk-foot" id="lkFoot_dm"></div></div>
    </div>
  </aside>`;
  document.getElementById('lkChip').onclick=()=>openAccount();
  document.getElementById('lkSettings').onclick=()=>openSettings(false);
  document.getElementById('lkNoticeBtn').onclick=()=>lockOpenNotice(false);
  document.getElementById('lkDmBtn').onclick=()=>lockToggleDm();
  document.getElementById('lkStripBtn').onclick=()=>lockOpenNotice(false);
  document.getElementById('lkBypass').onclick=()=>{
    if(!isOwner(ME.id))return;
    _lk.bypass=true;lockLeave();goHome(true);
    toast('Owner bypass on for this tab. Reload to lock again.');
  };
  document.getElementById('lkTabs').addEventListener('click',e=>{
    const b=e.target.closest('button[data-col]');if(!b)return;
    _lk.col=b.dataset.col;lockSyncTabs();
  });
  // maximize: the clicked column floats over the other two (not full screen)
  root.querySelector('.lk-grid').addEventListener('click',e=>{
    const b=e.target.closest('button[data-max]');if(!b)return;
    lockToggleMax(b.dataset.max);
  });
  root.querySelectorAll('.lk-col-h').forEach(h=>h.addEventListener('dblclick',e=>{
    if(e.target.closest('button'))return;
    lockToggleMax(h.parentNode.dataset.c);
  }));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&_lk.max&&view&&view.page==='lockPage'&&!_lkN&&!document.querySelector('.emoji-pop')&&!(document.getElementById('modalRoot')||{}).innerHTML)lockToggleMax(null);
  });
  const q=document.getElementById('lkHubQ');
  q.oninput=()=>{_lk.q=q.value.trim().toLowerCase();lockRenderHubs()};
  lockBuildComposer('ann');lockBuildComposer('mvp');lockBuildComposer('dm');
  document.getElementById('lkDmClose').onclick=()=>lockToggleDm(false);
  document.getElementById('lkDmBack').onclick=()=>lockDmBack();
}
function lockToggleMax(c){
  _lk.max=(c&&_lk.max!==c)?c:null;
  lockApplyMax();
}
function lockApplyMax(){
  const g=document.querySelector('#lockPage .lk-grid');if(!g)return;
  g.classList.toggle('has-max',!!_lk.max);
  g.querySelectorAll('.lk-col').forEach(col=>{
    const on=col.dataset.c===_lk.max;
    col.classList.toggle('max',on);
    const b=col.querySelector('.lk-max');
    if(b){b.innerHTML=on?LK_MIN_ICON:LK_MAX_ICON;b.title=on?'Restore':'Maximize';b.setAttribute('aria-pressed',on?'true':'false')}
  });
  ['ann','mvp'].forEach(c=>{const box=document.getElementById('lkMsgs_'+c);if(box)box.scrollTop=box.scrollHeight});
}
function lockSyncTabs(){
  const g=document.querySelector('#lockPage .lk-grid');if(g)g.dataset.col=_lk.col;
  document.querySelectorAll('#lkTabs button').forEach(b=>b.classList.toggle('on',b.dataset.col===_lk.col));
}

/* ---------- composers (announcements: owner only. MVP chat: MVP / owner) ---------- */
function lockRoomKey(c){return c==='ann'?CFG.ANNOUNCEMENTS_ROOM:(c==='dm'?_lk.dmKey:CFG.MVP_ROOM)}
function lockCanPost(c){
  if(!ME)return false;
  if(c==='ann')return isOwner(ME.id);
  if(c==='dm')return !!(_lk.dmKey&&_lk.dmPeer&&hasMvpPerks(ME.id)&&hasMvpPerks(_lk.dmPeer)&&DB.isFriend(ME.id,_lk.dmPeer)&&!DB.isBlocked(ME.id,_lk.dmPeer)&&!DB.isBlockedBy(ME.id,_lk.dmPeer));
  return hasMvpPerks(ME.id);
}
function lockBuildComposer(c){
  const foot=document.getElementById('lkFoot_'+c);if(!foot)return;
  foot.innerHTML=`<div class="lk-note hidden" id="lkNote_${c}"></div>
    <div class="compose-context" id="lkCtx_${c}">
      <div class="cc-bar"></div>
      <div class="cc-body"><div class="cc-label" id="lkCtxL_${c}"></div><div class="cc-text" id="lkCtxT_${c}"></div></div>
      <button class="cc-close" id="lkCtxX_${c}" type="button" title="Cancel">✕</button>
    </div>
    <div class="previews lk-imgprev" id="lkPrev_${c}"></div>
    <div class="lk-row" id="lkRow_${c}">
      <button class="icon-btn lk-attach" id="lkAtt_${c}" type="button" title="Attach images, GIFs, videos or files" aria-label="Upload">🖼️</button>
      <input type="file" id="lkFile_${c}" accept="image/*,video/*,audio/*,text/*,.txt,.md,.log,.csv,.json,.js,.ts,.py,.java,.c,.cpp,.cs,.html,.css,.xml,.yml,.yaml,.pdf,.zip,.7z,.rar,.doc,.docx,.xls,.xlsx,.ppt,.pptx" multiple hidden>
      <button class="icon-btn lk-emoji" id="lkEmo_${c}" type="button" title="Insert emoji">😊</button>
      <textarea id="lkIn_${c}" rows="1" placeholder="Message…" autocomplete="off"></textarea>
      <button class="send" id="lkSend_${c}" type="button" aria-label="Send">➤</button>
    </div>`;
  const ta=document.getElementById('lkIn_'+c),btn=document.getElementById('lkSend_'+c);
  ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px'});
  ta.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();lockSend(c)}
    if(e.key==='Escape'&&(_lk.reply[c]||_lk.edit[c])){e.stopPropagation();lockCancelCompose(c)}
  });
  btn.onclick=()=>lockSend(c);
  document.getElementById('lkCtxX_'+c).onclick=()=>lockCancelCompose(c);
  const fi=document.getElementById('lkFile_'+c);
  document.getElementById('lkAtt_'+c).onclick=()=>{if(!ta.disabled)fi.click()};
  fi.onchange=async e=>{const files=[...e.target.files];e.target.value='';await lockAddImages(c,files)};
  ta.addEventListener('paste',async e=>{
    const files=[...(e.clipboardData&&e.clipboardData.files||[])];
    if(!files.length)return;e.preventDefault();await lockAddImages(c,files);
  });
  document.getElementById('lkEmo_'+c).onclick=e=>{
    e.stopPropagation();
    openEmojiPicker(e.currentTarget,em=>{
      if(ta.disabled)return;
      const a=ta.selectionStart==null?ta.value.length:ta.selectionStart,b=ta.selectionEnd==null?a:ta.selectionEnd;
      ta.value=ta.value.slice(0,a)+em+ta.value.slice(b);
      const np=a+em.length;ta.focus();try{ta.setSelectionRange(np,np)}catch(_){}
      ta.dispatchEvent(new Event('input'));
    });
  };
}
async function lockAddImages(c,files){
  const list=_lk.pending[c]=_lk.pending[c]||[];
  const bag=_lk.files[c]=_lk.files[c]||[];
  for(const f of files){
    const kind=FILES.kindOf(f);
    if(kind!=='image'){FILES.add(f,bag,()=>lockRenderPrev(c));continue}   // gif / video / audio / text / other -> Firebase Storage
    if(list.length>=CFG.MAX_IMAGES){toast(`Max ${CFG.MAX_IMAGES} images per message.`,'bad');break}
    if(f.size>CFG.MAX_IMG_BYTES){toast(`${f.name} is too large (max 8MB).`,'bad');continue}
    try{list.push(await compressImage(f))}catch(err){toast(err.message||`${f.name} could not be processed.`,'bad')}
  }
  lockRenderPrev(c);
}
function lockRenderPrev(c){
  const p=document.getElementById('lkPrev_'+c);if(!p)return;
  p.innerHTML='';
  (_lk.pending[c]||[]).forEach((src,i)=>{
    const d=document.createElement('div');d.className='pv';
    d.innerHTML=`<img src="${src}"><button type="button">✕</button>`;
    d.querySelector('button').onclick=()=>{_lk.pending[c].splice(i,1);lockRenderPrev(c)};
    p.appendChild(d);
  });
  FILES.renderChips(p,_lk.files[c]||[],()=>lockRenderPrev(c));
}
function lockCancelCompose(c){
  const wasEdit=!!_lk.edit[c];
  _lk.reply[c]=null;_lk.edit[c]=null;
  const ta=document.getElementById('lkIn_'+c);
  if(wasEdit&&ta){ta.value='';ta.style.height='auto'}
  lockRenderCtx(c);
}
function lockRenderCtx(c){
  const box=document.getElementById('lkCtx_'+c);if(!box)return;
  const key=lockRoomKey(c),rp=_lk.reply[c],ed=_lk.edit[c];
  if(ed){
    box.classList.add('active');
    document.getElementById('lkCtxL_'+c).textContent='Editing message';
    document.getElementById('lkCtxT_'+c).textContent='';
  }else if(rp){
    const s=DB.getUser(rp.senderId);
    const name=(s&&!s.deleted)?displayUsername(s.username):'Deleted User';
    const src=(_lk.msgs[key]||[]).find(x=>x.id===rp.id);
    box.classList.add('active');
    document.getElementById('lkCtxL_'+c).textContent='Replying to '+name;
    document.getElementById('lkCtxT_'+c).textContent=src?lockPreview(src):'';
  }else box.classList.remove('active');
}
function lockPreview(m){
  if(m.text)return m.text;
  if(m.images&&m.images.length)return '📷 '+m.images.length+' image'+(m.images.length===1?'':'s');
  if(m.files&&m.files.length)return filesLabel(m.files);
  return '';
}
function lockSyncComposer(c){
  const foot0=document.getElementById('lkFoot_'+c);
  const row=document.getElementById('lkRow_'+c),note=document.getElementById('lkNote_'+c),ta=document.getElementById('lkIn_'+c),btn=document.getElementById('lkSend_'+c),emo=document.getElementById('lkEmo_'+c);
  if(!row||!ME)return;
  let reason='';
  if(!lockCanPost(c))reason=c==='ann'?'📢 Only the owner can post announcements.':(c==='dm'?(_lk.dmKey?'💬 You can only DM friends who are also MVP (open their profile to add them).':'Pick someone from the list.'):'👑 Read-only — only MVPs can chat here.');
  else if(DB.isBanned(ME.id))reason='🚫 Your account is banned — you can read but not send.';
  else if(DB.isMuted(ME.id))reason='🔇 You are muted right now.';
  else{
    let t=null;try{t=(typeof chatBlockReason==='function')?chatBlockReason():null}catch(_){}
    if(t&&t!=='Checking your account…')reason='⚠️ '+t;
  }
  const canType=lockCanPost(c)&&!reason;
  row.classList.toggle('hidden',!lockCanPost(c));
  if(foot0)foot0.classList.remove('hidden');
  if(ta){ta.disabled=!canType;if(c!=='ann')ta.maxLength=maxMsgFor(ME.id);ta.placeholder=c==='ann'?'Post an announcement…':(c==='dm'?'Message…':'Message the MVP lounge…')}
  const att=document.getElementById('lkAtt_'+c);if(att)att.disabled=!canType;
  if(btn)btn.disabled=!canType;
  if(emo)emo.disabled=!canType;
  if(note){note.textContent=reason;note.classList.toggle('hidden',!reason)}
  if(!lockCanPost(c)){_lk.reply[c]=null;_lk.edit[c]=null}
  lockRenderCtx(c);
}
async function lockSend(c){
  const ta=document.getElementById('lkIn_'+c),btn=document.getElementById('lkSend_'+c);
  if(!ta||!ME||ta.disabled)return;
  const key=lockRoomKey(c);
  const limit=c==='ann'?Infinity:maxMsgFor(ME.id);
  const text=((typeof expandShortcodes==='function')?expandShortcodes(ta.value.trim()):ta.value.trim()).slice(0,limit);
  const imgs=(_lk.pending[c]||[]).slice();
  const fbag=_lk.files[c]||[];
  if(!text&&!imgs.length&&!fbag.length)return;
  if(!_lk.edit[c]){const pr=FILES.sendProblem(fbag);if(pr){toast(pr,'bad');return}}
  btn.disabled=true;
  try{
    if(fbag.length&&!_lk.edit[c]&&await FILES.anyFlagged(fbag)){
      FILES.discard(fbag);lockRenderPrev(c);
      try{DB.selfMuteNsfw().catch(()=>{})}catch(_){}
      toast('File blocked: NSFW content isn\'t allowed. You are muted for 1 hour.','bad');
      return;
    }
    if(imgs.length&&!_lk.edit[c]&&typeof NSFW!=='undefined'&&NSFW.on()){
      toast('Checking image'+(imgs.length===1?'':'s')+'…');
      let bad=false;try{bad=await NSFW.anyFlagged(imgs)}catch(_){}
      if(bad){
        _lk.pending[c]=[];lockRenderPrev(c);
        try{DB.selfMuteNsfw().catch(()=>{})}catch(_){}
        toast('Image blocked: NSFW content isn\'t allowed. You are muted for 1 hour.','bad');
        return;
      }
    }
    if(_lk.edit[c]){
      const id=_lk.edit[c].id;
      await DB.editMessage(key,id,text);
      _lk.edit[c]=null;
    }else{
      const rp=_lk.reply[c];
      const replyTo=rp?{id:rp.id,senderId:rp.senderId,preview:lockPreview((_lk.msgs[key]||[]).find(x=>x.id===rp.id)||{})}:null;
      const sent=FILES.payload(fbag);
      try{await DB.sendMessage(key,{senderId:ME.id,text,images:imgs,files:sent,pings:[],replyTo})}
      catch(err){FILES.deleteUrls(sent);fbag.length=0;lockRenderPrev(c);throw err}
      _lk.reply[c]=null;_lk.pending[c]=[];_lk.files[c]=[];lockRenderPrev(c);
    }
    ta.value='';ta.style.height='auto';
    _lk.sig[c]=null;lockRenderMsgs(key);
    const box=document.getElementById('lkMsgs_'+c);if(box)box.scrollTop=box.scrollHeight;
  }catch(e){toast(e&&e.message||'Could not send','bad')}
  finally{lockSyncComposer(c);ta.focus()}
}

/* ---------- message lists (same look + hover tools as the normal chat) ---------- */
function lockCanDelete(m){
  if(!ME)return false;
  return m.senderId===ME.id||isOwner(ME.id)||(isAdmin(ME.id)&&!isOwner(m.senderId))||(isMod(ME.id)&&!isOwner(m.senderId)&&!isAdmin(m.senderId));
}
const _lkFi=(d,eo)=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path${eo?' fill-rule="evenodd" clip-rule="evenodd"':''} d="${d}"/></svg>`;
const LK_IC={
  reply:_lkFi('M10 9V5l-8 7 8 7v-4c5 0 8.5 1.5 11 5-1-6-4.5-11-11-11z'),
  react:_lkFi('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8.5 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM7 14h10a5 5 0 0 1-10 0z',1),
  copy:_lkFi('M16 1H6a3 3 0 0 0-3 3v12h2V4a1 1 0 0 1 1-1h10V1zm3 4H10a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3z'),
  edit:_lkFi('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'),
  del:_lkFi('M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z')
};
function lockReactions(key,msgId){
  const raw=(_lk.react[key]||{})[msgId];if(!raw)return[];
  return Object.keys(raw).map(emoji=>{
    const ids=Object.keys(raw[emoji]||{}).map(Number);
    return{emoji,ids,mine:ME?ids.includes(ME.id):false};
  }).filter(r=>r.ids.length>0);
}
async function lockToggleReaction(key,msgId,emoji){
  if(!ME)return;
  if(DB.isBanned(ME.id)){toast('Your account has been banned.','bad');return}
  const c=lockColOf(key);
  const already=!!((((_lk.react[key]||{})[msgId]||{})[emoji]||{})[ME.id]);
  _lk.react[key]=_lk.react[key]||{};
  const mm=_lk.react[key][msgId]=_lk.react[key][msgId]||{};
  const ee=mm[emoji]=mm[emoji]||{};
  if(already)delete ee[ME.id];else ee[ME.id]=true;
  _lk.sig[c]=null;lockRenderMsgs(key);
  try{
    const r=R('reactions/'+key+'/'+msgId+'/'+emoji+'/'+ME.id);
    if(already)await remove(r);else await set(r,true);
  }catch(e){
    // roll back
    if(already)ee[ME.id]=true;else delete ee[ME.id];
    _lk.sig[c]=null;lockRenderMsgs(key);
    toast('Could not react'+(e&&e.code==='PERMISSION_DENIED'?' (not allowed here)':''),'bad');
  }
}
function lockReactionRow(key,msgId){
  const list=lockReactions(key,msgId);
  if(!list.length)return'';
  const pills=list.map(r=>{
    const names=r.ids.map(id=>{const u=DB.getUser(id);return(u&&!u.deleted)?displayUsername(u.username):'Deleted User'});
    const who=names.length<=6?names.join(', '):names.slice(0,6).join(', ')+' and '+(names.length-6)+' more';
    return`<button class="reaction-pill${r.mine?' mine':''}" data-emoji="${esc(r.emoji)}" title="${esc(who)}"><span class="rp-emoji">${esc(r.emoji)}</span><span class="rp-count">${r.ids.length}</span></button>`;
  }).join('');
  return`<div class="reactions-row">${pills}<button class="reaction-pill reaction-add" data-add-reaction title="Add reaction">+</button></div>`;
}
function lockReplyRef(key,m){
  const rt=m.replyTo;if(!rt||!rt.id)return'';
  const list=_lk.msgs[key]||[];
  const src=list.find(x=>x.id===rt.id);
  let gone=false,text='';
  if(src)text=lockPreview(src);
  else if(list.length&&rt.id>=list[0].id)gone=true;       // would be inside the loaded window, so it was deleted
  else text=rt.preview||'';
  if(gone)return`<div class="reply-ref gone"><svg class="rr-elbow" viewBox="0 0 20 12"><path d="M2 0 v4 a6 6 0 0 0 6 6 h10"/></svg><span class="rr-text">Deleted Message</span></div>`;
  const rs=DB.getUser(rt.senderId);
  const rname=(rs&&!rs.deleted)?displayUsername(rs.username):'Deleted User';
  const rav=avatarHtml(rs,rname,'width:15px;height:15px;font-size:8px');
  return`<div class="reply-ref" data-reply-jump="${esc(rt.id)}"><svg class="rr-elbow" viewBox="0 0 20 12"><path d="M2 0 v4 a6 6 0 0 0 6 6 h10"/></svg><span class="rr-avatar">${rav}</span><span class="rr-name">${esc(rname)}</span><span class="rr-text">${esc(String(text).replace(/\s+/g,' ').trim().slice(0,200))}</span></div>`;
}
function lockMsgEl(c,key,m,prev){
  const mine=m.senderId===ME.id;
  const sender=DB.getUser(m.senderId);
  const name=(sender&&!sender.deleted)?displayUsername(sender.username):'Deleted User';
  const clickable=!!(sender&&!sender.deleted);
  const pinged=(m.pings||[]).includes(ME.id)||(m.pings||[]).includes('everyone');
  const el=document.createElement('div');
  el.className='msg'+(mine?' me':'')+(pinged?' ping-row':'');el.dataset.msgId=m.id;
  const time=new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const av=avatarHtml(sender,name,'width:46px;height:46px;font-size:17px');
  const avEl=clickable?`<span data-open-profile="${m.senderId}" style="cursor:pointer">${av}</span>`:av;
  const nameSpan=clickable?`<span data-open-profile="${m.senderId}" style="cursor:pointer">${fullNameHTML(m.senderId,esc(name))}</span>`:esc(name);
  const nameHTML=mine?'':nameSpan+'<span class="nm-sep">·</span>';
  const nameAfter=mine?'<span class="nm-sep">·</span>'+nameSpan:'';
  const canPost=lockCanPost(c);
  const canEdit=mine&&!!m.text&&canPost;
  const btns=[];
  if(m.text)btns.push(`<button data-copy-btn title="Copy message">${LK_IC.copy}</button>`);
  if(canPost)btns.push(`<button data-reply-btn title="Reply">${LK_IC.reply}</button>`);
  btns.push(`<button data-react-btn title="Add reaction">${LK_IC.react}</button>`);
  if(canEdit)btns.push(`<button data-edit-btn title="Edit message">${LK_IC.edit}</button>`);
  if(lockCanDelete(m))btns.push(`<button data-del title="Delete message" class="hb-danger">${LK_IC.del}</button>`);
  const edited=(m.editedAt&&m.text)?'<span class="edited-tag">(edited)</span>':'';
  let bStyle='';
  if(!mine){
    const ss=sender&&sender.settings;
    try{bStyle=` style="background:${hexToRgba(safeColor(ss&&ss.meBubble,'#7c6cff'),.5)};color:${safeColor(ss&&ss.meText,'#ffffff')}"`}catch(_){}
  }
  el.innerHTML=`${lockReplyRef(key,m)}<div class="msg-row">${avEl}<div class="msg-body"><div class="meta">${nameHTML}${time}${edited}${isShownOwner(m.senderId)?' <span class="tag owner">#'+m.senderId+'</span>':''}${nameAfter}</div>
    <div class="bubble${(!m.text&&((m.images&&m.images.length)||(m.files&&m.files.length)))?' img-only':''}${(typeof isEmojiOnly==='function'&&isEmojiOnly(m.text))?' jumbo-emoji':''}"${bStyle}><div class="msg-hover-bar">${btns.join('')}</div>${fmtText(displayMsgText(m.text))}${imagesHTML(m.images)}${filesHTML(m.files)}</div>${lockReactionRow(key,m.id)}</div></div>`;
  // Discord-look grouping: same person within 7 minutes collapses under one name/avatar
  el._sid=m.senderId;el._at=m.at;
  if(typeof DiscordLook!=='undefined'&&DiscordLook.on()&&prev&&prev.classList&&prev.classList.contains('msg')&&prev._sid===m.senderId&&m.at-prev._at<420000&&!(m.replyTo&&m.replyTo.id))el.classList.add('dl-cont');
  // wiring
  el.querySelectorAll('[data-open-profile]').forEach(p=>{p.onclick=()=>openUserProfile(Number(p.dataset.openProfile))});
  el.querySelectorAll('.imgs img').forEach((img,i)=>{img.onclick=()=>openLightbox(m.images,i)});
  el.querySelectorAll('.reaction-pill[data-emoji]').forEach(p=>{p.onclick=ev=>{ev.stopPropagation();lockToggleReaction(key,m.id,p.dataset.emoji)}});
  const openPick=btn=>btn.onclick=ev=>{ev.stopPropagation();openEmojiPicker(btn,em=>lockToggleReaction(key,m.id,em))};
  const rb=el.querySelector('[data-react-btn]');if(rb)openPick(rb);
  const ab=el.querySelector('[data-add-reaction]');if(ab)openPick(ab);
  const cb=el.querySelector('[data-copy-btn]');
  if(cb)cb.onclick=ev=>{ev.stopPropagation();copyText(displayMsgText(m.text)).then(ok=>toast(ok?'Message copied':'Couldn\'t copy — select the text and copy manually',ok?'':'bad'))};
  const rpb=el.querySelector('[data-reply-btn]');
  if(rpb)rpb.onclick=()=>{
    _lk.edit[c]=null;_lk.reply[c]={id:m.id,senderId:m.senderId};
    const ta=document.getElementById('lkIn_'+c);
    lockRenderCtx(c);if(ta&&!ta.disabled)ta.focus();
  };
  const eb=el.querySelector('[data-edit-btn]');
  if(eb)eb.onclick=()=>{
    _lk.reply[c]=null;_lk.edit[c]={id:m.id};
    const ta=document.getElementById('lkIn_'+c);
    if(ta){ta.value=m.text||'';ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px';ta.focus()}
    lockRenderCtx(c);
  };
  const db=el.querySelector('[data-del]');
  if(db)db.onclick=ev=>{ev.stopPropagation();modalDeleteMessageConfirm(key,m)};
  const jp=el.querySelector('[data-reply-jump]');
  if(jp)jp.onclick=()=>{
    const t=document.getElementById('lkMsgs_'+c).querySelector(`[data-msg-id="${CSS.escape(jp.dataset.replyJump)}"]`);
    if(!t){toast('That message isn\'t loaded here.');return}
    t.scrollIntoView({behavior:'smooth',block:'center'});
    t.classList.add('pinned-flash');setTimeout(()=>t.classList.remove('pinned-flash'),1200);
  };
  return el;
}
function lockVisible(key){
  return(_lk.msgs[key]||[]).filter(m=>{
    const s=DB.getUser(m.senderId);
    if(s&&s.deleted)return false;
    if(m.senderId===ME.id)return true;
    try{if(DB.isBlocked(ME.id,m.senderId)||DB.isBlockedBy(ME.id,m.senderId))return false}catch(_){}
    return true;
  });
}
function lockRenderMsgs(key){
  if(!ME||view.page!=='lockPage')return;
  const c=lockColOf(key);
  if(c==='dm'&&key!==_lk.dmKey)return;
  const box=document.getElementById('lkMsgs_'+c);if(!box)return;
  if(box.dataset.locked==='1')return;               // showing the 'can't load' card instead
  const list=lockVisible(key);
  // skip rebuilds when nothing visible changed (this runs on every database tick)
  const sig=list.map(m=>{
    const u=DB.getUser(m.senderId)||{};
    const rx=lockReactions(key,m.id).map(r=>r.emoji+':'+r.ids.join(',')).join('|');
    return m.id+'|'+(m.editedAt||0)+'|'+m.text.length+'|'+(u.username||'')+'|'+((u.settings||{}).avatar||'').length+'|'+rx+'|'+(m.replyTo?m.replyTo.id:'')+'|'+(lockCanPost(c)?1:0);
  }).join(';');
  if(_lk.sig[c]===sig)return;
  _lk.sig[c]=sig;
  const stick=box.scrollHeight-box.scrollTop-box.clientHeight<140||!box.childElementCount;
  box.innerHTML='';
  if(!list.length){box.innerHTML=`<div class="lk-empty">${c==='ann'?'No announcements yet.':'No messages yet — say '+(c==='dm'?'hi!':'something!')}</div>`}
  else{
    let lastDay=null,prev=null;
    list.forEach(m=>{
      const day=new Date(m.at).toDateString();
      if(day!==lastDay){lastDay=day;const d=document.createElement('div');d.className='date-sep';d.textContent=day;box.appendChild(d);prev=null}
      const el=lockMsgEl(c,key,m,prev);box.appendChild(el);prev=el;
    });
  }
  lockRenderCtx(c);
  if(stick)box.scrollTop=box.scrollHeight;
}

/* ---------- MVP column: locked card for non-MVPs ---------- */
function lockRenderMvpState(){
  const box=document.getElementById('lkMsgs_mvp'),sub=document.getElementById('lkMvpSub');
  if(!box||!ME)return;
  const ok=hasMvpPerks(ME.id);
  if(sub)sub.textContent=ok?(isOwner(ME.id)&&!isMvp(ME.id)?'Owner access':'MVP lounge'):'Read-only';
  lockSyncComposer('mvp');
  if(!_lk.denied.mvp){
    // everyone can read; only MVPs / owners get the composer (lockSyncComposer)
    if(box.dataset.locked==='1'){box.dataset.locked='';_lk.sig.mvp=null;box.innerHTML=''}
    lockWatch(CFG.MVP_ROOM);
    lockRenderMsgs(CFG.MVP_ROOM);
    return;
  }
  // the database refused the read (non-MVP + rules say no): fall back to a locked card
  if(box.dataset.locked==='1')return;
  box.dataset.locked='1';
  box.innerHTML=`<div class="lk-locked"><div class="lk-locked-ic">👑</div><h3>MVP Chat</h3>
    <p>This lounge is for <b>MVPs</b> (and the owner). MVP is a permanent rank, and it's included in the Headless Horseman deal.</p>
    <button class="btn small" id="lkMvpDeal" type="button">See the deal</button></div>`;
  const d=document.getElementById('lkMvpDeal');if(d)d.onclick=()=>lockOpenNotice(false,2);
}

/* ---------- MVP DMs: a slide-over panel. Only MVPs/owners see it, only other MVPs are listed, and you start a chat
   from the person's PROFILE card (its Message button calls openDmWith -> lockOpenDm). ---------- */
function lockMvpPeople(){
  const ids=new Set(DB.mvpIds());
  Object.keys(OWNERS_CACHE||{}).forEach(k=>{if(OWNERS_CACHE[k]===1)ids.add(Number(k))});
  ids.delete(ME.id);
  return[...ids].filter(id=>{
    const u=DB.getUser(id);if(u&&u.deleted)return false;
    try{if(DB.isBlocked(ME.id,id)||DB.isBlockedBy(ME.id,id))return false}catch(_){}
    return true;
  });
}
function lockToggleDm(force){
  if(!ME||!hasMvpPerks(ME.id)){return}
  _lk.dmOpen=(typeof force==='boolean')?force:!_lk.dmOpen;
  const d=document.getElementById('lkDm');if(d)d.classList.toggle('open',_lk.dmOpen);
  if(_lk.dmOpen){if(_lk.dmKey)lockRenderMsgs(_lk.dmKey);else lockRenderDmList()}
}
function lockRenderDmList(){
  const box=document.getElementById('lkDmList');if(!box||!ME)return;
  const on=new Set((function(){try{return DB.onlineIds()}catch(_){return[]}})().map(Number));
  const ids=lockMvpPeople().sort((a,b)=>(on.has(b)-on.has(a))||a-b);
  box.innerHTML=`<div class="lk-dm-hint">Only MVPs are listed here. Tap a person to open their profile, then press <b>Message</b>. You have to be friends first.</div>`+
    (ids.length?ids.map(id=>{
      const u=DB.getUser(id);
      const name=(u&&!u.deleted)?displayUsername(u.username):'User '+id;
      let fr=false;try{fr=DB.isFriend(ME.id,id)}catch(_){}
      return`<div class="list-row lk-dm-row" data-id="${id}">
        <span class="lk-dm-av">${avatarHtml(u,name,'width:36px;height:36px;font-size:14px')}<i class="lk-on${on.has(id)?' y':''}"></i></span>
        <div class="nm"><div class="lk-dm-nm">${fullNameHTML(id,esc(name))}</div><div class="lk-dm-sub">${fr?'Friends':'Not friends yet'}${on.has(id)?' · online':''}</div></div>
        <div class="hub-arrow">›</div></div>`}).join(''):'<div class="lk-empty">No other MVPs yet.</div>');
  box.querySelectorAll('.lk-dm-row').forEach(r=>r.onclick=()=>openUserProfile(Number(r.dataset.id)));
}
function lockDmBack(){
  _lk.dmKey=null;_lk.dmPeer=null;_lk.sig.dm=null;_lk.reply.dm=null;_lk.edit.dm=null;_lk.pending.dm=[];lockRenderPrev('dm');
  const ta=document.getElementById('lkIn_dm');if(ta){ta.value='';ta.style.height='auto'}
  lockDmShow();
}
function lockDmShow(){
  const chat=!!_lk.dmKey;
  const l=document.getElementById('lkDmList'),c=document.getElementById('lkDmChat'),b=document.getElementById('lkDmBack'),t=document.getElementById('lkDmTitle');
  if(l)l.classList.toggle('hidden',chat);if(c)c.classList.toggle('hidden',!chat);if(b)b.classList.toggle('hidden',!chat);
  if(t){
    if(chat){const u=DB.getUser(_lk.dmPeer);t.textContent=(u&&!u.deleted)?displayUsername(u.username):'Direct message'}
    else t.textContent='MVP DMs';
  }
  if(!chat)lockRenderDmList();
}
// called from openDmWith() (social/user-profile.js) while the lockdown is on
async function lockOpenDm(id){
  id=Number(id);
  if(!ME||id===ME.id)return false;
  if(!hasMvpPerks(ME.id)||!hasMvpPerks(id)){toast('During limited mode you can only DM other MVPs.','bad');return false}
  if(!DB.isFriend(ME.id,id)){toast('You can only message friends. Send a friend request first.','bad');return false}
  if(DB.isBlocked(ME.id,id)||DB.isBlockedBy(ME.id,id)){toast('You can\'t message this user.','bad');return false}
  try{await DB.ensureDmMemberships()}catch(_){}
  const key=DB.dmKey(ME.id,id);
  _lk.dmKey=key;_lk.dmPeer=id;_lk.sig.dm=null;_lk.reply.dm=null;_lk.edit.dm=null;_lk.pending.dm=[];lockRenderPrev('dm');
  const ta=document.getElementById('lkIn_dm');if(ta){ta.value='';ta.style.height='auto'}
  lockWatch(key);
  _lk.dmOpen=true;
  const d=document.getElementById('lkDm');if(d)d.classList.add('open');
  lockDmShow();lockSyncComposer('dm');lockRenderMsgs(key);
  const box=document.getElementById('lkMsgs_dm');if(box)box.scrollTop=box.scrollHeight;
  return true;
}

/* ---------- Hubs & Tools (reuses the site's own hub list + launcher) ---------- */
function lockRenderHubs(){
  const tabs=document.getElementById('lkHubTabs'),list=document.getElementById('lkHubList'),cnt=document.getElementById('lkHubCount');
  if(!tabs||!list||typeof CUSTOM_HUBS==='undefined')return;
  const q=_lk.q;
  const match=h=>!q||h.name.toLowerCase().includes(q)||(h.desc||'').toLowerCase().includes(q)||(h.group||'').toLowerCase().includes(q);
  const counts={};CUSTOM_HUBS.forEach(h=>{if(match(h))counts[h.sec]=(counts[h.sec]||0)+1});
  if(!counts[_lk.tab]){const first=HUB_SECTIONS.find(s=>counts[s[0]]);if(first&&q)_lk.tab=first[0]}
  tabs.innerHTML=HUB_SECTIONS.map(([k,label])=>`<button type="button" data-k="${k}" class="${_lk.tab===k?'on':''}">${esc(label)} <i>${counts[k]||0}</i></button>`).join('');
  tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{_lk.tab=b.dataset.k;lockRenderHubs()});
  const items=CUSTOM_HUBS.filter(h=>h.sec===_lk.tab&&match(h));
  if(cnt)cnt.textContent=items.length+' shown';
  list.innerHTML='';
  if(!items.length){list.innerHTML='<div class="lk-empty">Nothing found.</div>';return}
  let lastGrp=null;
  items.forEach(h=>{
    if(h.group&&h.group!==lastGrp){lastGrp=h.group;const g=document.createElement('div');g.className='hub-grp';g.innerHTML=`<span>${esc(h.group)}</span>`;list.appendChild(g)}
    const c=HUB_COLORS[(h.color||'').toLowerCase()]||HUB_COLORS.grey;
    const row=document.createElement('div');row.className='list-row hub-row';
    row.innerHTML=`<div class="hub-ic" style="background:${c.bg};color:${c.fg}">${esc((h.icon||h.name.slice(0,2)).toString().slice(0,4))}</div>
      <div class="nm"><div class="hub-nm">${esc(h.name)}</div>${h.desc?`<div class="hub-desc">${esc(h.desc)}</div>`:''}</div><div class="hub-arrow">↗</div>`;
    row.onclick=()=>launchHub(h);
    list.appendChild(row);
  });
}

/* ---------- header bits ---------- */
function lockRenderHeader(){
  if(!ME)return;
  const nm=document.getElementById('lkName');if(nm)nm.textContent=ME.username;
  const av=document.getElementById('lkAv');
  if(av)av.outerHTML=avatarHtml(ME,ME.username,'width:30px;height:30px;font-size:13px').replace('class="avatar"','class="avatar" id="lkAv"');
  const by=document.getElementById('lkBypass');
  if(by)by.classList.toggle('hidden',!(LOCKDOWN.OWNER_BYPASS&&isOwner(ME.id)));
  const dmb=document.getElementById('lkDmBtn');if(dmb)dmb.classList.toggle('hidden',!hasMvpPerks(ME.id));
  if(!hasMvpPerks(ME.id)&&_lk.dmOpen)lockToggleDm(false);
}
function lockRenderAll(){
  if(!ME)return;
  lockRenderHeader();
  lockSyncTabs();
  lockRenderHubs();
  lockRenderMvpState();
  lockSyncComposer('ann');lockSyncComposer('mvp');lockSyncComposer('dm');
  lockRenderMsgs(CFG.ANNOUNCEMENTS_ROOM);
}
// keep names / roles / mute state fresh as the database fills in
let _lkTick=0;
DB.onChange(()=>{
  if(typeof view==='undefined'||view.page!=='lockPage')return;
  ME=DB.currentUser();
  if(!ME||!LOCKDOWN.ON||_lk.bypass)return;
  clearTimeout(_lkTick);
  _lkTick=setTimeout(()=>{
    if(view.page!=='lockPage'||!ME)return;
    lockRenderHeader();lockRenderMvpState();
    lockSyncComposer('ann');lockSyncComposer('mvp');lockSyncComposer('dm');
    lockRenderMsgs(CFG.ANNOUNCEMENTS_ROOM);
    lockRenderMsgs(CFG.MVP_ROOM);
    if(_lk.dmKey)lockRenderMsgs(_lk.dmKey);
    if(_lk.dmOpen&&!_lk.dmKey)lockRenderDmList();
  },120);
});

/* ==========================================================================
 * THE NOTICE  (2 pages. On the first showing after sign-in, "I understand" on page 2 stays locked for
 * PAGE2_WAIT_SECONDS; the countdown only runs while page 2 is open and this tab is visible.)
 * ========================================================================== */
let _lkN=null;
function lockCloseNotice(force){
  if(!_lkN)return;
  if(!force&&_lkN.enforce&&(_lkN.left>0||!_lkN.sawLast))return;
  clearInterval(_lkN.iv);
  document.removeEventListener('keydown',_lkN.key,true);
  const el=_lkN.el;_lkN=null;
  el.classList.add('closing');setTimeout(()=>el.remove(),200);
  document.body.style.overflow='';
}
function lockNoticeCopy(btn,text){
  copyText(text).then(ok=>{toast(ok?'Copied '+text:'Couldn\'t copy — select it manually',ok?'':'bad')});
}
function lockPage1HTML(){
  return `
    <div class="lkn-hero">
      <div class="lkn-hero-ic">🎃</div>
      <div>
        <h2 class="lkn-h">The site is on hold</h2>
        <p class="lkn-sub">Limited mode is on</p>
      </div>
    </div>
    <p class="lkn-lead">Itsuki's Chat Hub is in <b>limited mode</b>. Right now only <b>Announcements</b>, <b>MVP Chat</b> and <b>Hubs &amp; Tools</b> are open. You can still sign up, sign in and use Settings — everything else is paused.</p>

    <div class="lkn-card">
      <h3><span>❓</span>Why is this happening?</h3>
      <p>Google's <b>Firebase</b> (the thing that runs accounts, chat and the live database) <b>isn't free</b> — and I don't get anything out of running this site. I can't keep covering it for nothing.</p>
    </div>

    <div class="lkn-card hot">
      <h3><span>🔑</span>What it takes to bring it back</h3>
      <p>The website stays down until I get the <b>Headless Horseman</b> bundle on Roblox — by <b>gift card</b> or <b>gamepass</b>. <b>Whoever buys it for me gets Owner access to the site</b>, and the site comes back up.</p>
      <div class="lkn-chips">
        <span class="lkn-chip">💳 VISA</span>
        <span class="lkn-chip">🎁 ROBLOX gift cards</span>
        <span class="lkn-chip">🎟️ ROBLOX gamepass</span>
      </div>
      <p class="lkn-all"><b>@everyone</b> — I accept <b>VISA</b> and <b>ROBUX gift cards</b> for the <b>Headless Horseman only</b>.</p>
      <p>Or the gamepass (more expensive, <b>${esc(LOCKDOWN.GAMEPASS_ROBUX)} Robux</b>):<br>
        <a href="${esc(LOCKDOWN.GAMEPASS_URL)}" target="_blank" rel="noopener noreferrer">${esc(LOCKDOWN.GAMEPASS_URL)}</a></p>
    </div>

    <div class="lkn-card">
      <h3><span>💬</span>Contact</h3>
      <p>Message me on Discord: <button type="button" class="lkn-copy" data-copy="${esc(LOCKDOWN.DISCORD)}" title="Tap to copy">${esc(LOCKDOWN.DISCORD)}<span>copy</span></button></p>
    </div>

    <div class="lkn-warn"><span>⏳</span><div><b>Deadline: ${esc(LOCKDOWN.DEADLINE)}.</b> If I don't have the Headless Horseman by then, the website will be taken down — a <b>full shutdown</b>.</div></div>
    <p class="lkn-small">Under 18? Ask a parent or guardian before buying anything.</p>`;
}
function lockPage2HTML(){
  return `
    <div class="lkn-hero">
      <div class="lkn-hero-ic">🎃</div>
      <div>
        <h2 class="lkn-h">Special announcement</h2>
        <p class="lkn-sub">From the Headless Horseman</p>
      </div>
    </div>

    <div class="lkn-card hot">
      <h3><span>🎃</span>Headless Horseman deal</h3>
      <p><b>Roblox price breakdown ($269.97 USD total):</b></p>
      <div class="lkn-table">
        <div><span>$200 bundle</span><b>24,000 Robux</b></div>
        <div><span>$50 bundle</span><b>5,250 Robux</b></div>
        <div><span>$20 bundle</span><b>2,000 Robux</b></div>
        <div class="tot"><span>Total</span><b>31,250 Robux <small>(31,000 needed)</small></b></div>
      </div>
    </div>

    <p class="lkn-lead"><b>Attention everyone!</b> We're running an ultimate, once-in-a-lifetime giveaway / bounty event. If anyone is legendary enough to gift or buy me the <b>Headless Horseman</b> bundle on Roblox, you'll be instantly rewarded with the ultimate VIP treatment across the entire platform and community!</p>

    <div class="lkn-card">
      <h3><span>👑</span>What you get</h3>
      <ul class="lkn-list">
        <li><b>Full Owner Rank</b> — permanent administrative and management privileges on the site/project.</li>
        <li><b>MVP Status</b> — ultimate recognition and priority across all features.</li>
        <li><b>Custom Special Roles</b> — fully customized roles and tags tailored to your liking.</li>
        <li><b>Total Customization</b> — literally <i>anything</i> you want (within reason) added or configured!</li>
        <li><b>And much more</b> — exclusive perks, permanent bragging rights, and direct access to future updates.</li>
      </ul>
    </div>

    <div class="lkn-card hot">
      <h3><span>📥</span>How to claim / buy</h3>
      <p>Add me on Discord: <button type="button" class="lkn-copy" data-copy="${esc(LOCKDOWN.DISCORD)}" title="Tap to copy">${esc(LOCKDOWN.DISCORD)}<span>copy</span></button></p>
      <p>Use <b>GIFTCARDS</b> / <b>VISA</b> / <b>ROBUX</b>, or the <b>GAMEPASS</b>:<br>
        <a href="${esc(LOCKDOWN.GAMEPASS_URL)}" target="_blank" rel="noopener noreferrer">${esc(LOCKDOWN.GAMEPASS_URL)}</a> (${esc(LOCKDOWN.GAMEPASS_ROBUX)} Robux)</p>
    </div>
    <div class="lkn-warn"><span>⏳</span><div><b>Deadline: ${esc(LOCKDOWN.DEADLINE)}</b> — after that, full shutdown.</div></div>
    <p class="lkn-small">Under 18? Ask a parent or guardian before buying anything.</p>`;
}
/* enforce=true: first showing after sign-in (can't be closed until page 2 was seen and its short wait is over).
   enforce=false: reopened from the "Read notice" button (close any time). */
function lockOpenNotice(enforce,startPage){
  if(_lkN){if(startPage)lockNoticeGo(startPage);return}
  const secs=Math.max(0,Number(LOCKDOWN.PAGE2_WAIT_SECONDS)||0);
  const el=document.createElement('div');
  el.id='lkNotice';el.className='lkn-bg';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Important notice');
  el.innerHTML=`<div class="lkn-box">
    <div class="lkn-top">
      <span class="lkn-tag"><i class="lkn-pulse"></i>IMPORTANT NOTICE</span>
      <div class="lkn-steps" id="lknSteps" aria-hidden="true"><i class="on"></i><i></i></div>
      <span class="lkn-pg" id="lknPg">Page 1 of 2</span>
    </div>
    <div class="lkn-scroll" id="lknScroll"></div>
    <div class="lkn-bar">
      <div class="lkn-timer" id="lknTimer" aria-live="polite"></div>
      <div class="lkn-btns">
        <button class="btn sec" id="lknBack" type="button">← Back</button>
        <button class="btn" id="lknNext" type="button">Next page →</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(el);
  document.body.style.overflow='hidden';
  _lkN={el,enforce:!!enforce&&secs>0,left:enforce?secs:0,secs,page:1,sawLast:!enforce,iv:0,key:null};
  _lkN.key=e=>{
    if(e.key==='Escape'){e.stopPropagation();e.preventDefault();lockCloseNotice(false)}
  };
  document.addEventListener('keydown',_lkN.key,true);
  el.addEventListener('click',e=>{
    if(e.target===el)lockCloseNotice(false);
    const c=e.target.closest('[data-copy]');if(c)lockNoticeCopy(c,c.dataset.copy);
  });
  document.getElementById('lknBack').onclick=()=>lockNoticeGo(1);
  document.getElementById('lknNext').onclick=()=>{
    if(!_lkN)return;
    if(_lkN.page===1){lockNoticeGo(2);return}
    lockCloseNotice(false);
  };
  // the wait only counts down while PAGE 2 is open and this tab is visible
  _lkN.iv=setInterval(()=>{
    if(!_lkN)return;
    if(_lkN.page===2&&_lkN.left>0&&document.visibilityState==='visible'){_lkN.left--;lockNoticeSync()}
  },1000);
  lockNoticeGo(startPage||1);
}
function lockNoticeGo(p){
  if(!_lkN)return;
  _lkN.page=p;if(p===2)_lkN.sawLast=true;
  const sc=document.getElementById('lknScroll');
  sc.innerHTML=p===1?lockPage1HTML():lockPage2HTML();
  sc.classList.remove('swap');void sc.offsetWidth;sc.classList.add('swap');
  sc.scrollTop=0;
  document.getElementById('lknPg').textContent='Page '+p+' of 2';
  document.querySelectorAll('#lknSteps i').forEach((d,i)=>d.classList.toggle('on',i<p));
  lockNoticeSync();
}
function lockNoticeSync(){
  if(!_lkN)return;
  const back=document.getElementById('lknBack'),next=document.getElementById('lknNext'),tm=document.getElementById('lknTimer');
  if(!back||!next||!tm)return;
  back.style.visibility=_lkN.page===2?'visible':'hidden';
  const waiting=_lkN.enforce&&_lkN.page===2&&_lkN.left>0;
  if(_lkN.page===1){
    next.textContent='Next page →';next.disabled=false;
  }else{
    next.textContent=_lkN.enforce?(waiting?'I understand ('+_lkN.left+')':'I understand'):'Close';
    next.disabled=waiting;
  }
  if(_lkN.enforce){
    if(_lkN.page===1){
      tm.innerHTML='<span class="lkn-ring" style="--p:0"></span><span>Go to <b>page 2</b> to continue.</span>';
    }else{
      const pct=_lkN.secs?Math.round((_lkN.secs-_lkN.left)/_lkN.secs*100):100;
      tm.innerHTML=waiting
        ?`<span class="lkn-ring" style="--p:${pct}"></span><span>Please read this page — you can continue in <b>${_lkN.left}s</b></span>`
        :`<span class="lkn-ring done" style="--p:100"></span><span>Thanks for reading.</span>`;
    }
  }else tm.innerHTML='<span>Tap outside or press Esc to close.</span>';
}
