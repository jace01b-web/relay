/* ==========================================================================
 * js/chat/pings.js
 * Ping tracking, ping toasts and desktop notifications for pings & DMs
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

// Readable ping toast: who pinged you, where, and a preview of the message. Click it to open their profile.
/* Pings are tracked by message id (persisted per account on this device), never by list length.
   The old length-based check re-fired old pings whenever history grew above what was on screen
   (preview -> full list) and missed new ones once a room hit its 300-message window. Now a ping
   is shown live at most once, and is marked read as soon as it has been seen in its chat. */
const PING_SEEN_MAX=500;
let _pingSeen=null,_pingSeenFor=null,_pingQueue={},_pingFlushT=0;
function pingSeenSet(){   // fast local cache (this device); the account copy in the database is merged in by pingSeen()
  if(!ME)return new Set();
  if(_pingSeenFor!==ME.id||!_pingSeen){
    _pingSeenFor=ME.id;
    try{_pingSeen=new Set(JSON.parse(localStorage.getItem('ich.pingSeen.'+ME.id)||'[]'))}catch(_){_pingSeen=new Set()}
  }
  return _pingSeen;
}
function pingSeen(id){
  if(pingSeenSet().has(id))return true;
  const db=DB.pingSeenMap();
  if(db&&db[id]){pingSeenSet().add(id);return true}   // seen on another device
  return false;
}
function markPingSeen(m){
  if(!ME||!m||!m.id)return;
  const st=pingSeenSet();if(st.has(m.id))return;
  st.add(m.id);
  while(st.size>PING_SEEN_MAX)st.delete(st.values().next().value);
  try{localStorage.setItem('ich.pingSeen.'+ME.id,JSON.stringify([...st]))}catch(_){}
  // and save it to the account (batched) so every other device knows it's read too
  _pingQueue[m.id]=Number(m.at)||Date.now();
  clearTimeout(_pingFlushT);
  _pingFlushT=setTimeout(()=>{const q=_pingQueue;_pingQueue={};DB.savePingsSeen(q).catch(()=>{})},900);
}
function pingToast(m,key,sender){
  // never stack two toasts for the same message, and keep at most 3 ping toasts on screen
  const host=$('#toasts');
  if(host.querySelector('.ping-rich[data-mid="'+m.id+'"]'))return;
  const live=host.querySelectorAll('.ping-rich');
  for(let i=0;i<=live.length-3;i++)live[i].remove();
  const name=sender&&!sender.deleted?displayUsername(sender.username):'Someone';
  const where=key===CFG.GLOBAL_ROOM?'in Global chat':(String(key).startsWith('dm_')?'in a DM':'in a room');
  const raw=(m.text||'').replace(/\s+/g,' ').trim();
  const prev=raw?(raw.length>90?raw.slice(0,90)+'…':raw):((m.images&&m.images.length)?'[sent an image]':((m.files&&m.files.length)?'[sent '+filesLabel(m.files)+']':''));
  const t=document.createElement('div');t.className='toast ping ping-rich';t.dataset.mid=m.id;
  const mk=(c,tx)=>{const d=document.createElement('div');d.className=c;d.textContent=tx;t.appendChild(d)};
  mk('pt-title','@ '+name+' pinged you');mk('pt-where',where);if(prev)mk('pt-text',prev);
  if(sender&&!sender.deleted)mk('pt-hint','Tap to view profile');
  t.onclick=()=>{t.remove();if(sender&&!sender.deleted)openUserProfile(m.senderId)};
  // already reading that chat => it's been seen, so the toast only lingers briefly
  const viewing=view.page==='chatPage'&&view.roomKey===key;
  $('#toasts').appendChild(t);setTimeout(()=>t.remove(),viewing?4500:9000);
}

/* ---------- Desktop notifications for pings & DMs ----------
   Fires a native browser Notification for an incoming ping or DM, but only
   while you're not actually looking at that exact conversation — tab hidden
   or unfocused ("not online"), or you're elsewhere in the app (a different
   room, the home screen, Game Hubs, settings, etc).
   Permission is ONLY ever requested from inside the Settings > Pings >
   "Desktop notifications" toggle's own click handler (see below) — never
   automatically on page load or sign-in. That used to be the bug: asking for
   permission the moment you signed in wasn't a real user gesture, so browsers
   silently ignored or auto-blocked the prompt, permission stayed stuck on
   "default" forever, and notifications simply never fired even though the
   setting itself was on. Now the toggle is the only path to a permission
   prompt: flip it on and, if needed, the browser asks right then; flip it off
   and it's just a preference change, no browser prompt involved.
   NOTIFY_SINCE keeps this from replaying old unread pings/DMs as a
   notification storm the moment the tab loads or you sign in. */
const NOTIFY_SINCE=Date.now();
const _notifiedMsgIds=new Set();
function _viewingRoom(key){
  return view.page==='chatPage'&&view.roomKey===key&&document.visibilityState==='visible'&&document.hasFocus();
}
function checkPingNotifications(){
  if(!ME||!ME.settings.pings||!ME.settings.pings.desktop)return;
  if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
  const keys=[CFG.GLOBAL_ROOM,CFG.ANNOUNCEMENTS_ROOM,CFG.SHITPOST_ROOM,
    ...DB.myRooms(ME.id).map(r=>r.id),
    ...DB.friends(ME.id).map(f=>DB.dmKey(ME.id,f))];
  keys.forEach(key=>{
    const isDM=String(key).startsWith('dm_');
    (DB.messages(key)||[]).forEach(m=>{
      if(m.senderId===ME.id||m.at<=NOTIFY_SINCE||_notifiedMsgIds.has(m.id))return;
      _notifiedMsgIds.add(m.id);
      const pinged=(m.pings||[]).includes(ME.id)||((m.pings||[]).includes('everyone')&&ME.settings.pings.everyone);
      if(!isDM&&!pinged)return;                 // only pings & DMs — never every ordinary message
      if(_viewingRoom(key))return;               // already looking right at it — the in-app toast/sound covers this
      if(pinged&&pingSeen(m.id))return;          // already seen in its chat
      const sender=DB.getUser(m.senderId);
      const name=sender&&!sender.deleted?displayUsername(sender.username):'Someone';
      try{
        const n=new Notification(name,{
          icon:'https://aniitsukicoded.github.io/backups/icon.png',
          silent:true,                          // no sound — the in-chat ping chime already covers that
          tag:'itsuki-'+key                     // collapse a burst of messages from the same conversation into one
        });
        n.onclick=()=>n.close();                // just dismiss it — no navigation
      }catch(_){}
    });
  });
}
