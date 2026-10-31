/* ==========================================================================
 * js/core/boot.js
 * Boot: decide which page to show first
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Boot ---------- */
const BOOTUI=window.ICHBoot||{prog(){},phase(){},step(){},done(){},fail(){},reveal(){}};
(async function init(){
  let settled=false;
  BOOTUI.step('net');BOOTUI.prog(96);BOOTUI.phase('Connecting…');
  DB.settle().then(()=>settled=true);
  setTimeout(()=>{
    if(settled||view.page!=='loadingPage')return;
    // Diagnostic: report what this window can actually do (launcher/about:blank windows often lack storage)
    let dx=[];
    dx.push('page='+location.protocol);
    try{localStorage.setItem('_t','1');localStorage.removeItem('_t');dx.push('localStorage=ok')}catch(e){dx.push('localStorage=BLOCKED')}
    try{dx.push('indexedDB='+(window.indexedDB?'ok':'MISSING'))}catch(e){dx.push('indexedDB=BLOCKED')}
    dx.push('online='+navigator.onLine);
    $('#loadingHint').textContent="This is taking longer than expected. ["+dx.join(', ')+"]";
    $('#loadingRetry').classList.remove('hidden');
  },10000);
  $('#loadingRetry').onclick=()=>location.reload();
  await DB.settle();
  ME=DB.currentUser();
  checkForcedVersion(); // re-evaluate now that ME (and so owner status) is actually known
  if(ME){
    applyStyle(document.documentElement,ME.settings);goHome();
    // Browsers block audio until the user interacts with the page at least
    // once — so try immediately (works if this reload came from an in-app
    // navigation) and otherwise retry on the very first click/keypress.
    if(ME.settings.music&&ME.settings.music.enabled){
      MusicPlayer.applyPrefs(ME.settings.music);
      const retryOnce=()=>{MusicPlayer.applyPrefs(ME.settings.music);document.removeEventListener('click',retryOnce);document.removeEventListener('keydown',retryOnce)};
      document.addEventListener('click',retryOnce,{once:true});
      document.addEventListener('keydown',retryOnce,{once:true});
    }
  }
  else if(DB.hadSessionError()){
    // couldn't confirm the account (network) — do NOT ask for a username; offer a reload instead
    show('loadingPage');
    const pg=$('#loadingPage');if(pg)pg.classList.remove('ld-gone','hidden');
    BOOTUI.fail();
    $('#loadingHint').textContent="Couldn't reach the server to load your account.";
    $('#loadingRetry').classList.remove('hidden');
  }
  else if(DB.needsProfile()){show('authPage');modalPickUsername()}
  else show('authPage');
  // Fade the loading screen out ON TOP of whichever page just appeared (the session-error branch
  // above deliberately keeps it up, so it is the one case that skips this).
  if(!(!ME&&DB.hadSessionError()))BOOTUI.done();
})();
