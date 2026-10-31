/* ==========================================================================
 * js/ui/modals.js
 * Confirm modals (delete, ban, mute, leave, block) + signup/username modals
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

function modalDeleteMessageConfirm(key,m){
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal" style="max-width:380px;text-align:center">
    <div style="font-size:40px;margin-bottom:6px">🗑️</div>
    <h2 style="margin-bottom:8px">Delete this message?</h2>
    <div class="hint">This removes it for everyone and cannot be undone.</div>
    <div class="actions" style="justify-content:center;margin-top:18px">
      <button class="btn sec" id="delMsgCancel">Cancel</button>
      <button class="btn" style="background:var(--danger)" id="delMsgGo">Delete</button>
    </div>
  </div></div>`;
  $('#delMsgCancel').onclick=()=>{$('#modalRoot').innerHTML=''};
  $('#delMsgGo').onclick=async()=>{
    const b=$('#delMsgGo');b.disabled=true;
    try{await DB.deleteMessage(key,m.id);$('#modalRoot').innerHTML=''}
    catch(e){toast(e.message,'bad');b.disabled=false}
  };
}
function modalBanConfirm(id,name){
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal" style="max-width:400px;text-align:center">
    <div style="font-size:40px;margin-bottom:6px">🔨</div>
    <h2 style="margin-bottom:8px">Ban ${esc(name)}?</h2>
    <div class="hint">Their account will be frozen as "Deleted User" and their username reserved so nobody can grab it, and they'll lose the ability to send messages or change anything — but they'll stay signed in so they can't just make a new account to evade the ban. Unbanning later hands them a fresh username and frees the old one.</div>
    <div class="actions" style="justify-content:center;margin-top:18px">
      <button class="btn sec" id="banCancel">Cancel</button>
      <button class="btn" style="background:var(--danger)" id="banGo">Ban user</button>
    </div>
  </div></div>`;
  $('#banCancel').onclick=()=>{$('#modalRoot').innerHTML=''};
  $('#banGo').onclick=async()=>{
    try{await DB.banUser(id);toast(name+' has been banned.');$('#modalRoot').innerHTML=''}
    catch(e){toast(e.message,'bad')}
  };
}
function modalMuteConfirm(id,name){
  const opts=isOwner(ME.id)?OWNER_MUTE_OPTS:(isAdmin(ME.id)?ADMIN_MUTE_OPTS:MOD_MUTE_OPTS);
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal" style="max-width:400px;text-align:center">
    <div style="font-size:40px;margin-bottom:6px">🔇</div>
    <h2 style="margin-bottom:8px">Mute ${esc(name)}?</h2>
    <div class="hint">They'll be able to read, sign in, and use menus normally, but can't send messages until the mute expires or you unmute them.</div>
    <div class="set-grid" style="margin-top:14px"><div class="field"><label>Duration</label>
      <select id="muteDur">${opts.map(([m,l])=>`<option value="${m}">${l}</option>`).join('')}</select></div></div>
    <div class="actions" style="justify-content:center;margin-top:18px">
      <button class="btn sec" id="muteCancel">Cancel</button>
      <button class="btn sec" id="unmuteGo">Unmute</button>
      <button class="btn" style="background:var(--danger)" id="muteGo">Mute user</button>
    </div>
  </div></div>`;
  $('#muteCancel').onclick=()=>{$('#modalRoot').innerHTML=''};
  enhanceSelects($('#modalRoot'));
  $('#muteGo').onclick=async()=>{
    try{
      const mins=+$('#muteDur').value;
      await DB.muteUser(id,mins*60*1000);
      toast(name+' has been muted for '+$('#muteDur').selectedOptions[0].textContent+'.');
      $('#modalRoot').innerHTML='';
    }catch(e){toast(e.message,'bad')}
  };
  $('#unmuteGo').onclick=async()=>{
    try{await DB.unmuteUser(id);toast(name+' has been unmuted.');$('#modalRoot').innerHTML=''}
    catch(e){toast(e.message,'bad')}
  };
}
function modalLeaveRoomConfirm(r,onConfirm){
  const lastMember=(r.members||[]).length<=1;
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal" style="max-width:400px;text-align:center">
    <div style="font-size:40px;margin-bottom:6px">🗑️</div>
    <h2 style="margin-bottom:8px">${lastMember?'Delete':'Leave'} "${esc(r.name)}"?</h2>
    <div class="hint">${lastMember?"You're the last member, so this deletes the room for good — this cannot be undone.":"You'll lose access to this room. If you're the last member, it gets deleted too."}</div>
    <div class="actions" style="justify-content:center;margin-top:18px">
      <button class="btn sec" id="leaveRoomCancel">Cancel</button>
      <button class="btn" style="background:var(--danger)" id="leaveRoomGo">${lastMember?'Delete room':'Leave room'}</button>
    </div>
  </div></div>`;
  $('#leaveRoomCancel').onclick=()=>{$('#modalRoot').innerHTML=''};
  $('#leaveRoomGo').onclick=async()=>{
    const b=$('#leaveRoomGo');b.disabled=true;
    try{await onConfirm();$('#modalRoot').innerHTML=''}
    catch(e){toast(e.message,'bad');b.disabled=false}
  };
}
/* In-page "Remove friend?" confirmation. Replaces window.confirm(), which sandboxed embeds (Canva, Google Sites,
   about:blank launchers...) silently block, making the Remove button do nothing. */
function modalUnfriendConfirm(id,name,onConfirm){
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal" style="max-width:400px;text-align:center">
    <div style="font-size:40px;margin-bottom:6px">💔</div>
    <h2 style="margin-bottom:8px">Remove ${esc(name)}?</h2>
    <div class="hint">They'll be taken off your friends list and you'll be taken off theirs. You can send a new friend request later.</div>
    <div class="actions" style="justify-content:center;margin-top:18px">
      <button class="btn sec" id="unfriendCancel">Cancel</button>
      <button class="btn" style="background:var(--danger)" id="unfriendGo">Remove friend</button>
    </div>
  </div></div>`;
  const close=()=>{$('#modalRoot').innerHTML=''};
  $('#unfriendCancel').onclick=close;
  $('#modalRoot .modal-bg').addEventListener('mousedown',e=>{if(e.target===e.currentTarget)close()});
  $('#unfriendGo').onclick=async()=>{
    const b=$('#unfriendGo');b.disabled=true;
    try{await onConfirm();close()}
    catch(e){toast(e.message||'Could not remove friend','bad');b.disabled=false}
  };
}
function modalBlockConfirm(id,name,onConfirm){
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal" style="max-width:400px;text-align:center">
    <div style="font-size:40px;margin-bottom:6px">🚫</div>
    <h2 style="margin-bottom:8px">Block ${esc(name)}?</h2>
    <div class="hint">They won't be able to add you, and neither of you will see each other's messages.</div>
    <div class="actions" style="justify-content:center;margin-top:18px">
      <button class="btn sec" id="blockCancel">Cancel</button>
      <button class="btn" style="background:var(--danger)" id="blockGo">Block</button>
    </div>
  </div></div>`;
  $('#blockCancel').onclick=()=>{$('#modalRoot').innerHTML=''};
  $('#blockGo').onclick=async()=>{
    const b=$('#blockGo');b.disabled=true;
    try{await onConfirm();$('#modalRoot').innerHTML=''}
    catch(e){toast(e.message,'bad');b.disabled=false}
  };
}
function modalSignupSuccess(user,hasEmail){
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal" style="max-width:420px;text-align:center">
    <div style="font-size:44px;margin-bottom:6px">🎉</div>
    <h2 style="margin-bottom:8px">Account created!</h2>
    <div class="hint" style="margin-bottom:4px">Welcome, <b style="color:var(--text)">${esc(user.username)}</b> — you're user <b style="color:var(--text)">#${user.id}</b>.</div>
    ${hasEmail?`<div class="hint">Check your email to verify your address.</div>`:''}
    <div class="hint" style="margin-top:10px">Sign in below to get started.</div>
    <div class="actions" style="justify-content:center;margin-top:18px"><button class="btn" id="suOk">Got it</button></div>
  </div></div>`;
  const close=()=>{$('#modalRoot').innerHTML='';$('#inId').focus()};
  $('#suOk').onclick=close;
}
function modalPickUsername(){
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal"><h2>Choose a username</h2>
    <div class="hint">Almost done. Pick a username (1-20 chars: 0-9 a-z A-Z . _ -)</div>
    <div class="field" style="margin-top:12px"><input id="pkName" maxlength="20"><span class="hint" id="pkHint"></span></div>
    <div class="err" id="pkErr"></div>
    <div class="actions"><button class="btn sec" id="pkX">Cancel</button><button class="btn" id="pkOk">Continue</button></div></div></div>`;
  $('#pkX').onclick=async()=>{$('#modalRoot').innerHTML='';await DB.signOut();show('authPage')};
  $('#pkOk').onclick=async()=>{
    const b=$('#pkOk');b.disabled=true;$('#pkErr').textContent='';
    try{await DB.completeGoogleProfile($('#pkName').value.trim());$('#modalRoot').innerHTML='';goHome();giftPromoToast()}
    catch(e){console.error('profile setup failed',e);$('#pkErr').textContent=e.message}
    finally{b.disabled=false}
  };
}
