/* ==========================================================================
 * js/core/crash-catcher.js
 * If the app crashes while booting, show the reason on the loading screen instead of spinning forever
 * Plain (non-module) script that runs in place while the page is parsed - see its <script> tag in index.html.
 * ========================================================================== */
// If the app crashes while booting (e.g. launched from a launcher / about:blank / blob window),
// show the reason on the loading screen instead of spinning forever.
(function(){
  function show(msg){
    var p=document.getElementById('loadingPage'),h=document.getElementById('loadingHint'),r=document.getElementById('loadingRetry');
    if(!p||p.classList.contains('hidden')||!h)return;
    h.textContent='Failed to start: '+String(msg||'unknown error').slice(0,200);
    if(r)r.classList.remove('hidden');
    // never leave the app hidden behind a dead loading screen
    try{window.ICHBoot.fail();window.ICHBoot.reveal()}catch(_){document.documentElement.classList.remove('booting')}
  }
  window.addEventListener('error',function(e){show(e.message||(e.error&&e.error.message))});
  window.addEventListener('unhandledrejection',function(e){show(e.reason&&e.reason.message||e.reason)});
})();
