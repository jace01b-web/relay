/* ==========================================================================
 * js/ui/liquid-glass.js
 * Liquid-glass pointer highlight
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Liquid Glass: pointer-reactive specular highlight ----------
   Tracks the pointer/finger against EVERY glass panel (sidebar, topbar,
   composer, cards, modals — including ones created later, since we just
   re-query on each move) and feeds each one its own --px/--py (position)
   and --glow-op (strength), which the "LIQUID GLASS v2" CSS highlight
   follows. The light now fades in as the pointer gets close rather than
   only appearing once it's directly over the panel — RADIUS matches the
   glow's own 220px reach, so "close" here means the same distance the
   light would actually be visible from. rAF-throttled so it stays cheap
   even with several panels on screen at once. */
(function(){
  const GLASS='.sidebar,.topbar,.composer,.card,.modal,.gc-card';
  const RADIUS=220; // px — matches the radial-gradient's own circle radius
  let raf=null,pending=null;
  function distToRect(x,y,r){
    const dx=Math.max(r.left-x,0,x-r.right);
    const dy=Math.max(r.top-y,0,y-r.bottom);
    return Math.hypot(dx,dy);
  }
  function apply(){
    raf=null;if(!pending)return;
    const{x,y}=pending;pending=null;
    document.querySelectorAll(GLASS).forEach(t=>{
      const r=t.getBoundingClientRect();if(!r.width||!r.height)return;
      const d=distToRect(x,y,r);
      const op=Math.max(0,Math.min(1,1-d/RADIUS));
      t.style.setProperty('--glow-op',op.toFixed(3));
      if(op>0){
        t.style.setProperty('--px',((x-r.left)/r.width*100).toFixed(1)+'%');
        t.style.setProperty('--py',((y-r.top)/r.height*100).toFixed(1)+'%');
      }
    });
  }
  function point(e){
    if(document.documentElement.classList.contains('anti-lag'))return;   // anti-lag: no pointer glints
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy=e.touches?e.touches[0].clientY:e.clientY;
    pending={x:cx,y:cy};
    if(!raf)raf=requestAnimationFrame(apply);
  }
  document.addEventListener('pointermove',point,{passive:true});
  document.addEventListener('touchmove',point,{passive:true});
})();
