/* ==========================================================================
 * js/ui/context-menu.js
 * Custom right-click menu
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Custom right-click menu ----------
   Replaces the native browser context menu app-wide with quick actions
   (Settings, Profile Settings, Fullscreen, Home, Sign Out) styled to match
   the rest of the UI. Left alone for text inputs/contenteditable (so
   cut/copy/paste still works) and for images/links (so "save image",
   "open link in new tab" etc. still work natively). */
(function(){
  const menu=document.createElement('div');
  menu.className='ctx-menu';menu.id='ctxMenu';
  document.body.appendChild(menu);

  function toggleFullscreen(){
    if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
    else document.documentElement.requestFullscreen?.().catch(()=>{});
  }
  function items(){
    const fsOn=!!document.fullscreenElement;
    const list=[
      {ic:'⚙️',label:'Settings',needsMe:true,fn:()=>openSettings(true)},
      {ic:'👤',label:'Profile Settings',needsMe:true,fn:()=>openAccount()},
      {sep:true},
      {ic:'⛶',label:fsOn?'Exit Fullscreen':'Fullscreen',fn:toggleFullscreen},
      {ic:'🔄',label:'Reload',fn:()=>location.reload()},
    ];
    if(ME){
      list.push({sep:true});
      list.push({ic:'🏠',label:'Home',fn:()=>{view.roomKey=null;view.section=null;DB.watchMessages(null);$('#sidebar')?.classList.remove('open');goHome(true)}});
      list.push({ic:'🚪',label:'Sign Out',danger:true,fn:()=>doSignOut()});
    }
    return list.filter(it=>!it.needsMe||ME);
  }
  function close(){
    menu.classList.remove('open');
    document.removeEventListener('pointerdown',onOutside,true);
    document.removeEventListener('scroll',close,true);
    window.removeEventListener('resize',close);
    document.removeEventListener('keydown',onKey,true);
  }
  function onOutside(e){if(!menu.contains(e.target))close()}
  function onKey(e){if(e.key==='Escape')close()}
  function open(x,y){
    close();
    const list=items();
    menu.innerHTML=list.map((it,i)=>it.sep?`<div class="ctx-sep"></div>`
      :`<div class="ctx-item${it.danger?' danger':''}" data-i="${i}"><span class="ctx-ic">${it.ic}</span><span>${it.label}</span></div>`).join('');
    menu.querySelectorAll('.ctx-item').forEach(el=>{
      el.onclick=()=>{const it=list[Number(el.dataset.i)];close();it.fn&&it.fn()};
    });
    // place, then clamp so it never runs off the edge of the viewport
    menu.style.left=x+'px';menu.style.top=y+'px';
    menu.classList.add('open');
    const r=menu.getBoundingClientRect();
    const nx=r.right>innerWidth-8?Math.max(8,innerWidth-r.width-8):x;
    const ny=r.bottom>innerHeight-8?Math.max(8,innerHeight-r.height-8):y;
    menu.style.left=nx+'px';menu.style.top=ny+'px';
    document.addEventListener('pointerdown',onOutside,true);
    document.addEventListener('scroll',close,true);
    window.addEventListener('resize',close);
    document.addEventListener('keydown',onKey,true);
  }
  document.addEventListener('contextmenu',e=>{
    const t=e.target;
    const tag=(t.tagName||'').toLowerCase();
    if(tag==='input'||tag==='textarea'||tag==='img'||tag==='a'||t.isContentEditable)return; // keep the native menu where it's actually useful
    e.preventDefault();
    open(e.clientX,e.clientY);
  });
})();
