/* ==========================================================================
 * js/chat/live-sync.js
 * Background cleanup loop, live DB sync and light re-render
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Live sync (other tabs / future Firestore listeners) ---------- */
// A just-unbanned account still shows "Deleted User" until it repairs its own profile —
// only its own auth can do that (see DB.restoreBannedAccount). This runs it once, the
// moment that account's client notices the ban is gone, and hands them a fresh username.
/* ---------- Cleanup scheduler + "load older" on scroll ---------- */
let _cleanupStarted=false;
function startCleanupLoop(){
  if(_cleanupStarted||!ME)return;_cleanupStarted=true;
  const run=()=>{if(document.visibilityState==='visible'&&ME)DB.pruneRun({aggressive:DB.isOwner(ME.id),maxBatches:DB.isOwner(ME.id)?25:1}).catch(()=>{})};
  setTimeout(run,45000);
  setInterval(run,12*60*1000);
}
(function(){
  const box=document.getElementById('messages');if(!box)return;
  let busy=false;
  box.addEventListener('scroll',()=>{
    if(busy||box.scrollTop>180||typeof view==='undefined'||view.page!=='chatPage'||!view.roomKey)return;
    if(!DB.canLoadOlder(view.roomKey))return;
    busy=true;DB.loadOlder(view.roomKey);setTimeout(()=>{busy=false},1200);
  },{passive:true});
})();
let _restoringAccount=false,_lastRestoreTry=0,_selfPurged=false;
DB.onChange(()=>{
  ME=DB.currentUser();
  if(!ME){if(view.page&&view.page!=='authPage'&&!DB.needsProfile()&&!DB.isLoggedIn())show('authPage');return}
  // Banned: delete my own messages everywhere I can see (once per load, only after the server confirms the ban).
  if(!_selfPurged&&DB.isBanned(ME.id)&&!DB.isOwner(ME.id)){
    _selfPurged=true;
    DB.confirmBannedOnServer(ME.id).then(ok=>{if(ok)return DB.purgeUserMessages(ME.id);_selfPurged=false}).catch(()=>{_selfPurged=false});
  }
  if(typeof DiscordLook!=='undefined')DiscordLook.sync();
  if(typeof AntiLag!=='undefined')AntiLag.sync();        // cross-device: account setting wins
  if(typeof startCleanupLoop==='function')startCleanupLoop();
  if(!_restoringAccount&&Date.now()-_lastRestoreTry>30000&&DB.needsUnbanRestore()){
    _restoringAccount=true;_lastRestoreTry=Date.now();
    DB.restoreBannedAccount().then(newName=>{
      _restoringAccount=false;
      if(newName){
        ME=DB.currentUser();
        toast(`Welcome back! Your account is restored as @${newName} — change it anytime in Settings.`);
        if(view.page==='homePage'||view.page==='chatPage')goHome();
      }
    }).catch(e=>{_restoringAccount=false;console.warn('account restore failed',e)});
    return; // let the restore write land and re-trigger onChange before doing anything else
  }
  if(view.page==='homePage')refreshBadge();
  if(typeof refreshAnnPicker==='function')refreshAnnPicker();
  applyStyleIfChanged();
  DB.ensureDmMemberships();
  checkPingNotifications();
  if(view.page==='chatPage'){
    // avoid rebuilding modal/inputs; just refresh lists and messages
    const keepFriends=view.mode==='dms'&&view.dmView==='friends';
    renderChatLight(keepFriends);
  }
});
let _styleSig='';
function applyStyleIfChanged(){
  const s=ME.settings,sig=JSON.stringify([s.meBubble,s.meText,s.radius,s.font,s.size,s.bold,s.italic,s.bgType,s.bgColor,s.bgColor2,s.bgFit,s.bgBlur,s.bgDim,s.uiOpacity,s.uiBlur,s.bgImage&&s.bgImage.length]);
  if(sig!==_styleSig){_styleSig=sig;
    // don't clobber a live settings preview
    if(!document.querySelector('#sTabs'))applyStyle(document.documentElement,s)}
}
function renderChatLight(keepFriends){
  ME=DB.currentUser();
  if(keepFriends){renderChat();return}
  // rebuild sidebar and messages without touching composer text
  const draft=msgIn.value,ss=msgIn.selectionStart;
  renderChat();
  msgIn.value=draft;try{msgIn.setSelectionRange(ss,ss)}catch(e){}
}
