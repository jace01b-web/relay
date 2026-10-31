/* ==========================================================================
 * js/social/user-profile.js
 * Give-VIP picker and user profile card
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

function modalGiveVip(id,name){
  const root=$('#modalRoot');
  const u=DB.getUser(id);
  const av=u?avatarHtml(u,name,'width:52px;height:52px;font-size:20px;border:3px solid var(--panel)'):'';
  const current=DB.vipInfo(id);
  const OPTS=[
    {k:'perm',ic:'\u{1F451}',tt:'Legend',ds:'Permanent VIP. Never expires.'},
    {k:'24h', ic:'\u{1F31E}',tt:'Star',  ds:'24-hour VIP. Counts down from now.'}
  ];
  let sel=(current&&current.kind==='day')?'perm':'24h';   // sensible default: upgrade a Star, otherwise start with Star
  const prevName=k=>{
    const t=k==='perm'?{cls:'tier-legend',ic:'\u{1F451}',label:'Legend'}:{cls:'tier-star',ic:'\u{1F31E}',label:'Star'};
    const p=nameStylePreset(id);
    const user=p?'<span class="nm-user flair-name flair-'+p+'">'+esc(name)+'</span>':'<span class="nm-user">'+esc(name)+'</span>';
    return '<span class="nm-wrap '+t.cls+'"><span class="nm-title"><span class="nm-ic">'+t.ic+'</span>'+t.label+'</span>'+user+'</span>';
  };
  root.innerHTML=`<div class="modal-bg"><div class="modal gv-modal" role="dialog" aria-modal="true" aria-label="Give VIP">
    <button class="gv-x" id="gvX" title="Close" aria-label="Close">\u2715</button>
    <div class="gv-head">
      <div class="gv-av">${av}</div>
      <div class="gv-t">
        <div class="gv-k">Give VIP</div>
        <div class="gv-n">${esc(name)}</div>
        <div class="gv-id">User #${id}${current&&current.kind==='perm'?' \u00B7 already Legend':(current&&current.kind==='day'?' \u00B7 currently Star':'')}</div>
      </div>
    </div>
    <div class="gv-body">
      <div class="gv-lbl">Choose a tier</div>
      <div class="gv-opts" role="radiogroup">
        ${OPTS.map(o=>`<button type="button" class="gv-opt" data-k="${o.k}" role="radio" aria-checked="false">
          <span class="gv-ic">${o.ic}</span>
          <span class="gv-tx"><span class="gv-tt">${o.tt}</span><span class="gv-ds">${o.ds}</span></span>
          <span class="gv-ck">\u2713</span></button>`).join('')}
      </div>
      <div class="gv-prev"><span class="gv-pl">Preview</span><span class="gv-pn" id="gvPrev"></span></div>
      <div class="gv-actions">
        <button class="btn sec gv-cancel" id="gvCancel" type="button">Cancel</button>
        <button class="btn gv-go" id="gvGo" type="button"></button>
      </div>
    </div></div></div>`;
  const opts=[...root.querySelectorAll('.gv-opt')],go=$('#gvGo'),prev=$('#gvPrev');
  const paint=()=>{
    opts.forEach(o=>{const on=o.dataset.k===sel;o.classList.toggle('on',on);o.setAttribute('aria-checked',on)});
    prev.innerHTML=prevName(sel);
    go.dataset.k=sel;
    go.textContent=sel==='perm'?'\u{1F451} Make Legend':'\u{1F31E} Give Star (24h)';
  };
  opts.forEach(o=>o.onclick=()=>{sel=o.dataset.k;paint()});
  paint();
  const done=()=>{root.innerHTML='';openUserProfile(id)};
  go.onclick=async()=>{
    go.disabled=true;
    try{await DB.giveVip(id,sel);toast(name+' is now '+(sel==='perm'?'a Legend (forever)':'a Star (24 hours)')+'.');done()}
    catch(e){toast(e.message,'bad');go.disabled=false}
  };
  $('#gvCancel').onclick=done;
  $('#gvX').onclick=()=>{root.innerHTML=''};
  root.querySelector('.modal-bg').onclick=e=>{if(e.target===e.currentTarget)root.innerHTML=''};
  const onKey=e=>{if(e.key==='Escape'&&root.querySelector('.gv-modal')){root.innerHTML='';document.removeEventListener('keydown',onKey)}};
  document.addEventListener('keydown',onKey);
}

// Click-through profile card: username, avatar, online state, user ID, friend status/actions.
// Open the DM with someone from anywhere (profile card opened from the home screen, Global Chat, a room...).
// The old button only swapped the open chat, so it did nothing visible unless you were already inside Itsuki DMs.
async function openDmWith(id,modalRoot){
  id=Number(id);
  if(!ME||id===ME.id)return;
  if(!DB.isFriend(ME.id,id)){toast('You can only message friends. Send a friend request first.','bad');return}
  if(DB.isBlocked(ME.id,id)||DB.isBlockedBy(ME.id,id)){toast('You can\'t message this user.','bad');return}
  (modalRoot||$('#modalRoot')).innerHTML='';
  // make sure my side of the DM exists so the messages are readable/sendable
  try{await DB.ensureDmMemberships()}catch(_){}
  view.mode='dms';view.section=null;view.dmView='chat';
  view.pending=[];clearPendingFiles();view.replyingTo=null;view.editingId=null;renderPreviews();
  if(view.page!=='chatPage')show('chatPage');          // coming from the home screen
  selectRoom(DB.dmKey(ME.id,id));                       // also re-renders the sidebar (switches Global -> DMs)
  const sb=$('#sidebar');if(sb)sb.classList.remove('open');
}

// ---- Discord look: private notes + click popout --------------------------------------------------------------
// Notes are stored only in this browser (never sent anywhere), one per person.
const dlProfileOn=()=>typeof DiscordLook!=='undefined'&&DiscordLook.on();
function noteKey(id){return 'ich.note.'+(ME?ME.id:0)+'.'+id}
function noteGet(id){try{return localStorage.getItem(noteKey(id))||''}catch(_){return ''}}
function noteSet(id,t){try{t?localStorage.setItem(noteKey(id),t):localStorage.removeItem(noteKey(id))}catch(_){}}
function profileNoteHTML(id){
  if(!ME||id===ME.id||!dlProfileOn())return '';
  return `<div class="pf-note"><div class="pf-note-h">Note (only visible to you)</div><textarea class="pf-note-in" rows="1" maxlength="256" placeholder="Click to add a note" spellcheck="false" aria-label="Note">${esc(noteGet(id))}</textarea></div>`;
}
function wireProfileNote(root,id){
  const ta=root.querySelector('.pf-note-in');if(!ta)return;
  const fit=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px'};
  fit();
  ta.oninput=()=>{fit();noteSet(id,ta.value.trim())};
  ta.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ta.blur()}};
}
// Roles: show the first 5, then a "+N" button that reveals the rest.
function foldRoles(root,limit){
  const rw=root.querySelector('.pf-roles');if(!rw)return;
  const rs=[...rw.querySelectorAll('.pf-role')];if(rs.length<=limit)return;
  rs.slice(limit).forEach(r=>r.classList.add('pf-extra'));
  const more=document.createElement('button');more.type='button';more.className='pf-role-more';more.title='Show all roles';more.setAttribute('aria-label','Show '+(rs.length-limit)+' more roles');more.textContent='+'+(rs.length-limit);
  more.onclick=()=>{rw.classList.add('expanded');more.remove()};
  rw.appendChild(more);
}
// remember what was clicked, so a name/avatar click in the chat or member list can open the small popout next to it
let lastProfileClick=null;
document.addEventListener('click',e=>{lastProfileClick={el:e.target,t:Date.now()}},true);
function wantsProfilePopout(){
  if(!dlProfileOn()||!window.matchMedia('(min-width:821px)').matches)return false;
  const c=lastProfileClick;if(!c||Date.now()-c.t>700||!c.el||!c.el.closest)return false;
  if(c.el.closest('.dl-fr,.dlp-full'))return false;                 // Friends page rows + "View Full Profile" go to the full card
  return !!c.el.closest('#messages,#dlMembers');
}
function openProfilePopout(id){
  const u=DB.getUser(id);if(!u||!ME)return false;
  const root=$('#modalRoot');
  const src=lastProfileClick.el;
  const anchor=(src.closest('[data-open-profile]')||src);
  const rc=anchor.getBoundingClientRect();
  const isMe=id===ME.id,deleted=!!u.deleted;
  const name=deleted?'Deleted User':displayUsername(u.username);
  const online=isMe||DB.onlineIds().includes(id);
  const accent=safeColor(u.settings&&u.settings.meBubble,'#5865f2');
  const banner=safeColor(u.settings&&u.settings.bannerColor,accent);
  const av=avatarHtml(u,name,'width:80px;height:80px;font-size:30px');
  const canAdd=!isMe&&!deleted&&!DB.isFriend(ME.id,id)&&!DB.hasIncoming(id)&&!DB.hasOutgoing(ME.id,id)&&!DB.isBlocked(ME.id,id)&&!DB.isBlockedBy(ME.id,id);
  const canRemove=!isMe&&!deleted&&DB.isFriend(ME.id,id);
  const sub=deleted?'Account deleted':[online?'Online':'Offline',u.pronouns?esc(u.pronouns):''].filter(Boolean).join(' <b>\u2022</b> ');
  const roles=deleted?'':profileRolesHTML(id);
  root.innerHTML=`<div class="modal-bg dlpo-bg"><div class="dlpo" role="dialog" aria-label="Profile of ${esc(name)}">
    <div class="dlpo-banner${bannerImgOf(u)?' banner-img':''}" style="background:${bannerBg(u,banner)}"><div class="dlpo-btns">
      ${canAdd?'<button type="button" class="dlpo-ib" id="poAdd" title="Add Friend" aria-label="Add Friend"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 20c0-3.3 3.6-5 8-5s8 1.7 8 5v1H2zM19 8h-2v2h-2v2h2v2h2v-2h2v-2h-2z"/></svg></button>':''}
      ${canRemove?'<button type="button" class="dlpo-ib" id="poRemove" title="Remove Friend" aria-label="Remove Friend"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 20c0-3.3 3.6-5 8-5s8 1.7 8 5v1H2zM15 9h7v2h-7z"/></svg></button>':''}
      <button type="button" class="dlpo-ib" id="poMore" title="View full profile" aria-label="View full profile"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
    </div></div>
    <div class="dlpo-av">${av}<span class="dlpo-st"><i class="${online&&!deleted?'on':''}"></i></span></div>
    <div class="dlpo-body">
      <div class="dlpo-name">${deleted?esc(name):fullNameHTML(id,esc(name))}</div>
      <div class="dlpo-sub">${sub}</div>
      ${(!deleted&&u.description)?`<div class="dlpo-bio">${esc(u.description)}</div>`:''}
      ${deleted?'':'<button type="button" class="dlpo-full" id="poFull">View Full Profile</button>'}
      ${roles}
    </div>
    ${(!isMe&&!deleted)?`<div class="dlpo-msg"><input id="poMsg" type="text" maxlength="${maxMsgFor(ME.id)}" placeholder="Message @${esc(name)}" autocomplete="off" spellcheck="false" aria-label="Message ${esc(name)}"></div>`:''}
  </div></div>`;
  const bg=root.querySelector('.dlpo-bg'),card=root.querySelector('.dlpo');
  const close=()=>{root.innerHTML='';document.removeEventListener('keydown',onKey,true)};
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}};
  document.addEventListener('keydown',onKey,true);
  bg.onclick=e=>{if(e.target===bg)close()};
  foldRoles(root,5);
  // position next to what was clicked, kept on screen
  const W=card.offsetWidth||340,H=card.offsetHeight||420,vw=window.innerWidth,vh=window.innerHeight;
  let left=rc.right+12;if(left+W>vw-12)left=Math.max(12,rc.left-W-12);
  let top=Math.min(Math.max(12,rc.top-24),Math.max(12,vh-H-12));
  card.style.left=left+'px';card.style.top=top+'px';
  const full=()=>{close();openUserProfile(id,{full:true})};
  const f=$('#poFull');if(f)f.onclick=full;
  $('#poMore').onclick=full;
  const rem=$('#poRemove');
  if(rem)rem.onclick=()=>{close();modalUnfriendConfirm(id,u.username,async()=>{await DB.removeFriend(ME.id,id);ME=DB.currentUser();renderChat()})};
  const add=$('#poAdd');
  if(add)add.onclick=async()=>{add.disabled=true;try{const r=await DB.friendReqById(ME.id,id);toast(r==='accepted'?'You are now friends!':'Friend request sent.');ME=DB.currentUser();add.remove();renderChat()}catch(e){toast(e.message,'bad');add.disabled=false}};
  const mi=$('#poMsg');
  if(mi){
    mi.onkeydown=async e=>{
      e.stopPropagation();
      if(e.key!=='Enter')return;e.preventDefault();
      const txt=mi.value;
      if(!DB.isFriend(ME.id,id)){toast('You can only message friends. Send a friend request first.','bad');return}
      await openDmWith(id,root);
      if(txt&&typeof msgIn!=='undefined'&&msgIn){msgIn.value=txt;msgIn.focus();$('#cc').textContent=txt.length}
    };
  }
  return true;
}

// Opened from message avatars, the online list, and the friends list.
function openUserProfile(id,opts){
  id=Number(id);
  if(!(opts&&opts.full)&&wantsProfilePopout()){try{if(openProfilePopout(id))return}catch(_){}}
  const root=$('#modalRoot');
  root.innerHTML=`<div class="modal-bg"><div class="modal" style="max-width:380px;text-align:center">
    <div class="hint" style="padding:30px 0">Loading profile…</div>
  </div></div>`;
  root.querySelector('.modal-bg').onclick=e=>{if(e.target===e.currentTarget)root.innerHTML=''};
  let tries=0;
  const tryRender=()=>{
    if(root.innerHTML==='')return; // modal was closed
    const u=DB.getUser(id);
    if(u){render();return}
    if(tries++<20)setTimeout(tryRender,150);
    else{
      root.innerHTML=`<div class="modal-bg"><div class="modal" style="max-width:380px;text-align:center"><div class="hint" style="padding:30px 0">Couldn't load that user.</div><button class="btn sec small" id="pfGiveUpClose">Close</button></div></div>`;
      $('#pfGiveUpClose').onclick=()=>{root.innerHTML=''};
      root.querySelector('.modal-bg').onclick=e=>{if(e.target===e.currentTarget)root.innerHTML=''};
    }
  };
  const render=()=>{
    if(root.innerHTML==='')return;
    const u=DB.getUser(id);
    if(!u)return;
    const isMe=id===ME.id;
    const deleted=!!u.deleted;
    const name=deleted?'Deleted User':displayUsername(u.username);
    const online=isMe||DB.onlineIds().includes(id);   // you're obviously online while looking at your own card
    const owner=isOwner(id);
    const mod=isMod(id),admin=isAdmin(id);
    const banned=DB.isBanned(id);
    const muted=DB.isMuted(id);
    const muteMs=muted?DB.muteRemainingMs(id):0;
    const av=avatarHtml(u,name,'width:88px;height:88px;font-size:34px;border:4px solid var(--panel)');
    const accent=safeColor(u.settings&&u.settings.meBubble,'#7c6cff');
    const bannerBase=safeColor(u.settings&&u.settings.bannerColor,accent);
    const joined=u.createdAt?new Date(u.createdAt).toLocaleDateString(undefined,dlProfileOn()?{month:'short',day:'numeric',year:'numeric'}:{month:'short',year:'numeric'}):null;

    const iBlocked=!isMe&&DB.isBlocked(ME.id,id);
    const blockedMe=!isMe&&DB.isBlockedBy(ME.id,id);
    let socialHtml='';
    if(!isMe&&!deleted&&iBlocked){
      socialHtml=`<button class="btn sec small" id="pfUnblock" style="flex:1">Unblock</button>`;
    }else if(!isMe&&!deleted&&blockedMe){
      socialHtml='';
    }else if(!isMe&&!deleted){
      if(DB.isFriend(ME.id,id)){
        socialHtml=`<button class="btn small" id="pfMsg" style="flex:1">💬 Message</button><button class="btn sec small pf-icon-btn" id="pfRemove" title="Remove friend">🗑️</button>`;
      }else if(DB.hasIncoming(id)){
        socialHtml=`<button class="btn small" id="pfAccept" style="flex:1">✓ Accept request</button><button class="btn sec small" id="pfDecline">Decline</button>`;
      }else if(DB.hasOutgoing(ME.id,id)){
        socialHtml=`<button class="btn sec small" id="pfMsg" style="flex:1">💬 Message</button><button class="btn sec small" disabled style="flex:1">Request sent</button>`;
      }else{
        socialHtml=`<button class="btn sec small" id="pfMsg" style="flex:1">💬 Message</button><button class="btn small" id="pfAdd" style="flex:1">+ Add friend</button>`;
      }
    }
    const blockBtnHtml=(!isMe&&!deleted&&!blockedMe&&!iBlocked)?`<button class="btn sec small" id="pfBlock" style="width:100%">Block user</button>`:'';
    let modHtml='';
    const iAmOwner=isOwner(ME.id),iAmAdmin=isAdmin(ME.id),iAmMod=isMod(ME.id);
    // Banning freezes the profile as "Deleted User" with deleted:true, so a banned account is
    // ALWAYS also flagged deleted. Gating these buttons on !deleted therefore hid Unban on exactly
    // the accounts that need it — nobody could unban from a profile card at all. `gone` is the one
    // case with nothing to moderate: deleted and not banned, i.e. the person deleted themselves.
    const gone=deleted&&!banned;
    if(!isMe&&!gone&&iAmOwner&&!owner){
      // Owners: full powers — ban/unban plus mute at any duration.
      modHtml=banned
        ?`<button class="btn sec small" id="pfUnban">Unban</button>`
        :`<button class="btn sec small" id="pfMute">🔇 Mute</button><button class="btn danger small" id="pfBan">🔨 Ban</button>`;
    }else if(!isMe&&!gone&&iAmAdmin&&!owner&&!admin){
      // Admins: mute (up to 7 days), ban AND unban — on anyone except owners and other admins.
      // An admin's unban lifts the ban immediately; the profile itself (username, "Deleted User")
      // is repaired by that account's own client the next time they sign in, because only an
      // owner is allowed to write somebody else's username.
      modHtml=banned
        ?`<button class="btn sec small" id="pfUnban">Unban</button>`
        :`<button class="btn sec small" id="pfMute">🔇 Mute</button><button class="btn danger small" id="pfBan">🔨 Ban</button>`;
    }else if(!isMe&&!gone&&iAmMod&&!owner&&!mod&&!admin&&!banned){
      // Mods: mute/unmute only (preset durations, enforced in modalMuteConfirm/DB.muteUser
      // and again server-side by the rules), no ban, and never against an owner or
      // another mod — banned users are owner-only to unban, so mods see nothing there.
      modHtml=`<button class="btn sec small" id="pfMute">🔇 Mute</button>`;
    }

    // 24h VIP countdown + owner-only Give/Remove VIP controls on the card
    const vInfo=deleted?null:DB.vipInfo(id,true);
    const vipTimerHTML=(vInfo&&vInfo.kind==='day')?`<div><span class="pf-vip-timer">VIP \u00B7 ${fmtDur(vInfo.until-(Date.now()+SKEW))} left</span></div>`:'';
    if(!isMe&&!deleted&&iAmOwner&&!owner){
      const hasVip=DB.hasVipRole(id);       // a real VIP record (MVP's built-in VIP isn't removable here; remove MVP instead)
      modHtml+=hasVip
        ?`<button class="btn sec small" id="pfVipRemove">Remove VIP</button>`
        :`<button class="btn sec small" id="pfVipGive">\u{1F48E} Give VIP</button>`;
      modHtml+=DB.isMvp(id)
        ?`<button class="btn sec small" id="pfMvpRemove">Remove MVP</button>`
        :`<button class="btn sec small" id="pfMvpGive">\u{1F3C6} Give MVP</button>`;
    }
    const statusDot=deleted?'':`<span style="width:9px;height:9px;border-radius:50%;flex:none;${online?'background:#3ddc73;box-shadow:0 0 6px #3ddc73':'background:var(--muted)'}"></span>`;
    const statusText=deleted?'Account deleted':(online?'Online now':'Offline');

    root.innerHTML=`<div class="modal-bg"><div class="modal pf-card" style="max-width:340px;padding:0;overflow:hidden">
      <div class="pf-banner${bannerImgOf(u)?' banner-img':' banner-anim'}" style="background:${bannerBg(u,bannerBase)}">
        <button class="pf-x" id="pfClose" title="Close">✕</button>
      </div>
      <div class="pf-body" style="padding:0 24px 24px;margin-top:-46px">
        <div class="pf-avwrap" style="position:relative;width:fit-content">${av}${online&&!deleted?'<span class="pf-stat" style="position:absolute;bottom:4px;right:4px;width:18px;height:18px;border-radius:50%;background:#3ddc73;box-shadow:0 0 8px #3ddc73;border:3px solid var(--panel)"></span>':''}</div>
        <div class="pf-namerow" style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
          <h2 style="margin:0;font-size:20px">${deleted?esc(name):fullNameHTML(id,esc(name))}</h2>
          ${admin&&!owner?'<span class="tag" style="background:#e8503a">Admin</span>':(mod&&!owner?'<span class="tag" style="background:var(--accent)">Mod</span>':'')}
          ${banned?'<span class="tag" style="background:var(--danger)">Banned</span>':''}
        </div>
        <div class="pf-sub">${(!deleted&&u.pronouns)?`<div class="pf-pron">${esc(u.pronouns)}</div>`:''}
        <div class="pf-status" style="display:flex;align-items:center;gap:6px;margin-top:6px;color:var(--muted);font-size:13px">
          ${statusDot}<span>${statusText}</span>
        </div></div>
        ${deleted?'':profileRolesHTML(id)}
        ${vipTimerHTML}
        ${(!deleted&&u.description)?`<div class="pf-desc">${esc(u.description)}</div>`:''}
        ${muted?`<div class="hint" style="color:var(--danger);margin-top:4px">Muted for ${Math.ceil(muteMs/60000)} more min</div>`:''}

        <div class="pf-meta-row">
          <div class="pf-meta-chip" id="pfCopyId" title="Click to copy">
            <span class="pf-meta-label">User ID</span>
            <span class="pf-meta-val">#${id}</span>
          </div>
          ${joined?`<div class="pf-meta-chip">
            <span class="pf-meta-label">${dlProfileOn()?'Member Since':'Joined'}</span>
            <span class="pf-meta-val">${dlProfileOn()?'<svg class="pf-ms-ic" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>':''}${joined}</span>
          </div>`:''}
        </div>

        ${deleted?'':profileNoteHTML(id)}
        ${blockedMe?'<div class="hint" style="color:var(--danger);margin-top:10px">This user has blocked you.</div>':''}
        ${iBlocked?'<div class="hint" style="color:var(--danger);margin-top:10px">You have blocked this user.</div>':''}
        ${socialHtml?`<div class="pf-actions" style="display:flex;gap:8px;margin-top:18px">${socialHtml}</div>`:''}
        ${blockBtnHtml?`<div style="margin-top:8px">${blockBtnHtml}</div>`:''}
        ${modHtml?`<div style="display:flex;gap:8px;margin-top:8px;justify-content:center">${modHtml}</div>`:''}
      </div>
    </div></div>`;

    root.querySelector('.modal-bg').onclick=e=>{if(e.target===e.currentTarget)root.innerHTML=''};
    foldRoles(root,5);
    $('#pfClose').onclick=()=>{root.innerHTML=''};
    wireProfileNote(root,id);
    const copyBtn=$('#pfCopyId');
    if(copyBtn)copyBtn.onclick=()=>{
      navigator.clipboard?.writeText(String(id)).then(()=>toast('User ID copied')).catch(()=>{});
    };
    const goMsg=()=>openDmWith(id,root);
    const el2=id2=>document.getElementById(id2);
    if(el2('pfMsg'))el2('pfMsg').onclick=goMsg;
    if(el2('pfAdd'))el2('pfAdd').onclick=async()=>{
      el2('pfAdd').disabled=true;
      try{const r=await DB.friendReqById(ME.id,id);toast(r==='accepted'?'You are now friends!':'Friend request sent.');ME=DB.currentUser();render();renderChat()}
      catch(e){toast(e.message,'bad');render()}
    };
    if(el2('pfAccept'))el2('pfAccept').onclick=async()=>{
      try{await DB.acceptFriend(ME.id,id);toast('You are now friends!');ME=DB.currentUser();render();renderChat()}
      catch(e){toast(e.message,'bad')}
    };
    if(el2('pfDecline'))el2('pfDecline').onclick=async()=>{
      try{await DB.declineFriend(ME.id,id);toast('Request declined');render();renderChat()}
      catch(e){toast(e.message,'bad')}
    };
    if(el2('pfRemove'))el2('pfRemove').onclick=()=>{
      const fu=DB.getUser(id)||{username:'User '+id};
      modalUnfriendConfirm(id,fu.username,async()=>{await DB.removeFriend(ME.id,id);ME=DB.currentUser();render();renderChat()});
    };
    if(el2('pfBlock'))el2('pfBlock').onclick=()=>{
      modalBlockConfirm(id,name,async()=>{
        await DB.blockUser(ME.id,id);
        toast(name+' blocked.');render();renderChat();
      });
    };
    if(el2('pfUnblock'))el2('pfUnblock').onclick=()=>{
      DB.unblockUser(ME.id,id).then(()=>{toast(name+' unblocked.');render();renderChat()}).catch(e=>toast(e.message,'bad'));
    };
    if(el2('pfVipGive'))el2('pfVipGive').onclick=()=>{root.innerHTML='';modalGiveVip(id,name)};
    if(el2('pfVipRemove'))el2('pfVipRemove').onclick=async()=>{
      try{await DB.removeVip(id);toast('VIP removed from '+name+'.');render()}
      catch(e){toast(e.message,'bad')}
    };
    if(el2('pfMvpGive'))el2('pfMvpGive').onclick=async e=>{
      e.currentTarget.disabled=true;
      try{await DB.giveMvp(id);toast(name+' is now an MVP (permanent until removed).');render()}
      catch(err){toast(err.message,'bad');e.currentTarget.disabled=false}
    };
    if(el2('pfMvpRemove'))el2('pfMvpRemove').onclick=async e=>{
      if(!confirm('Remove MVP from '+name+'? They lose the perks and the role.'))return;
      e.currentTarget.disabled=true;
      try{await DB.removeMvp(id);toast('MVP removed from '+name+'.');render()}
      catch(err){toast(err.message,'bad');e.currentTarget.disabled=false}
    };
    if(el2('pfBan'))el2('pfBan').onclick=()=>{root.innerHTML='';modalBanConfirm(id,name)};
    if(el2('pfMute'))el2('pfMute').onclick=()=>{root.innerHTML='';modalMuteConfirm(id,name)};
    if(el2('pfUnban'))el2('pfUnban').onclick=async()=>{
      const b=el2('pfUnban');if(b)b.disabled=true;
      try{
        const newName=await DB.unbanUser(id);
        toast(newName?('User #'+id+' unbanned — back as @'+newName+'.')
                     :('User #'+id+' unbanned. Their profile comes back the next time they sign in.'));
        render();
      }
      catch(e){toast(e.message,'bad');if(b)b.disabled=false}
    };
  };
  tryRender();
}
