/* ==========================================================================
 * js/core/database.js
 * DB layer: Firebase Realtime Database + Auth (users, rooms, DMs, friends, messages, VIP, ...)
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

const DB=(()=>{
  // live cache
  const C={users:{},usernames:{},rooms:{},roomMembers:{},dmMembers:{},friends:{},friendReqIn:{},friendReqOut:{},lastRead:{},pingSeen:{},messages:{},myRoomIds:[],online:0,onlineIds:[],presenceIds:[],banned:{},muted:{},blocked:{},blockedBy:{},reactions:{},vip:{},mvp:{},spinWin:null,flair:{},roles:{},lastSpin:0};
  let myId=null,myUid=null,ready=false;
  const listeners=new Set();
  const unsubs=[];         // base listeners
  let msgUnsub=null,msgKey=null;
  let reactUnsub=null;   // follows whichever conversation is open, alongside msgUnsub
  let _svOff=0,_annSeen=null;const LIVE_ANN_MS=10000;   // live announcements: server clock offset, last shown id, on-screen time
  let _rcBase,_rcShownAt=0;   // owner "Reconnect everyone" request tracking
  let presUnsub=null,presenceSelfRef=null;   // scoped "who's here" presence for the open context
  let presenceRef=null,sessUnsub=null,mySessionToken=null,sessionConfirmed=false,kicked=false;
  let rcPending=false,signingOut=false,lastHeal=0;   // rcPending: owner's online check is waiting on this client; signingOut: don't re-mark online while logging out   // single-active-session enforcement
  const previewUnsubs={};
  const roomUnsubs={};
  const fetchingUsers=new Set();
  // Fallback: if a user isn't in the live cache yet (e.g. the bulk 'users' listener
  // hasn't synced, or rules restrict it), fetch that one record directly so we
  // don't wrongly show real people as "Deleted User".
  function fetchUserIfMissing(id){
    if(id==null||C.users[id]||fetchingUsers.has(id))return;
    fetchingUsers.add(id);
    get(R('users/'+id)).then(s=>{
      if(s.exists()){C.users[id]=s.val();if(ready)emit()}
    }).catch(()=>{}).finally(()=>fetchingUsers.delete(id));
  }
  /* emit() tells the UI "something changed" and every listener re-renders. Roughly 25 Firebase
     listeners are live at once, and a single action (sending a message, someone coming online,
     signing in) makes several of them fire in the same tick — which used to mean several full
     re-renders back to back, and a visible stutter on login and in busy chats.
     So emit() is coalesced: however many times it is called, the listeners run once, on the next
     frame. In a hidden tab requestAnimationFrame is paused, so a timer is used instead — ping
     notifications and the ban self-purge have to keep working while the tab is in the background. */
  let _emitPending=false;
  function _flushEmit(){_emitPending=false;listeners.forEach(f=>{try{f()}catch(e){console.error(e)}})}
  const emit=()=>{
    if(_emitPending)return;
    _emitPending=true;
    if(document.visibilityState==='hidden')setTimeout(_flushEmit,0);
    else requestAnimationFrame(_flushEmit);
  };
  const dmKey=(a,b)=>'dm_'+[a,b].sort((x,y)=>x-y).join('_');
  // MVP: mvp/$id holds the time (ms) the role was granted; true/1 also count. Never expires — only an owner removes it.
  const mvpOn=id=>{const v=C.mvp[Number(id)];return v===true||v===1||(typeof v==='number'&&v>0)};
  const mvpAccess=id=>isOwner(id)||mvpOn(id);
  const FAKE='@itsuki.local';

  function listen(path,cb){
    const u=onValue(R(path),s=>{cb(s.val());if(ready)emit()},err=>console.warn('listen denied',path,err.code));
    unsubs.push(u);return u;
  }
  function stopAll(){SECRET_OWNER_ID=null;SECRET_LOADED=false;unsubs.splice(0).forEach(u=>u());Object.keys(previewUnsubs).forEach(k=>{previewUnsubs[k]();delete previewUnsubs[k]});Object.keys(roomUnsubs).forEach(k=>{roomUnsubs[k]();delete roomUnsubs[k]});if(msgUnsub){msgUnsub();msgUnsub=null}if(reactUnsub){try{reactUnsub()}catch(_){}reactUnsub=null}if(presUnsub){try{presUnsub()}catch(_){}presUnsub=null}if(presenceSelfRef){try{remove(presenceSelfRef).catch(()=>{})}catch(_){}presenceSelfRef=null}if(sessUnsub){try{sessUnsub()}catch(_){}sessUnsub=null}presenceRef=null;mySessionToken=null;sessionConfirmed=false;kicked=false;hideKickOverlay();C.presenceIds=[];C.lastReadLoaded=false;msgKey=null}

  // ---- Single-active-session enforcement --------------------------------
  // onlineUsers/$id is one shared boolean per account, not one per tab. The old
  // code had every open tab race to set it true and register its OWN
  // onDisconnect().remove() on that same shared path — so closing any one tab,
  // even an old one that had long since been superseded by a newer login, could
  // wipe out "online" for an account that was still very much connected
  // elsewhere. Fix: only the most-recently-claimed client is allowed to touch
  // that path at all. Every (re)login writes a random token to sessions/$id;
  // whichever token lands there last is the winner. A client that loses the
  // claim cancels its own onDisconnect (so it can never again clear
  // onlineUsers, even when it eventually closes) and shows a pause screen with
  // a Reconnect button that re-claims the session — which in turn kicks
  // whichever client is currently active.
  function genSessionToken(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)}
  /* Self-heal: onlineUsers/$id is one shared boolean per account and only got written on (re)connect. If anything cleared it
     while this client was still live (another tab/device closing, a network blip, a re-login race) the person showed as
     "Offline" everywhere until they refreshed. Now a live client notices its own marker is missing and puts it back. */
  function healPresence(){
    if(myId==null||kicked||rcPending||signingOut||!presenceRef||!ready)return;
    if(C.onlineIds.indexOf(myId)>-1)return;
    const t=Date.now();if(t-lastHeal<8000)return;lastHeal=t;
    armPresence();armScopedPresence();
  }
  setInterval(()=>{try{healPresence()}catch(_){}},30000);
  function armPresence(){
    if(!presenceRef)return;
    onDisconnect(presenceRef).remove();
    if(kicked)return;
    set(presenceRef,true).catch(e=>{
      // The write requires idToUid/$myId===auth.uid, which for a brand-new signup
      // may not have landed yet (it's linked separately, right after startListeners()
      // fires this the first time via .info/connected) — that link write resolves a
      // beat later and nothing used to retry the presence write once it did, so a
      // fresh account could silently never show as online for the rest of that
      // session. Log it and retry shortly instead of swallowing it outright.
      console.warn('presence write failed, will retry',e.code||e.message);
      setTimeout(()=>{if(!kicked&&presenceRef)set(presenceRef,true).catch(e2=>console.warn('presence retry failed',e2.code||e2.message))},1500);
    });
  }
  // Re-arms the SCOPED "who's here" marker (presence/$key/$myId) — the one behind
  // "Online in Global Chat" / "Online in this DM" / "Online in this room". This is
  // separate from the account-level onlineUsers marker above. It used to only get
  // set once, when you switched context (watchMessages) — so a real network drop
  // (Firebase's onDisconnect fires server-side the instant the socket closes) left
  // it missing forever afterward: the client never re-wrote it once the connection
  // came back, so you'd look offline in that room/DM until you actually switched
  // chats again. Called from the same '.info/connected' handler as armPresence so
  // both markers recover together on every reconnect.
  function armScopedPresence(){
    if(!presenceSelfRef)return;
    onDisconnect(presenceSelfRef).remove();
    if(kicked)return;
    set(presenceSelfRef,true).catch(e=>{
      console.warn('scoped presence write failed, will retry',e.code||e.message);
      setTimeout(()=>{if(!kicked&&presenceSelfRef)set(presenceSelfRef,true).catch(()=>{})},1500);
    });
  }
  // (Re)join the scoped presence node for whichever chat is currently open. Used both
  // by watchMessages (switching context) and by the un-kick path below — takeoverKick()
  // tears presenceSelfRef/presUnsub all the way down to null, so simply un-setting
  // 'kicked' isn't enough to bring the room/DM's "who's online" list back; we have to
  // actually re-create them for the chat that's still open (msgKey doesn't change
  // across a kick/un-kick, so watchMessages' own "already on this key" guard would
  // otherwise skip rejoining until the person switched chats and back).
  function rejoinScopedPresence(){
    if(!msgKey||myId==null)return;
    if(presUnsub){try{presUnsub()}catch(_){}presUnsub=null}
    presenceSelfRef=R('presence/'+msgKey+'/'+myId);
    armScopedPresence();
    presUnsub=onValue(R('presence/'+msgKey),s=>{
      C.presenceIds=s.val()?Object.keys(s.val()).map(Number):[];
      C.presenceIds.forEach(fetchUserIfMissing);
      if(ready)emit();
    },()=>{});
  }
  // Session debug logging — console only (no on-page panel).
  function sessLog(...args){
    const msg=args.map(a=>{try{return typeof a==='object'?JSON.stringify(a):String(a)}catch(_){return String(a)}}).join(' ');
    console.log('[session]',msg);
  }

  function watchSession(){
    if(sessUnsub){try{sessUnsub()}catch(_){}sessUnsub=null}
    sessUnsub=onValue(R('sessions/'+myId),s=>{
      const val=s.val();
      sessLog('snapshot',val,'| mine=',mySessionToken,'| confirmed=',sessionConfirmed,'| kicked=',kicked);
      if(!val||!val.token)return;
      if(val.token===mySessionToken){
        sessionConfirmed=true;
        if(kicked){sessLog('reconnect confirmed, un-kicking');kicked=false;hideKickOverlay();armPresence();rejoinScopedPresence()}
        return;
      }
      // Only act once we've actually confirmed OUR claim landed — otherwise the
      // very first snapshot (still holding a stale value from a previous
      // session) would wrongly look like an instant takeover on every login.
      if(sessionConfirmed&&!kicked){sessLog('token mismatch after confirmation -> KICKING this client');takeoverKick()}
    },e=>sessLog('LISTEN DENIED on sessions/'+myId,e.code||e.message));
  }
  function claimSession(){
    mySessionToken=genSessionToken();sessionConfirmed=false;
    sessLog('claiming id=',myId,'token=',mySessionToken);
    return set(R('sessions/'+myId),{token:mySessionToken,at:serverTimestamp()})
      .then(()=>sessLog('claim write acknowledged by server'))
      .catch(e=>sessLog('CLAIM WRITE FAILED:',e.code||e.message));
  }
  function takeoverKick(){
    if(kicked)return;kicked=true;
    sessLog('takeoverKick() firing — showing overlay now');
    if(presenceRef){try{onDisconnect(presenceRef).cancel()}catch(_){}}
    if(presenceSelfRef){try{onDisconnect(presenceSelfRef).cancel()}catch(_){}remove(presenceSelfRef).catch(()=>{});presenceSelfRef=null}
    if(presUnsub){try{presUnsub()}catch(_){}presUnsub=null}
    showKickOverlay();
  }

  function startListeners(){
    stopAll();BANNED_LOADED=false;_rcBase=undefined;signingOut=false;rcPending=false;
    presenceRef=R('onlineUsers/'+myId);
    claimSession();watchSession();
    listen('users',v=>C.users=v||{});
    listen('usernames',v=>C.usernames=v||{});
    listen('banned',v=>{
      C.banned=v||{};BANNED_LOADED=true;
      checkBanLock(myId,C.banned);
    });
    listen('muted',v=>{C.muted=v||{};if(typeof updateMuteLock==='function')updateMuteLock();});
    listen('owners',v=>{OWNERS_CACHE=v||{};OWNERS_LOADED=true;checkBanLock(myId,C.banned);if(typeof checkForcedVersion==="function")checkForcedVersion();if(typeof refreshVipUI==='function'){try{refreshVipUI()}catch(_){}}});
    {const sid=myId;   // own entry only; a denied/missing read just means "not a secret owner"
      const done=on=>{SECRET_OWNER_ID=on?sid:null;SECRET_LOADED=true;checkBanLock(myId,C.banned);if(typeof checkForcedVersion==="function")checkForcedVersion();if(typeof refreshVipUI==='function'){try{refreshVipUI()}catch(_){}}if(ready)emit()};
      unsubs.push(onValue(R('secretowner/'+sid),sn=>done(sn.val()===1),()=>done(false)));}
    listen('mods',v=>{MODS_CACHE=v||{};MODS_LOADED=true;});
    listen('admin',v=>{ADMINS_CACHE=v||{};ADMINS_LOADED=true;});
    // Custom roles: decorative only, written from the backend, never by the client (see js/moderation/roles.js).
    listen('customroles',v=>{
      CUSTOM_ROLES_CACHE=(v&&typeof v==='object')?v:{};CUSTOM_ROLES_LOADED=true;
      if(ready)emit();
      if(typeof DiscordShell!=='undefined'){try{DiscordShell.refresh()}catch(_){}}
    });
    listen('appVersion',v=>{APP_VERSION_CACHE=v||null;APP_VERSION_LOADED=true;if(typeof checkForcedVersion==="function")checkForcedVersion();});
    listen('dmMembers',v=>C.dmMembers=v||{});
    listen('vip',v=>{C.vip=v||{};if(typeof refreshVipUI==='function'){try{refreshVipUI()}catch(_){}}});
    listen('mvp',v=>{C.mvp=(v&&typeof v==='object')?v:{};if(typeof refreshVipUI==='function'){try{refreshVipUI()}catch(_){}}});
    listen('flair',v=>{C.flair=v||{}});
    listen('roles',v=>{C.roles=v||{};if(typeof refreshSpinUI==='function'){try{refreshSpinUI()}catch(_){}}});
    /* HALLOWEEN:START */ listen('halloween/claimed',v=>{window.HW_CLAIMED=v||{};if(typeof hwRefresh==='function'){try{hwRefresh()}catch(_){}}});listen('halloween/progress/'+myId,v=>{window.HW_PROG=v||{};window.HW_LOADED=true;if(typeof hwRefresh==='function'){try{hwRefresh()}catch(_){}}});listen('halloween/equipped',v=>{window.HW_EQ=v||{};if(typeof hwRefresh==='function'){try{hwRefresh()}catch(_){}}});listen('halloween/intro/'+myId,v=>{window.HW_INTRO=Number(v)||0;window.HW_INTRO_LOADED=true;if(typeof hwMaybeIntro==='function'){try{hwMaybeIntro()}catch(_){}}}); /* HALLOWEEN:END */
    listen('lastSpin/'+myId,v=>{C.lastSpin=Number(v)||0;if(typeof refreshSpinUI==='function'){try{refreshSpinUI()}catch(_){}}});
    listen('spinWin/'+myId,v=>{C.spinWin=(v&&typeof v==='object')?v:null;if(typeof refreshSpinUI==='function'){try{refreshSpinUI()}catch(_){}}});
    listen('friendRequests/'+myId,v=>C.friendReqIn=v||{});
    listen('lastRead/'+myId,v=>{C.lastRead=v||{};C.lastReadLoaded=true});
    listen('pingSeen/'+myId,v=>{C.pingSeen=v||{}});
    // Rooms: rather than trying to read the whole 'rooms'/'roomMembers' trees (which
    // security rules almost never allow for a giant shared list), keep a small
    // per-user index of which room IDs I'm in, then watch just those rooms.
    listen('userRooms/'+myId,v=>{
      C.myRoomIds=Object.keys(v||{});
      C.myRoomIds.forEach(watchRoom);
      // also preview each room's last 30 messages so unread badges work for
      // rooms I'm not currently looking at (mirrors the DM preview below)
      C.myRoomIds.forEach(watchPreview);
    });
    // watch each friend's DM (latest 30 msgs) so unread badges work while another chat is open
    listen('friends/'+myId,v=>{
      const ids=v?Object.keys(v).map(Number):[];
      C.friends[myId]=ids;
      ids.forEach(f=>watchPreview(dmKey(myId,f)));
    });
    listen('sentRequests/'+myId,v=>{C.friendReqOut[myId]=Object.keys(v||{}).map(t=>({from:myId,to:Number(t),status:'pending'}))});
    // Always preview Global & Announcements too (readable by anyone signed in), so an
    // @everyone/@me ping landing there can still be noticed — and desktop-notified — even
    // while I'm not currently looking at that room.
    watchPreview(CFG.GLOBAL_ROOM);
    watchPreview(CFG.ANNOUNCEMENTS_ROOM);
    watchPreview(CFG.SHITPOST_ROOM);
    // Blocking: my own blocked list, and the mirror list of who has blocked me (blockedBy/myId/*
    // is written by whoever blocks me, so I can filter their messages and they can filter mine).
    listen('blocked/'+myId,v=>{C.blocked[myId]=v?Object.keys(v).map(Number):[]});
    listen('blockedBy/'+myId,v=>{C.blockedBy[myId]=v?Object.keys(v).map(Number):[]});
    // Presence: mark myself online while connected, and let the server auto-remove me
    // the instant this connection drops (tab close, network loss, crash) via onDisconnect.
    // Re-armed on every (re)connect, per Firebase's recommended presence pattern.
    listen('.info/connected',connected=>{if(connected){armPresence();armScopedPresence()}});
    listen('onlineUsers',v=>{
      C.onlineIds=v?Object.keys(v).map(Number):[];
      C.online=C.onlineIds.length;
      C.onlineIds.forEach(id=>fetchUserIfMissing(id));
      if(ready)emit();   // refresh online pills/lists the moment someone goes offline
      healPresence();
    });
    // Owner "Reconnect everyone": the owner clears every online marker and bumps reconnectRequest. Everyone with
    // a live client gets a prompt and only shows as online again if they press Reconnect. The first value we
    // receive is just the baseline (an old request), only later changes count.
    listen('reconnectRequest',v=>{
      const at=v&&typeof v.at==='number'?v.at:0;
      if(_rcBase===undefined){_rcBase=at;return}
      if(!at||at===_rcBase)return;
      _rcBase=at;
      if(Date.now()-_rcShownAt<10000)return;      // serverTimestamp fires twice (estimate, then real value)
      _rcShownAt=Date.now();
      if(kicked)return;
      if(v.by===myId){armPresence();armScopedPresence();return}   // the owner who ran it stays online
      rcPending=true;
      if(typeof onReconnectCheck==='function')setTimeout(()=>onReconnectCheck(),0);
    });
    // Owner "Announcement": a short broadcast every signed-in client shows as a non-blocking banner for 10s.
    // liveAnnouncement = {id,at,by,text,kind}. We only show one that is still fresh (<10s old by SERVER time), so
    // reloading later never replays an old one, and the sender's serverTimestamp double-fire is de-duped by id.
    listen('.info/serverTimeOffset',v=>{_svOff=Number(v)||0});
    listen('liveAnnouncement',v=>{
      if(!v||typeof v!=='object'||typeof v.text!=='string'||!v.id||v.id===_annSeen)return;
      const age=Date.now()+_svOff-(Number(v.at)||0);
      if(!(age>=-5000&&age<LIVE_ANN_MS-800))return;      // too old (or no timestamp yet) -> ignore
      _annSeen=v.id;
      {const _ah=typeof onLiveAnnouncement==='function'?onLiveAnnouncement:(typeof ownerAnnouncementBanner==='function'?ownerAnnouncementBanner:null);   // a dedicated live-announce.js wins if the repo has one
        if(_ah)setTimeout(()=>_ah(v,Math.max(1500,LIVE_ANN_MS-Math.max(0,age))),0)}
    });
    // heal my DM memberships as soon as friends load, so messages from a friend always become readable
    
  }
  function watchRoom(id){
    if(roomUnsubs[id])return;
    const u1=onValue(R('rooms/'+id),s=>{C.rooms[id]=s.val();if(ready)emit()},()=>{});
    const u2=onValue(R('roomMembers/'+id),s=>{C.roomMembers[id]=s.val()||{};if(ready)emit()},()=>{});
    roomUnsubs[id]=()=>{u1();u2()};
  }
  const fetchingRooms=new Set();
  // Fallback for a room I know the ID of (e.g. just joined) but whose per-room
  // listener hasn't reported back yet.
  function fetchRoomIfMissing(id){
    if(id==null||C.rooms[id]||fetchingRooms.has(id))return;
    fetchingRooms.add(id);
    Promise.all([get(R('rooms/'+id)),get(R('roomMembers/'+id))]).then(([rs,ms])=>{
      if(rs.exists()){C.rooms[id]=rs.val();C.roomMembers[id]=ms.val()||{};if(ready)emit()}
    }).catch(()=>{}).finally(()=>fetchingRooms.delete(id));
  }
  function watchPreview(key){
    if(previewUnsubs[key]||key===msgKey)return;
    const q=query(R('messages/'+key),orderByChild('at'),limitToLast(30));
    previewUnsubs[key]=onValue(q,s=>{
      if(key===msgKey)return;               // the full listener owns the open chat
      const arr=[];s.forEach(c=>{arr.push({...c.val(),id:c.key,images:c.val().images||[],files:c.val().files||[],pings:c.val().pings||[],text:c.val().text||''})});
      C.messages[key]=arr;if(ready)emit();
      NSFW.sweep(key,arr);
    },()=>{});
  }
  // The message listener follows whichever chat is open
  let pruning=false;
  async function pruneBatch(key,limit,days){
    // one extra minute of margin so clock skew can never make the server reject a whole batch
    const cutoff=Date.now()+SKEW-days*864e5-60000;
    const snap=await get(query(R('messages/'+key),orderByChild('at'),endAt(cutoff),limitToFirst(limit)));
    if(!snap.exists())return 0;
    const msgs={},rx={};let n=0;
    snap.forEach(c=>{msgs['messages/'+key+'/'+c.key]=null;rx['reactions/'+key+'/'+c.key]=null;n++});
    // reactions first (their rule checks the message still exists), best-effort; then the messages themselves
    try{await update(ref(rtdb),rx)}catch(_){}
    await update(ref(rtdb),msgs);
    return n;
  }
  const MSG_LIMIT=100,MSG_STEP=100,msgLimit={};
  function attachMsgListener(key){
    if(msgUnsub){msgUnsub();msgUnsub=null}
    const q=query(R('messages/'+key),orderByChild('at'),limitToLast(msgLimit[key]||MSG_LIMIT));
    msgUnsub=onValue(q,s=>{
      const arr=[];s.forEach(c=>{arr.push({...c.val(),id:c.key})});
      C.messages[key]=arr.map(m=>({...m,images:m.images||[],files:m.files||[],pings:m.pings||[],text:m.text||''}));
      if(ready)emit();
      NSFW.sweep(key,C.messages[key]);
    },err=>console.warn('messages denied',key,err.code));
  }
  function watchMessages(key){
    // VIP Lounge: don't even attach the listener unless I qualify (the rules would just deny it).
    if(key===CFG.VIP_ROOM&&!DB.vipInfo(myId))key=null;
    if(key===CFG.MVP_ROOM&&!mvpAccess(myId))key=null;
    if(key===msgKey)return;
    if(msgUnsub){msgUnsub();msgUnsub=null}
    if(reactUnsub){try{reactUnsub()}catch(_){}reactUnsub=null}
    // Presence: leave whichever context I was in and join the new one, so
    // "who's online" can be scoped to global/this room/this DM instead of
    // showing literally every online user everywhere. Mirrors the typing
    // pattern: onDisconnect handles tab close/crash, we handle a plain
    // context switch ourselves. Needs a matching 'presence' rule (see reply).
    if(presUnsub){try{presUnsub()}catch(_){}presUnsub=null}
    if(presenceSelfRef){try{remove(presenceSelfRef).catch(()=>{})}catch(_){}presenceSelfRef=null}
    C.presenceIds=[];
    msgKey=key;
    if(!key){if(ready)emit();return}
    rejoinScopedPresence();
    msgLimit[key]=MSG_LIMIT;           // every fresh open starts light: only the newest messages
    attachMsgListener(key);
    // Reactions live at their own top-level path (reactions/$key/$msgId/$emoji/$userId)
    // rather than under messages/$key/$msgId, since the message rules only let the
    // ORIGINAL SENDER edit their own message — reactions need to be addable by anyone
    // in the conversation, so they get their own node with its own rules.
    reactUnsub=onValue(R('reactions/'+key),s=>{
      C.reactions[key]=s.val()||{};
      if(ready)emit();
    },()=>{C.reactions[key]={}});
  }
  // Reactions for one message, as [{emoji, ids:[...], mine}], ordered by first-added.
  function reactionsFor(key,msgId){
    const raw=(C.reactions[key]||{})[msgId];
    if(!raw)return[];
    return Object.keys(raw).map(emoji=>{
      const ids=Object.keys(raw[emoji]||{}).map(Number);
      return{emoji,ids,mine:ids.includes(myId)};
    }).filter(r=>r.ids.length>0);
  }
  // Toggle: adds my reaction if I haven't reacted with this emoji yet, removes it if I have.
  async function toggleReaction(key,msgId,emoji){
    if(myId==null)return;
    if(DB.isBanned(myId))throw new Error('Your account has been banned.');
    const path='reactions/'+key+'/'+msgId+'/'+emoji+'/'+myId;
    const already=!!((((C.reactions[key]||{})[msgId]||{})[emoji]||{})[myId]);
    // optimistic local update
    C.reactions[key]=C.reactions[key]||{};
    C.reactions[key][msgId]=C.reactions[key][msgId]||{};
    C.reactions[key][msgId][emoji]=C.reactions[key][msgId][emoji]||{};
    if(already)delete C.reactions[key][msgId][emoji][myId];
    else C.reactions[key][msgId][emoji][myId]=true;
    emit();
    try{
      if(already)await remove(R(path));
      else await set(R(path),true);
    }catch(e){
      // roll back on failure
      C.reactions[key]=C.reactions[key]||{};
      C.reactions[key][msgId]=C.reactions[key][msgId]||{};
      C.reactions[key][msgId][emoji]=C.reactions[key][msgId][emoji]||{};
      if(already)C.reactions[key][msgId][emoji][myId]=true;
      else delete C.reactions[key][msgId][emoji][myId];
      emit();
      throw new Error(e.code==='PERMISSION_DENIED'?'Could not react to that message.':'Reaction failed ('+(e.code||e.message)+')');
    }
  }

  // rebuild the {id: user} map in the shape the UI expects
  const userView=id=>{
    const u=C.users[id];if(!u)return undefined;
    const mine=Number(id)===myId;
    const st=u.style||{};
    const base=defaultSettings();
    const own=mine?(u.settings||{}):{};
    const settings={...base,...own,pings:{...base.pings,...(own.pings||{})}};
    // public bubble style: what EVERYONE sees for this person
    settings.meBubble=st.bubble||own.meBubble||base.meBubble;
    settings.meText=st.text||own.meText||base.meText;
    settings.avatar=st.avatar||(mine?own.avatar:'')||'';
    if(st.radius!=null&&!mine)settings.radius=st.radius;
    return{...u,pronouns:String(st.pronouns||''),description:String(st.description||'').slice(0,descMaxFor(id)),banner:String(st.banner||''),hiddenTags:String(st.hiddenTags||''),id:Number(id),friends:mine?(C.friends[myId]||[]):[],
      lastRead:mine?C.lastRead:{},settings};
  };

  // Signed-in state
  let authResolve;const authReady=new Promise(r=>authResolve=r);
  let sessionDone=Promise.resolve();
  let sessionError=false;                 // true when we could NOT confirm profile state (network etc.)
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // retry a read a few times so a transient hiccup never looks like "no account"
  async function getRetry(path,tries=4){
    let last;
    for(let i=0;i<tries;i++){
      try{return await get(R(path))}catch(e){last=e;await sleep(350*(i+1))}
    }
    throw last;
  }
  let sessionSeq=0;
  onAuthStateChanged(auth,user=>{
    const seq=++sessionSeq;
    sessionDone=(async()=>{
      stopAll();ready=false;myId=null;sessionError=false;myUid=user?user.uid:null;
      if(user){
        try{
          const s=await getRetry('uidToId/'+user.uid);
          if(seq!==sessionSeq)return;
          if(s.exists()){
            const id=s.val();
            const prof=await getRetry('users/'+id);
            if(seq!==sessionSeq)return;
            if(prof.exists()){
              myId=id;C.users[id]=prof.val();startListeners();
              // link this login to its numeric ID for the database rules, but only if it's
              // not already linked — the rules reject this write once idToUid/$id exists,
              // and firing it unconditionally on every login just spams a permission_denied
              // warning into the console every single time (harmless functionally, but it
              // was polluting the write-error diagnostic below by looking like a real failure).
              get(R('idToUid/'+id)).then(existing=>{
                if(!existing.exists())return set(R('idToUid/'+id),user.uid).then(()=>{
                  // Presence (armPresence, fired from .info/connected inside startListeners()
                  // above) may have already tried and failed to write onlineUsers/$id before
                  // this link existed — the rule requires idToUid/$id===auth.uid. Now that it's
                  // linked, re-arm so a brand-new account shows online immediately instead of
                  // waiting on the retry timer or the next reconnect.
                  armPresence();
                });
              }).catch(()=>{});
              // NOTE: no immediate banned-check here — it used stale pre-login C.banned
              // and ran before owners/ had loaded, so it could wrongly lock an owner's
              // menu. startListeners() above re-evaluates the ban lock correctly once
              // both banned/ and owners/ are live (see checkBanLock()).
            }
            // uidToId exists but profile is missing -> genuinely unfinished signup (needsProfile)
          }
        }catch(e){console.error('session load failed',e);sessionError=true}
      }
      if(seq!==sessionSeq)return;
      ready=true;authResolve();emit();
    })();
  });

  return{
    authReady,
    // Re-claims this client's session (kicking whichever client is currently
    // active). Doesn't flip the UI itself — watchSession() above notices the
    // confirmed claim and hides the overlay / re-arms presence from there, so
    // the button reacts the same way whether the claim lands in 50ms or 3s.
    reconnectSession:()=>{if(myId!=null)claimSession()},
    // Owner only: mark everyone offline, then ask every live client to confirm they're really here.
    async requestReconnectAll(){
      if(!isOwner(myId))throw new Error('Only owners can do this.');
      const ids=C.onlineIds.slice();
      if(ids.length){const patch={};ids.forEach(id=>{patch[id]=null});await update(R('onlineUsers'),patch)}
      await set(R('reconnectRequest'),{at:serverTimestamp(),by:myId});
      armPresence();armScopedPresence();
      return ids.length;
    },
    // Owner only: broadcast a live announcement (10s banner on every client) and, optionally, keep a copy in the Announcements chat.
    async sendLiveAnnouncement(text,{kind='info',alsoPost=true}={}){
      if(!isOwner(myId))throw new Error('Only owners can send announcements.');
      text=String(text||'').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g,'').replace(/\n{3,}/g,'\n\n').trim().slice(0,300);
      if(!text)throw new Error('Type an announcement first.');
      if(!['info','event','warn'].includes(kind))kind='info';
      const id=Date.now().toString(36)+Math.random().toString(36).slice(2,7);
      let live=true;
      try{await set(R('liveAnnouncement'),{id,at:serverTimestamp(),by:myId,text,kind})}
      catch(e){live=false;console.warn('liveAnnouncement denied',e&&e.code)}
      let posted=false;
      if(alsoPost){try{await DB.sendMessage(CFG.ANNOUNCEMENTS_ROOM,{senderId:myId,text:text,images:[],pings:[]});posted=true}catch(e){console.warn('announcement chat post failed',e&&e.message)}}
      if(!live&&!posted)throw new Error('Could not send ('+'database rules blocked liveAnnouncement'+').');
      return{live,posted};
    },
    // Called when a user presses "Reconnect" on the owner's check: show as online again.
    confirmOnline(){rcPending=false;if(myId!=null&&!kicked){armPresence();armScopedPresence()}},
    settle:async()=>{await Promise.race([authReady,sleep(12000)]);await sessionDone;},
    onChange:f=>{listeners.add(f);return()=>listeners.delete(f)},
    dmKey,watchMessages,
    // VIP status: owners always count; otherwise a permanent flag or an unexpired 'until'.
    vipInfo:(id,pub,ignoreHidden)=>{id=Number(id);
      /* pub=true: display use, a secret owner falls through to their normal VIP status. ignoreHidden=true (profile card): the person's
         "hide this tag" choice only affects their NAME, so the profile still shows what they really have. */
      const shownOwner=OWNERS_CACHE[id]===1&&(ignoreHidden||!tagHidden(id,'owner'));
      if(isOwner(id)&&!(pub&&!shownOwner))return{kind:'owner'};
      // MVP includes free permanent VIP. Hiding the MVP tag only affects display (pub), never access.
      if(mvpOn(id)&&!(pub&&!ignoreHidden&&tagHidden(id,'mvp')))return{kind:'mvp',since:DB.mvpSince(id)};
      if(pub&&!ignoreHidden&&tagHidden(id,'vip'))return null;
      const v=C.vip[id];if(!v)return null;
      if(v.perm===true)return{kind:'perm'};
      if(typeof v.until==='number'&&v.until>Date.now()+SKEW)return{kind:'day',until:v.until};
      return null},
    flairOf:(id)=>{const f=C.flair[Number(id)];return(f&&typeof f.until==='number'&&f.until>Date.now()+SKEW)?f.preset:null},
    rolesOf:(id)=>C.roles[Number(id)]||{},
    /* Custom roles (decorative, backend-only). customRoles() = every role, highest rank first;
       customRolesOf(id) = the ones that person has; topCustomRole(id) = the one shown on their name. */
    customRoles:()=>customRoleList(),
    customRolesOf:(id)=>customRolesOf(id),
    topCustomRole:(id)=>topCustomRole(id),
    customRolesLoaded:()=>CUSTOM_ROLES_LOADED,
    isMvp:mvpOn,
    mvpAccess,
    mvpSince:(id)=>{const v=C.mvp[Number(id)];return(typeof v==='number'&&v>1)?v:0},
    mvpIds:()=>Object.keys(C.mvp).map(Number).filter(mvpOn),
    // a real (unexpired) VIP record, ignoring MVP's built-in VIP — used so owners can still remove a separate VIP
    hasVipRole:(id)=>{const v=C.vip[Number(id)];return !!(v&&(v.perm===true||(typeof v.until==='number'&&v.until>Date.now()+SKEW)))},
    spinWindow:()=>C.spinWin,
    /* TAG-VISIBILITY:START */
    hiddenTagsOf:(id)=>{const u=C.users[Number(id)];const h=u&&u.style&&u.style.hiddenTags;return(typeof h==='string'&&h)?h.split(',').filter(t=>HIDEABLE_TAGS.indexOf(t)!==-1):[]},
    // Which hideable tags this person really has (ignores their own hide choices) — drives the Account section.
    tagsOwned:(id)=>{id=Number(id);const out=[];
      if(OWNERS_CACHE[id]===1)out.push('owner');
      if(mvpOn(id))out.push('mvp');
      if(isMod(id))out.push('mod');
      const v=C.vip[id];if(v&&(v.perm===true||(typeof v.until==='number'&&v.until>Date.now()+SKEW)))out.push('vip');
      const r=C.roles[id]||{};const f=C.flair[id];
      if((f&&typeof f.until==='number'&&f.until>Date.now()+SKEW)||NAME_STYLE_PRESETS.some(p=>r[p]===true))out.push('flair');
      if(r.confetti===true)out.push('confetti');
      return out},
    /* TAG-VISIBILITY:END */
    lastSpinAt:()=>C.lastSpin||0,
    reactionsFor,toggleReaction,
    isLoggedIn:()=>!!myUid,
    // Only true when we CONFIRMED there is no profile. A failed/slow read is never treated as "no username".
    needsProfile:()=>!!myUid&&!sessionError&&!(myId&&C.users[myId]),
    hadSessionError:()=>sessionError,

    /* --- Users --- */
    usernameTaken(name,exceptId){
      const id=C.usernames[name.toLowerCase()];
      return id!==undefined&&id!==exceptId;
    },
    async checkUsernameFree(name){
      const key=name.toLowerCase();
      // signed out: the public lookup node is readable; signed in: the real index is authoritative
      const path=myUid||auth.currentUser?'usernames/'+key:'usernameLogin/'+key;
      const s=await get(R(path));return !s.exists();
    },
    currentUser(){return myId?userView(myId):null},
    getUser:id=>{const v=userView(id);if(!v)fetchUserIfMissing(id);return v},
    allUsers:()=>Object.keys(C.users).map(userView),
    get:()=>({usernameIndex:C.usernames,rooms:C.rooms}),
    onlineCount:()=>C.online,
    onlineIds:()=>C.onlineIds.slice(),
    // ids currently present in whichever context is open (global / this room / this DM)
    // A scoped presence marker can outlive its owner (stale node after a crash / dropped socket), so only
    // count someone as "here" if the account-level onlineUsers marker agrees they're online. This keeps the
    // chat online lists, the home counter and profile status all telling the same story.
    presenceIds:()=>{const on=new Set(C.onlineIds);return C.presenceIds.filter(id=>on.has(id))},
    // ids of my current friends (not just anyone I've ever DMed — unfriending
    // leaves the old dmMembers record in place so chat history survives, so we
    // filter that record down to the live friends list instead of trusting it alone)
    // who are currently online
    onlineDmIds:uid=>{
      const onlineSet=new Set(C.onlineIds);
      const friendSet=new Set(C.friends[uid]||[]);
      const out=new Set();
      Object.keys(C.dmMembers||{}).forEach(key=>{
        const m=C.dmMembers[key];
        if(!m||!m[uid])return;
        const parts=key.split('_');if(parts[0]!=='dm')return;
        const a=Number(parts[1]),b=Number(parts[2]);
        const other=a===uid?b:a;
        if(other!==uid&&friendSet.has(other)&&onlineSet.has(other))out.add(other);
      });
      return[...out];
    },

    async createUser({username,email,password}){
      if(!CFG.USERNAME_RE.test(username))throw new Error('Username must be 1-20 chars using 0-9, a-z, A-Z, ".", "_" or "-".');
      if(!usernameAllowed(username))throw new Error('That username isn\'t allowed.');
      if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))throw new Error('Please enter a real email address.');
      let cred;
      try{cred=await createUserWithEmailAndPassword(auth,email||(username.toLowerCase()+FAKE),password)}
      catch(e){throw new Error(authMsg(e))}
      // now signed in: safe to check the username
      if(!(await this.checkUsernameFree(username))){
        try{await deleteUser(cred.user)}catch(_){}
        throw new Error('That username is already taken.');
      }
      try{await this._finishProfile(cred.user,username,email||null,'password')}
      catch(e){try{await deleteUser(cred.user)}catch(_){}throw e}
      if(email){try{await sendEmailVerification(cred.user)}catch(_){}}
      return this.currentUser();
    },
    // Claims the next ID, then writes uidToId -> usernames -> users (order required by the rules)
    async _finishProfile(fbUser,username,email,provider){
      let id=(await get(R('uidToId/'+fbUser.uid))).val();      // reuse ID from an interrupted signup
      if(id==null){
        // Atomic claim: counter bump + idToUid + uidToId in ONE request. The database rules only accept
        // it when all three agree, so nobody can squat or steal IDs. On a race, re-read and retry.
        for(let i=0;i<8&&id==null;i++){
          const n=((await get(R('counters/userId'))).val()||0)+1;
          try{
            await update(ref(rtdb),{'counters/userId':n,['idToUid/'+n]:fbUser.uid,['uidToId/'+fbUser.uid]:n});
            id=n;
          }catch(e){
            if(i===7)throw new Error('Could not reserve a user ID. Try again.');
            await sleep(150+Math.random()*250);
          }
        }
      }
      const rec={username,createdAt:Date.now()+SKEW,lastNameChange:0,provider};
      if(email)rec.email=email;
      // ONE atomic write: username claim + profile + login lookup. The rules check they all match each other.
      try{
        await update(ref(rtdb),{
          ['usernames/'+username.toLowerCase()]:id,
          ['users/'+id]:rec,
          ['usernameLogin/'+username.toLowerCase()]:{email:email||(username.toLowerCase()+FAKE)}
        });
      }catch(e){
        console.error('profile write failed',e);
        throw new Error(e.code==='PERMISSION_DENIED'||/permission/i.test(e.message)
          ?'Username was taken or blocked by database rules. Try another.'
          :'Could not save profile: '+(e.code||e.message));
      }
      // seed the cache immediately so the UI never waits on the listener round-trip
      C.users[id]={...rec};C.usernames[username.toLowerCase()]=id;
      myId=id;sessionError=false;startListeners();
      emit();
    },
    async completeGoogleProfile(username){
      if(!CFG.USERNAME_RE.test(username))throw new Error('Username must be 1-20 chars using 0-9, a-z, A-Z, ".", "_" or "-".');
      if(!usernameAllowed(username))throw new Error('That username isn\'t allowed.');
      if(!(await this.checkUsernameFree(username)))throw new Error('That username is already taken.');
      const u=auth.currentUser;
      await this._finishProfile(u,username,u.email||null,'google');
      return this.currentUser();
    },
    async login(idf,password){
      let email=idf.trim();
      if(!email.includes('@')){
        // username login: look up ID, then the account's email
        let rec;
        try{rec=(await get(R('usernameLogin/'+email.toLowerCase()))).val()}
        catch(e){
          throw new Error(e.code==='PERMISSION_DENIED'
            ?'Username sign-in is unavailable right now (database rules block the lookup). Try signing in with your email instead.'
            :'Could not look up that username: '+(e.code||e.message));
        }
        if(!rec)throw new Error('Incorrect username/email or password.');
        email=rec.email||(email.toLowerCase()+FAKE);
      }
      try{await signInWithEmailAndPassword(auth,email,password)}
      catch(e){throw new Error(authMsg(e))}
      await new Promise(r=>setTimeout(r,0));   // let onAuthStateChanged fire
      await this.settle();
      const u=this.currentUser();
      if(!u)throw new Error('Signed in, but your account profile could not be loaded. Try again.');
      return u;
    },
    async googleSignIn(){
      try{await signInWithPopup(auth,new GoogleAuthProvider(),browserPopupRedirectResolver)}
      catch(e){throw new Error(authMsg(e))}
      await new Promise(r=>setTimeout(r,0));   // let onAuthStateChanged fire
      await this.settle();
      return{needsProfile:!this.currentUser()};
    },
    async signOut(){
      signingOut=true;
      if(myId!=null&&!kicked)await remove(R('onlineUsers/'+myId)).catch(()=>{});
      if(msgKey!=null&&myId!=null)await remove(R('presence/'+msgKey+'/'+myId)).catch(()=>{});
      if(myId!=null&&mySessionToken){await get(R('sessions/'+myId)).then(s=>{const v=s.val();if(v&&v.token===mySessionToken)return remove(R('sessions/'+myId))}).catch(()=>{})}
      stopAll();await fbSignOut(auth);myId=null;
    },
    // Nitro-promo alert: has this account already closed it? (saved at giftPromoSeen/$id)
    async giftPromoSeen(){
      if(myId==null)return false;
      try{return (await get(R('giftPromoSeen/'+myId))).val()===true}catch(_){return false}
    },
    async markGiftPromoSeen(){
      if(myId==null)return;
      try{await set(R('giftPromoSeen/'+myId),true)}catch(_){}
    },
    async resetPassword(email){try{await sendPasswordResetEmail(auth,email)}catch(e){throw new Error(authMsg(e))}},
    // Lets a Google-signed-up account also sign in with username/password.
    hasPasswordLogin:()=>!!auth.currentUser?.providerData.some(p=>p.providerId==='password'),
    async setPassword(password){
      const u=auth.currentUser;if(!u)throw new Error('Not signed in.');
      if(password.length<CFG.MIN_PW)throw new Error(`Password must be at least ${CFG.MIN_PW} characters.`);
      const rec=C.users[myId]||{};
      const email=u.email||rec.email||(rec.username?.toLowerCase()+FAKE);
      try{await linkWithCredential(u,EmailAuthProvider.credential(email,password))}
      catch(e){
        if(e.code==='auth/provider-already-linked'||e.code==='auth/credential-already-in-use')
          throw new Error('Password sign-in is already set up for this account.');
        throw new Error(authMsg(e));
      }
      // make sure username-login lookup points at the real email, not a placeholder
      if(rec.username)await set(R('usernameLogin/'+rec.username.toLowerCase()),{email}).catch(()=>{});
    },

    async renameUser(id,newName){
      const u=C.users[id];
      if(!u)throw new Error('Account not loaded yet. Try again in a moment.');
      if(!CFG.USERNAME_RE.test(newName))throw new Error('Invalid username format.');
      if(!usernameAllowed(newName))throw new Error('That username isn\'t allowed.');
      if(newName===u.username)return userView(id);
      const oldKey=u.username.toLowerCase(),newKey=newName.toLowerCase();
      const wait=(u.lastNameChange||0)+CFG.NAME_CHANGE_MS-Date.now();
      if(wait>0&&(u.lastNameChange||0)!==0){const d=Math.ceil(wait/86400000);throw new Error(`You can change your username again in ${d} day${d>1?'s':''}.`);}
      // only a real conflict if the new key belongs to someone ELSE (changing capitalisation of your own name is fine)
      if(newKey!==oldKey){
        const taken=(await get(R('usernames/'+newKey))).val();
        if(taken!=null&&Number(taken)!==Number(id))throw new Error('That username is already taken.');
      }
      let email=u.email;
      if(!email){try{email=((await get(R('usernameLogin/'+oldKey))).val()||{}).email}catch(_){}}
      if(!email)email=oldKey+FAKE;
      const stamp=Date.now()+SKEW;
      // Single atomic multi-path write: claim the new name, update the profile, point the
      // login lookup at the new name, and free the old name+lookup all in one request.
      // Rules are validated against the state that results from ALL of these together, so
      // there is no window where the old name is freed but the new one isn't claimed yet
      // (or vice versa) — which is what let the old username end up permanently stuck
      // ("shows available" in the signed-out check but "already taken" on Create Account)
      // when a partial failure or a slow network landed the writes out of order before.
      const patch={};
      patch['users/'+id+'/username']=newName;
      patch['users/'+id+'/lastNameChange']=stamp;
      if(newKey!==oldKey){
        patch['usernames/'+newKey]=id;
        patch['usernameLogin/'+newKey]={email};
        patch['usernames/'+oldKey]=null;
        patch['usernameLogin/'+oldKey]=null;
      }
      try{
        await update(ref(rtdb),patch);
      }catch(e){
        throw new Error('Could not change username: '+(e.code||e.message));
      }
      C.users[id]={...u,username:newName,lastNameChange:stamp};
      C.usernames[newKey]=id;if(newKey!==oldKey)delete C.usernames[oldKey];
      emit();
      return userView(id);
    },
    /* --- Owner-only: look up an account (by numeric ID or exact username) and rename it ---
       Spaces are allowed in names set this way ONLY (normal signup/self-rename still can't use them).
       The rename is one atomic multi-path write: new name claimed, profile updated, login lookup moved,
       and every old name pointing at that account freed — so there is never a half-renamed state and the
       old username is immediately available again. The database rules still refuse duplicates. */
    async lookupUserForRename(q){
      if(!isOwner(myId))throw new Error('Only owners can look up accounts to rename.');
      q=String(q||'').trim();
      if(!q)throw new Error('Enter a user ID or a username.');
      const ids=[];
      const add=async id=>{
        id=Number(id);if(!Number.isFinite(id)||ids.includes(id))return;
        if(!C.users[id]){try{const sn=await get(R('users/'+id));if(sn.exists())C.users[id]=sn.val()}catch(_){}}
        if(C.users[id])ids.push(id);
      };
      if(/^[0-9]+$/.test(q))await add(q);
      let byName=C.usernames[q.toLowerCase()];
      if(byName==null){try{const sn=await get(R('usernames/'+q.toLowerCase()));if(sn.exists())byName=sn.val()}catch(_){}}
      if(byName!=null)await add(byName);
      return ids.map(id=>{
        const v=userView(id);
        return{id,username:v.username,user:v,deleted:v.deleted===true,banned:!!(C.banned&&C.banned[id]),owner:isOwner(id)};
      });
    },
    async ownerRenameUser(id,rawName){
      if(!isOwner(myId))throw new Error('Only owners can change other people\'s usernames.');
      id=Number(id);
      const u=C.users[id];
      if(!u)throw new Error('That account isn\'t loaded. Look it up again.');
      if(u.deleted===true||u.username==='Deleted User'||(C.banned&&C.banned[id]))throw new Error('Banned/deleted accounts can\'t be renamed. Unban them first.');
      if(isOwner(id)&&id!==myId)throw new Error('You can\'t rename another owner.');
      // collapse accidental double spaces, trim the ends, then validate: letters/digits/._- groups separated by single spaces, 1-20 chars
      const newName=String(rawName||'').replace(/\s+/g,' ').trim();
      if(!newName)throw new Error('Enter the new username.');
      if(newName.length>20||!/^[0-9a-zA-Z._-]+( [0-9a-zA-Z._-]+)*$/.test(newName))
        throw new Error('Usernames are 1-20 chars: 0-9 a-z A-Z . _ - (single spaces allowed between words, none at the ends).');
      if(!usernameAllowed(newName))throw new Error('The content filter blocks that name. Turn off "Filter usernames too" above if you really want it.');
      if(newName===u.username)throw new Error('That is already their username.');
      const newKey=newName.toLowerCase(),oldKey=u.username.toLowerCase();
      // Duplicate check against the live server index (the rules enforce it again). Their own old name (case change) is fine.
      if(newKey!==oldKey){
        const taken=(await get(R('usernames/'+newKey))).val();
        if(taken!=null&&Number(taken)!==id)throw new Error('That username is already taken'+(C.users[taken]&&C.users[taken].deleted?' (reserved by a banned account).':'.'));
        if(C.usernames[newKey]!=null&&Number(C.usernames[newKey])!==id)throw new Error('That username is already taken.');
      }
      // Every index key currently pointing at this account — all of them get freed.
      const oldKeys=new Set([oldKey]);
      Object.keys(C.usernames||{}).forEach(k=>{if(Number(C.usernames[k])===id)oldKeys.add(k)});
      try{const sn=await get(query(R('usernames'),orderByValue(),equalTo(id)));if(sn.exists())Object.keys(sn.val()).forEach(k=>oldKeys.add(k))}catch(_){}
      oldKeys.delete(newKey);
      // Keep the account's real login email (never regenerate it from the new name).
      let email=u.email;
      if(!email){try{email=((await get(R('usernameLogin/'+oldKey))).val()||{}).email}catch(_){}}
      if(!email)email=oldKey+FAKE;
      const stamp=Date.now()+SKEW;
      const patch={};
      patch['users/'+id+'/username']=newName;
      patch['users/'+id+'/lastNameChange']=stamp;   // also stops them instantly reverting the name for the normal cooldown
      if(newKey!==oldKey||!C.usernames[newKey]){
        patch['usernames/'+newKey]=id;
        patch['usernameLogin/'+newKey]={email};
      }
      oldKeys.forEach(k=>{patch['usernames/'+k]=null;patch['usernameLogin/'+k]=null});
      try{await update(ref(rtdb),patch)}
      catch(e){throw new Error(e.code==='PERMISSION_DENIED'?'Database refused the rename. Make sure the updated database rules (username section) are published.':'Could not change username: '+(e.code||e.message))}
      C.users[id]={...u,username:newName,lastNameChange:stamp};
      C.usernames[newKey]=id;oldKeys.forEach(k=>delete C.usernames[k]);
      emit();
      return{id,oldName:u.username,newName};
    },
    /* HALLOWEEN:START ===== Owner-only: set someone's Halloween Pass level (use lookupUserForRename to find them by ID or username) =====
       Writes halloween/claimed/<id> (the level they OWN, which is what grants the roles/badges/effects to everyone who sees them).
       When raising, their logged-in minutes are also lifted to that level's requirement so their own pass screen matches
       (otherwise it would show "Owned" on levels their time hasn't reached). Level 0 removes the pass rewards entirely.
       Allowed by the existing owner branch of halloween/claimed and halloween/progress rules, so no rules change is needed. */
    async ownerSetHalloweenLevel(id,level){
      if(!isOwner(myId))throw new Error('Only owners can change Halloween Pass levels.');
      id=Number(id);level=Math.floor(Number(level));
      const u=C.users[id];
      if(!Number.isFinite(id)||!u)throw new Error('That account isn\'t loaded. Look it up again.');
      if(u.deleted===true||u.username==='Deleted User')throw new Error('Deleted accounts can\'t be given pass levels.');
      if(!Number.isFinite(level)||level<0||level>HW.N)throw new Error('Level must be between 0 and '+HW.N+'.');
      const patch={};
      patch['halloween/claimed/'+id]=level>0?level:null;
      if(level>0){
        const need=hwCum(level);let mins=0;
        try{const sn=await get(R('halloween/progress/'+id));if(sn.exists())mins=Number((sn.val()||{}).mins)||0}catch(_){}
        if(mins<need)patch['halloween/progress/'+id]={mins:need,last:serverTimestamp()};
      }
      try{await update(ref(rtdb),patch)}
      catch(e){throw new Error(e.code==='PERMISSION_DENIED'?'Database refused the change. Make sure the Halloween rules block is published.':'Could not set level: '+(e.code||e.message))}
      const cl={...(window.HW_CLAIMED||{})};if(level>0)cl[id]=level;else delete cl[id];
      window.HW_CLAIMED=cl;
      if(typeof hwRefresh==='function'){try{hwRefresh()}catch(_){}}
      return{id,username:u.username,level};
    },
    /* HALLOWEEN:END */
    // Saves ONE settings key without re-uploading the whole settings blob (which can carry a large
    // background image) — used for small toggles like anti-lag.
    async setSettingKey(id,key,val){
      const cur=C.users[id]||{};
      C.users[id]={...cur,settings:{...(cur.settings||{}),[key]:val}};emit();
      try{await set(R('users/'+id+'/settings/'+key),val)}
      catch(e){console.error('setting save failed',key,e);throw e}
    },
    async updateSettings(id,patch){
      const cur=C.users[id]||{};
      patch={...patch};delete patch.hwTheme;   // hwTheme is only written by setSettingKey (Halloween toggle); a stale snapshot must not overwrite it
      const merged={...(cur.settings||{}),...patch};
      // Avatar lives only in the public `style` node, never in `settings` (it's
      // deliberately stripped out below before every settings save) — so it can
      // NEVER be read back via merged.avatar. Reading it from there always came
      // back undefined and fell through to '', which meant every settings save
      // that wasn't itself changing the avatar (e.g. just picking a banner color)
      // silently wiped the person's profile picture. Carry the real current
      // avatar forward from style unless this patch is explicitly changing it.
      const avatar=('avatar' in patch)?(patch.avatar||''):((cur.style&&cur.style.avatar)||'');
      // Pronouns are public (everyone sees them on your profile card), so like the avatar they live in the
      // `style` node and never in the private `settings` blob. Carried forward unless this patch changes them.
      const pronouns=('pronouns' in patch)?String(patch.pronouns||'').replace(/[\u0000-\u001f\u007f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,30):String((cur.style&&cur.style.pronouns)||'');
      delete merged.pronouns;
      // Profile description is public too, so it lives in `style` like pronouns. Carried forward unless this patch changes it.
      const description=('description' in patch)?String(patch.description||'').replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,descMaxFor(id)):String((cur.style&&cur.style.description)||'');
      delete merged.description;
      // MVP image banner: public like the avatar, so it lives in `style`. Only MVPs can set one; clearing is always allowed.
      const banner=('banner' in patch)?((patch.banner&&hasMvpPerks(id)&&isSafeBannerImg(patch.banner))?patch.banner:''):String((cur.style&&cur.style.banner)||'');
      delete merged.banner;
      // TAG-VISIBILITY: hidden tags are public too (everyone's client needs them), so they live in `style` like pronouns.
      const hiddenTags=('hiddenTags' in patch)?String(patch.hiddenTags||'').split(',').filter((t,i,a)=>HIDEABLE_TAGS.indexOf(t)!==-1&&a.indexOf(t)===i).join(','):String((cur.style&&cur.style.hiddenTags)||'');
      delete merged.hiddenTags;
      const style={bubble:merged.meBubble||'#7c6cff',text:merged.meText||'#ffffff',radius:Number(merged.radius)||16,avatar};
      if(pronouns)style.pronouns=pronouns;
      if(description)style.description=description;
      if(banner)style.banner=banner;
      if(hiddenTags)style.hiddenTags=hiddenTags;       // empty = field omitted, so nothing changes for people who don't use it
      C.users[id]={...cur,settings:merged,style};emit();
      // avatar lives in the public `style` node (above), not `settings` (which is
      // private and rules-limited to short values) — strip it before that write.
      const settingsToSave={...merged};delete settingsToSave.avatar;
      try{
        // public style first (tiny, everyone reads it), then the private settings blob
        await set(R(`users/${id}/style`),style);
        await set(R(`users/${id}/settings`),settingsToSave);
      }catch(e){console.error('settings save failed',e);toast('Could not save settings ('+(e.code||e.message)+')','bad');throw e}
    },
    // Only writes when there is genuinely something newer than what's already marked read.
    // (Without this guard: render -> markRead -> lastRead listener echo -> render -> markRead ... forever.)
    markRead(uid,key){
      const msgs=C.messages[key]||[];
      const newest=msgs.length?Math.max(...msgs.map(m=>Number(m.at)||0)):0;
      const have=C.lastRead[key]||0;
      if(newest<=have)return;
      C.lastRead[key]=newest;
      set(R(`lastRead/${uid}/${key}`),newest).catch(()=>{});
    },

    /* --- Friends --- */
    friends:id=>C.friends[id]||[],
    // Only requests that can actually be acted on: ignore stale ones from deleted/blocked accounts,
    // people who are already friends, or myself - otherwise a ghost request keeps a badge lit that
    // can never be cleared because it never shows up in the Friends list.
    incoming:me=>Object.keys(C.friendReqIn||{}).map(Number).filter(from=>{
      if(from===me)return false;
      const u=C.users[from];if(u&&u.deleted)return false;
      if((C.blocked[me]||[]).includes(from)||(C.blockedBy[me]||[]).includes(from))return false;
      return true;
    }).map(from=>({from,to:me,status:'pending',at:(C.friendReqIn[from]||{}).at})),
    outgoing:me=>(C.friendReqOut[me]||[]),
    async friendReq(from,toUsername){
      let to=C.usernames[toUsername.toLowerCase()];
      if(to===undefined){
        // cache may be stale; ask the server directly
        const s=await get(R('usernames/'+toUsername.toLowerCase()));
        if(s.exists())to=s.val();
      }
      return this.friendReqById(from,to);
    },
    async friendReqById(from,to){
      to=Number(to);
      if(!to||Number.isNaN(to))throw new Error('No user with that username.');
      if(to===from)throw new Error("You can't add yourself.");
      if((C.blocked[from]||[]).includes(to)||(C.blockedBy[from]||[]).includes(to))throw new Error("You can't add this user.");
      if((C.friends[from]||[]).includes(to))throw new Error('Already friends.');
      // they already asked me -> just accept
      if(C.friendReqIn[to]){await this.acceptFriend(from,to);return 'accepted'}
      if((C.friendReqOut[from]||[]).some(r=>r.to===to))throw new Error('Request already sent.');
      try{
        await set(R(`friendRequests/${to}/${from}`),{at:Date.now()});
        await set(R(`sentRequests/${from}/${to}`),true);
      }catch(e){
        await remove(R(`friendRequests/${to}/${from}`)).catch(()=>{});
        throw new Error('Could not send request ('+(e.code||e.message)+')');
      }
      // local echo so the button flips to "Requested" instantly (dedupe: a fast
      // double-click can otherwise get this far twice before the cache updates
      // and would double up the entry even though only one request exists server-side)
      const existing=C.friendReqOut[from]||[];
      if(!existing.some(r=>r.to===to))C.friendReqOut[from]=[...existing,{from,to,status:'pending'}];
      emit();
      return 'sent';
    },
    async acceptFriend(me,other){
      // Order matters for the rules:
      //  1) my side of the friendship          (I own friends/me/*)
      //  2) their side                         (allowed only while their request to me still exists)
      //  3) my DM membership                   (I can only write my own dmMembers entry)
      //  4) clear the request + sent marker
      const key=dmKey(me,other);
      try{
        await set(R(`friends/${me}/${other}`),true);
        await set(R(`friends/${other}/${me}`),true);
        await set(R(`dmMembers/${key}/${me}`),true);
      }catch(e){
        console.error('acceptFriend failed',e);
        throw new Error('Could not accept request ('+(e.code||e.message)+')');
      }
      await remove(R(`friendRequests/${me}/${other}`)).catch(()=>{});
      await remove(R(`sentRequests/${other}/${me}`)).catch(()=>{});
      C.friends[me]=[...new Set([...(C.friends[me]||[]),other])];
      delete C.friendReqIn[other];
      (C.dmMembers[key]=C.dmMembers[key]||{})[me]=true;
      watchPreview(key);emit();
      // the other person's client writes THEIR dmMembers entry when it sees the friendship (ensureDmMemberships)
    },
    async declineFriend(me,other){
      await remove(R(`friendRequests/${me}/${other}`));
      await remove(R(`sentRequests/${other}/${me}`)).catch(()=>{});
      delete C.friendReqIn[other];emit();
    },
    async cancelReq(me,other){
      await remove(R(`friendRequests/${other}/${me}`));
      await remove(R(`sentRequests/${me}/${other}`)).catch(()=>{});
      C.friendReqOut[me]=(C.friendReqOut[me]||[]).filter(r=>r.to!==other);emit();
    },
    async removeFriend(me,other){
      me=Number(me);other=Number(other);
      const before=(C.friends[me]||[]).slice();
      // optimistic: drop them from my list immediately so the UI never looks stuck
      C.friends[me]=before.filter(x=>x!==other);
      delete C.friendReqIn[other];
      emit();
      // my side first (I own friends/me/*) - this is the one that must succeed
      try{await remove(R(`friends/${me}/${other}`))}
      catch(e){
        console.error('removeFriend failed',e);
        C.friends[me]=before;emit();   // roll back so the list matches the server
        throw new Error('Could not remove friend ('+(e.code||e.message)+')');
      }
      // their side too, awaited, so they stop seeing me as a friend (rules may refuse this - then they can remove me themselves)
      let both=true;
      try{await remove(R(`friends/${other}/${me}`))}catch(e){both=false;console.warn('could not clear their side of the friendship',e&&e.code)}
      // clear any leftover request markers either way, so the two of you can re-add each other cleanly
      await Promise.all([
        remove(R(`friendRequests/${me}/${other}`)).catch(()=>{}),
        remove(R(`sentRequests/${other}/${me}`)).catch(()=>{}),
        remove(R(`friendRequests/${other}/${me}`)).catch(()=>{}),
        remove(R(`sentRequests/${me}/${other}`)).catch(()=>{})
      ]);
      C.friendReqOut[me]=(C.friendReqOut[me]||[]).filter(r=>r.to!==other);
      emit();
      return{both};
    },
    isFriend:(me,other)=>(C.friends[me]||[]).includes(other),
    /* --- Blocking ---
       blocked/$me/$other = true    (people I blocked; only I can read/write my own list)
       blockedBy/$other/$me = true  (mirror, written by me at the same time, so $other's
       client can see I blocked them and hide my messages/requests without ever reading my list) */
    blockedList:me=>C.blocked[me]||[],
    isBlocked:(me,other)=>(C.blocked[me]||[]).includes(other),      // I blocked them
    isBlockedBy:(me,other)=>(C.blockedBy[me]||[]).includes(other),  // they blocked me
    async blockUser(me,other){
      other=Number(other);
      if(other===me)throw new Error("You can't block yourself.");
      try{
        await set(R(`blocked/${me}/${other}`),true);
        await set(R(`blockedBy/${other}/${me}`),true);
      }catch(e){throw new Error('Could not block ('+(e.code||e.message)+')')}
      C.blocked[me]=[...new Set([...(C.blocked[me]||[]),other])];emit();
      // Blocking also ends any friendship/pending requests between the two of you.
      if((C.friends[me]||[]).includes(other))await this.removeFriend(me,other).catch(()=>{});
      await remove(R(`friendRequests/${me}/${other}`)).catch(()=>{});
      await remove(R(`friendRequests/${other}/${me}`)).catch(()=>{});
      await remove(R(`sentRequests/${me}/${other}`)).catch(()=>{});
      await remove(R(`sentRequests/${other}/${me}`)).catch(()=>{});
      delete C.friendReqIn[other];
      C.friendReqOut[me]=(C.friendReqOut[me]||[]).filter(r=>r.to!==other);emit();
    },
    async unblockUser(me,other){
      other=Number(other);
      try{
        await remove(R(`blocked/${me}/${other}`));
        await remove(R(`blockedBy/${other}/${me}`)).catch(()=>{});
      }catch(e){throw new Error('Could not unblock ('+(e.code||e.message)+')')}
      C.blocked[me]=(C.blocked[me]||[]).filter(x=>x!==other);emit();
    },
    hasIncoming:from=>!!C.friendReqIn[from],
    hasOutgoing:(me,to)=>(C.friendReqOut[me]||[]).some(r=>r.to===to),

    /* --- Rooms --- */
    async createRoom(owner,name){
      name=name.trim();
      if(!name||name.length>30)throw new Error('Room name must be 1-30 characters.');
      const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const mkCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b=>chars[b%32]).join('');
      const id=push(R('rooms')).key;
      // 1) claim a unique join code (roomCodes rule: write only if it doesn't already exist)
      let code=null;
      for(let i=0;i<6&&!code;i++){
        const c=mkCode();
        try{await set(R('roomCodes/'+c),id);code=c}catch(e){if(e.code!=='PERMISSION_DENIED')throw e}
      }
      if(!code)throw new Error('Could not generate a room code. Try again.');
      const room={name,ownerId:owner,code};
      try{
        // 2) room record (new room => anyone signed in may create it; ownerId must be me)
        await set(R('rooms/'+id),room);
        // 3) my membership + my personal room index
        await set(R('roomMembers/'+id+'/'+owner),true);
        await set(R('userRooms/'+owner+'/'+id),true);
      }catch(e){
        await remove(R('rooms/'+id)).catch(()=>{});
        console.error('createRoom failed',e);
        throw new Error('Could not create room ('+(e.code||e.message)+'). Make sure the latest database rules are published.');
      }
      C.rooms[id]=room;C.roomMembers[id]={[owner]:true};
      if(!C.myRoomIds.includes(id))C.myRoomIds=[...C.myRoomIds,id];
      watchRoom(id);emit();
      return{id,name,code,ownerId:owner};
    },
    async joinRoom(uid,code){
      code=code.trim().toUpperCase();
      if(!/^[A-Z0-9]{6}$/.test(code))throw new Error('Room codes are 6 letters/numbers.');
      const id=(await get(R('roomCodes/'+code))).val();
      if(!id)throw new Error('No room with that code.');
      await set(R(`roomMembers/${id}/${uid}`),true);
      await set(R('userRooms/'+uid+'/'+id),true);
      if(!C.myRoomIds.includes(id))C.myRoomIds=[...C.myRoomIds,id];
      watchRoom(id);fetchRoomIfMissing(id);emit();
      return{id};
    },
    async leaveRoom(uid,id){
      await remove(R(`roomMembers/${id}/${uid}`));
      await remove(R(`userRooms/${uid}/${id}`)).catch(()=>{});
      C.myRoomIds=C.myRoomIds.filter(x=>x!==id);emit();
    },
    myRooms:uid=>C.myRoomIds.filter(id=>C.rooms[id]).map(id=>({id,...C.rooms[id],type:'private',members:Object.keys(C.roomMembers[id]||{}).map(Number)})),
    async leaveRoom(me,roomId){
      try{
        await remove(R(`roomMembers/${roomId}/${me}`));
        await remove(R(`userRooms/${me}/${roomId}`)).catch(()=>{});
      }catch(e){throw new Error('Could not leave room ('+(e.code||e.message)+')')}
      C.myRoomIds=(C.myRoomIds||[]).filter(id=>id!==roomId);emit();
      // If that was the last member, clean up the room itself. This can fail silently if the
      // rules on this project haven't been updated to allow deleting an empty room — the room
      // just sits there unused until an owner deletes it, which is harmless.
      try{
        const snap=await get(R(`roomMembers/${roomId}`));
        if(!snap.exists()){
          await remove(R(`rooms/${roomId}`)).catch(()=>{});
          await remove(R(`roomMembers/${roomId}`)).catch(()=>{});
        }
      }catch(_){}
    },
    // Finds every message by a user ID, across every conversation the CURRENT
    // user (the owner running this) can actually read: global chat, rooms the
    // owner is a member of, and DMs the owner is a member of (their friends'
    // DMs). Rules give clients no way to see conversations they're not part
    // of — even for owners — so this can't reach every conversation on the
    // whole server; only what this owner's own account has access to. Banning
    // also makes the banned account's own client delete its own messages
    // everywhere it can see (see purgeUserMessages), so no admin script is needed.
    async searchUserMessages(userId){
      userId=Number(userId);
      const keys=['global','announcements','shitpost',...C.myRoomIds.filter(id=>C.rooms[id]),
        ...(C.friends[myId]||[]).map(f=>dmKey(myId,f))];
      const results=[];
      await Promise.all(keys.map(async key=>{
        try{
          const snap=await get(R('messages/'+key));
          const val=snap.val();if(!val)return;
          Object.entries(val).forEach(([mid,msg])=>{
            if(Number(msg.senderId)===userId){
              results.push({id:mid,key,at:msg.at,text:msg.text||'',images:msg.images||[],files:msg.files||[]});
            }
          });
        }catch(_){/* not readable by this account — skip */}
      }));
      results.sort((a,b)=>b.at-a.at);
      return results;
    },
    getRoom:id=>{
      if(!C.rooms[id]){fetchRoomIfMissing(id);return undefined}
      return{id,...C.rooms[id],members:Object.keys(C.roomMembers[id]||{}).map(Number)};
    },

    /* --- Messages --- */
    /* Anti-raid: if an account fires NUKE_MSGS messages inside NUKE_WINDOW_MS on THIS
       client, we ban them client-side as a first line of defense (a modified/hostile
       client can skip this, which is why the 1.5s floor below is also enforced by the
       database rules themselves — that part can't be bypassed by any client).
       Banning no longer signs the user out or wipes their local session: they stay
       logged in (so they can't ban-evade by making a fresh account) but every write
       the rules protect (sending messages, changing settings, etc.) is rejected. */
    _sendTimes:[],
    async antiNuke(id){
      if(!ownersKnown()||!MODS_LOADED||!ADMINS_LOADED)return; // owners/ or mods/ hasn't loaded yet this session —
      // isOwner()/isMod() could give a false negative for a real owner/mod right now, so
      // refuse to auto-ban anyone until we actually know who they are. A few extra fast
      // messages getting through for one beat is far safer than wrongly banning someone.
      if(isOwner(id)||isAdmin(id)||isMod(id))return; // owners, admins and mods are never auto-banned by the client-side spam heuristic
      if(DB._nuking)return;DB._nuking=true;
      try{await DB.banUser(id)}catch(e){console.warn('anti-nuke ban failed',e)}
      DB._nuking=false;
    },
    /* --- Owner / mod moderation --- */
    isOwner(id){return isOwner(id)},
    isMod(id){return isMod(id)},
    isAdmin(id){return isAdmin(id)},
    async banUser(id){
      if(!isOwner(myId)&&!isAdmin(myId))throw new Error('Only owners and admins can ban.');
      if(isOwner(id))throw new Error('Owners cannot be banned.');
      if(!isOwner(myId)&&isAdmin(id))throw new Error('Admins cannot ban other admins.');
      await set(R('banned/'+id),true);
      try{if(typeof tosIpBanUser==='function')tosIpBanUser(id).catch(e=>console.warn('ip ban failed',e&&e.code||e))}catch(_){}   // banned accounts are IP-banned too (if they accepted the TOS)
      C.banned[id]=true;checkBanLock(myId,C.banned); // update local state immediately; don't wait on the listener round-trip
      await update(R('users/'+id),{deleted:true,username:'Deleted User'});
      // Deliberately NOT freeing usernames/$oldKey or usernameLogin/$oldKey here:
      // a banned account's old username stays permanently reserved (still pointing
      // at this now-deleted id) so nobody else can ever sign up or rename into it.
      await remove(R('onlineUsers/'+id)).catch(()=>{});
      // Cascade-delete this user's messages everywhere THIS owner can reach (global, VIP,
      // announcements, my rooms/DMs). The banned account's own client wipes the rest
      // (its own rooms/DMs) the next time it is open — see purgeUserMessages().
      DB.purgeUserMessages(id).catch(e=>console.warn('ban cleanup failed',e));
    },
    // Deletes every message by `userId` in all chats the CURRENT account can read.
    // Works for an owner (deleting someone else's) and for the banned account itself
    // (the rules let a sender delete their own messages, banned or not).
    async purgeUserMessages(userId){
      userId=Number(userId);
      const keys=[CFG.GLOBAL_ROOM,'announcements','shitpost'];
      if(isOwner(myId)||DB.vipInfo(myId))keys.push(CFG.VIP_ROOM);
      if(mvpAccess(myId))keys.push(CFG.MVP_ROOM);
      (C.myRoomIds||[]).filter(r=>C.rooms[r]).forEach(r=>keys.push(r));
      (C.friends[myId]||[]).forEach(f=>keys.push(dmKey(myId,f)));
      const items=[];
      await Promise.all([...new Set(keys)].map(async key=>{
        let snap=null;
        try{snap=await get(query(R('messages/'+key),orderByChild('senderId'),equalTo(userId)))}
        catch(_){try{snap=await get(R('messages/'+key))}catch(__){return}}   // not indexed / not readable
        snap.forEach(c=>{const v=c.val();if(v&&Number(v.senderId)===userId)items.push({key,id:c.key})});
      }));
      return items.length?DB.deleteMessagesBulk(items):{ok:0,fail:0};
    },
    async unbanUser(id){
      // Owners and admins can both unban. An admin may not touch an owner or another admin —
      // the same limit that applies to banning — and the database rules enforce it again server-side.
      if(!isOwner(myId)&&!isAdmin(myId))throw new Error('Only owners and admins can unban.');
      if(!isOwner(myId)&&(isOwner(id)||isAdmin(id)))throw new Error('Admins can\'t unban owners or other admins.');
      // An unban is now an EXPLICIT record (banned/$id = false) instead of the flag simply vanishing.
      // A missing flag is what a client sees before banned/ has loaded, so "missing" must never be
      // read as "unbanned" — that misreading is what silently un-froze banned accounts.
      await set(R('banned/'+id),false);
      try{if(typeof tosIpUnbanUser==='function')tosIpUnbanUser(id).catch(()=>{})}catch(_){}
      C.banned[id]=false;checkBanLock(myId,C.banned); // update local state immediately; don't wait on the listener round-trip
      // Restore the profile right now (new username, un-delete). Only an OWNER can do this part —
      // the rules deliberately keep "write someone else's username" to owners — so for an admin's
      // unban this returns null and the account repairs itself on its own next sign-in instead
      // (restoreBannedAccount). Either way the unban itself has already landed.
      try{return await DB.ownerRestoreUnbanned(id)}catch(e){console.warn('owner restore skipped:',e&&(e.code||e.message))}
      // NOTE: this is deliberately all an owner CAN do here. users/$id only lets an owner
      // write it in the exact "ban" shape (deleted:true, username:'Deleted User') — there's
      // no rule letting an owner set someone else's username or clear their `deleted` flag,
      // since that would mean owners could rename/impersonate other accounts at will. So
      // unban alone used to leave the account stuck showing "Deleted User" forever, with
      // their old username permanently reserved and unusable by anyone. The actual profile
      // repair (new generated username, old name freed) has to be done by that account's
      // OWN auth the next time they sign back in — see restoreBannedAccount() below, which
      // fires automatically on their client once banned/$id is gone.
    },
    async ownerRestoreUnbanned(id){
      id=Number(id);if(!isOwner(myId)||isOwner(id))return null;
      let u=C.users[id];
      try{const sn=await get(R('users/'+id));if(sn.exists())u=sn.val()}catch(_){}
      if(!u||u.deleted!==true||u.username!=='Deleted User')return null;
      if(!u.email)return null;   // no stored login email: the account restores itself on its next sign-in
      if((await get(R('banned/'+id))).val()!==false)return null;
      let oldKeys=[];
      try{const s2=await get(query(R('usernames'),orderByValue(),equalTo(id)));if(s2.exists())oldKeys=Object.keys(s2.val())}catch(_){}
      let newName,newKey,tries=0,free=false;
      do{
        newName='UnbannedUser'+Math.floor(100000+Math.random()*900000);newKey=newName.toLowerCase();
        try{free=await DB.checkUsernameFree(newName)}catch(_){free=false}
        tries++;
      }while(!free&&tries<8);
      if(!free)throw new Error('no free name');
      const stamp=Date.now()+SKEW,patch={};
      patch['users/'+id+'/username']=newName;
      patch['users/'+id+'/deleted']=null;
      patch['users/'+id+'/lastNameChange']=stamp;
      patch['usernames/'+newKey]=id;
      patch['usernameLogin/'+newKey]={email:u.email};
      oldKeys.forEach(k=>{patch['usernames/'+k]=null;patch['usernameLogin/'+k]=null});
      await update(ref(rtdb),patch);
      const nu={...u,username:newName,lastNameChange:stamp};delete nu.deleted;
      C.users[id]=nu;C.usernames[newKey]=id;oldKeys.forEach(k=>delete C.usernames[k]);
      emit();
      return newName;
    },
    /* Owner-only TOS acceptance log (tosLog/, written by /api/tos with the Admin SDK — see
       SETUP-SECURITY.md). It holds the raw IP, so the rules let only owners read it, and it is
       fetched on demand rather than watched: a non-owner's listener would just be denied. */
    async tosLog(){
      if(!isOwner(myId))throw new Error('Only owners can see the TOS log.');
      const sn=await get(R('tosLog'));
      const v=sn.val()||{};
      return Object.keys(v).map(id=>({id:Number(id),...(v[id]||{})}))
        .filter(r=>!isNaN(r.id))
        .sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0));
    },
    // Everyone whose mute has not expired yet, soonest to expire first.
    mutedIds(){const n=Date.now()+SKEW;return Object.keys(C.muted||{})
      .filter(k=>typeof C.muted[k]==='number'&&C.muted[k]>n)
      .map(Number).filter(x=>!isNaN(x))
      .sort((a,b)=>C.muted[a]-C.muted[b])},
    // Everyone currently banned (an explicit false means "unbanned", so only true counts).
    bannedIds(){return Object.keys(C.banned||{}).filter(k=>C.banned[k]===true).map(Number).filter(n=>!isNaN(n))},
    async confirmBannedOnServer(id){try{return(await get(R('banned/'+id))).val()===true}catch(_){return false}},
    isBanned(id){return!!C.banned&&!!C.banned[id]},
    /* --- Automatic cleanup of old data ---
       Messages older than modSettings/retentionDays (default 7, 0 = keep forever) are deleted. The database
       RULES enforce that only messages past that age can be deleted by someone who isn't the sender/an
       owner, so a client can never wipe recent chat. Every signed-in client trims a small batch in the chats
       it can see; owners trim faster. Also clears this account's used-up send-rate slots and stale ping marks. */
    retentionDays(){
      if(!MODSET_LOADED)return 0;                      // not known yet => do nothing
      const v=MODSET.retentionDays;
      return typeof v==='number'?v:7;
    },
    async pruneRun(opts){
      opts=opts||{};
      if(pruning||myId==null||DB.isBanned(myId)||!ready)return{deleted:0,busy:true};
      pruning=true;let total=0;
      try{
        // 1) this account's used-up rate slots (one is left behind by every message ever sent)
        try{
          const rs=await get(R('rate/'+myId));
          if(rs.exists()){
            const cut=Date.now()+SKEW-600000,upd={};let n=0;
            rs.forEach(c=>{if(n<450&&Number(c.val())<cut){upd['rate/'+myId+'/'+c.key]=null;n++}});
            if(n)await update(ref(rtdb),upd);
          }
        }catch(_){}
        const days=DB.retentionDays();
        // 2) ping "seen" marks for messages that no longer exist
        try{
          const seen=C.pingSeen||{},cut=Date.now()+SKEW-((days||14)+2)*864e5,upd={};let n=0;
          Object.keys(seen).forEach(k=>{if(n<450&&Number(seen[k])<cut){upd['pingSeen/'+myId+'/'+k]=null;n++}});
          if(n){await update(ref(rtdb),upd);n&&Object.keys(upd).forEach(p=>{delete C.pingSeen[p.split('/').pop()]})}
        }catch(_){}
        // 3) old messages
        if(days>0){
          const per=opts.aggressive?40:25,perKey=opts.aggressive?(opts.maxBatches||60):1;
          const keys=[CFG.GLOBAL_ROOM];
          if(isOwner(myId)||DB.vipInfo(myId))keys.push(CFG.VIP_ROOM);
          if(mvpAccess(myId))keys.push(CFG.MVP_ROOM);
          (C.myRoomIds||[]).forEach(r=>keys.push(r));
          (C.friends[myId]||[]).forEach(f=>keys.push(dmKey(myId,f)));
          for(const key of keys){
            for(let b=0;b<perKey;b++){
              const n=await pruneBatch(key,per,days);
              total+=n;if(opts.onProgress)opts.onProgress(total,key);
              if(n<per)break;
              if(opts.aggressive)await sleep(450);
            }
          }
        }
      }catch(e){console.warn('cleanup failed',e.code||e.message)}
      finally{pruning=false}
      return{deleted:total};
    },
    async setRetention(days){
      if(!isOwner(myId))throw new Error('Only owners can change this.');
      days=Math.round(Number(days));
      if(!(days===0||(days>=1&&days<=365)))throw new Error('Pick 0 (keep forever) or 1–365 days.');
      await update(R('modSettings'),{retentionDays:days});
    },
    /* --- Older history, loaded only when you scroll up to it --- */
    canLoadOlder(key){return key===msgKey&&(C.messages[key]||[]).length>=(msgLimit[key]||MSG_LIMIT)&&(msgLimit[key]||MSG_LIMIT)<1500},
    loadOlder(key){
      if(!DB.canLoadOlder(key))return false;
      msgLimit[key]=(msgLimit[key]||MSG_LIMIT)+MSG_STEP;
      attachMsgListener(key);return true;
    },
    /* --- Pings marked as read (synced across devices) --- */
    pingSeenMap(){return C.pingSeen||{}},
    async savePingsSeen(map){
      const ids=Object.keys(map||{});if(!ids.length||myId==null)return;
      const upd={};ids.forEach(k=>{upd['pingSeen/'+myId+'/'+k]=map[k]});
      C.pingSeen=C.pingSeen||{};ids.forEach(k=>C.pingSeen[k]=map[k]);
      await update(ref(rtdb),upd);
    },
    // Self-service repair for a just-unbanned account: only the account's own auth can
    // rewrite its username (the security rules don't let an owner do this on someone
    // else's behalf), so this runs on that user's own client right after sign-in once
    // their ban has been lifted but their profile is still frozen as "Deleted User".
    // Frees whatever old username was reserved at ban time and issues a fresh generated
    // one (UnbannedUserXXXXXX) that they're free to change any time in Settings.
    needsUnbanRestore(){
      const id=myId;if(id==null||!BANNED_LOADED||!ownersKnown())return false;   // never decide before the ban list is really known
      const u=C.users[id];
      // only an explicit unban (banned/$id === false) qualifies; a missing flag never does
      return!!u&&u.deleted===true&&u.username==='Deleted User'&&!!C.banned&&C.banned[id]===false;
    },
    async restoreBannedAccount(){
      const id=myId;if(id==null)return null;
      const u=C.users[id];
      if(!u||u.username!=='Deleted User'||u.deleted!==true)return null; // nothing to restore
      // Ask the SERVER (not the local cache) and insist on an explicit unban record, both now and again
      // right before writing. The old version only looked at C.banned, which is empty for the first
      // moments after sign-in — so a banned account reloading the page could "restore" itself.
      const confirmUnbanned=async()=>{try{const b=await get(R('banned/'+id));return b.val()===false}catch(_){return false}};
      if(!(await confirmUnbanned()))return null;
      // Find whatever username(s) still point at me from before the ban, so they can be freed.
      let oldKeys=[];
      try{
        const s=await get(query(R('usernames'),orderByValue(),equalTo(id)));
        if(s.exists())oldKeys=Object.keys(s.val());
      }catch(_){/* best-effort — worst case the old name just stays reserved */}
      // Pick a fresh, available placeholder name.
      let newName,newKey,tries=0,free=false;
      do{
        newName='UnbannedUser'+Math.floor(100000+Math.random()*900000);
        newKey=newName.toLowerCase();
        try{free=await this.checkUsernameFree(newName)}catch(_){free=false}
        tries++;
      }while(!free&&tries<8);
      if(!free)throw new Error('Could not find an available name to restore your account with. Try again in a moment.');
      if(!(await confirmUnbanned()))return null;   // re-check after all the awaits above
      const email=u.email||(newKey+FAKE);
      const stamp=Date.now()+SKEW;
      const patch={};
      patch['users/'+id+'/username']=newName;
      patch['users/'+id+'/deleted']=null;          // un-freeze the account
      patch['users/'+id+'/lastNameChange']=stamp;   // must change alongside username, per the rules
      patch['usernames/'+newKey]=id;
      patch['usernameLogin/'+newKey]={email};
      oldKeys.forEach(k=>{patch['usernames/'+k]=null;patch['usernameLogin/'+k]=null;}); // free the old name for anyone to use
      await update(ref(rtdb),patch);
      const nu={...u,username:newName,lastNameChange:stamp};delete nu.deleted;
      C.users[id]=nu;C.usernames[newKey]=id;oldKeys.forEach(k=>delete C.usernames[k]);
      emit();
      return newName;
    },
    /* Mute: blocks sending only (menus, settings, reading all still work). Stored as
       muted/$id = a future ms timestamp (auto-expires) or false/absent = not muted.
       Owners can mute for any duration. Mods can mute too, but only for one of the
       preset MOD_MUTE_OPTS durations, and never against an owner or another mod — the
       rules enforce both of those independently, this is just so a compromised/hostile
       client gets a clear error instead of a confusing PERMISSION_DENIED. */
    // NSFW penalty applied by the offender's own client when the pre-send scan blocks an
    // image: a 1-hour self-mute. The database rules allow a user to mute themselves (never
    // to lift a mute), so it is enforced server-side like any other mute.
    // Rules agreement, saved per account at rulesAgreed/<id> = {v:<rules version>,at:<time>}
    async rulesAgreement(){const sn=await get(R('rulesAgreed/'+myId));return sn.exists()?sn.val():null},
    async agreeRules(v){await set(R('rulesAgreed/'+myId),{v,at:Date.now()+SKEW})},
    async selfMuteNsfw(){
      if(isOwner(myId))return;
      await set(R('muted/'+myId),Date.now()+SKEW+3600000);
    },
    async muteUser(id,durationMs){
      if(!isOwner(myId)&&!isAdmin(myId)&&!isMod(myId))throw new Error('Only owners, admins and mods can mute.');
      if(isOwner(id))throw new Error('Owners cannot be muted.');
      if(!isOwner(myId)){
        if(isAdmin(id))throw new Error('Admins cannot be muted.');
        if(isAdmin(myId)){
          if(!(durationMs>0&&durationMs<=7*86400000))throw new Error('Admins can mute for up to 7 days.');
        }else{
          if(isMod(id))throw new Error('Mods cannot mute other mods.');
          if(!MOD_MUTE_OPTS.some(([m])=>m*60000===durationMs))throw new Error('Mods can only use the preset timeout durations.');
        }
      }
      const until=Date.now()+SKEW+durationMs;
      await set(R('muted/'+id),until);
    },
    async unmuteUser(id){
      if(!isOwner(myId)&&!isAdmin(myId)&&!isMod(myId))throw new Error('Only owners, admins and mods can unmute.');
      // Removing the node (not setting it to `false`) — Firebase rules compare
      // muted/$id's value against `now` with <=, and comparing the boolean `false`
      // to a number never evaluates true in the rules engine, so a stored `false`
      // permanently failed the "not muted" check and could never send again.
      // Removing the key makes it genuinely absent, which the rules already treat
      // as "not muted".
      await remove(R('muted/'+id)).catch(()=>{});
    },
    isMuted(id){
      const v=C.muted&&C.muted[id];
      return typeof v==='number'&&v>Date.now()+SKEW;
    },
    muteRemainingMs(id){
      const v=C.muted&&C.muted[id];
      return typeof v==='number'?Math.max(0,v-(Date.now()+SKEW)):0;
    },
    async setFilterSettings({filterEnabled,filterNames,customNames}){
      if(!isOwner(myId))throw new Error('Only owners can change filter settings.');
      const upd={};
      if(filterEnabled!=null)upd.filterEnabled=!!filterEnabled;
      if(filterNames!=null)upd.filterNames=!!filterNames;
      if(customNames!=null)upd.customNames=!!customNames;
      await update(R('modSettings'),upd);
    },
    /* --- Owner: grant/revoke VIP directly (no spin required) --- */
    async giveVip(id,kind){
      if(!isOwner(myId))throw new Error('Only owners can grant VIP.');
      id=Number(id);if(!id)throw new Error('Enter a valid user ID.');
      if(isOwner(id))throw new Error('Owners already have full access.');
      if(kind==='perm')await set(R('vip/'+id),{perm:true});
      else if(kind==='24h')await set(R('vip/'+id),{until:Date.now()+SKEW+86400000});
      else throw new Error('Unknown VIP duration.');
    },
    async removeVip(id){
      if(!isOwner(myId))throw new Error('Only owners can remove VIP.');
      id=Number(id);if(!id)throw new Error('Enter a valid user ID.');
      await remove(R('vip/'+id)).catch(()=>{});
    },
    /* --- Owner: grant/revoke MVP (permanent until removed) --- */
    async giveMvp(id){
      if(!isOwner(myId))throw new Error('Only owners can grant MVP.');
      id=Number(id);if(!id)throw new Error('Enter a valid user ID.');
      if(isOwner(id))throw new Error('Owners already have every MVP perk.');
      if(mvpOn(id))throw new Error('That user is already an MVP.');
      try{await update(ref(rtdb),{['mvp/'+id]:Math.round(Date.now()+SKEW)})}
      catch(e){throw new Error(e.code==='PERMISSION_DENIED'?'Database refused it. Publish the MVP database rules (see SETUP-MVP.md).':'Could not grant MVP: '+(e.code||e.message))}
    },
    async removeMvp(id){
      if(!isOwner(myId))throw new Error('Only owners can remove MVP.');
      id=Number(id);if(!id)throw new Error('Enter a valid user ID.');
      try{await update(ref(rtdb),{['mvp/'+id]:null,['spinWin/'+id]:null})}
      catch(e){throw new Error(e.code==='PERMISSION_DENIED'?'Database refused it. Publish the MVP database rules (see SETUP-MVP.md).':'Could not remove MVP: '+(e.code||e.message))}
    },
    /* --- Version history / forced updates --- */
    // The build this tab is actually running, from the <meta name="build-version"> tag
    // baked into the deployed index.html — never taken from the database.
    myBuildVersion(){return MY_BUILD},
    // Live view of appVersion/ (current + history), or null before the first snapshot arrives.
    versionState(){return APP_VERSION_CACHE},
    versionHistory(){
      const h=(APP_VERSION_CACHE&&APP_VERSION_CACHE.history)||{};
      return Object.values(h).sort((a,b)=>b.at-a.at);
    },
    // Pins `version` as canonical in the database and logs it to history/. Every other
    // signed-in client is watching appVersion/current live and reloads once it disagrees
    // with its own build (see checkForcedVersion() above) — this is what "force everyone
    // onto the current version" actually does; there's no separate broadcast needed.
    async forceVersion(version){
      if(!isOwner(myId))throw new Error('Only owners can force a version update.');
      version=String(version||'').trim();
      if(!version)throw new Error('Enter a version label.');
      if(version.length>60)throw new Error('Version label is too long.');
      const at=Date.now()+SKEW;
      const upd={};
      upd['appVersion/current']=version;
      upd['appVersion/updatedAt']=at;
      upd['appVersion/history/'+at]={version,at,by:myId};
      await update(ref(rtdb),upd);
    },
    async sendMessage(key,{senderId,text,images,files,pings,replyTo}){
      files=(typeof FILES!=='undefined')?FILES.clean(files).map(f=>{const o={url:f.url,name:f.name,size:f.size,kind:f.kind};if(f.preview)o.preview=f.preview;return o}):[];
      if(typeof tosGateGuard==='function')await tosGateGuard();   // TOS not accepted / VPN / IP-banned network -> throws, nothing is sent
      if(key===CFG.VIP_ROOM&&!DB.vipInfo(senderId))throw new Error('VIP Chat is for VIP members. Win VIP from the Daily Spin.');
      if(key===CFG.MVP_ROOM&&!mvpAccess(senderId))throw new Error('MVP Chat is for MVPs. MVP is a 0.1% prize on the Daily Spin.');
      if(key===CFG.SHITPOST_ROOM&&!isStaff(senderId))throw new Error('Only mods, admins and owners can post in #shitpost.');
      if(key!==CFG.ANNOUNCEMENTS_ROOM&&text&&text.length>maxMsgFor(senderId))throw new Error('Message is too long (max '+maxMsgFor(senderId)+' characters'+(isMvp(senderId)||isOwner(senderId)?'':'; MVPs get '+CFG.MAX_MSG*CFG.MVP_MSG_MULT)+').');
      if(DB.isBanned(senderId))throw new Error('Your account has been banned.');
      // The local ban list can lag (or not be loaded yet) right after a ban. Ask the server directly so a
      // banned account is stopped HERE, before the optimistic echo, instead of the message appearing and
      // then being auto-removed when the database rejects it.
      if(!BANNED_LOADED&&!isOwner(senderId)){
        let srvBanned=false;
        try{srvBanned=(await get(R('banned/'+senderId))).val()===true}catch(_){}
        if(srvBanned){C.banned[senderId]=true;checkBanLock(myId,C.banned);throw new Error('Your account has been banned.')}
      }
      if(DB.isMuted(senderId)){
        const secs=Math.ceil(DB.muteRemainingMs(senderId)/1000);
        throw new Error('You are muted for '+secs+'s and cannot send messages.');
      }
      // ---- client-side 1.5s cooldown for non-owners (owners are exempt) ----
      // Checked FIRST and reserved synchronously (before any await below). The old order checked the
      // cooldown against the time of the last *finished* send, so on a slow connection several taps all
      // got through before the first one completed - and the anti-raid check below then banned the
      // account for what was just a laggy double-tap.
      const now0=Date.now();
      if(!isOwner(senderId)){
        const lastGo=Math.max(DB._lastOk||0,DB._lastStart||0);
        if(lastGo&&now0-lastGo<CFG.SEND_COOLDOWN_MS){
          throw new Error('Slow down a little — wait a moment before sending again.');
        }
      }
      DB._lastStart=now0;
      // ---- anti-raid: sliding window on outgoing messages (client-side first line) ----
      // Counts only sends that actually reached Firebase successfully (recorded at the
      // bottom of this function). Because the cooldown above already spaces real sends out, only
      // genuine scripted spam can ever reach this.
      DB._sendTimes=(DB._sendTimes||[]).filter(t=>now0-t<CFG.NUKE_WINDOW_MS);
      if(!isOwner(senderId)&&DB._sendTimes.length>=CFG.NUKE_MSGS){
        DB.antiNuke(senderId);
        throw new Error('Sending too fast — account banned.');
      }
      // ---- profanity filter (censors rather than blocks, matching "Hey man, **** YOU" style) ----
      let outText=text;
      if(text)outText=checkMessageText_(text);
      // DM: make sure MY membership exists before writing (fixes "can't send in a new DM")
      if(key.startsWith('dm_')&&!(C.dmMembers[key]&&C.dmMembers[key][senderId])){
        try{await set(R(`dmMembers/${key}/${senderId}`),true);(C.dmMembers[key]=C.dmMembers[key]||{})[senderId]=true}catch(_){}
      }
      const newRef=push(R('messages/'+key));
      // The database rules require the message's `at` to be within 1.5s of the SERVER's
      // clock at the moment the write is actually processed (not when we started building
      // it) — so a large image payload that takes a while to upload on a slow connection
      // can miss that window even though everything about the request was valid when sent.
      // We try once with `at` stamped right before transmission, and — only if the write is
      // rejected — retry a single time with a freshly-stamped `at`/rate-slot, so a slow
      // upload gets a second chance instead of surfacing a confusing rules error.
      // The rules reject a message whose `at` is AHEAD of the server clock (at <= now) or more than 20s behind
      // it. SKEW (the server offset) is only an estimate - on mobile / high-latency connections it can be off
      // by a few hundred ms, which made the write bounce for "no reason" for some people. So stamp a little in
      // the past (still far inside the 20s window); every retry backs off further.
      let _backoff=400;
      const build=()=>{
        const at=Math.round(Date.now()+SKEW-_backoff);
        const m={senderId,at};
        if(outText)m.text=outText;
        if(images&&images.length)m.images=images;
        if(files.length)m.files=files;
        if(pings&&pings.length)m.pings=pings;
        if(replyTo&&replyTo.id)m.replyTo={id:replyTo.id,senderId:replyTo.senderId,...(replyTo.preview?{preview:replyTo.preview}:{})};
        return{at,m};
      };
      let{at,m}=build();
      // optimistic local echo (replaced automatically when the server copy arrives with the same id)
      const arr=C.messages[key]||(C.messages[key]=[]);
      const tmp={...m,images:images||[],files:files,pings:pings||[],text:outText||'',id:newRef.key,replyTo:m.replyTo||null};
      if(key===msgKey){arr.push(tmp);emit()}
      const attemptWrite=async()=>{
        // The database rules require rate/$senderId/$at to equal the message's own `at`
        // (a per-write timestamped slot keyed by the same timestamp as the message), so
        // both paths are written atomically in one multi-path update using the same value.
        await update(ref(rtdb),{
          ['rate/'+senderId+'/'+at]:at,
          ['lastSend/'+senderId]:serverTimestamp(),   // server-clock cooldown the database rules enforce (1.2s)
          ['messages/'+key+'/'+newRef.key]:m
        });
      };
      try{
        try{
          await attemptWrite();
        }catch(e1){
          // A PERMISSION_DENIED that is not a real ban/mute is most often a timestamp miss (clock-offset error,
          // or a slow upload landing late). Retry up to twice with a freshly stamped, further back-dated
          // `at`/rate-slot; real bans/mutes would fail identically, so those are not retried.
          let lastErr=e1;
          if(e1.code==='PERMISSION_DENIED'&&!DB.isBanned(senderId)&&!DB.isMuted(senderId)){
            let ok=false;
            for(const back of [1500,4000]){
              _backoff=back;
              ({at,m}=build());
              Object.assign(tmp,m,{images:images||[],files:files,pings:pings||[],text:outText||'',replyTo:m.replyTo||null});
              try{await attemptWrite();ok=true;break}catch(e2){lastErr=e2;if(e2.code!=='PERMISSION_DENIED')break}
            }
            if(!ok)throw lastErr;
          }else{
            throw e1;
          }
        }
      }
      catch(e){
        C.messages[key]=(C.messages[key]||[]).filter(x=>x!==tmp);emit();
        if(e.code==='PERMISSION_DENIED'){
          if(!DB.isBanned(senderId)&&!isOwner(senderId)){
            try{if((await get(R('banned/'+senderId))).val()===true){C.banned[senderId]=true;checkBanLock(myId,C.banned)}}catch(_){}
          }
          if(DB.isBanned(senderId))throw new Error('Your account has been banned.');
          if(DB.isMuted(senderId))throw new Error('You are muted and cannot send messages right now.');
          // only call it "too fast" if we really did send something a moment ago
          if(!isOwner(senderId)&&Date.now()-(DB._lastOk||0)<CFG.SEND_COOLDOWN_MS+200)throw new Error('Slow down a little - you are sending too fast.');
          throw new Error('Blocked by database rules ('+await DB._diag(senderId)+')');
        }
        throw new Error('Message failed to send ('+(e.code||e.message)+')');
      }
      DB._lastOk=Date.now();
      (DB._sendTimes=DB._sendTimes||[]).push(DB._lastOk); // only counted here, on confirmed success
    },
    // Explains WHY a send was refused (shown in the error toast so no DevTools needed)
    async _diag(id){
      const out=[];
      try{out.push('uidToId='+(await get(R('uidToId/'+auth.currentUser.uid))).val())}catch(e){out.push('uidToId '+(e.code||'err'))}
      try{const slot=Date.now()+SKEW;await set(R('rate/'+id+'/'+slot),slot);out.push('link+rate ok');await remove(R('rate/'+id+'/'+slot)).catch(()=>{})}catch(e){out.push('account link/rate denied')}
      return out.join(', ');
    },
    // Deletes one message. Allowed by the rules for the sender themselves, or
    // for any owner deleting someone else's message. Removes it for everyone —
    // this isn't a per-viewer hide, it's a real delete from the database.
    async deleteMessage(key,msgId){
      if(!key||!msgId)return;
      const arr=C.messages[key];
      const before=arr&&arr.find(x=>x.id===msgId);
      // optimistic local removal
      if(arr){
        const idx=arr.findIndex(x=>x.id===msgId);
        if(idx!==-1)arr.splice(idx,1);
        if(key===msgKey)emit();
      }
      try{
        await remove(R('messages/'+key+'/'+msgId));
        if(before&&before.files&&before.files.length&&typeof FILES!=='undefined')FILES.deleteUrls(before.files);   // free the Storage space (only works on your own uploads)
      }catch(e){
        // roll back on failure
        if(before&&arr&&!arr.find(x=>x.id===msgId)){arr.push(before);arr.sort((a,b)=>a.at-b.at);if(key===msgKey)emit()}
        throw new Error(e.code==='PERMISSION_DENIED'?(((isMod(myId)||isAdmin(myId))&&!isOwner(myId))?'Permission denied. You can\'t delete that message (owners\' and admins\' messages are protected from mods, and owners\' from everyone else).':'Could not delete that message.'):'Delete failed ('+(e.code||e.message)+')');
      }
    },
    // Fast bulk delete for the admin panel. Removes everything from the local cache in
    // one go (single re-render, so the UI never stutters), then sends the deletes to the
    // database as multi-path updates in parallel chunks instead of one awaited request
    // per message. If a chunk is rejected it falls back to per-message removes for just
    // that chunk so one bad message can't block the rest. Returns {ok,fail}.
    async deleteMessagesBulk(items){
      items=(items||[]).filter(x=>x&&x.key&&x.id);
      if(!items.length)return{ok:0,fail:0};
      const gone=new Set(items.map(x=>x.key+'|'+x.id));
      const touched=new Set();
      items.forEach(x=>{
        const arr=C.messages[x.key];
        if(arr&&arr.some(m=>gone.has(x.key+'|'+m.id))){
          C.messages[x.key]=arr.filter(m=>!gone.has(x.key+'|'+m.id));
          touched.add(x.key);
        }
      });
      if(touched.has(msgKey))emit();
      const CHUNK=200;
      const chunks=[];
      for(let i=0;i<items.length;i+=CHUNK)chunks.push(items.slice(i,i+CHUNK));
      let ok=0,fail=0;
      await Promise.all(chunks.map(async chunk=>{
        const upd={};
        chunk.forEach(x=>{upd['messages/'+x.key+'/'+x.id]=null});
        try{
          await update(ref(rtdb),upd);
          ok+=chunk.length;
        }catch(e){
          const res=await Promise.all(chunk.map(x=>remove(R('messages/'+x.key+'/'+x.id)).then(()=>true,()=>false)));
          res.forEach(r=>r?ok++:fail++);
        }
      }));
      return{ok,fail};
    },
    // Edit the text of one of MY OWN messages in place. Only the text (and an
    // editedAt marker) can change — sender, timestamp, images and reply target
    // are all fixed by the database rules, so this can't be abused to alter
    // who sent something or when, or to swap in different attachments.
    async editMessage(key,msgId,newText){
      if(typeof tosGateGuard==='function')await tosGateGuard();
      if(!key||!msgId)return;
      const limit=key===CFG.ANNOUNCEMENTS_ROOM?Infinity:maxMsgFor(ME.id);
      const text=checkMessageText_((newText||'').trim()).slice(0,limit);
      if(!text)throw new Error('Message can\'t be empty.');
      const arr=C.messages[key];
      const m=arr&&arr.find(x=>x.id===msgId);
      if(!m)return;
      if(Number(m.senderId)!==Number(ME.id))throw new Error('You can only edit your own messages.');
      const before=m.text;const beforeEdited=m.editedAt;
      const editedAt=Date.now()+SKEW;
      // optimistic local update
      m.text=text;m.editedAt=editedAt;
      if(key===msgKey)emit();
      try{
        await update(R('messages/'+key+'/'+msgId),{text,editedAt});
      }catch(e){
        m.text=before;m.editedAt=beforeEdited;if(key===msgKey)emit();
        throw new Error(e.code==='PERMISSION_DENIED'?'Could not edit that message.':'Edit failed ('+(e.code||e.message)+')');
      }
    },
    // Deletes every message by a user ID across a specific conversation key
    // (global / a room / a DM) that the CURRENT user can see. Rules don't let
    // an owner enumerate every conversation on the server from the client —
    // only conversations they're already a member of (or global) are readable
    // — so this sweeps the keys the client actually has loaded, not the whole server.
    async deleteAllByUserInKey(key,userId){
      if(!key)return 0;
      const arr=C.messages[key]||[];
      const targets=arr.filter(m=>Number(m.senderId)===Number(userId));
      await DB.deleteMessagesBulk(targets.map(m=>({key,id:m.id})));
      return targets.length;
    },
    messages(key){
      const my=myId;
      return(C.messages[key]||[]).filter(m=>{
        const s=C.users[m.senderId];
        if(s&&s.deleted)return false; // deleted accounts: hide instantly, don't wait on server cleanup
        if(m.senderId===my)return true;
        if((C.blocked[my]||[]).includes(m.senderId))return false;   // I blocked them
        if((C.blockedBy[my]||[]).includes(m.senderId))return false; // they blocked me
        return true;
      });
    },
    // Unread count for ONE conversation. Counts exactly what the chat would show you as new:
    //  - not before lastRead has actually loaded (otherwise everything flashes as unread on startup)
    //  - never my own messages, never from deleted accounts, never from people I blocked / who blocked me
    //    (those are hidden in the chat, so counting them gave a badge with nothing to read)
    //  - a conversation I have never opened only counts messages sent after my account existed
    unreadIn(key,uid){
      if(!C.lastReadLoaded)return 0;
      const lr=C.lastRead[key];
      const born=Number((C.users[uid]||{}).createdAt)||0;
      const last=(lr===undefined||lr===null)?born:(Number(lr)||0);
      const blocked=C.blocked[uid]||[],blockedBy=C.blockedBy[uid]||[];
      let n=0;
      (C.messages[key]||[]).forEach(m=>{
        if(m.senderId===uid||!(Number(m.at)>last))return;
        const s=C.users[m.senderId];if(s&&s.deleted)return;
        if(blocked.includes(m.senderId)||blockedBy.includes(m.senderId))return;
        n++;
      });
      return n;
    },
    unreadDMs(uid){
      let n=0;
      (C.friends[uid]||[]).forEach(f=>{n+=DB.unreadIn(dmKey(uid,f),uid)});
      return n+DB.incomingUnseen(uid).length;
    },
    // Friend requests that still count toward the badge. "Mark all as read" hides the current ones from the
    // BADGE only (stored on this device); they stay in Friends & Requests so nothing is lost.
    _dismissedReqs(uid){try{return JSON.parse(localStorage.getItem('ich_dismissed_req_'+uid)||'[]')}catch(_){return[]}},
    incomingUnseen(uid){const d=DB._dismissedReqs(uid);return DB.incoming(uid).filter(r=>d.indexOf(r.from)===-1)},
    unreadTotal(uid){return DB.unreadDMs(uid)+DB.unreadRooms(uid)},   // announcements are NOT part of "Mark all as read" (they keep their own badge)
    // Marks every conversation (global, announcements, rooms, DMs) as read in one write, and hides the
    // current friend-request count from the badge.
    async markAllRead(uid){
      const stamp=Math.round(Date.now()+SKEW);
      const keys=new Set([CFG.GLOBAL_ROOM]);   // announcements + shitpost are left alone on purpose
      (C.myRoomIds||[]).forEach(id=>keys.add(id));
      (C.friends[uid]||[]).forEach(f=>keys.add(dmKey(uid,f)));
      const upd={};
      keys.forEach(k=>{
        const newest=(C.messages[k]||[]).reduce((a,m)=>Math.max(a,Number(m.at)||0),0);
        upd[k]=Math.max(stamp,newest);
      });
      try{localStorage.setItem('ich_dismissed_req_'+uid,JSON.stringify(DB.incoming(uid).map(r=>r.from)))}catch(_){}
      Object.assign(C.lastRead,upd);emit();                 // instant local update
      await update(R('lastRead/'+uid),upd);                 // then persist (rules: own lastRead is writable)
    },
    // New announcements since the user last opened the Announcements room (same rule as DMs/rooms).
    unreadAnnouncements(uid){return DB.unreadIn(CFG.ANNOUNCEMENTS_ROOM,uid)},
    // Same for #shitpost: own badge, and (like announcements) NOT cleared by "Mark all as read".
    unreadShitposts(uid){return DB.unreadIn(CFG.SHITPOST_ROOM,uid)},
    unreadRooms(uid){
      let n=0;
      (C.myRoomIds||[]).forEach(id=>{n+=DB.unreadIn(id,uid)});
      return n;
    },
    // called by the UI so a friendship created by the other person becomes a DM on this side too
    async ensureDmMemberships(){
      if(!myId)return;
      for(const f of (C.friends[myId]||[])){
        const k=dmKey(myId,f);
        if(!(C.dmMembers[k]&&C.dmMembers[k][myId])){
          try{await set(R(`dmMembers/${k}/${myId}`),true);(C.dmMembers[k]=C.dmMembers[k]||{})[myId]=true}catch(_){}
        }
      }
    }
  };
  function defaultSettings(){return{
    avatar:'',
    meBubble:'#7c6cff',meText:'#ffffff',
    radius:16,font:'system',size:15,bold:false,italic:false,
    bgType:'gradient',bgColor:'#2a1f5c',bgColor2:'#7c2f66',bgImage:'',bgFit:'cover',bgBlur:0,bgDim:30,
    uiOpacity:50,uiBlur:18,
    autoScrollBottom:true,
    filterLocal:true,
    pings:{everyone:true,sound:true,desktop:true},
    music:{enabled:true,volume:15,shuffle:true}
  }}
  function authMsg(e){
    const m={
      'auth/email-already-in-use':'That email is already registered.',
      'auth/invalid-email':'Please enter a real email address.',
      'auth/weak-password':'Password is too weak (min 6 characters).',
      'auth/invalid-credential':'Incorrect username/email or password.',
      'auth/wrong-password':'Incorrect username/email or password.',
      'auth/user-not-found':'Incorrect username/email or password.',
      'auth/too-many-requests':'Too many attempts. Try again later.',
      'auth/popup-closed-by-user':'Sign-in cancelled.',
      'auth/network-request-failed':'Network error. Check your connection.'
    };
    return m[e.code]||('Authentication error: '+(e.code||e.message));
  }
})();
