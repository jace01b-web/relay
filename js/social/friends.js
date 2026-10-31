/* ==========================================================================
 * js/social/friends.js
 * Friends: add friend, requests, friends list
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Friends ---------- */
let friendTab='friends';
function modalAddFriend(){
  ME=DB.currentUser();
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal"><h2>Find people</h2>
    <div class="field"><label>Search by username or user ID</label><input id="afQ" placeholder="e.g. alex or 42" autocomplete="off"></div>
    <div id="afResults"><div class="hint">Start typing to search.</div></div>
    <div class="actions"><button class="btn sec" id="afX">Close</button></div></div></div>`;
  $('#afX').onclick=()=>$('#modalRoot').innerHTML='';
  const q=$('#afQ');
  q.addEventListener('input',()=>renderAfResults(q.value.trim()));
  q.focus();
}
function renderAfResults(v){
  const box=$('#afResults');if(!box)return;
  if(!v){box.innerHTML='<div class="hint">Start typing to search.</div>';return}
  // A numeric query could be either a user ID lookup OR a username that
  // happens to be all digits (usernames allow 0-9) — search both and merge,
  // instead of treating "all digits" as exclusively an ID search.
  const byName=DB.allUsers().filter(u=>u.username.toLowerCase().includes(v.toLowerCase()));
  let matches=byName;
  if(/^[0-9]+$/.test(v)){
    const byId=DB.getUser(Number(v));
    if(byId&&!byName.some(u=>u.id===byId.id))matches=[byId,...byName];
  }
  matches=matches.filter(u=>u.id!==ME.id).slice(0,8);
  if(!matches.length){box.innerHTML='<div class="empty">No users found.</div>';return}
  box.innerHTML='';
  matches.forEach(u=>{
    const isFriend=ME.friends.includes(u.id);
    const sentReq=DB.hasOutgoing(ME.id,u.id);
    const d=document.createElement('div');d.className='list-row';
    d.innerHTML=`<span data-open-profile="${u.id}" style="cursor:pointer;display:flex;align-items:center;gap:10px;flex:1;min-width:0">${avatarHtml(u,u.username)}<div class="nm">${esc(u.username)} <span class="hint">#${u.id}</span></div></span>`;
    d.querySelector('[data-open-profile]').onclick=()=>{$('#modalRoot').innerHTML='';openUserProfile(u.id)};
    const btn=document.createElement('button');btn.className='btn small';
    if(isFriend){
      btn.textContent='Message';
      btn.onclick=()=>{$('#modalRoot').innerHTML='';view.dmView='chat';view.mode='dms';selectRoom(DB.dmKey(ME.id,u.id))};
    }else if(sentReq){
      btn.textContent='Requested';btn.disabled=true;btn.className+=' sec';
    }else{
      btn.textContent='Add Friend';
      btn.onclick=async()=>{
        if(btn.disabled)return;
        btn.disabled=true;
        try{
          const r=await DB.friendReqById(ME.id,u.id);
          toast(r==='accepted'?'You are now friends!':'Friend request sent.');
          ME=DB.currentUser();renderAfResults(v);
        }catch(e){btn.disabled=false;toast(e.message,'bad')}
      };
    }
    d.appendChild(btn);box.appendChild(d);
  });
}
function renderFriends(){
  if(typeof DiscordLook!=='undefined'&&DiscordLook.on()&&typeof DiscordShell!=='undefined')return DiscordShell.renderFriends();
  const box=$('#messages');ME=DB.currentUser();
  const inc=DB.incoming(ME.id),out=DB.outgoing(ME.id),blk=DB.blockedList(ME.id);
  box.innerHTML=`<div style="max-width:640px;width:100%;margin:0 auto" id="frWrap">
    <div class="tab-mini">
      <button data-t="friends" class="${friendTab==='friends'?'active':''}">Friends (${ME.friends.length})</button>
      <button data-t="incoming" class="${friendTab==='incoming'?'active':''}">Incoming (${inc.length})</button>
      <button data-t="outgoing" class="${friendTab==='outgoing'?'active':''}">Sent (${out.length})</button>
      <button data-t="blocked" class="${friendTab==='blocked'?'active':''}">Blocked (${blk.length})</button>
      <button class="btn small" id="frAdd">+ Add Friend</button>
    </div><div id="frBody"></div></div>`;
  box.querySelectorAll('.tab-mini [data-t]').forEach(b=>b.onclick=()=>{friendTab=b.dataset.t;renderFriends()});
  $('#frAdd').onclick=modalAddFriend;
  const body=$('#frBody');
  const row=(uid,btns)=>{
    const u=DB.getUser(uid)||{id:uid,username:'User '+uid};const d=document.createElement('div');d.className='list-row';
    d.innerHTML=`<span data-open-profile="${uid}" style="cursor:pointer;display:flex;align-items:center;gap:10px;flex:1;min-width:0">${avatarHtml(u,u.username)}<div class="nm">${esc(u.username)} <span class="hint">#${u.id}</span></div></span>`;
    btns.forEach(([t,cls,fn])=>{const b=document.createElement('button');b.className='btn small '+cls;b.textContent=t;b.onclick=fn;d.appendChild(b)});
    d.querySelector('[data-open-profile]').onclick=()=>openUserProfile(uid);
    body.appendChild(d);
  };
  if(friendTab==='friends'){
    if(!ME.friends.length)body.innerHTML='<div class="empty">No friends yet. Add someone by username!</div>';
    ME.friends.forEach(f=>row(f,[
      ['Message','',()=>{view.dmView='chat';selectRoom(DB.dmKey(ME.id,f))}],
      ['Remove','danger',()=>{const fu=DB.getUser(f)||{username:'User '+f};modalUnfriendConfirm(f,fu.username,async()=>{await DB.removeFriend(ME.id,f);ME=DB.currentUser();renderChat()})}]
    ]));
  }else if(friendTab==='incoming'){
    if(!inc.length)body.innerHTML='<div class="empty">No pending requests.</div>';
    inc.forEach(r=>row(r.from,[
      ['Accept','',()=>{DB.acceptFriend(ME.id,r.from).then(()=>{ME=DB.currentUser();renderChat()}).catch(e=>toast(e.message||'Failed','bad'))}],
      ['Decline','sec',()=>{DB.declineFriend(ME.id,r.from).then(renderChat).catch(e=>toast(e.message||'Failed','bad'))}]
    ]));
  }else if(friendTab==='outgoing'){
    if(!out.length)body.innerHTML='<div class="empty">No sent requests.</div>';
    out.forEach(r=>row(r.to,[['Cancel','sec',()=>{DB.cancelReq(ME.id,r.to).then(renderChat).catch(e=>toast(e.message||'Failed','bad'))}]]));
  }else{
    if(!blk.length)body.innerHTML='<div class="empty">You haven\'t blocked anyone.</div>';
    blk.forEach(id=>row(id,[
      ['Unblock','sec',()=>{DB.unblockUser(ME.id,id).then(()=>{toast('Unblocked.');renderChat()}).catch(e=>toast(e.message,'bad'))}]
    ]));
  }
}
