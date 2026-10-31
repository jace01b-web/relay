/* ==========================================================================
 * js/core/sound.js
 * Notification chime / beep
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

// Soft two-note "bell" chime for pings: a bright note followed by a gentle
// perfect-fifth-down resolve, each with its own quick attack + smooth decay
// and a touch of lowpassed shimmer, so it reads as pleasant rather than a
// flat alarm-style beep.
let _pingCtx=null;
function _pingAudioCtx(){
  if(!_pingCtx)_pingCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(_pingCtx.state==='suspended')_pingCtx.resume().catch(()=>{});
  return _pingCtx;
}
function _chimeNote(c,freq,start,dur,peak){
  const o=c.createOscillator(),o2=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter();
  o.type='sine';o2.type='sine';
  o.frequency.value=freq;o2.frequency.value=freq*2;
  f.type='lowpass';f.frequency.value=3200;f.Q.value=.6;
  o.connect(f);o2.connect(f);f.connect(g);g.connect(c.destination);
  const g2=c.createGain();g2.gain.value=.25;o2.disconnect();o2.connect(g2);g2.connect(f);
  g.gain.setValueAtTime(0,start);
  g.gain.linearRampToValueAtTime(peak,start+.012);
  g.gain.exponentialRampToValueAtTime(.0006,start+dur);
  o.start(start);o2.start(start);o.stop(start+dur+.02);o2.stop(start+dur+.02);
}
function beep(){
  try{
    const c=_pingAudioCtx();
    const t=c.currentTime+.001;
    _chimeNote(c,988,t,.42,.11);      // B5
    _chimeNote(c,740,t+.09,.5,.09);   // F#5 (a fifth down) — gentle resolve
  }catch(e){}
}
