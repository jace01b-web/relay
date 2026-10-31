/* ==========================================================================
 * js/tools/now-playing.js
 * Now-playing pill in the chat top bar
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Now-playing pill (chat top bar) ---------- */
(function(){
  const np=document.getElementById('np'),nm=document.getElementById('npName'),
        lf=document.getElementById('npLeft'),fl=document.getElementById('npFill'),bar=document.getElementById('npBar');
  if(!np)return;
  const fmt=s=>{s=Math.max(0,Math.floor(s||0));const m=Math.floor(s/60);return m+':'+String(s%60).padStart(2,'0')};
  let lastName='';
  function paint(p){
    // Show only when music is actually on & a song is loaded/playing
    const on=!!(p&&p.name&&(p.playing||p.current>0));
    np.classList.toggle('show',on&&p.playing);
    np.classList.toggle('playing',!!(p&&p.playing));
    if(!p||!p.name)return;
    if(p.name!==lastName){lastName=p.name;nm.textContent=p.name;np.title='Now playing: '+p.name}
    lf.textContent=(p.buffering&&!(p.current>0))?'Loading…':(p.duration?('-'+fmt(p.remaining)+' left'):'');
    fl.style.width=(p.fraction*100).toFixed(2)+'%';
  }
  MusicPlayer.onTime(paint);
  // also refresh on play/pause/track changes (not just on time ticks)
  MusicPlayer.on(()=>paint(MusicPlayer.progress()));
  // click the bar to seek
  bar.addEventListener('click',e=>{
    const r=bar.getBoundingClientRect();
    MusicPlayer.seek((e.clientX-r.left)/r.width);
  });
  // skip button: next song, with a short lockout so rapid taps don't stack crossfades
  const skip=document.getElementById('npSkip');
  if(skip){
    skip.addEventListener('click',e=>{
      e.stopPropagation();
      if(skip.classList.contains('busy'))return;
      skip.classList.add('busy');
      MusicPlayer.next();
      setTimeout(()=>skip.classList.remove('busy'),650);
    });
  }
  // clicking the pill opens the Music settings tab
  np.addEventListener('click',e=>{
    if(e.target.closest('#npBar')||e.target.closest('#npSkip'))return;
    document.getElementById('settingsBtn')?.click();
    setTimeout(()=>document.querySelector('#sTabs button[data-t="music"]')?.click(),0);
  });
})();
