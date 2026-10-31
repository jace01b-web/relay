/* ==========================================================================
 * js/features/gift-promo.js
 * Nitro gift promo alert
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Nitro gift promo ---------- */
const GIFT_PROMO={name:'Suki',discord:'@AniItsuki'};
const DC_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.74 19.74 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 01.078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.009c.12.1.246.199.372.293a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>';
function giftPromoSeenLocal(id){try{return localStorage.getItem('giftPromoSeen_'+id)==='1'}catch(_){return false}}
function giftPromoMarkLocal(id){try{localStorage.setItem('giftPromoSeen_'+id,'1')}catch(_){}}
/* Auto-opens after login / Google sign-in, but only until the account has closed it once (saved per account). */
async function giftPromoToast(){
  try{
    const me=DB.currentUser();if(!me)return;
    if(giftPromoSeenLocal(me.id))return;
    if(await DB.giftPromoSeen()){giftPromoMarkLocal(me.id);return}
  }catch(_){}
  setTimeout(showGiftPromo,700);
}
/* Opens the alert right now (also used by the main-menu button). Closing it saves it for the account. */
function showGiftPromo(){
  if(document.getElementById('giftAlertBg'))return;
  const bg=document.createElement('div');bg.className='modal-bg gift-alert-bg';bg.id='giftAlertBg';
  bg.innerHTML='<div class="modal gift-alert" role="alertdialog" aria-modal="true">'
    +'<button type="button" class="ga-x" aria-label="Close"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg></button>'
    +'<div class="ga-hero">'
      +'<span class="ga-float" style="left:16px;top:50px;font-size:24px">\ud83c\udf83</span>'
      +'<span class="ga-float" style="right:18px;top:70px;font-size:20px;animation-delay:-1.5s">\ud83d\udd77\ufe0f</span>'
      +'<span class="ga-float" style="left:30px;bottom:30px;font-size:16px;animation-delay:-2.4s">\u2728</span>'
      +'<span class="ga-float" style="right:34px;bottom:34px;font-size:18px;animation-delay:-.8s">\ud83e\udd87</span>'
      +'<div class="ga-orb">\ud83c\udf81</div>'
      +'<div class="ga-tag"><i></i>Halloween Special</div>'
      +'<h2>Gift Nitro.<br>Get Rewarded.</h2>'
      +'<div class="ga-text">Gift <b>'+GIFT_PROMO.name+'</b> Discord Nitro and you get:</div>'
    +'</div>'
    +'<div class="ga-body">'
      +'<div class="ga-list">'
        +'<div class="ga-item sure"><div class="ga-ico">\u2b50</div><div class="ga-info"><b>VIP</b><span>Your own VIP status</span></div><div class="ga-badge">\u2714 Guaranteed</div></div>'
        +'<div class="ga-item sure"><div class="ga-ico">\ud83c\udf83</div><div class="ga-info"><b>FULL Halloween Pass</b><span>The MAX Season Pass, fully unlocked</span></div><div class="ga-badge">\u2714 Guaranteed</div></div>'
        +'<div class="ga-item maybe"><div class="ga-ico">\ud83d\udee1\ufe0f</div><div class="ga-info"><b>MOD</b><span>A shot at joining the mod team</span></div><div class="ga-badge">\ud83c\udfb2 Chance</div></div>'
      +'</div>'
      +'<div class="ga-steps">'
        +'<div class="ga-step"><b>1</b>Gift Nitro on Discord</div>'
        +'<div class="ga-step"><b>2</b>Send your username</div>'
        +'<div class="ga-step"><b>3</b>Get your perks</div>'
      +'</div>'
      +'<button type="button" class="ga-dc">'+DC_SVG+'<span>Discord: '+GIFT_PROMO.discord+'</span><small>(tap to copy)</small></button>'
      +'<button type="button" class="ga-ok">Got it</button>'
      +'<div class="ga-note">Closing this saves it to your account. Reopen it anytime from the main menu.</div>'
    +'</div></div>';
  const close=()=>{
    if(bg._closing)return;bg._closing=true;
    try{const me=DB.currentUser();if(me){giftPromoMarkLocal(me.id);DB.markGiftPromoSeen()}}catch(_){}
    bg.classList.add('closing');setTimeout(()=>bg.remove(),260);
  };
  bg.querySelector('.ga-x').onclick=close;
  bg.querySelector('.ga-ok').onclick=close;
  bg.onclick=e=>{if(e.target===bg)close()};
  bg.querySelector('.ga-dc').onclick=()=>{
    try{navigator.clipboard.writeText(GIFT_PROMO.discord.replace(/^@/,''))}catch(_){}
    toast('Copied '+GIFT_PROMO.discord+' to your clipboard');
  };
  document.body.appendChild(bg);
}
(function(){const b=document.getElementById('giftPromoBtn');if(b)b.onclick=showGiftPromo})();
