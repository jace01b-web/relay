/* ==========================================================================
 * js/tools/music-player.js
 * Background music player (Jamendo)
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Background music player ----------
   Streams free music from the Jamendo API (https://developer.jamendo.com).
   Tracks come from a genre tag (the quick-pick chips) or a free-text search
   typed in Settings > Music. The last search is remembered per device in
   localStorage (not in the account settings, so no database-rule change).
   Only the public client_id (8 characters) is used here; the long client secret is never
   needed for read-only track search and must NOT be put in a web page.
   Playback state itself lives only in this tab (autoplay policies require a
   user gesture anyway); volume/enabled/shuffle prefs are saved to the
   account like any other setting. */
const MusicPlayer=(()=>{
  const JAMENDO_CLIENT_ID='bcb2f672';
  const JAMENDO_URL='https://api.jamendo.com/v3.0/tracks/';
  const RESULT_LIMIT=40;
  const DEFAULT_TAG='lofi';
  const QUERY_KEY='ich.musicQuery';
  const QUICK_TAGS=['lofi','chillout','ambient','electronic','jazz','piano','rock','hiphop','classical','cinematic','pop','relaxation'];
  let tracks=[];        // [{id,name,artist,image,duration,url}]
  let order=[];         // shuffled/sequential index order
  let pos=-1;
  let nowTrack=null;    // the song that is actually loaded (survives a new search)
  let ready=false;
  let loading=false;
  let loadSeq=0;
  let scanning=null;
  let lastError='';
  let query={q:'',tag:DEFAULT_TAG};
  try{
    const sv=JSON.parse(localStorage.getItem(QUERY_KEY)||'null');
    if(sv&&typeof sv==='object')query={q:String(sv.q||'').slice(0,60),tag:String(sv.tag||'').slice(0,30)};
  }catch(_){}
  const listeners=new Set();
  function emit(){updateMediaSession();listeners.forEach(fn=>{try{fn(state())}catch(_){}})}
  function on(fn){listeners.add(fn);return()=>listeners.delete(fn)}
  function state(){
    return{
      tracks,ready,loading,lastError,query:{q:query.q,tag:query.tag},
      playing:!!(decks[live]&&decks[live]._url&&!decks[live].paused),
      buffering,
      current:nowTrack,
      volume:Math.round(targetVol*100),
      trackIndex:pos,total:order.length
    };
  }
  function shuffleArr(arr){
    const a=arr.slice();
    for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
    return a;
  }
  async function fetchTracks(qry){
    const p=new URLSearchParams({
      client_id:JAMENDO_CLIENT_ID,format:'json',limit:String(RESULT_LIMIT),
      audioformat:'mp32',imagesize:'100',order:qry.q?'relevance':'popularity_week'
    });
    if(qry.q)p.set('search',qry.q);
    if(qry.tag)p.set('tags',qry.tag);
    const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),12000);
    let j;
    try{
      const r=await fetch(JAMENDO_URL+'?'+p.toString(),{signal:ctl.signal});
      if(!r.ok)throw new Error('Jamendo returned HTTP '+r.status);
      j=await r.json();
    }finally{clearTimeout(to)}
    if(!j||!j.headers||j.headers.status!=='success')throw new Error((j&&j.headers&&j.headers.error_message)||'Jamendo request failed');
    return(j.results||[]).filter(r=>r&&r.audio).map(r=>({
      id:r.id,name:String(r.name||'Untitled'),artist:String(r.artist_name||''),
      image:r.image||'',duration:+r.duration||0,url:r.audio
    }));
  }
  // Run a search ({q:'free text', tag:'genre'}). Whatever is playing keeps playing;
  // the new list takes over from the next song / the next tap.
  async function load(opts){
    if(opts)query={q:String(opts.q||'').trim().slice(0,60),tag:String(opts.tag||'').trim().slice(0,30)};
    try{localStorage.setItem(QUERY_KEY,JSON.stringify(query))}catch(_){}
    const token=++loadSeq;
    loading=true;lastError='';emit();
    try{
      const list=await fetchTracks(query);
      if(token!==loadSeq)return tracks;                 // a newer search replaced this one
      tracks=list;pos=-1;resetOrder();
      for(let i=0;i<2;i++)if(decks[i]&&decks[i]!==decks[live])decks[i]._url=null;   // drop stale preloads
    }catch(e){
      if(token!==loadSeq)return tracks;
      lastError=e&&e.name==='AbortError'?'Jamendo took too long to answer. Check your connection and try again.':String((e&&e.message)||e);
      console.warn('[music]',lastError);
    }
    loading=false;ready=true;
    emit();
    return tracks;
  }
  function scan(){
    if(scanning)return scanning;
    scanning=Promise.resolve().then(()=>load());
    return scanning;
  }
  function resetOrder(shuffle){
    const idx=tracks.map((_,i)=>i);
    order=shuffle?shuffleArr(idx):idx;
    if(pos>=order.length)pos=-1;
  }
  /* ===== Crossfading engine =====
     Two <audio> elements (A/B). One is "live"; the other is kept warm with the
     NEXT song already buffered, so when it's time to blend there is never a
     wait on the network. Fades are computed from elapsed time (not frame
     counts) so they land correctly even if a tab is throttled.

     What makes the blend smooth:
       - Curve: equal-power (sin/cos) run through a smoothstep warp, so a fade has
         ZERO slope where it starts and where it lands. There is no audible
         "corner" at either end, and combined loudness stays constant in the
         middle (sin^2 + cos^2 = 1), so the blend doesn't dip.
       - Rate: ~60 updates/sec.
       - Volume slider: the level you pick glides to its new value instead of
         stepping, so dragging it doesn't crackle.
       - Manual skips use a short blend (you want the next song NOW); songs that
         end on their own get the long, gentle one. */
  const XFADE_MS=6000;       // blend when a song ends on its own
  const SKIP_FADE_MS=450;    // quick blend when the listener skips / picks a track: the new song is audible almost at once
  const PAUSE_FADE_MS=700;   // fade when pausing
  const RESUME_FADE_MS=1100; // fade when resuming / starting
  const QUICK_FADE_MS=140;   // clears a still-audible tail when skipping twice fast
  let targetVol=.15;         // what the slider says
  let curVol=.15;            // what is actually applied (glides toward targetVol)
  let decks=[null,null];     // the two audio elements
  let live=0;                // index of the deck that is the "current" song
  let gains=[0,0];           // per-deck fade gain 0..1
  let timerId=null;
  let fades=[null,null];     // per-deck active fade {from,to,start,ms,after}
  let xfading=false;         // a track-to-track crossfade is in progress
  let userPaused=true;       // true until the user/app starts playback
  let hiddenPaused=false;
  let loadToken=0;           // guards against overlapping skips
  const clamp01=x=>Math.max(0,Math.min(1,x));
  const warp=t=>t*t*t*(t*(t*6-15)+10);               // smootherstep: no kink in speed OR acceleration at either end
  const easeIn =t=>Math.sin(warp(t)*Math.PI/2);      // 0 -> 1
  const easeOut=t=>Math.cos(warp(t)*Math.PI/2);      // 1 -> 0
  // manual switches: plain equal-power (no slow start), so the new song is audible straight away
  const qIn =t=>Math.sin(t*Math.PI/2);
  const qOut=t=>Math.cos(t*Math.PI/2);
  function deck(i){
    if(decks[i])return decks[i];
    const a=new Audio();
    a.preload='auto';
    a.volume=0;
    a.addEventListener('play',emit);
    a.addEventListener('pause',emit);
    a.addEventListener('loadedmetadata',emit);
    a.addEventListener('durationchange',emit);
    // a song that dies mid-way (network drop, bad file): move on instead of going silent
    a.addEventListener('error',()=>{
      if(decks.indexOf(a)!==live||userPaused||buffering||!a._url)return;
      if(++failStreak>=4)return;
      loadAt(pos+1,true,SKIP_FADE_MS,true);
    });
    decks[i]=a;
    return a;
  }
  function applyVol(i){
    const a=decks[i];if(!a)return;
    a.volume=clamp01(curVol*gains[i]);
  }
  function startTimer(){if(!timerId)timerId=setInterval(tick,16)}
  function tick(){
    const now=performance.now();
    for(let i=0;i<2;i++){
      const f=fades[i];if(!f)continue;
      const t=Math.min(1,(now-f.start)/f.ms);
      const ei=f.q?qIn:easeIn,eo=f.q?qOut:easeOut;
      gains[i]=f.to>f.from ? f.from+(f.to-f.from)*ei(t) : f.to+(f.from-f.to)*eo(t);
      if(t>=1){gains[i]=f.to;const after=f.after;fades[i]=null;if(after)after()}
    }
    // glide the chosen volume toward the slider value (no zipper noise while dragging)
    let gliding=false;
    if(Math.abs(curVol-targetVol)>.0005){curVol+=(targetVol-curVol)*.18;gliding=true}else curVol=targetVol;
    applyVol(0);applyVol(1);
    // NOTE: check fades AFTER the loop — an `after` callback may have started a new one.
    if(!fades[0]&&!fades[1]&&!gliding&&timerId){clearInterval(timerId);timerId=null}
    emitTime();
  }
  // Fades are driven by setInterval, NOT requestAnimationFrame: rAF is paused
  // completely in a hidden tab, which would freeze a fade-out half way.
  function fade(i,to,ms,after,q){
    deck(i);
    fades[i]={from:gains[i],to,start:performance.now(),ms:Math.max(1,ms),after,q:!!q};
    startTimer();
  }
  function cancelFade(i){fades[i]=null}

  // --- progress ticker (drives the top-bar countdown; independent of fades) ---
  const timeListeners=new Set();
  function onTime(fn){timeListeners.add(fn);return()=>timeListeners.delete(fn)}
  let lastTimeEmit=0;
  function emitTime(force){
    if(!timeListeners.size)return;
    const n=performance.now();
    if(!force&&n-lastTimeEmit<90)return;      // UI doesn't need 60 redraws/sec
    lastTimeEmit=n;
    const p=progress();timeListeners.forEach(fn=>{try{fn(p)}catch(_){}})
  }
  function progress(){
    const a=decks[live];
    const has=!!(a&&a._url);
    let dur=has&&isFinite(a.duration)&&a.duration>0?a.duration:0;
    if(!dur&&nowTrack&&nowTrack.duration)dur=nowTrack.duration;   // before the file reports its length, use the API's
    const cur=has?(a.currentTime||0):0;
    return{current:cur,duration:dur,remaining:Math.max(0,dur-cur),
      fraction:dur?Math.min(1,cur/dur):0,total:order.length,
      playing:!!(has&&!a.paused),buffering,name:nowTrack?nowTrack.name:''};
  }
  setInterval(()=>{
    const a=decks[live];
    if(!a||a.paused)return;
    emitTime();
    // start the blend shortly before the song ends
    if(!xfading&&!buffering&&isFinite(a.duration)&&a.duration>XFADE_MS/1000*2.5&&(a.duration-a.currentTime)<=XFADE_MS/1000&&order.length>1){
      loadAt(pos+1,true,XFADE_MS);
    }
  },250);

  let buffering=false;       // a chosen song is still loading (UI shows a spinner)
  let failStreak=0;          // songs in a row that wouldn't play
  let playTimer=null;
  const LOAD_TIMEOUT_MS=9000;

  // Warm the idle deck with a song so switching to it starts instantly.
  function warm(t){
    if(!t||buffering)return;
    const nu=1-live,d=deck(nu);
    if(!d.paused&&gains[nu]>.02)return;                 // still finishing the previous song
    if(d._url===t.url)return;
    d._url=t.url;d.src=t.url;d.preload='auto';
    try{d.load()}catch(_){}
  }
  function preloadNext(){
    if(order.length<2)return;
    warm(tracks[order[(pos+1)%order.length]]);
  }
  function resetDeck(d){
    if(!d)return;
    try{d.pause()}catch(_){}
    d.onended=null;d._url=null;d.removeAttribute('src');
    try{d.load()}catch(_){}
  }

  /* Load track `i` (index into order) on the idle deck and blend it in while the previous deck
     fades out. The blend starts the moment the new song is really playing, so there is never a
     silent gap, and the old song keeps going while the new one buffers. A song that can't be
     played is skipped (never a silent dead end). `manual` = listener skipped / picked a song:
     short, punchy blend instead of the long one used when a song ends on its own. */
  function loadAt(i,autoplay,blendMs,manual){
    if(!order.length)return;
    pos=((i%order.length)+order.length)%order.length;
    const t=tracks[order[pos]];
    nowTrack=t;
    const token=++loadToken;
    clearTimeout(playTimer);
    const old=live,nu=1-live;
    const blend=blendMs||XFADE_MS;
    const q=!!manual;
    buffering=!!autoplay;
    emit();                                             // show the new title straight away
    const giveUp=()=>{
      if(token!==loadToken)return;
      clearTimeout(playTimer);
      buffering=false;xfading=false;
      resetDeck(decks[nu]);
      live=old;                                         // the previous song (if any) is still the live one
      if(++failStreak>=4||order.length<2){
        lastError='That song couldn’t be played. Check your connection or pick another one.';
        emit();return;
      }
      loadAt(pos+1,true,blend,manual);                  // skip to the next song
    };
    const begin=()=>{
      if(token!==loadToken)return;                      // a newer skip took over
      const a=deck(nu);
      cancelFade(nu);
      a.onended=null;
      if(a._url!==t.url){a._url=t.url;a.src=t.url}      // else: already buffered by warm()/preloadNext()
      try{if(a.currentTime>.05)a.currentTime=0}catch(_){}
      gains[nu]=0;applyVol(nu);
      if(!autoplay){live=nu;buffering=false;emit();return}
      const oldDeck=decks[old];
      const oldPlaying=!!(oldDeck&&oldDeck._url&&!oldDeck.paused);
      live=nu;userPaused=false;xfading=oldPlaying;
      // if a song ends by itself (e.g. very short), move on
      a.onended=()=>{if(live===nu&&!userPaused)loadAt(pos+1,true,XFADE_MS)};
      playTimer=setTimeout(()=>{if(token===loadToken&&buffering)giveUp()},LOAD_TIMEOUT_MS);
      let pr;
      try{pr=a.play()}catch(e){pr=Promise.reject(e)}
      Promise.resolve(pr).then(()=>{
        if(token!==loadToken)return;
        clearTimeout(playTimer);
        buffering=false;failStreak=0;lastError='';
        if(userPaused){try{a.pause()}catch(_){}xfading=false;emit();return}
        if(oldPlaying&&oldDeck&&!oldDeck.paused){
          // equal-power crossfade: old out, new in, over the same window
          fade(old,0,blend,()=>{oldDeck.pause();xfading=false;emit();preloadNext()},q);
          fade(nu,1,blend,null,q);
        }else{
          xfading=false;
          fade(nu,1,manual?SKIP_FADE_MS:RESUME_FADE_MS,null,q);
          preloadNext();
        }
        emit();
      }).catch(err=>{
        if(token!==loadToken)return;
        const nm=err&&err.name;
        if(nm==='AbortError'&&userPaused){clearTimeout(playTimer);buffering=false;xfading=false;emit();return}
        if(nm==='NotAllowedError'){                     // browser wants a tap first: stay loaded, ready to play
          clearTimeout(playTimer);buffering=false;xfading=false;emit();return;
        }
        giveUp();
      });
      emit();
    };
    // Skipped again while the previous song's tail is still audible on the deck we
    // need? Clear it with a very quick fade first so nothing is cut off with a click.
    const tail=decks[nu];
    if(tail&&!tail.paused&&gains[nu]>.02){
      fade(nu,0,QUICK_FADE_MS,()=>{tail.pause();begin()},true);
    }else begin();
  }
  async function play(){
    await scan();
    if(!tracks.length)return;
    userPaused=false;
    const a=deck(live);
    if(!a._url){loadAt(Math.max(pos,0),true,RESUME_FADE_MS);return}
    cancelFade(live);
    try{
      gains[live]=Math.min(gains[live],.001);
      await a.play();
      if(!userPaused){fade(live,1,RESUME_FADE_MS);preloadNext()}
    }catch(e){
      const nm=e&&e.name;
      if(nm!=='AbortError'&&nm!=='NotAllowedError')loadAt(Math.max(pos,0),true,RESUME_FADE_MS);
    }
    emit();
  }
  function pause(){
    userPaused=true;buffering=false;
    // fade out whichever deck(s) are sounding, then pause them
    for(let i=0;i<2;i++){
      const a=decks[i];
      if(a&&!a.paused){
        fade(i,0,PAUSE_FADE_MS,()=>{a.pause();xfading=false;emit()});
      }
    }
    emit();
  }
  function toggle(){
    const a=decks[live];
    if(a&&a._url&&!a.paused)pause();else play();
  }
  function next(){if(!order.length)return;loadAt(pos+1,true,SKIP_FADE_MS,true)}
  function prev(){
    if(!order.length)return;
    // like most players: if we're >3s in, "previous" restarts the song
    const a=decks[live];
    if(a&&a._url&&!buffering&&a.currentTime>3){a.currentTime=0;emitTime(true);return}
    loadAt(pos<0?0:pos-1,true,SKIP_FADE_MS,true);
  }
  function playTrack(trackIdx){
    const oi=order.indexOf(trackIdx);
    if(oi===-1)return;
    const t=tracks[trackIdx],a=decks[live];
    if(t&&nowTrack&&nowTrack.url===t.url&&a&&a._url===t.url&&!buffering){   // same song: resume / restart
      if(a.paused)play();else{a.currentTime=0;emitTime(true)}
      return;
    }
    loadAt(oi,true,SKIP_FADE_MS,true);
  }
  function hint(trackIdx){warm(tracks[trackIdx])}      // preload on pointer-down so the click starts instantly

  /* Safari / iOS only let code start an <audio> element that was "unlocked" by a real tap.
     The second (idle) deck never gets one, so a skip could silently fail there. Unlock both
     decks on the very first tap/key with a tiny silent clip. */
  const SILENT=(()=>{
    const n=400,b=new Uint8Array(44+n),v=new DataView(b.buffer);
    const w=(o,s)=>{for(let i=0;i<s.length;i++)b[o+i]=s.charCodeAt(i)};
    w(0,'RIFF');v.setUint32(4,36+n,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);
    v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,8000,true);v.setUint16(32,1,true);v.setUint16(34,8,true);
    w(36,'data');v.setUint32(40,n,true);b.fill(128,44);
    let s='';for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);
    return 'data:audio/wav;base64,'+btoa(s);
  })();
  let unlocked=false;
  function unlock(){
    if(unlocked)return;unlocked=true;
    for(let i=0;i<2;i++){
      const d=deck(i);
      if(d._url||d.getAttribute('src'))continue;
      d.src=SILENT;d.volume=0;
      const done=()=>{if(d.getAttribute('src')===SILENT){try{d.pause()}catch(_){}d.removeAttribute('src');try{d.load()}catch(_){}}};
      try{const pr=d.play();if(pr&&pr.then)pr.then(done,done);else done()}catch(_){done()}
    }
  }
  ['pointerdown','keydown','touchend'].forEach(ev=>document.addEventListener(ev,unlock,{once:true,passive:true}));
  function seek(fraction){
    const a=decks[live];
    if(a&&isFinite(a.duration))a.currentTime=Math.max(0,Math.min(1,fraction))*a.duration;
    emitTime(true);
  }
  function setVolume(v){
    targetVol=Math.max(0,Math.min(100,v))/100;
    deck(live);
    const a=decks[live];
    if(a&&!a.paused)startTimer();                       // audible: glide there
    else{curVol=targetVol;applyVol(0);applyVol(1)}      // nothing playing: just set it
    emit();
  }
  function setShuffle(on){resetOrder(on);emit()}

  /* ===== Background play (per device) =====
     Off (default): music fades out and pauses when you leave — switch tabs,
     minimise, or click into another app — and fades back in when you return.
     On: it just keeps playing. Kept in this browser's localStorage rather than in
     the account settings on purpose: it's a per-device choice (you may want it
     on for a laptop and off for a phone) and it needs no database-rule change. */
  const BG_KEY='ich.musicBackground';
  let bgPlay=false;
  try{bgPlay=localStorage.getItem(BG_KEY)==='1'}catch(_){}
  function getBackground(){return bgPlay}
  function setBackground(on){
    bgPlay=!!on;
    try{localStorage.setItem(BG_KEY,bgPlay?'1':'0')}catch(_){}
    emit();
  }

  /* ===== Media Session: lock-screen / notification / keyboard media keys =====
     Lets the OS show the song title and route play, pause, next and previous —
     which is what keeps background playback usable on phones. */
  let _msTitle='';
  function updateMediaSession(){
    if(typeof navigator==='undefined'||!('mediaSession' in navigator))return;
    try{
      const t=nowTrack;
      if(t&&t.url!==_msTitle&&typeof MediaMetadata!=='undefined'){
        _msTitle=t.url;
        navigator.mediaSession.metadata=new MediaMetadata({
          title:t.name,artist:t.artist||'Jamendo',album:'Itsukis Chat Hub',
          artwork:t.image?[{src:t.image,sizes:'100x100'}]:[]
        });
      }
      navigator.mediaSession.playbackState=(decks[live]&&decks[live]._url&&!decks[live].paused)?'playing':'paused';
    }catch(_){}
  }
  if(typeof navigator!=='undefined'&&'mediaSession' in navigator){
    const h=(n,f)=>{try{navigator.mediaSession.setActionHandler(n,f)}catch(_){}};
    h('play',()=>play());h('pause',()=>pause());h('nexttrack',()=>next());h('previoustrack',()=>prev());
  }

  /* ===== Away / return handling (used when background play is OFF) =====
     Three signals, because no single one covers every case:
       - visibilitychange : tab switched / window minimised / screen locked
       - pagehide         : tab being closed or frozen (mobile browsers)
       - window blur/focus: user clicked into ANOTHER APP while this browser
                            window is still visible — visibilitychange does not
                            fire at all in that case.
     A short grace period on blur stops a quick click on the address bar or a
     devtools panel from cutting the music. Only touches music that was actually
     playing, so it never starts something the user had paused. */
  const AWAY_FADE_MS=2200;   // fade-out when leaving
  const BACK_FADE_MS=2600;   // fade-in when returning
  const BLUR_GRACE_MS=1500;  // ignore very short focus losses
  let awayTimer=null;
  function goAway(){
    if(awayTimer){clearTimeout(awayTimer);awayTimer=null}
    if(bgPlay)return;                                   // background play is on: keep going
    if(hiddenPaused||userPaused)return;
    const a=decks[live];
    if(!a||a.paused)return;
    hiddenPaused=true;
    // If a track-to-track crossfade is mid-way, silence and pause BOTH decks.
    for(let i=0;i<2;i++){
      const d=decks[i];
      if(d&&!d.paused)fade(i,0,AWAY_FADE_MS,()=>{d.pause();xfading=false;emit()});
    }
    // Backgrounded tabs can be throttled hard or frozen before a timer-driven
    // fade finishes, so also hard-pause once it should have ended (no-op if done).
    setTimeout(()=>{if(hiddenPaused)for(const d of decks)if(d&&!d.paused){d.volume=0;d.pause()}},AWAY_FADE_MS+1500);
  }
  function comeBack(){
    if(awayTimer){clearTimeout(awayTimer);awayTimer=null}
    if(!hiddenPaused)return;
    hiddenPaused=false;
    if(userPaused)return;
    const a=decks[live];if(!a)return;
    for(let i=0;i<2;i++)cancelFade(i);
    gains[live]=0;a.volume=0;
    a.play().then(()=>{fade(live,1,BACK_FADE_MS);preloadNext()}).catch(()=>{});
  }
  document.addEventListener('visibilitychange',()=>{document.hidden?goAway():comeBack()});
  window.addEventListener('pagehide',goAway);
  window.addEventListener('pageshow',()=>{if(!document.hidden)comeBack()});
  window.addEventListener('blur',()=>{
    if(document.hidden||bgPlay)return;
    if(awayTimer)clearTimeout(awayTimer);
    awayTimer=setTimeout(()=>{awayTimer=null;if(!document.hasFocus())goAway()},BLUR_GRACE_MS);
  });
  window.addEventListener('focus',()=>{if(!document.hidden)comeBack();else if(awayTimer){clearTimeout(awayTimer);awayTimer=null}});
  function applyPrefs(music){
    if(!music)return;
    setVolume(music.volume??15);
    const a=decks[live];
    const isPlaying=!!(a&&!a.paused);
    if(music.enabled&&!isPlaying)play();
    else if(!music.enabled)pause();
  }
  return{emitNow:()=>emitTime(true),on,onTime,progress,seek,state,scan,play,pause,toggle,next,prev,playTrack,hint,setVolume,setShuffle,applyPrefs,getBackground,setBackground,load,quickTags:QUICK_TAGS};
})();
