/* ==========================================================================
 * js/settings/rules-check.js
 * Prompts everyone to agree to the rules once per account
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

// Everyone must agree once per account (and again whenever RULES_VERSION goes up). Runs as soon as
// the app is idle; if the agreement can't be read (offline/rules not published) nobody gets locked out.
(function(){
  let tries=0;
  const t=setInterval(()=>{
    if(++tries>60){clearInterval(t);return}
    const root=$('#modalRoot');
    if(typeof ME==='undefined'||!ME||!root)return;
    clearInterval(t);
    if(DB.isBanned(ME.id))return;
    DB.rulesAgreement().then(st=>{
      RULES_STATE=st;
      if(rulesAgreed(st))return;
      let waits=0;
      const show=setInterval(()=>{
        const r=$('#modalRoot');
        if(++waits>120){clearInterval(show);return}
        if(r&&!r.innerHTML.trim()){clearInterval(show);modalRules({force:true})}
      },800);
    }).catch(e=>console.warn('rules check skipped',e&&e.code||e));
  },1500);
})();
