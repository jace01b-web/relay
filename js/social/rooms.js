/* ==========================================================================
 * js/social/rooms.js
 * Create / join room modals
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Rooms modals ---------- */
function modalCreateRoom(){
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal"><h2>Create a room</h2>
    <div class="field"><label>Room name</label><input id="rmName" maxlength="30"></div>
    <div class="err" id="rmErr"></div>
    <div class="actions"><button class="btn sec" id="rmX">Cancel</button><button class="btn" id="rmOk">Create</button></div></div></div>`;
  $('#rmX').onclick=()=>$('#modalRoot').innerHTML='';
  $('#rmOk').onclick=async()=>{
    try{const r=await DB.createRoom(ME.id,$('#rmName').value);$('#modalRoot').innerHTML='';selectRoom(r.id);toast(`Room created. Share code: ${r.code}`)}
    catch(e){$('#rmErr').textContent=e.message}
  };
}
function modalJoinRoom(){
  $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal"><h2>Join a room</h2>
    <div class="field"><label>Room code</label><input id="jrCode" maxlength="6" style="text-transform:uppercase"></div>
    <div class="err" id="jrErr"></div>
    <div class="actions"><button class="btn sec" id="jrX">Cancel</button><button class="btn" id="jrOk">Join</button></div></div></div>`;
  $('#jrX').onclick=()=>$('#modalRoot').innerHTML='';
  $('#jrOk').onclick=async()=>{
    try{const r=await DB.joinRoom(ME.id,$('#jrCode').value);$('#modalRoot').innerHTML='';selectRoom(r.id)}
    catch(e){$('#jrErr').textContent=e.message}
  };
}
