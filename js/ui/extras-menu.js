/* ==========================================================================
 * js/ui/extras-menu.js
 * Extras menu (morphing top tab)
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Extras (main menu): morphing top tab ---------- */
(function(){
  const box=document.getElementById('extras'),btn=document.getElementById('extrasBtn'),menu=document.getElementById('extrasMenu');
  if(!box||!btn||!menu)return;
  const items=()=>[...menu.querySelectorAll('[role="menuitem"]')];
  function setOpen(v,focus){
    if(box.classList.contains('open')===v)return;
    if(v){const inn=menu.firstElementChild;if(inn)menu.style.setProperty('--ex-h',inn.offsetHeight+'px')}   // explicit target so the height can animate
    box.classList.toggle('open',v);
    btn.setAttribute('aria-expanded',v?'true':'false');
    menu.setAttribute('aria-hidden',v?'false':'true');
    items().forEach(a=>a.tabIndex=v?0:-1);
    if(v&&focus)setTimeout(()=>{const f=items()[0];if(f)f.focus({preventScroll:true})},120);
  }
  btn.addEventListener('click',e=>{e.stopPropagation();setOpen(!box.classList.contains('open'),e.detail===0)});
  menu.addEventListener('click',e=>{
    e.stopPropagation();
    if(e.target.closest('.ex-item'))setTimeout(()=>setOpen(false),220);   // let the press animation play, then fold away
  });
  // soft spotlight that follows the pointer across each row
  menu.addEventListener('pointermove',e=>{
    const it=e.target.closest('.ex-item');if(!it)return;
    const r=it.getBoundingClientRect();
    it.style.setProperty('--mx',(e.clientX-r.left)+'px');
    it.style.setProperty('--my',(e.clientY-r.top)+'px');
  },{passive:true});
  document.addEventListener('click',()=>setOpen(false));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&box.classList.contains('open')){setOpen(false);btn.focus()}
  });
})();
