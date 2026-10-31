/* ==========================================================================
 * js/loader.js - boots the app.
 *   1. imports the Firebase SDK once and exposes it as window.FB
 *   2. downloads every file in APP_MANIFEST.js in parallel and runs them in order
 * The build-version <meta> tag is appended as ?v= to every file so a new build is never served stale.
 * ========================================================================== */
(function(){
  'use strict';
  var M=window.APP_MANIFEST;
  var meta=document.querySelector('meta[name="build-version"]');
  var Q=meta&&meta.content?'?v='+encodeURIComponent(meta.content):'';

  function fail(msg){
    console.error('[loader]',msg);
    var h=document.getElementById('loadingHint'),r=document.getElementById('loadingRetry');
    if(h)h.textContent='Failed to start: '+String(msg).slice(0,200);
    if(r)r.classList.remove('hidden');
    try{window.ICHBoot.fail();window.ICHBoot.reveal()}catch(_){document.documentElement.classList.remove('booting')}
  }
  var BOOT=window.ICHBoot||{prog:function(){},phase:function(){},step:function(){},done:function(){},fail:function(){},reveal:function(){}};

  // start downloading the app files right away, while the Firebase SDK is still loading
  M.js.forEach(function(f){
    var l=document.createElement('link');
    l.rel='preload';l.as='script';l.href='js/'+f+Q;
    document.head.appendChild(l);
  });

  var base='https://www.gstatic.com/firebasejs/'+M.firebase.version+'/';
  // Firebase Storage (file uploads) is loaded on the side: if it fails, chat still works, only uploads are off.
  // It is NOT merged into window.FB because it exports its own `ref`, which would clash with the database one.
  // (never waited for: a slow or blocked storage script must not be able to delay or break startup)
  var storageP=M.firebase.storage?import(base+M.firebase.storage+'.js').catch(function(e){console.warn('[loader] firebase-storage unavailable',e);return null}):Promise.resolve(null);
  storageP.then(function(st){window.FBS=st});
  Promise.all(M.firebase.modules.map(function(n){return import(base+n+'.js')}))
    .then(function(mods){
      window.FB=Object.assign.apply(null,[{}].concat(mods));
      return new Promise(function(resolve,reject){
        var left=M.js.length,failed=null,total=M.js.length;
        BOOT.step('js');BOOT.phase('Starting the app — 0 of '+total);
        function tick(){BOOT.phase('Starting the app — '+(total-left)+' of '+total);BOOT.prog(90+Math.round(6*(total-left)/total))}
        M.js.forEach(function(f){
          var s=document.createElement('script');
          s.src='js/'+f+Q;
          s.async=false;                       // download in parallel, execute in insertion order
          s.onload=function(){left--;tick();if(left===0)failed?reject(failed):resolve()};
          s.onerror=function(){failed=failed||new Error('Could not load js/'+f);left--;tick();if(left===0)reject(failed)};
          document.head.appendChild(s);
        });
      });
    })
    .catch(function(e){fail(e&&e.message||e)});
})();
